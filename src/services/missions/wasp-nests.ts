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
import { ACADEMIA_GENIN_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers } from "./combat-party.js";
import {
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const INSTRUCTOR_KEY = "academy_instructor_yori_wasps";
const BEE = "\u{1F41D}";

interface RemovalOption {
  value: string;
  label: string;
  description: string;
}

interface RemovalStep {
  id: string;
  objectiveId: string;
  title: string;
  cell?: string;
  clue: string;
  correct: string;
  success: string;
  options: RemovalOption[];
}

const REMOVAL_STEPS: RemovalStep[] = [
  {
    id: "area",
    objectiveId: "isolar_area",
    title: "Preparar a area",
    clue: "Ha alunos curiosos passando perto da parede. Antes de mexer nos ninhos, e preciso deixar o local seguro.",
    correct: "isolar",
    success: "A area foi isolada e os alunos ficaram longe da parede.",
    options: [
      { value: "isolar", label: "Isolar com fita", description: "Afasta os alunos e protege o caminho perto da Academia." },
      { value: "gritar", label: "Gritar para sairem", description: "Pode assustar alunos e vespas ao mesmo tempo." },
      { value: "jutsu", label: "Usar jutsu forte", description: "Rapido, mas arrisca danificar a parede." },
    ],
  },
  {
    id: "b2",
    objectiveId: "remover_ninho_b2",
    title: "Ninho baixo em B2",
    cell: "B2",
    clue: "O ninho esta baixo, preso em madeira velha. As vespas ficam agitadas com movimentos bruscos.",
    correct: "fumaca_fria",
    success: "A fumaca fria acalmou o ninho baixo sem chamuscar a madeira.",
    options: [
      { value: "fumaca_fria", label: "Aplicar fumaca fria", description: "Acalma o enxame sem calor nem dano no predio." },
      { value: "tocha", label: "Usar tocha", description: "Afasta insetos, mas e perigoso perto da madeira." },
      { value: "soco", label: "Derrubar com golpe", description: "Rapido, barulhento e nada cuidadoso." },
    ],
  },
  {
    id: "c8",
    objectiveId: "remover_ninho_c8",
    title: "Ninho na marquise em C8",
    cell: "C8",
    clue: "O ninho esta grudado na marquise. Se puxar de uma vez, parte do reboco pode cair.",
    correct: "raspador",
    success: "O raspador soltou o ninho aos poucos, sem quebrar a marquise.",
    options: [
      { value: "raspador", label: "Raspar devagar", description: "Solta a base sem arrancar pedacos da parede." },
      { value: "kunai", label: "Cortar com kunai", description: "Pode marcar a parede e partir o ninho errado." },
      { value: "puxar", label: "Puxar com corda", description: "Faz forca demais na marquise." },
    ],
  },
  {
    id: "e6",
    objectiveId: "remover_ninho_e6",
    title: "Ninho alto em E6",
    cell: "E6",
    clue: "O ultimo ninho esta alto. Ele precisa cair dentro de algo fechado, senao o enxame se espalha.",
    correct: "saco_pano",
    success: "O saco de pano cobriu o ninho e evitou que as vespas se espalhassem pela entrada.",
    options: [
      { value: "saco_pano", label: "Cobrir com saco", description: "Contem o ninho antes de remover." },
      { value: "vento", label: "Soprar com vento", description: "Espalha o enxame pelo patio." },
      { value: "agua", label: "Jogar agua", description: "Deixa tudo escorregadio e irrita as vespas." },
    ],
  },
];

export interface WaspNestsState {
  stage?: "INTRO" | "REMOVING" | "FIGHT" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  running?: boolean;
  step?: number;
  mistakes?: number;
  combatStarted?: boolean;
}

export interface WaspNestsChoice {
  key: string;
  name: string;
}

interface WaspNestsContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): WaspNestsState {
  const state = readState<WaspNestsState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.running = state.running ?? false;
  state.step = state.step ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function introTurns(def: WaspNestsContext["def"]): number {
  return Number(def.data?.introTurns ?? 3);
}

function maxMistakes(def: WaspNestsContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: WaspNestsContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function waspTemplate(def: WaspNestsContext["def"]): string {
  return String(def.data?.waspTemplate ?? "wasp_swarm");
}

async function findContextByCharId(charId: string): Promise<WaspNestsContext | null> {
  const c = await getActiveInstanceByType(charId, "WASP_NESTS");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveWaspNests(discordId: string, guildId: string): Promise<WaspNestsContext | null> {
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

export function availableWaspNestsNpcs(state: WaspNestsState, channelId: string): WaspNestsChoice[] {
  if (channelId !== ACADEMIA_GENIN_CHANNEL_ID) return [];
  if (state.stage === "INTRO") return [{ key: INSTRUCTOR_KEY, name: "Yori Umino (ninhos de vespas)" }];
  return [];
}

export async function waspNestsMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: WaspNestsContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;

  entities.push(instructorEntity(), ...nestEntities(state));

  if (state.stage === "INTRO") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Yori usando \`/interagir npc\` antes de tocar nos ninhos ${BEE}.`;
  }

  if (state.stage === "FIGHT") {
    if (!(await getActiveSession(interaction.channelId))) {
      state.combatStarted = true;
      await setState(ctx.inst.id, state);
      void startWaspCombat(
        interaction.channel,
        interaction.channelId,
        interaction.guildId ?? "global",
        ctx.inst.id,
        interaction.user.id,
        interaction.user.username,
      ).catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - o enxame saiu dos ninhos. Derrote-o para proteger a Academia.`;
  }

  if (state.running) {
    return `\nMissao ativa: **${ctx.def.name}** - a remocao cuidadosa dos ninhos ja esta em andamento no canal.`;
  }

  state.running = true;
  state.step = state.step ?? 0;
  state.mistakes = state.mistakes ?? 0;
  await setState(ctx.inst.id, state);
  void startNestRemoval(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    ctx.inst.id,
    interaction.user.id,
    interaction.user.username,
  ).catch(() => undefined);
  return `\nMissao ativa: **${ctx.def.name}** - remova os ninhos pelo painel enviado no canal, com cuidado para nao ferir ninguem.`;
}

function instructorEntity(): RenderEntity {
  return {
    cell: "C3",
    name: "Yori Umino",
    label: "Yor",
    color: "#3498db",
    kind: "NPC",
    imageFile: "npcs/academy-instructor-yori.png",
  };
}

function nestEntities(state: WaspNestsState): RenderEntity[] {
  const currentStep = state.step ?? 0;
  return REMOVAL_STEPS.filter((step) => step.cell).map((step, index) => ({
    cell: step.cell!,
    name: step.title,
    label: BEE,
    color: currentStep > index + 1 ? "#2ecc71" : "#f1c40f",
    kind: "MARKER",
    badge: currentStep > index + 1 ? "OK" : "!",
  }));
}

async function speak(channel: TextBasedChannel | null, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(INSTRUCTOR_KEY, message, extra, fallbackIndex);
  const persona = getPersona(INSTRUCTOR_KEY);
  const sent = await sendAsPersona(channel, {
    key: INSTRUCTOR_KEY,
    name: persona?.displayName ?? "Yori Umino",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactWaspNests(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveWaspNests(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableWaspNestsNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel para essa missao aqui.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Ja existe uma conversa de missao em andamento.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runWaspDialogue(interaction.channel, ctx, "(o ninja aponta para os ninhos perto da parede da Academia)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueWaspNestsMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return false;
  const ctx = await resolveWaspNests(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.activeNpc !== INSTRUCTOR_KEY) return false;
  if (!availableWaspNestsNpcs(state, message.channelId).some((n) => n.key === INSTRUCTOR_KEY)) return false;
  await runWaspDialogue(message.channel, ctx, message.content || "...");
  return true;
}

async function runWaspDialogue(
  channel: TextBasedChannel | null,
  ctx: WaspNestsContext,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "WASP_NESTS") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "INTRO") return;

  state.talks = (state.talks ?? 0) + 1;
  const done = state.talks >= introTurns(def);
  await speak(
    channel,
    playerMessage,
    done
      ? "Esta e sua ultima fala: mande o jogador usar /mapa para isolar a area e remover os ninhos com cuidado, sem fogo forte, sem golpes e sem quebrar a parede."
      : "Explique que existem ninhos de vespas perto da Academia e que a remocao precisa proteger alunos e o predio.",
    done ? 2 : Math.min((state.talks ?? 1) - 1, 1),
  );

  if (done) {
    state.stage = "REMOVING";
    state.activeNpc = null;
    await markObjective(inst.id, "falar_instrutor");
    await setState(inst.id, state);
    if (channel && "send" in channel) await channel.send("Use `/mapa` para iniciar a remocao cuidadosa dos ninhos.");
    return;
  }
  await setState(inst.id, state);
}

function buildRemovalEmbed(
  state: WaspNestsState,
  def: NonNullable<ReturnType<typeof getMission>>,
  resultLine?: string,
): EmbedBuilder {
  const step = REMOVAL_STEPS[state.step ?? 0];
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Remocao dos Ninhos da Academia")
    .setDescription(
      [
        `Etapas concluidas: **${state.step ?? 0}/${REMOVAL_STEPS.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        resultLine ?? "",
        step ? `**${step.title}:** ${step.clue}` : "Todos os ninhos foram removidos.",
        "",
        step ? "Escolha a acao mais cuidadosa." : "",
      ].filter(Boolean).join("\n"),
    );
}

function buildRemovalMenu(instanceId: string, state: WaspNestsState): ActionRowBuilder<StringSelectMenuBuilder> {
  const index = state.step ?? 0;
  const step = REMOVAL_STEPS[index]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`wasps:remove:${instanceId}:${index + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description.slice(0, 100),
        value: option.value,
      }))),
  );
}

async function startNestRemoval(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
  actorUsername: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "WASP_NESTS") return;

  let state = ensureState(inst.stateJson);
  const msg = await channel.send({
    embeds: [buildRemovalEmbed(state, def)],
    components: [buildRemovalMenu(instanceId, state)],
  });

  while ((state.step ?? 0) < REMOVAL_STEPS.length) {
    const index = state.step ?? 0;
    const step = REMOVAL_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `wasps:remove:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let resultLine: string;
      if (pick.values[0] === step.correct) {
        state.step = index + 1;
        await markObjective(instanceId, step.objectiveId);
        resultLine = `**Sucesso:** ${step.success}`;
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        resultLine = "**Cuidado:** a escolha quase irritou as vespas ou danificou a parede.";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failWaspMission(instanceId, msg, "Erros demais. Yori interrompeu a remocao antes que alguem se machucasse ou a parede fosse danificada.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.step ?? 0) >= REMOVAL_STEPS.length;
      await pick.update({
        embeds: [buildRemovalEmbed(state, def, resultLine)],
        components: done ? [] : [buildRemovalMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      await failWaspMission(instanceId, msg, "Tempo esgotado. A movimentacao no patio ficou perigosa e a Academia cancelou a remocao.");
      return;
    }
  }

  state.stage = "FIGHT";
  state.running = false;
  state.combatStarted = true;
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("Enxame exposto")
        .setDescription("Os ninhos foram removidos, mas um enxame escapou irritado. Derrote-o sem deixar chegar nos alunos."),
    ],
    components: [],
  });
  await startWaspCombat(channel, channelId, guildId, instanceId, actorDiscordId, actorUsername);
}

async function startWaspCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
  actorUsername: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "WASP_NESTS") return;

  if (await getActiveSession(channelId)) {
    if (channel && "send" in channel) await channel.send("O enxame ja esta solto. Use `/mapa`.");
    return;
  }

  const char = await getOrCreateCharacter(actorDiscordId, guildId, actorUsername);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, {
    charId: char.id,
    name: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: {
      ninjutsu: char.attributes?.ninjutsu ?? 1,
      iryo: char.attributes?.iryo ?? 1,
      taijutsu: char.attributes?.taijutsu ?? 1,
      genjutsu: char.attributes?.genjutsu ?? 1,
      kenjutsu: char.attributes?.kenjutsu ?? 1,
    },
  });

  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "academia_genin",
    players,
    npcs: [{ templateId: waspTemplate(def) }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`Um enxame de vespas avancou perto da Academia! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

async function failWaspMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Remocao cancelada").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onWaspNestsCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "WASP_NESTS") return;
  await markObjective(inst.id, "derrotar_enxame");
  const state = ensureState(inst.stateJson);
  state.stage = "DONE";
  await setState(inst.id, state);
  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    const items = result.rewards.items?.map((i) => i.name).join(", ");
    await interaction.followUp(
      `Missao concluida: **${def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo${items ? `, ${items}` : ""}.`,
    );
  }
}
