import {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { DESERTO_CHANNEL_ID, ROTA_COMERCIAL_KONOHA_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const MASTER_KEY = "desert_caravan_master";
const CAPTAIN_KEY = "desert_raider_captain";

interface DesertStep {
  title: string;
  clue: string;
  correct: string;
  success: string;
  objectiveId?: string;
  options: { value: string; label: string; description: string }[];
}

const DESERT_STEPS: DesertStep[] = [
  {
    title: "Duas trilhas entre dunas",
    clue: "Uma trilha segue por areia lisa e facil demais. A outra passa perto de pedras quentes, mas tem marcas antigas de rodas.",
    correct: "pedras",
    success: "As marcas antigas confirmam a rota segura usada antes das caravanas sumirem.",
    objectiveId: "chegar_deserto_emboscada",
    options: [
      { value: "pedras", label: "Seguir pedras", description: "Rota dificil, mas com marcas reais de carroca." },
      { value: "areia_lisa", label: "Seguir areia lisa", description: "Caminho facil demais, provavel isca." },
      { value: "atalho", label: "Cortar pelas dunas", description: "Pode separar a caravana da escolta." },
    ],
  },
  {
    title: "Brilho de agua distante",
    clue: "O sol mostra um lago no horizonte, mas o vento sopra areia seca daquela direcao.",
    correct: "ignorar_miragem",
    success: "O time ignora a miragem e encontra bandeirolas falsas enterradas na areia.",
    objectiveId: "evitar_miragem_deserto",
    options: [
      { value: "ignorar_miragem", label: "Ignorar miragem", description: "Confia no vento seco e procura sinais falsos." },
      { value: "agua", label: "Ir ate a agua", description: "Pode levar a caravana para fora da rota." },
      { value: "correr", label: "Correr antes do calor", description: "Cansa os animais e espalha a escolta." },
    ],
  },
  {
    title: "Duna alta a oeste",
    clue: "A duna oferece visao perfeita da caravana. Ha pedras ao sul que podem proteger as carrocas.",
    correct: "cobrir_carrocas",
    success: "As carrocas ficam protegidas pelas pedras, obrigando os saqueadores a se revelar.",
    objectiveId: "proteger_caravana_dunas",
    options: [
      { value: "cobrir_carrocas", label: "Cobrir carrocas", description: "Usa as pedras como defesa antes da emboscada." },
      { value: "subir_duna", label: "Subir a duna", description: "Deixa as carrocas expostas na areia." },
      { value: "parar_aberto", label: "Parar no aberto", description: "Facilita cerco por todos os lados." },
    ],
  },
];

export interface DesertAmbushState {
  stage?: "BRIEFING" | "DESERT_ROUTE" | "CAPTAIN_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  routeStep?: number;
  mistakes?: number;
  captainSeen?: boolean;
  combatStarted?: boolean;
}

export interface DesertAmbushContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): DesertAmbushState {
  const state = readState<DesertAmbushState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.routeStep = state.routeStep ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.captainSeen = state.captainSeen ?? false;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function turns(def: DesertAmbushContext["def"], key: "briefingTurns" | "captainTurns" | "reportTurns", fallback: number): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: DesertAmbushContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: DesertAmbushContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function raiderTemplate(def: DesertAmbushContext["def"]): string {
  return String(def.data?.raiderTemplate ?? "desert_raider");
}

function captainTemplate(def: DesertAmbushContext["def"]): string {
  return String(def.data?.captainTemplate ?? "desert_raider_captain");
}

async function findContextByCharId(charId: string): Promise<DesertAmbushContext | null> {
  const c = await getActiveInstanceByType(charId, "DESERT_AMBUSH");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveDesertAmbush(discordId: string, guildId: string): Promise<DesertAmbushContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const ctx = await findContextByCharId(own.id);
    if (ctx) return ctx;
  }
  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const ctx = await findContextByCharId(uc.id);
    if (ctx) return ctx;
  }
  return null;
}

export function availableDesertAmbushNpcs(state: DesertAmbushState, channelId: string): { key: string; name: string }[] {
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return [{ key: MASTER_KEY, name: "Mestre da Caravana" }];
    if (state.stage === "RETURN") return [{ key: MASTER_KEY, name: "Mestre da Caravana (relatorio)" }];
  }
  if (channelId === DESERTO_CHANNEL_ID && state.stage === "CAPTAIN_TALK") {
    return [{ key: CAPTAIN_KEY, name: "Capitao saqueador" }];
  }
  return [];
}

export async function desertAmbushMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: DesertAmbushContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  entities.push(...desertAmbushEntities(state, channelId));

  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - fale com o mestre da caravana usando \`/interagir npc\`.`;
    if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - confirme a seguranca da caravana com \`/interagir npc\`.`;
    return `\nMissao ativa: **${ctx.def.name}** - siga para o **Deserto** para continuar.`;
  }

  if (channelId !== DESERTO_CHANNEL_ID) return null;
  if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - primeiro fale com o mestre da caravana na Rota Comercial.`;
  if (state.stage === "DESERT_ROUTE") {
    if (state.running) return `\nMissao ativa: **${ctx.def.name}** - a travessia do deserto ja esta aberta no canal.`;
    state.running = true;
    await setState(ctx.inst.id, state);
    void startDesertPanel(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    return `\nMissao ativa: **${ctx.def.name}** - escolha a rota segura e prepare a caravana no painel.`;
  }
  if (state.stage === "CAPTAIN_TALK") {
    if (!state.captainSeen) {
      state.captainSeen = true;
      await setState(ctx.inst.id, state);
      await speak(interaction.channel, CAPTAIN_KEY, "(o time protege as carrocas e revela a emboscada)", "Apareca no alto da duna, ameacando a caravana antes do combate.", 0);
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o capitao saqueador com \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    await retryCombatIfNeeded(interaction, ctx, state);
    return `\nMissao ativa: **${ctx.def.name}** - derrote os saqueadores do deserto.`;
  }
  return `\nMissao ativa: **${ctx.def.name}** - volte para a Rota Comercial e entregue o relatorio.`;
}

function desertAmbushEntities(state: DesertAmbushState, channelId: string): RenderEntity[] {
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID) {
    return [{ cell: "C4", name: "Mestre da Caravana", label: "Car", color: "#f39c12", kind: "NPC", imageFile: "npcs/merchant.png" }];
  }
  if (channelId !== DESERTO_CHANNEL_ID) return [];
  const entities: RenderEntity[] = [
    { cell: "B3", label: "Rot", color: "#f1c40f", kind: "MARKER" },
    { cell: "C6", label: "Mir", color: "#3498db", kind: "MARKER" },
    { cell: "D4", label: "Car", color: "#95a5a6", kind: "MARKER" },
  ];
  if (state.stage === "CAPTAIN_TALK") {
    entities.push({ cell: "E8", name: "Capitao saqueador", label: "Saq", color: "#c0392b", kind: "NPC", imageFile: "enemies/desert-bandit.png" });
  }
  return entities;
}

async function speak(channel: TextBasedChannel | null, personaKey: string, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(personaKey, message, extra, fallbackIndex);
  const persona = getPersona(personaKey);
  const sent = await sendAsPersona(channel, {
    key: personaKey,
    name: persona?.displayName ?? "NPC",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactDesertAmbush(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveDesertAmbush(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableDesertAmbushNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel nesta etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Ja existe uma conversa da missao em andamento.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, interaction.channelId, guildId, ctx, npcKey, "(o time inicia a conversa)", interaction.user);
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueDesertAmbushMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveDesertAmbush(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableDesertAmbushNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: DesertAmbushContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DESERT_AMBUSH") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === MASTER_KEY && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      MASTER_KEY,
      playerMessage,
      done
        ? "Ultima fala: mande o time seguir ao Deserto, evitar miragens, proteger as carrocas e descobrir quem esta atacando caravanas."
        : "Explique que caravanas estao sumindo perto da fronteira de Suna por causa de marcas falsas e emboscadas nas dunas.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DESERT_ROUTE";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_pedido_caravana");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Siga para o **Deserto** e use `/mapa` para atravessar as dunas.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === CAPTAIN_KEY && state.stage === "CAPTAIN_TALK") {
    const fight = turn >= turns(def, "captainTurns", 3);
    await speak(
      channel,
      CAPTAIN_KEY,
      playerMessage,
      fight
        ? "Ultima fala: mande tres saqueadores atacarem as carrocas e inicie o combate."
        : "Ameace a caravana, provoque o time e fale como alguem que conhece melhor o deserto.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_saqueador_deserto");
      await setState(inst.id, state);
      await startDesertCombat(channel, channelId, guildId, actor, inst.id, def);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === MASTER_KEY && state.stage === "RETURN") {
    const done = turn >= turns(def, "reportTurns", 2);
    await speak(
      channel,
      MASTER_KEY,
      playerMessage,
      done
        ? "Ultima fala: confirme que a caravana chegou segura, agradeca ao time e encerre a missao."
        : "Receba o relato sobre miragens, marcas falsas, protecao das carrocas e derrota dos saqueadores.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_caravana");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function desertEmbed(state: DesertAmbushState, def: DesertAmbushContext["def"], result?: string): EmbedBuilder {
  const step = DESERT_STEPS[state.routeStep ?? 0];
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Travessia da Caravana no Deserto")
    .setDescription([
      `Etapas resolvidas: **${state.routeStep ?? 0}/${DESERT_STEPS.length}**`,
      `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      "",
      result ?? "",
      step ? `**${step.title}:** ${step.clue}` : "A emboscada foi revelada.",
      "",
      step ? "Escolha a acao que protege a caravana e evita a isca dos saqueadores." : "",
    ].filter(Boolean).join("\n"));
}

function desertMenu(instanceId: string, state: DesertAmbushState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = DESERT_STEPS[state.routeStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`desert-ambush:route:${instanceId}:${(state.routeStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description.slice(0, 100),
        value: option.value,
      }))),
  );
}

async function startDesertPanel(channel: TextBasedChannel | null, instanceId: string, actorDiscordId: string): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DESERT_AMBUSH") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [desertEmbed(state, def)], components: [desertMenu(instanceId, state)] });

  while ((state.routeStep ?? 0) < DESERT_STEPS.length) {
    const index = state.routeStep ?? 0;
    const step = DESERT_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `desert-ambush:route:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.routeStep = index + 1;
        result = `**Correto:** ${step.success}`;
        if (step.objectiveId) await markObjective(instanceId, step.objectiveId);
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Alerta:** a escolha isolaria a caravana, cairia numa miragem ou deixaria as carrocas expostas.";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failDesertAmbush(instanceId, msg, "Erros demais deixaram a caravana cercada antes da chegada da escolta.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.routeStep ?? 0) >= DESERT_STEPS.length;
      await pick.update({ embeds: [desertEmbed(state, def, result)], components: done ? [] : [desertMenu(instanceId, state)] });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A travessia expirou. Use `/mapa` para retomar do ponto atual.");
      return;
    }
  }

  state.stage = "CAPTAIN_TALK";
  state.running = false;
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("Emboscada revelada")
        .setDescription("A caravana esta protegida e os saqueadores foram forçados a sair das dunas. Use `/mapa` e depois `/interagir npc`."),
    ],
    components: [],
  });
}

function starterFrom(char: Awaited<ReturnType<typeof getOrCreateCharacter>>): StarterChar {
  return {
    charId: char.id,
    name: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  };
}

async function startDesertCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: DesertAmbushContext["def"],
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "deserto",
    players,
    npcs: [
      { templateId: captainTemplate(def) },
      { templateId: raiderTemplate(def) },
      { templateId: raiderTemplate(def) },
      { templateId: raiderTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`O capitao e tres saqueadores atacam a caravana! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: DesertAmbushContext,
  state: DesertAmbushState,
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startDesertCombat(interaction.channel, interaction.channelId, interaction.guildId ?? "global", interaction.user, ctx.inst.id, ctx.def);
}

async function failDesertAmbush(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Caravana perdida").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onDesertAmbushCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DESERT_AMBUSH") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "FIGHT") return;

  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_saqueadores_deserto");
  await setState(inst.id, state);
  await interaction.followUp("Os saqueadores foram derrotados e a caravana atravessou as dunas. Volte a **Rota Comercial de Konoha** e fale com o mestre da caravana.");
}
