import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { RIO_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  completeMission,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

interface FloodNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface FloodRescueVariant {
  id: string;
  villageName: string;
  riverName: string;
  riverChannelId: string;
  riverScenarioId: string;
  rescuer: FloodNpc;
  bandit: FloodNpc;
}

const KONOHA_VARIANT: FloodRescueVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  riverName: "Rio",
  riverChannelId: RIO_CHANNEL_ID,
  riverScenarioId: "rio",
  rescuer: {
    key: "flood_rescue_rescuer_konoha",
    name: "Ayuri Senju (socorrista)",
    persona: "flood_rescue_rescuer_konoha",
    imageFile: "npcs/flood-rescuer-ayuri.png",
    cell: "B2",
  },
  bandit: {
    key: "flood_rescue_bandit_konoha",
    name: "Chefe dos Bandidos do Rio",
    persona: "flood_rescue_bandit_konoha",
    imageFile: "enemies/river-bandit-leader.png",
    cell: "E6",
  },
};

const VARIANTS: Record<string, FloodRescueVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface RopeTask {
  id: string;
  label: string;
  cell: string;
  description: string;
  objectiveId: string;
}

const ROPE_TASKS: RopeTask[] = [
  {
    id: "anchor",
    label: "Ancorar corda",
    cell: "B3",
    description: "Fixar a linha principal numa arvore firme antes de alguem entrar na correnteza.",
    objectiveId: "ancorar_linha_resgate",
  },
  {
    id: "buoy",
    label: "Preparar boias",
    cell: "C4",
    description: "Amarrar boias em intervalos curtos para civis cansados nao afundarem no retorno.",
    objectiveId: "preparar_boias",
  },
  {
    id: "return",
    label: "Linha de retorno",
    cell: "D4",
    description: "Criar uma corda de volta para puxar cada civil sem nadar contra a enchente.",
    objectiveId: "montar_linha_retorno",
  },
  {
    id: "watch",
    label: "Vigia da correnteza",
    cell: "E3",
    description: "Manter alguem observando troncos e ondas fortes enquanto os outros resgatam.",
    objectiveId: "vigiar_correnteza",
  },
];

interface CivilianTask {
  id: string;
  label: string;
  cell: string;
  clue: string;
  objectiveId: string;
}

const CIVILIANS: CivilianTask[] = [
  {
    id: "child",
    label: "Crianca no tronco",
    cell: "C7",
    clue: "Esta presa num tronco que gira e pode soltar a qualquer momento.",
    objectiveId: "resgatar_crianca_tronco",
  },
  {
    id: "merchant",
    label: "Mercador com caixas",
    cell: "D5",
    clue: "As caixas dele prendem a correnteza e podem bater nos outros civis se virarem.",
    objectiveId: "resgatar_mercador_caixas",
  },
  {
    id: "fisher",
    label: "Pescador na pedra",
    cell: "B8",
    clue: "Esta assustado e cansado, mas a pedra ainda segura por alguns minutos.",
    objectiveId: "resgatar_pescador_pedra",
  },
];

const RESCUE_ORDER = ["child", "merchant", "fisher"];

export interface FloodRescueState {
  stage?: "BRIEFING" | "ROPE" | "PRIORITY" | "BANDIT" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  ropes?: Record<string, string>;
  contributors?: string[];
  rescued?: string[];
  mistakes?: number;
  banditSeen?: boolean;
  combatStarted?: boolean;
}

export interface FloodRescueChoice {
  key: string;
  name: string;
}

export interface FloodRescueContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: FloodRescueVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): FloodRescueVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): FloodRescueState {
  const state = readState<FloodRescueState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.ropes = state.ropes ?? {};
  state.contributors = state.contributors ?? [];
  state.rescued = state.rescued ?? [];
  state.mistakes = state.mistakes ?? 0;
  state.banditSeen = state.banditSeen ?? false;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function turns(
  def: FloodRescueContext["def"],
  key: "briefingTurns" | "banditTurns" | "returnTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function stepTimeout(def: FloodRescueContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 100_000);
}

function maxMistakes(def: FloodRescueContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function gruntTemplate(def: FloodRescueContext["def"]): string {
  return String(def.data?.gruntTemplate ?? "river_bandit");
}

function leaderTemplate(def: FloodRescueContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "river_bandit_leader");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<FloodRescueContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "FLOOD_RESCUE") continue;
    const variant = variantFor(def);
    if (channelId && channelId !== variant.riverChannelId) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveFloodRescue(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<FloodRescueContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const ctx = await findContextByCharId(own.id, channelId);
    if (ctx) return ctx;
  }
  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const ctx = await findContextByCharId(uc.id, channelId);
    if (ctx) return ctx;
  }
  return null;
}

export function availableFloodRescueNpcs(
  state: FloodRescueState,
  channelId: string,
  variant: FloodRescueVariant,
): FloodRescueChoice[] {
  if (channelId !== variant.riverChannelId) return [];
  if (state.stage === "BRIEFING" || state.stage === "RETURN") {
    return [{ key: variant.rescuer.key, name: state.stage === "RETURN" ? `${variant.rescuer.name} (relatorio)` : variant.rescuer.name }];
  }
  if (state.stage === "BANDIT" && !state.combatStarted) return [{ key: variant.bandit.key, name: variant.bandit.name }];
  return [];
}

export async function floodRescueMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: FloodRescueContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ctx.variant.riverChannelId) return null;
  const state = ensureState(ctx.inst.stateJson);

  if (state.stage === "BRIEFING" || state.stage === "RETURN") {
    entities.push(npcEntity(ctx.variant.rescuer), ...floodEntities(state));
    return state.stage === "BRIEFING"
      ? `\nMissao ativa: **${ctx.def.name}** - fale com a socorrista usando \`/interagir npc\`.`
      : `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio do resgate usando \`/interagir npc\`.`;
  }

  if (state.stage === "ROPE") {
    entities.push(...ropeEntities(state), ...floodEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startRopePuzzle(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - monte a linha de resgate pelo painel enviado no canal.`;
  }

  if (state.stage === "PRIORITY") {
    entities.push(...ropeEntities(state), ...civilianEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startPriorityPuzzle(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - escolha a ordem de resgate pelo menu enviado no canal. Civis seguros: **${state.rescued?.length ?? 0}/3**.`;
  }

  if (state.stage === "BANDIT") {
    entities.push(npcEntity(ctx.variant.bandit), ...civilianEntities(state));
    if (!state.banditSeen) {
      state.banditSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        ctx.variant.bandit,
        "(o time encontra bandidos escondidos perto do bloqueio que desviou troncos para o rio)",
        "Mostre irritacao porque o resgate deu certo e tente intimidar o time antes do combate.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o chefe dos bandidos usando \`/interagir npc\`.`;
  }

  if (state.stage === "FIGHT") {
    entities.push(npcEntity(ctx.variant.bandit));
    if (!(await getActiveSession(interaction.channelId))) await startFloodCombat(interaction, ctx);
    return `\nMissao ativa: **${ctx.def.name}** - derrote os bandidos que causaram o bloqueio.`;
  }

  return null;
}

function npcEntity(npc: FloodNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#1f8fbf",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function ropeEntities(state: FloodRescueState): RenderEntity[] {
  const ropes = state.ropes ?? {};
  return ROPE_TASKS.map((task) => ({
    cell: task.cell,
    label: ropes[task.id] ? "\u2705" : "\u{1FAA2}",
    color: ropes[task.id] ? "#2ecc71" : "#3498db",
    kind: "MARKER" as const,
    name: task.label,
  }));
}

function civilianEntities(state: FloodRescueState): RenderEntity[] {
  const rescued = new Set(state.rescued ?? []);
  return CIVILIANS.map((civilian) => ({
    cell: civilian.cell,
    label: rescued.has(civilian.id) ? "\u2705" : civilian.id === "child" ? "\u{1F9D2}" : civilian.id === "merchant" ? "\u{1F6D2}" : "\u{1F3A3}",
    color: rescued.has(civilian.id) ? "#2ecc71" : "#f1c40f",
    kind: "MARKER" as const,
    name: civilian.label,
  }));
}

function floodEntities(state: FloodRescueState): RenderEntity[] {
  return [
    { cell: "D6", label: "\u{1FAB5}", color: "#8e5b2a", kind: "MARKER" as const, name: "Troncos acumulados" },
    { cell: "C6", label: state.stage === "DONE" ? "\u2705" : "\u{1F30A}", color: "#3498db", kind: "MARKER" as const, name: "Correnteza forte" },
  ];
}

async function speak(
  channel: TextBasedChannel | null,
  npc: FloodNpc,
  message: string,
  extra: string,
  fallbackIndex: number,
): Promise<void> {
  const text = await NpcAiService.say(npc.persona, message, extra, fallbackIndex);
  const persona = getPersona(npc.persona);
  const sent = await sendAsPersona(channel, {
    key: npc.persona,
    name: persona?.displayName ?? npc.name,
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactFloodRescue(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveFloodRescue(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableFloodRescueNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel nesta etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Termine a conversa atual antes de falar com outro NPC.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, interaction.channelId, guildId, ctx, npcKey, "(o time inicia a conversa)", interaction.user);
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueFloodRescueMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveFloodRescue(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableFloodRescueNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: FloodRescueContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FLOOD_RESCUE") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.rescuer.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.rescuer,
      playerMessage,
      done
        ? "Ultima fala: mande o time usar /mapa para montar linha com cordas e boias antes de escolher a ordem dos civis."
        : "Explique que uma cheia prendeu civis no rio e que troncos foram desviados de proposito para piorar a correnteza.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "ROPE";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_alerta_enchente");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` para montar a linha de resgate no rio.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.bandit.key && state.stage === "BANDIT") {
    const fight = turn >= turns(def, "banditTurns", 2);
    await speak(
      channel,
      ctx.variant.bandit,
      playerMessage,
      fight
        ? "Ultima fala: admita que desviou troncos para bloquear a passagem e inicie combate com os comparsas."
        : "Tente intimidar o time, irritado porque os civis foram salvos.",
      fight ? 1 : 0,
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_bandidos_rio");
      await setState(inst.id, state);
      await startFloodCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.rescuer.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.rescuer,
      playerMessage,
      done
        ? "Ultima fala: confirme que os civis foram resgatados, os bandidos capturados e encerre a missao."
        : "Receba o relatorio sobre a linha de resgate, prioridade dos civis e causa do bloqueio.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_enchente");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        const items = result.rewards.items?.map((item) => item.name).join(", ");
        await channel.send(
          `Missao concluida: **${def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo${items ? `, ${items}` : ""}.`,
        );
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function ropeEmbed(state: FloodRescueState, partyIds: string[], result?: string): EmbedBuilder {
  const ropes = state.ropes ?? {};
  const contributors = new Set(state.contributors ?? []);
  const requiredUnique = Math.min(partyIds.length, ROPE_TASKS.length);
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Linha de Resgate")
    .setDescription(
      [
        "Preparem cordas e boias antes de entrar na correnteza.",
        "",
        ...ROPE_TASKS.map((task) => `${ropes[task.id] ? "\u2705" : "\u26AA"} **${task.label}:** ${task.description}${ropes[task.id] ? `\nResponsavel: <@${ropes[task.id]}>` : ""}`),
        "",
        `Contribuicoes da party: **${contributors.size}/${requiredUnique}**`,
        `Pontos prontos: **${Object.keys(ropes).length}/${ROPE_TASKS.length}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function ropeRows(instanceId: string, state: FloodRescueState): ActionRowBuilder<ButtonBuilder>[] {
  const ropes = state.ropes ?? {};
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...ROPE_TASKS.map((task) =>
        new ButtonBuilder()
          .setCustomId(`flood-rescue:rope:${instanceId}:${task.id}`)
          .setLabel(task.label)
          .setStyle(ropes[task.id] ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(Boolean(ropes[task.id])),
      ),
    ),
  ];
}

async function startRopePuzzle(
  channel: TextBasedChannel | null,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FLOOD_RESCUE") return;
  const partyIds = await partyMemberIds(guildId, actorDiscordId);
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [ropeEmbed(state, partyIds)], components: ropeRows(instanceId, state) });

  while (Object.keys(state.ropes ?? {}).length < ROPE_TASKS.length) {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) => i.customId.startsWith(`flood-rescue:rope:${instanceId}:`),
      })) as ButtonInteraction;

      if (!partyIds.includes(btn.user.id)) {
        await btn.reply({ content: "Apenas membros da party desta missao podem montar a linha.", ephemeral: true });
        continue;
      }

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      const taskId = btn.customId.split(":").at(-1) ?? "";
      const task = ROPE_TASKS.find((entry) => entry.id === taskId);
      if (!task || state.ropes?.[task.id]) {
        await btn.reply({ content: "Esse ponto ja esta pronto.", ephemeral: true });
        continue;
      }

      const contributors = new Set(state.contributors ?? []);
      const requiredUnique = Math.min(partyIds.length, ROPE_TASKS.length);
      if (partyIds.length > 1 && contributors.size < requiredUnique && contributors.has(btn.user.id)) {
        await btn.reply({ content: "Deixe outro membro da party assumir um ponto antes de repetir.", ephemeral: true });
        continue;
      }

      state.ropes = { ...(state.ropes ?? {}), [task.id]: btn.user.id };
      state.contributors = [...new Set([...(state.contributors ?? []), btn.user.id])];
      await markObjective(instanceId, task.objectiveId);
      await setState(instanceId, state);
      const done = Object.keys(state.ropes).length >= ROPE_TASKS.length;
      await btn.update({
        embeds: [ropeEmbed(state, partyIds, `**${task.label}** pronto por <@${btn.user.id}>.`)],
        components: done ? [] : ropeRows(instanceId, state),
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A linha de resgate foi interrompida. Use `/mapa` para retomar.");
      return;
    }
  }

  state.stage = "PRIORITY";
  state.running = false;
  await markObjective(instanceId, "montar_linha_resgate");
  await setState(instanceId, state);
  await channel.send("Linha pronta. Use `/mapa` para decidir a prioridade dos civis.");
}

function priorityEmbed(state: FloodRescueState, result?: string): EmbedBuilder {
  const rescued = new Set(state.rescued ?? []);
  const next = RESCUE_ORDER[state.rescued?.length ?? 0];
  return new EmbedBuilder()
    .setColor(0x1f8fbf)
    .setTitle("Prioridade de Resgate")
    .setDescription(
      [
        "Escolham quem resgatar agora. A ordem importa porque a correnteza muda a cada minuto.",
        "",
        ...CIVILIANS.map((civilian) => `${rescued.has(civilian.id) ? "\u2705" : civilian.id === next ? "\u26A0" : "\u26AA"} **${civilian.label}:** ${civilian.clue}`),
        "",
        `Civis seguros: **${rescued.size}/${CIVILIANS.length}**`,
        `Erros: **${state.mistakes ?? 0}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function priorityRow(instanceId: string, state: FloodRescueState): ActionRowBuilder<StringSelectMenuBuilder> {
  const rescued = new Set(state.rescued ?? []);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`flood-rescue:priority:${instanceId}`)
      .setPlaceholder("Escolher proximo resgate")
      .addOptions(
        CIVILIANS.filter((civilian) => !rescued.has(civilian.id)).map((civilian) => ({
          label: civilian.label,
          description: civilian.clue.slice(0, 100),
          value: civilian.id,
        })),
      ),
  );
}

async function failMission(instanceId: string, channel: TextBasedChannel | null, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  if (channel && "send" in channel) {
    await channel.send(`Missao falhou: **${reason}** Peça a um admin para reatribuir com \`/admin missao adicionar\`.`);
  }
}

async function startPriorityPuzzle(
  channel: TextBasedChannel | null,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FLOOD_RESCUE") return;
  const partyIds = await partyMemberIds(guildId, actorDiscordId);
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [priorityEmbed(state)], components: [priorityRow(instanceId, state)] });

  while ((state.rescued ?? []).length < CIVILIANS.length) {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) => i.customId === `flood-rescue:priority:${instanceId}`,
      })) as StringSelectMenuInteraction;

      if (!partyIds.includes(pick.user.id)) {
        await pick.reply({ content: "Apenas membros da party desta missao podem escolher a prioridade.", ephemeral: true });
        continue;
      }

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      const expected = RESCUE_ORDER[state.rescued?.length ?? 0];
      const chosen = pick.values[0] ?? "";
      const civilian = CIVILIANS.find((entry) => entry.id === chosen);
      if (!civilian || state.rescued?.includes(chosen)) {
        await pick.reply({ content: "Esse grupo ja esta seguro.", ephemeral: true });
        continue;
      }

      if (chosen !== expected) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        await setState(instanceId, state);
        if (state.mistakes >= maxMistakes(def)) {
          await pick.update({
            embeds: [priorityEmbed(state, "A correnteza mudou rapido demais e a equipe precisou recuar antes de concluir o resgate.")],
            components: [],
          });
          await failMission(instanceId, channel, "a prioridade errada colocou os civis em risco.");
          return;
        }
        await pick.update({
          embeds: [priorityEmbed(state, `<@${pick.user.id}> tentou resgatar **${civilian.label}**, mas outro civil esta em risco mais imediato.`)],
          components: [priorityRow(instanceId, state)],
        });
        continue;
      }

      state.rescued = [...new Set([...(state.rescued ?? []), chosen])];
      await markObjective(instanceId, civilian.objectiveId);
      await setState(instanceId, state);
      const done = state.rescued.length >= CIVILIANS.length;
      await pick.update({
        embeds: [priorityEmbed(state, `**${civilian.label}** resgatado com ajuda de <@${pick.user.id}>.`)],
        components: done ? [] : [priorityRow(instanceId, state)],
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A escolha de prioridade expirou. Use `/mapa` para retomar o resgate.");
      return;
    }
  }

  state.stage = "BANDIT";
  state.running = false;
  await markObjective(instanceId, "resgatar_civis_enchente");
  await setState(instanceId, state);
  await channel.send("Todos os civis foram resgatados. Marcas de corte nos troncos revelam sabotagem humana. Use `/mapa`.");
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
    attrs: {
      ninjutsu: char.attributes?.ninjutsu ?? 1,
      iryo: char.attributes?.iryo ?? 1,
      taijutsu: char.attributes?.taijutsu ?? 1,
      genjutsu: char.attributes?.genjutsu ?? 1,
      kenjutsu: char.attributes?.kenjutsu ?? 1,
    },
  };
}

async function startFloodCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: FloodRescueContext["def"],
  variant: FloodRescueVariant,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: variant.riverScenarioId,
    players,
    npcs: [
      { templateId: leaderTemplate(def) },
      { templateId: gruntTemplate(def) },
      { templateId: gruntTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`Os bandidos atacam na margem! ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`);
  }
}

async function startFloodCombat(interaction: ChatInputCommandInteraction, ctx: FloodRescueContext): Promise<void> {
  await startFloodCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

export async function onFloodRescueCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FLOOD_RESCUE") return;
  const state = ensureState(inst.stateJson);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_bandidos_rio");
  await setState(inst.id, state);
  await interaction.followUp("Os bandidos foram derrotados e o bloqueio foi controlado. Fale com a socorrista para entregar o relatorio.");
}

export function floodRescueVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
