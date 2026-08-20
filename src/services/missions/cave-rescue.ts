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
import { CAVERNA_CHANNEL_ID, MANSAO_HOKAGE_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
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
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

interface RegionalNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface CaveRescueVariant {
  id: string;
  villageName: string;
  administrationName: string;
  caveName: string;
  administrationChannelId: string;
  caveChannelId: string;
  caveScenarioId: string;
  clerk: RegionalNpc;
  survivor: RegionalNpc;
  leader: RegionalNpc;
}

const KONOHA_VARIANT: CaveRescueVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  administrationName: "Mansao do Hokage",
  caveName: "Caverna",
  administrationChannelId: MANSAO_HOKAGE_CHANNEL_ID,
  caveChannelId: CAVERNA_CHANNEL_ID,
  caveScenarioId: "caverna",
  clerk: {
    key: "cave_rescue_clerk_konoha",
    name: "Kaede Mori (resgate na caverna)",
    persona: "cave_rescue_clerk_konoha",
    imageFile: "npcs/mission-clerk.png",
    cell: "C3",
  },
  survivor: {
    key: "cave_rescue_survivor_konoha",
    name: "Goro (mineiro ferido)",
    persona: "cave_rescue_survivor_konoha",
    imageFile: "npcs/miner-survivor.png",
    cell: "C5",
  },
  leader: {
    key: "cave_rescue_leader_konoha",
    name: "Chefe dos Bandidos da Mina",
    persona: "cave_rescue_leader_konoha",
    imageFile: "enemies/cave-bandit-leader.png",
    cell: "E6",
  },
};

const VARIANTS: Record<string, CaveRescueVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface BraceTask {
  id: string;
  label: string;
  objectiveId: string;
  description: string;
}

const BRACE_TASKS: BraceTask[] = [
  {
    id: "left",
    label: "Escora esquerda",
    objectiveId: "escorar_entrada_esquerda",
    description: "Segura o teto rachado perto da parede esquerda.",
  },
  {
    id: "right",
    label: "Escora direita",
    objectiveId: "escorar_entrada_direita",
    description: "Impede que a lateral direita ceda durante a tracao.",
  },
  {
    id: "rope",
    label: "Corda de tracao",
    objectiveId: "fixar_corda_tracao",
    description: "Fixa a corda na pedra maior para puxar sem deslocar o teto.",
  },
  {
    id: "stone",
    label: "Pedra central",
    objectiveId: "remover_pedra_central",
    description: "Remove a pedra central so depois das escoras ficarem firmes.",
  },
];

export interface CaveRescueState {
  stage?: "BRIEFING" | "ENTRANCE" | "SURVIVOR" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  braces?: Record<string, string>;
  contributors?: string[];
  combatStarted?: boolean;
  leaderSeen?: boolean;
}

export interface CaveRescueChoice {
  key: string;
  name: string;
}

export interface CaveRescueContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: CaveRescueVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): CaveRescueVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): CaveRescueState {
  const state = readState<CaveRescueState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.braces = state.braces ?? {};
  state.contributors = state.contributors ?? [];
  state.combatStarted = state.combatStarted ?? false;
  state.leaderSeen = state.leaderSeen ?? false;
  return state;
}

function turns(
  def: CaveRescueContext["def"],
  key: "briefingTurns" | "survivorTurns" | "leaderTurns" | "returnTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function stepTimeout(def: CaveRescueContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 120_000);
}

function banditTemplate(def: CaveRescueContext["def"]): string {
  return String(def.data?.banditTemplate ?? "cave_bandit");
}

function leaderTemplate(def: CaveRescueContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "cave_bandit_leader");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<CaveRescueContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "CAVE_RESCUE") continue;
    const variant = variantFor(def);
    if (channelId && ![variant.administrationChannelId, variant.caveChannelId].includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveCaveRescue(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<CaveRescueContext | null> {
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

export function availableCaveRescueNpcs(
  state: CaveRescueState,
  channelId: string,
  variant: CaveRescueVariant,
): CaveRescueChoice[] {
  if (channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING") return [{ key: variant.clerk.key, name: variant.clerk.name }];
    if (state.stage === "RETURN") return [{ key: variant.clerk.key, name: `${variant.clerk.name} (relatorio)` }];
  }
  if (channelId === variant.caveChannelId) {
    if (state.stage === "SURVIVOR") return [{ key: variant.survivor.key, name: variant.survivor.name }];
    if (state.stage === "FIGHT" && !state.combatStarted) return [{ key: variant.leader.key, name: variant.leader.name }];
  }
  return [];
}

export async function caveRescueMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: CaveRescueContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const { variant } = ctx;

  if (interaction.channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING" || state.stage === "RETURN") {
      entities.push(npcEntity(variant.clerk));
      return state.stage === "BRIEFING"
        ? `\nMissao ativa: **${ctx.def.name}** - receba o briefing com \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio do resgate com \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId !== variant.caveChannelId) return null;

  if (state.stage === "ENTRANCE") {
    entities.push(...rubbleEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startEntrancePuzzle(
        interaction.channel,
        interaction.guildId ?? "global",
        ctx.inst.id,
        interaction.user.id,
      ).catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - abra a entrada pelo painel enviado no canal.`;
  }

  if (state.stage === "SURVIVOR") {
    entities.push(npcEntity(variant.survivor), ...rescuedMarkers());
    return `\nMissao ativa: **${ctx.def.name}** - fale com o sobrevivente usando \`/interagir npc\`.`;
  }

  if (state.stage === "FIGHT") {
    entities.push(npcEntity(variant.leader));
    if (state.combatStarted) {
      if (!(await getActiveSession(interaction.channelId))) await startCaveCombat(interaction, ctx);
      return `\nMissao ativa: **${ctx.def.name}** - derrote os bandidos no fundo da caverna.`;
    }
    if (!state.leaderSeen) {
      state.leaderSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        variant.leader,
        "(o time encontra os bandidos tentando recolher ferramentas roubadas no fundo da caverna)",
        "Mostre surpresa por a entrada ter sido aberta e tente intimidar o time antes do combate.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o chefe dos bandidos usando \`/interagir npc\`.`;
  }

  return nextPlaceNote(ctx, state);
}

function nextPlaceNote(ctx: CaveRescueContext, state: CaveRescueState): string | null {
  const v = ctx.variant;
  if (state.stage === "ENTRANCE" || state.stage === "SURVIVOR" || state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.caveName}: <#${v.caveChannelId}>.`;
  }
  if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - volte para ${v.administrationName}: <#${v.administrationChannelId}>.`;
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#7f8c8d",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function rubbleEntities(state: CaveRescueState): RenderEntity[] {
  const done = new Set(Object.keys(state.braces ?? {}));
  return [
    { cell: "B3", task: "left" },
    { cell: "B8", task: "right" },
    { cell: "C5", task: "rope" },
    { cell: "D5", task: "stone" },
  ].map((entry) => ({
    cell: entry.cell,
    label: done.has(entry.task) ? "\u{2705}" : "\u{1FAA8}",
    color: done.has(entry.task) ? "#2ecc71" : "#95a5a6",
    kind: "MARKER",
    name: BRACE_TASKS.find((task) => task.id === entry.task)?.label ?? "Entulho",
  }));
}

function rescuedMarkers(): RenderEntity[] {
  return [
    { cell: "C4", label: "\u{26D1}", color: "#e67e22", kind: "MARKER", name: "Ferramentas presas" },
    { cell: "D6", label: "\u{1FA78}", color: "#e74c3c", kind: "MARKER", name: "Kit de primeiros socorros" },
  ];
}

async function speak(
  channel: TextBasedChannel | null,
  npc: RegionalNpc,
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

export async function interactCaveRescue(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveCaveRescue(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableCaveRescueNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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
  await runDialogue(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    ctx,
    npcKey,
    "(o time inicia a conversa)",
    interaction.user,
  );
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueCaveRescueMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveCaveRescue(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableCaveRescueNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(
    message.channel,
    message.channelId,
    message.guildId,
    ctx,
    state.activeNpc,
    message.content || "...",
    message.author,
  );
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: CaveRescueContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CAVE_RESCUE") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.clerk.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.clerk,
      playerMessage,
      done
        ? `Ultima fala: mande o time para ${ctx.variant.caveName}, no canal <#${ctx.variant.caveChannelId}>, para abrir a entrada com cuidado.`
        : "Explique que trabalhadores ficaram presos numa mina antiga apos um desabamento provocado por bandidos.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "ENTRANCE";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_ordem_resgate");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send(`Va para ${ctx.variant.caveName} e use \`/mapa\`: <#${ctx.variant.caveChannelId}>.`);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.survivor.key && state.stage === "SURVIVOR") {
    const done = turn >= turns(def, "survivorTurns", 3);
    await speak(
      channel,
      ctx.variant.survivor,
      playerMessage,
      done
        ? "Ultima fala: diga claramente que os bandidos provocaram o desabamento para roubar ferramentas e ainda estao no fundo da caverna."
        : "Fale como mineiro ferido, aliviado por respirar ar limpo, mas preocupado com colegas e sons no fundo da galeria.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "falar_sobrevivente");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "descoberta",
        title: "Bandidos localizados",
        description: "O sobrevivente confirmou que o grupo responsável está no fundo da caverna.",
        items: ["Use `/mapa` para avançar e confrontá-los."],
        itemsTitle: "Próximo passo",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.leader.key && state.stage === "FIGHT" && !state.combatStarted) {
    const fight = turn >= turns(def, "leaderTurns", 2);
    await speak(
      channel,
      ctx.variant.leader,
      playerMessage,
      fight
        ? "Ultima fala: ordene que os comparsas terminem o roubo e inicie combate no fundo da caverna."
        : "Tente intimidar o time e negar que provocou o desabamento.",
      fight ? 1 : 0,
    );
    if (fight) {
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_bandidos_caverna");
      await setState(inst.id, state);
      await startCaveCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.clerk.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.clerk,
      playerMessage,
      done
        ? "Ultima fala: registre que os trabalhadores foram resgatados, os bandidos capturados e encerre a missao."
        : "Receba o relatorio sobre a abertura segura da entrada, o sobrevivente e o combate no fundo da caverna.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_resgate");
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

function openingEmbed(state: CaveRescueState, partyIds: string[], result?: string): EmbedBuilder {
  const braces = state.braces ?? {};
  const contributors = new Set(state.contributors ?? []);
  const requiredUnique = Math.min(partyIds.length, BRACE_TASKS.length);
  const lines = BRACE_TASKS.map((task) => {
    const userId = braces[task.id];
    return `${userId ? "\u2705" : "\u26AA"} **${task.label}:** ${task.description}${userId ? `\nResponsavel: <@${userId}>` : ""}`;
  });
  return new EmbedBuilder()
    .setColor(0x7f8c8d)
    .setTitle("Abrir Entrada da Caverna")
    .setDescription(
      [
        "A entrada cedeu em placas instaveis. Abram caminho sem derrubar o teto.",
        "",
        ...lines,
        "",
        `Contribuicoes da party: **${contributors.size}/${requiredUnique}**`,
        `Tarefas seguras: **${Object.keys(braces).length}/${BRACE_TASKS.length}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function openingRows(instanceId: string, state: CaveRescueState): ActionRowBuilder<ButtonBuilder>[] {
  const braces = state.braces ?? {};
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...BRACE_TASKS.map((task) =>
        new ButtonBuilder()
          .setCustomId(`cave-rescue:open:${instanceId}:${task.id}`)
          .setLabel(task.label)
          .setStyle(braces[task.id] ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(Boolean(braces[task.id])),
      ),
    ),
  ];
}

async function startEntrancePuzzle(
  channel: TextBasedChannel | null,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CAVE_RESCUE") return;
  const partyIds = await partyMemberIds(guildId, actorDiscordId);
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [openingEmbed(state, partyIds)], components: openingRows(instanceId, state) });

  while (Object.keys(state.braces ?? {}).length < BRACE_TASKS.length) {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) => i.customId.startsWith(`cave-rescue:open:${instanceId}:`),
      })) as ButtonInteraction;

      if (!partyIds.includes(btn.user.id)) {
        await btn.reply({ content: "Apenas membros da party desta missao podem abrir a entrada.", ephemeral: true });
        continue;
      }

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      const taskId = btn.customId.split(":").at(-1) ?? "";
      const task = BRACE_TASKS.find((entry) => entry.id === taskId);
      if (!task || state.braces?.[task.id]) {
        await btn.reply({ content: "Essa frente ja foi estabilizada.", ephemeral: true });
        continue;
      }

      const contributors = new Set(state.contributors ?? []);
      const requiredUnique = Math.min(partyIds.length, BRACE_TASKS.length);
      const needsFreshHands = partyIds.length > 1 && contributors.size < requiredUnique && contributors.has(btn.user.id);
      if (needsFreshHands) {
        await btn.reply({ content: "Deixe outro membro da party assumir uma frente antes de repetir.", ephemeral: true });
        continue;
      }

      state.braces = { ...(state.braces ?? {}), [task.id]: btn.user.id };
      state.contributors = [...new Set([...(state.contributors ?? []), btn.user.id])];
      await markObjective(instanceId, task.objectiveId);
      await setState(instanceId, state);
      const done = Object.keys(state.braces).length >= BRACE_TASKS.length;
      await btn.update({
        embeds: [openingEmbed(state, partyIds, `**${task.label}** estabilizada por <@${btn.user.id}>.`)],
        components: done ? [] : openingRows(instanceId, state),
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("A abertura da entrada foi interrompida.", "Use /mapa para retomar a entrada da caverna."));
      return;
    }
  }

  state.stage = "SURVIVOR";
  state.running = false;
  await markObjective(instanceId, "abrir_entrada_caverna");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Entrada aberta")
        .setDescription("As escoras seguraram, a pedra central saiu e ar voltou a circular. Use `/mapa` e fale com o sobrevivente."),
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

async function startCaveCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: CaveRescueContext["def"],
  variant: CaveRescueVariant,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: variant.caveScenarioId,
    players,
    npcs: [
      { templateId: leaderTemplate(def) },
      { templateId: banditTemplate(def) },
      { templateId: banditTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(
      `Os bandidos atacam no fundo da caverna! ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`,
    );
  }
}

async function startCaveCombat(interaction: ChatInputCommandInteraction, ctx: CaveRescueContext): Promise<void> {
  await startCaveCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

export async function onCaveRescueCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CAVE_RESCUE") return;
  const state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_bandidos_caverna");
  await setState(inst.id, state);
  await interaction.followUp(
    `Os bandidos foram derrotados e os trabalhadores foram escoltados para fora. Volte para ${variant.administrationName}: <#${variant.administrationChannelId}>.`,
  );
}

export function caveRescueVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
