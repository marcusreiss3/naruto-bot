import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { ROTA_COMERCIAL_KONOHA_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

interface RouteNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface RouteTrapVariant {
  id: string;
  villageName: string;
  routeName: string;
  routeChannelId: string;
  captain: RouteNpc;
}

const KONOHA_VARIANT: RouteTrapVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  routeName: "Rota Comercial de Konoha",
  routeChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  captain: {
    key: "route_traps_captain_konoha",
    name: "Reina Nara (patrulheira da rota)",
    persona: "route_traps_captain_konoha",
    imageFile: "npcs/route-patrol-captain.png",
    cell: "C3",
  },
};

const VARIANTS: Record<string, RouteTrapVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface TrapStep {
  id: string;
  label: string;
  cell: string;
  clue: string;
  correct: string;
  objectiveId: string;
}

const TRAPS: TrapStep[] = [
  {
    id: "wire",
    label: "Fio de disparo",
    cell: "B4",
    clue: "Um fio quase invisivel passa entre duas pedras. Se puxar direto, dispara kunais laterais.",
    correct: "pin",
    objectiveId: "desarmar_fio_disparo",
  },
  {
    id: "seal",
    label: "Selo explosivo",
    cell: "C6",
    clue: "O selo esta grudado sob uma tabua rachada. Ele pulsa quando sente chakra bruto.",
    correct: "brush",
    objectiveId: "desarmar_selo_explosivo",
  },
  {
    id: "pit",
    label: "Fosso coberto",
    cell: "E5",
    clue: "Folhas novas cobrem terra fofa no meio da passagem. O perigo e o peso dos civis.",
    correct: "mark",
    objectiveId: "marcar_fosso_coberto",
  },
];

interface EscortStep {
  id: string;
  label: string;
  clue: string;
  correct: string;
  objectiveId: string;
}

const ESCORTS: EscortStep[] = [
  {
    id: "children",
    label: "Criancas assustadas",
    clue: "Elas querem correr para atravessar logo, mas ainda ha marcas falsas no chao.",
    correct: "hold",
    objectiveId: "atravessar_criancas",
  },
  {
    id: "cart",
    label: "Carroca de legumes",
    clue: "A roda pesada pode afundar no trecho remendado. Precisa passar pela margem firme.",
    correct: "guide",
    objectiveId: "atravessar_carroca",
  },
  {
    id: "elder",
    label: "Casal idoso",
    clue: "Eles caminham devagar. Um assobio suspeito tenta apressar o grupo pela rota errada.",
    correct: "screen",
    objectiveId: "atravessar_idosos",
  },
];

const TRAP_ACTIONS = [
  { id: "pin", label: "Prender gatilho", style: ButtonStyle.Primary },
  { id: "brush", label: "Raspar selo devagar", style: ButtonStyle.Secondary },
  { id: "mark", label: "Marcar desvio", style: ButtonStyle.Success },
];

const ESCORT_ACTIONS = [
  { id: "hold", label: "Segurar e orientar", style: ButtonStyle.Primary },
  { id: "guide", label: "Guiar pela margem", style: ButtonStyle.Success },
  { id: "screen", label: "Formar barreira", style: ButtonStyle.Secondary },
];

export interface RouteTrapsState {
  stage?: "BRIEFING" | "DISARM" | "ESCORT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  disarmed?: string[];
  escorted?: string[];
  mistakes?: number;
  contributors?: string[];
}

export interface RouteTrapsChoice {
  key: string;
  name: string;
}

export interface RouteTrapsContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: RouteTrapVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): RouteTrapVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): RouteTrapsState {
  const state = readState<RouteTrapsState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.disarmed = state.disarmed ?? [];
  state.escorted = state.escorted ?? [];
  state.mistakes = state.mistakes ?? 0;
  state.contributors = state.contributors ?? [];
  return state;
}

function turns(def: RouteTrapsContext["def"], key: "briefingTurns" | "returnTurns", fallback: number): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: RouteTrapsContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: RouteTrapsContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 90_000);
}

async function findContextByCharId(charId: string, channelId?: string): Promise<RouteTrapsContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "ROUTE_TRAPS") continue;
    const variant = variantFor(def);
    if (channelId && channelId !== variant.routeChannelId) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveRouteTraps(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<RouteTrapsContext | null> {
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

export function availableRouteTrapsNpcs(
  state: RouteTrapsState,
  channelId: string,
  variant: RouteTrapVariant,
): RouteTrapsChoice[] {
  if (channelId !== variant.routeChannelId) return [];
  if (state.stage === "BRIEFING") return [{ key: variant.captain.key, name: variant.captain.name }];
  if (state.stage === "RETURN") return [{ key: variant.captain.key, name: `${variant.captain.name} (relatorio)` }];
  return [];
}

export async function routeTrapsMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: RouteTrapsContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ctx.variant.routeChannelId) return null;
  const state = ensureState(ctx.inst.stateJson);

  if (state.stage === "BRIEFING" || state.stage === "RETURN") {
    entities.push(npcEntity(ctx.variant.captain));
    return state.stage === "BRIEFING"
      ? `\nMissao ativa: **${ctx.def.name}** - fale com a patrulheira usando \`/interagir npc\`.`
      : `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio da travessia usando \`/interagir npc\`.`;
  }

  if (state.stage === "DISARM") {
    entities.push(...trapEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startDisarmPuzzle(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - desarme as armadilhas pelo painel enviado no canal. Erros: **${state.mistakes}/${maxMistakes(ctx.def)}**.`;
  }

  if (state.stage === "ESCORT") {
    entities.push(...trapEntities(state), ...civilianEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startEscortPuzzle(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - proteja os civis pelo painel enviado no canal. Grupos seguros: **${state.escorted?.length ?? 0}/3**.`;
  }

  return null;
}

function npcEntity(npc: RouteNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#2c3e50",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function trapEntities(state: RouteTrapsState): RenderEntity[] {
  const done = new Set(state.disarmed ?? []);
  return TRAPS.map((trap) => ({
    cell: trap.cell,
    label: done.has(trap.id) ? "\u2705" : "\u26A0",
    color: done.has(trap.id) ? "#2ecc71" : "#e74c3c",
    kind: "MARKER" as const,
    name: trap.label,
  }));
}

function civilianEntities(state: RouteTrapsState): RenderEntity[] {
  const escorted = state.escorted?.length ?? 0;
  return [
    { cell: "A2", label: "\u{1F9D2}", color: escorted >= 1 ? "#2ecc71" : "#f1c40f", kind: "MARKER" as const, name: "Criancas" },
    { cell: "D2", label: "\u{1F6D2}", color: escorted >= 2 ? "#2ecc71" : "#f39c12", kind: "MARKER" as const, name: "Carroca" },
    { cell: "F4", label: "\u{1F9D3}", color: escorted >= 3 ? "#2ecc71" : "#95a5a6", kind: "MARKER" as const, name: "Idosos" },
  ];
}

async function speak(
  channel: TextBasedChannel | null,
  npc: RouteNpc,
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

export async function interactRouteTraps(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveRouteTraps(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableRouteTrapsNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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
  await runDialogue(interaction.channel, ctx, npcKey, "(o time inicia a conversa)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueRouteTrapsMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveRouteTraps(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableRouteTrapsNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, ctx, state.activeNpc, message.content || "...");
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  ctx: RouteTrapsContext,
  npcKey: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ROUTE_TRAPS") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.captain.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.captain,
      playerMessage,
      done
        ? "Ultima fala: mande o time usar /mapa na rota para desarmar fio de disparo, selo explosivo e fosso coberto antes dos civis atravessarem."
        : "Explique que a rota foi sabotada e civis estao presos dos dois lados esperando uma travessia segura.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DISARM";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_alerta_rota");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "investigacao",
        title: "Varredura da rota iniciada",
        description: "Localize os mecanismos antes de permitir a passagem dos civis.",
        items: ["Use `/mapa` para localizar e desarmar as armadilhas."],
        itemsTitle: "Próximo passo",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.captain.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.captain,
      playerMessage,
      done
        ? "Ultima fala: confirme que a rota foi reaberta, os civis atravessaram sem feridos e encerre a missao."
        : "Receba o relatorio sobre as armadilhas desarmadas e os civis atravessados.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_rota");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send(buildMissionCompleteEmbed(def.name, result));
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function disarmEmbed(state: RouteTrapsState, trap: TrapStep, result?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`Desarmar armadilha: ${trap.label}`)
    .setDescription(
      [
        trap.clue,
        "",
        `Armadilhas desarmadas: **${state.disarmed?.length ?? 0}/${TRAPS.length}**`,
        `Erros: **${state.mistakes ?? 0}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function escortEmbed(state: RouteTrapsState, step: EscortStep, result?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`Travessia civil: ${step.label}`)
    .setDescription(
      [
        step.clue,
        "",
        `Grupos seguros: **${state.escorted?.length ?? 0}/${ESCORTS.length}**`,
        `Erros: **${state.mistakes ?? 0}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function actionRow(instanceId: string, mode: "trap" | "escort"): ActionRowBuilder<ButtonBuilder> {
  const actions = mode === "trap" ? TRAP_ACTIONS : ESCORT_ACTIONS;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...actions.map((action) =>
      new ButtonBuilder()
        .setCustomId(`route-traps:${mode}:${instanceId}:${action.id}`)
        .setLabel(action.label)
        .setStyle(action.style),
    ),
  );
}

async function failMission(instanceId: string, channel: TextBasedChannel | null, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  if (channel && "send" in channel) {
    await channel.send(`Missao falhou: **${reason}** Peça a um admin para reatribuir com \`/admin missao adicionar\`.`);
  }
}

async function startDisarmPuzzle(
  channel: TextBasedChannel | null,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ROUTE_TRAPS") return;
  const partyIds = await partyMemberIds(guildId, actorDiscordId);
  let state = ensureState(inst.stateJson);
  let trap = TRAPS.find((entry) => !(state.disarmed ?? []).includes(entry.id));
  if (!trap) return;
  const msg = await channel.send({ embeds: [disarmEmbed(state, trap)], components: [actionRow(instanceId, "trap")] });

  while (trap) {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) => i.customId.startsWith(`route-traps:trap:${instanceId}:`),
      })) as ButtonInteraction;

      if (!partyIds.includes(btn.user.id)) {
        await btn.reply({ content: "Apenas membros da party desta missao podem mexer nas armadilhas.", ephemeral: true });
        continue;
      }

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      trap = TRAPS.find((entry) => !(state.disarmed ?? []).includes(entry.id));
      if (!trap) break;
      const action = btn.customId.split(":").at(-1) ?? "";
      if (action !== trap.correct) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        await setState(instanceId, state);
        if (state.mistakes >= maxMistakes(def)) {
          await btn.update({
            embeds: [disarmEmbed(state, trap, "O gatilho foi perturbado vezes demais e a patrulha precisou fechar a rota.")],
            components: [],
          });
          await failMission(instanceId, channel, "as armadilhas foram acionadas durante o desarme.");
          return;
        }
        await btn.update({
          embeds: [disarmEmbed(state, trap, `Acao arriscada de <@${btn.user.id}>. A armadilha ainda esta ativa.`)],
          components: [actionRow(instanceId, "trap")],
        });
        continue;
      }

      state.disarmed = [...new Set([...(state.disarmed ?? []), trap.id])];
      state.contributors = [...new Set([...(state.contributors ?? []), btn.user.id])];
      await markObjective(instanceId, trap.objectiveId);
      await setState(instanceId, state);
      trap = TRAPS.find((entry) => !(state.disarmed ?? []).includes(entry.id));
      if (!trap) {
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("Armadilhas desarmadas")
              .setDescription("A rota principal esta limpa. Agora os civis precisam atravessar com orientacao. Use `/mapa`."),
          ],
          components: [],
        });
        break;
      }
      await btn.update({
        embeds: [disarmEmbed(state, trap, `Armadilha anterior desarmada por <@${btn.user.id}>.`)],
        components: [actionRow(instanceId, "trap")],
      });
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("O desarme foi interrompido.", "Use /mapa para retomar a varredura da rota."));
      return;
    }
  }

  state.stage = "ESCORT";
  state.running = false;
  await markObjective(instanceId, "desarmar_armadilhas");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Armadilhas desarmadas")
        .setDescription("A rota principal esta limpa. Agora os civis precisam atravessar com orientacao. Use `/mapa`."),
    ],
    components: [],
  });
}

async function startEscortPuzzle(
  channel: TextBasedChannel | null,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ROUTE_TRAPS") return;
  const partyIds = await partyMemberIds(guildId, actorDiscordId);
  let state = ensureState(inst.stateJson);
  let step = ESCORTS.find((entry) => !(state.escorted ?? []).includes(entry.id));
  if (!step) return;
  const msg = await channel.send({ embeds: [escortEmbed(state, step)], components: [actionRow(instanceId, "escort")] });

  while (step) {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) => i.customId.startsWith(`route-traps:escort:${instanceId}:`),
      })) as ButtonInteraction;

      if (!partyIds.includes(btn.user.id)) {
        await btn.reply({ content: "Apenas membros da party desta missao podem orientar a travessia.", ephemeral: true });
        continue;
      }

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      step = ESCORTS.find((entry) => !(state.escorted ?? []).includes(entry.id));
      if (!step) break;
      const action = btn.customId.split(":").at(-1) ?? "";
      if (action !== step.correct) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        await setState(instanceId, state);
        if (state.mistakes >= maxMistakes(def)) {
          await btn.update({
            embeds: [escortEmbed(state, step, "A travessia ficou caotica e a patrulha evacuou os civis de volta.")],
            components: [],
          });
          await failMission(instanceId, channel, "os civis foram colocados em risco durante a travessia.");
          return;
        }
        await btn.update({
          embeds: [escortEmbed(state, step, `A orientacao de <@${btn.user.id}> quase levou o grupo pelo trecho errado.`)],
          components: [actionRow(instanceId, "escort")],
        });
        continue;
      }

      state.escorted = [...new Set([...(state.escorted ?? []), step.id])];
      state.contributors = [...new Set([...(state.contributors ?? []), btn.user.id])];
      await markObjective(instanceId, step.objectiveId);
      await setState(instanceId, state);
      step = ESCORTS.find((entry) => !(state.escorted ?? []).includes(entry.id));
      if (!step) {
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("Travessia concluida")
              .setDescription("Todos os civis atravessaram sem ferimentos. Fale com a patrulheira para entregar o relatorio."),
          ],
          components: [],
        });
        break;
      }
      await btn.update({
        embeds: [escortEmbed(state, step, `Grupo anterior atravessou em seguranca com ajuda de <@${btn.user.id}>.`)],
        components: [actionRow(instanceId, "escort")],
      });
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("A orientação dos civis foi interrompida.", "Use /mapa para retomar a travessia."));
      return;
    }
  }

  state.stage = "RETURN";
  state.running = false;
  await markObjective(instanceId, "proteger_civis");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Travessia concluida")
        .setDescription("Todos os civis atravessaram sem ferimentos. Fale com a patrulheira para entregar o relatorio."),
    ],
    components: [],
  });
}

export function routeTrapsVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
