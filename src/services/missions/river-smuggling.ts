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
import { MANSAO_HOKAGE_CHANNEL_ID, RIO_CHANNEL_ID } from "../../data/scenarios/index.js";
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

const CLERK_KEY = "river_smuggling_clerk";
const BOATMAN_KEY = "river_boatman";
const INVESTIGATION_EMOJI = "<:investigation:1523544296379383949>";
const INVESTIGATION_CHECK_EMOJI = "<:investigation_check:1523545905255547001>";

interface RiverStep {
  title: string;
  clue: string;
  correct: string;
  success: string;
  objectiveId?: string;
  options: { value: string; label: string; description: string }[];
}

const RIVER_STEPS: RiverStep[] = [
  {
    title: "Marcas na margem",
    clue: "Ha sulcos na lama e restos de corda com residuo de chakra perto da agua.",
    correct: "corda",
    success: "As marcas mostram que caixas pesadas foram arrastadas ate um barco, nao carregadas por pescadores.",
    objectiveId: "chegar_rio_contrabando",
    options: [
      { value: "corda", label: "Examinar cordas", description: "Compara sulcos, lama e residuo de chakra." },
      { value: "pegadas", label: "Seguir pegadas", description: "Pegadas foram pisoteadas por pescadores de verdade." },
      { value: "mergulhar", label: "Mergulhar direto", description: "Entra na agua sem checar armadilhas." },
    ],
  },
  {
    title: "Barcos atracados",
    clue: "Tres barcos estao parados. Um deles tem tinta fresca por cima de marcas oficiais raspadas.",
    correct: "barco_pintado",
    success: "O barco pintado encobre o antigo registro de transporte oficial.",
    objectiveId: "identificar_barco_falso",
    options: [
      { value: "barco_pintado", label: "Checar tinta fresca", description: "Revela marcas raspadas na lateral." },
      { value: "barco_velho", label: "Checar barco velho", description: "E um barco de pesca comum e vazio." },
      { value: "todos", label: "Revirar todos", description: "Alerta os contrabandistas antes da prova." },
    ],
  },
  {
    title: "Corda sob a correnteza",
    clue: "Uma corda quase invisivel cruza a agua entre duas pedras. Sinos pequenos estao presos abaixo da superficie.",
    correct: "soltar_pedra",
    success: "A corda-armadilha foi solta pela pedra de ancoragem sem tocar nos sinos.",
    objectiveId: "atravessar_sem_armadilha",
    options: [
      { value: "soltar_pedra", label: "Soltar ancoragem", description: "Desarma a corda sem disparar os sinos." },
      { value: "cortar_meio", label: "Cortar no meio", description: "A tensao puxa os sinos e alerta o barco." },
      { value: "pular", label: "Pular por cima", description: "Deixa a armadilha ativa para o resto do time." },
    ],
  },
];

export interface RiverSmugglingState {
  stage?: "BRIEFING" | "RIVER_SURVEY" | "BOATMAN_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  riverStep?: number;
  mistakes?: number;
  boatmanSeen?: boolean;
  combatStarted?: boolean;
}

export interface RiverSmugglingContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): RiverSmugglingState {
  const state = readState<RiverSmugglingState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.riverStep = state.riverStep ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.boatmanSeen = state.boatmanSeen ?? false;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function turns(def: RiverSmugglingContext["def"], key: "briefingTurns" | "captainTurns" | "reportTurns", fallback: number): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: RiverSmugglingContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: RiverSmugglingContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function smugglerTemplate(def: RiverSmugglingContext["def"]): string {
  return String(def.data?.smugglerTemplate ?? "river_smuggler");
}

function captainTemplate(def: RiverSmugglingContext["def"]): string {
  return String(def.data?.captainTemplate ?? "river_smuggler_captain");
}

async function findContextByCharId(charId: string): Promise<RiverSmugglingContext | null> {
  const c = await getActiveInstanceByType(charId, "RIVER_SMUGGLING");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveRiverSmuggling(discordId: string, guildId: string): Promise<RiverSmugglingContext | null> {
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

export function availableRiverSmugglingNpcs(state: RiverSmugglingState, channelId: string): { key: string; name: string }[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return [{ key: CLERK_KEY, name: "Kaede Mori (contrabando)" }];
    if (state.stage === "RETURN") return [{ key: CLERK_KEY, name: "Kaede Mori (carga apreendida)" }];
  }
  if (channelId === RIO_CHANNEL_ID && state.stage === "BOATMAN_TALK") {
    return [{ key: BOATMAN_KEY, name: "Barqueiro suspeito" }];
  }
  return [];
}

export async function riverSmugglingMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: RiverSmugglingContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  entities.push(...riverSmugglingEntities(state, channelId));

  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - receba a ordem com \`/interagir npc\`.`;
    if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - entregue a carga apreendida a Kaede com \`/interagir npc\`.`;
    return `\nMissao ativa: **${ctx.def.name}** - siga para o **Rio** para continuar.`;
  }

  if (channelId !== RIO_CHANNEL_ID) return null;
  if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - primeiro receba a ordem na Mansao do Hokage.`;
  if (state.stage === "RIVER_SURVEY") {
    if (state.running) return `\nMissao ativa: **${ctx.def.name}** - a investigacao do rio ja esta aberta no canal.`;
    state.running = true;
    await setState(ctx.inst.id, state);
    void startRiverPanel(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    return `\nMissao ativa: **${ctx.def.name}** - investigue margem, barco e armadilha no painel.`;
  }
  if (state.stage === "BOATMAN_TALK") {
    if (!state.boatmanSeen) {
      state.boatmanSeen = true;
      await setState(ctx.inst.id, state);
      await speak(interaction.channel, BOATMAN_KEY, "(o time encontra o barco de pesca falso)", "Finga ser um pescador, mas esconda nervosismo com as caixas seladas.", 0);
    }
    return `\nMissao ativa: **${ctx.def.name}** - interrogue o barqueiro suspeito com \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    await retryCombatIfNeeded(interaction, ctx, state);
    return `\nMissao ativa: **${ctx.def.name}** - derrote os contrabandistas no Rio.`;
  }
  return `\nMissao ativa: **${ctx.def.name}** - volte a Mansao do Hokage para finalizar.`;
}

function riverSmugglingEntities(state: RiverSmugglingState, channelId: string): RenderEntity[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    return [{ cell: "C3", name: "Kaede Mori", label: "Kae", color: "#3498db", kind: "NPC", imageFile: "npcs/mission-clerk.png" }];
  }
  if (channelId !== RIO_CHANNEL_ID) return [];
  const entities: RenderEntity[] = [
    { cell: "B7", label: "Crg", color: "#f1c40f", kind: "MARKER" },
    { cell: "C6", label: "Bar", color: "#95a5a6", kind: "MARKER" },
    { cell: "D4", label: "Arm", color: "#c0392b", kind: "MARKER" },
  ];
  if (state.stage === "BOATMAN_TALK") {
    entities.push({ cell: "C7", name: "Barqueiro suspeito", label: "Bar", color: "#e67e22", kind: "NPC", imageFile: "npcs/merchant.png" });
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

export async function interactRiverSmuggling(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveRiverSmuggling(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableRiverSmugglingNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
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

export async function continueRiverSmugglingMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveRiverSmuggling(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableRiverSmugglingNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: RiverSmugglingContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "RIVER_SMUGGLING") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === CLERK_KEY && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      CLERK_KEY,
      playerMessage,
      done
        ? "Ultima fala: mande o time ir ao Rio, investigar a margem, achar o barco falso e apreender a carga selada."
        : "Explique que cargas seladas foram desviadas e transportadas pelo rio em barco de pesca falso.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "RIVER_SURVEY";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_ordem_contrabando");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Siga para o **Rio** e use `/mapa` para investigar a margem.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === BOATMAN_KEY && state.stage === "BOATMAN_TALK") {
    const fight = turn >= turns(def, "captainTurns", 3);
    await speak(
      channel,
      BOATMAN_KEY,
      playerMessage,
      fight
        ? "Ultima fala: chame o capitao contrabandista, revele a emboscada e inicie combate."
        : "Desconverse sobre caixas, tinta fresca e marcas raspadas no barco.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      await speak(
        channel,
        "river_smuggler_captain",
        "(o capitao surge na proa do barco falso)",
        "Ameace afundar as provas e mande dois comparsas atacarem.",
        0,
      );
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_capitao_contrabando");
      await setState(inst.id, state);
      await startRiverCombat(channel, channelId, guildId, actor, inst.id, def);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === CLERK_KEY && state.stage === "RETURN") {
    const done = turn >= turns(def, "reportTurns", 2);
    await speak(
      channel,
      CLERK_KEY,
      playerMessage,
      done
        ? "Ultima fala: registre a carga apreendida, confirme os lacres recuperados e encerre a missao."
        : "Receba o relatorio sobre margem, barco falso, corda-armadilha e contrabandistas presos.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_carga_apreendida");
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

function riverEmbed(state: RiverSmugglingState, def: RiverSmugglingContext["def"], result?: string): EmbedBuilder {
  const step = RIVER_STEPS[state.riverStep ?? 0];
  const titleEmoji = step ? INVESTIGATION_EMOJI : INVESTIGATION_CHECK_EMOJI;
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${titleEmoji} Investigacao do Contrabando no Rio`)
    .setDescription([
      `Etapas resolvidas: **${state.riverStep ?? 0}/${RIVER_STEPS.length}**`,
      `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      "",
      result ?? "",
      step ? `**${step.title}:** ${step.clue}` : "O barco falso foi localizado.",
      "",
      step ? "Escolha a acao que preserva provas e evita alertar os contrabandistas." : "",
    ].filter(Boolean).join("\n"));
}

function riverMenu(instanceId: string, state: RiverSmugglingState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = RIVER_STEPS[state.riverStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`river-smuggling:survey:${instanceId}:${(state.riverStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description.slice(0, 100),
        value: option.value,
      }))),
  );
}

async function startRiverPanel(channel: TextBasedChannel | null, instanceId: string, actorDiscordId: string): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "RIVER_SMUGGLING") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [riverEmbed(state, def)], components: [riverMenu(instanceId, state)] });

  while ((state.riverStep ?? 0) < RIVER_STEPS.length) {
    const index = state.riverStep ?? 0;
    const step = RIVER_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `river-smuggling:survey:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.riverStep = index + 1;
        result = `${INVESTIGATION_CHECK_EMOJI} **Pista confirmada:** ${step.success}`;
        if (step.objectiveId) await markObjective(instanceId, step.objectiveId);
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Alerta:** a escolha perderia provas, alertaria o barco ou acionaria a armadilha.";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failRiverSmuggling(instanceId, msg, "Erros demais alertaram os contrabandistas, que fugiram pela correnteza.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.riverStep ?? 0) >= RIVER_STEPS.length;
      await pick.update({ embeds: [riverEmbed(state, def, result)], components: done ? [] : [riverMenu(instanceId, state)] });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A investigacao do rio expirou. Use `/mapa` para retomar do ponto atual.");
      return;
    }
  }

  state.stage = "BOATMAN_TALK";
  state.running = false;
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Barco falso localizado")
        .setDescription("As pistas apontam para o barco com tinta fresca e caixas sob redes molhadas. Use `/mapa` e depois `/interagir npc`."),
    ],
    components: [],
  });
}

function starterFrom(char: Awaited<ReturnType<typeof getOrCreateCharacter>>): StarterChar {
  return {
    charId: char.id,
    name: char.name,
    level: char.level,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  };
}

async function startRiverCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: RiverSmugglingContext["def"],
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "rio",
    players,
    npcs: [{ templateId: captainTemplate(def) }, { templateId: smugglerTemplate(def) }, { templateId: smugglerTemplate(def) }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`O capitao e dois contrabandistas atacam na margem! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: RiverSmugglingContext,
  state: RiverSmugglingState,
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startRiverCombat(interaction.channel, interaction.channelId, interaction.guildId ?? "global", interaction.user, ctx.inst.id, ctx.def);
}

async function failRiverSmuggling(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Contrabandistas fugiram").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onRiverSmugglingCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "RIVER_SMUGGLING") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "FIGHT") return;

  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_contrabandistas");
  await setState(inst.id, state);
  await interaction.followUp("Os contrabandistas foram derrotados e a carga selada foi apreendida. Volte a **Mansao do Hokage** e fale com Kaede.");
}
