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
  buildMissionCompleteEmbed,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

interface BridgeNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface DamagedBridgeVariant {
  id: string;
  villageName: string;
  routeName: string;
  routeChannelId: string;
  routeScenarioId: string;
  foreman: BridgeNpc;
  saboteur: BridgeNpc;
}

const KONOHA_VARIANT: DamagedBridgeVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  routeName: "Rota Comercial de Konoha",
  routeChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  routeScenarioId: "rota_comercial_konoha",
  foreman: {
    key: "damaged_bridge_foreman_konoha",
    name: "Jiro Yamashiro (mestre de obras)",
    persona: "damaged_bridge_foreman_konoha",
    imageFile: "npcs/bridge-foreman-jiro.png",
    cell: "C3",
  },
  saboteur: {
    key: "damaged_bridge_saboteur_konoha",
    name: "Lider dos Sabotadores",
    persona: "damaged_bridge_saboteur_konoha",
    imageFile: "enemies/bridge-saboteur-leader.png",
    cell: "E5",
  },
};

const VARIANTS: Record<string, DamagedBridgeVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface RepairTask {
  id: string;
  label: string;
  cell: string;
  clue: string;
  correct: string;
  objectiveId: string;
}

const REPAIRS: RepairTask[] = [
  {
    id: "north_rope",
    label: "Corda norte frouxa",
    cell: "B4",
    clue: "A corda principal ainda esta inteira, mas perdeu tensao. Se trocar a prancha antes de esticar, tudo balanca.",
    correct: "tension",
    objectiveId: "reforcar_corda_norte",
  },
  {
    id: "south_knot",
    label: "No sul cortado",
    cell: "D4",
    clue: "O no de apoio foi quase cortado por lamina. A ponte precisa de uma amarracao nova antes de receber peso.",
    correct: "knot",
    objectiveId: "refazer_no_sul",
  },
  {
    id: "middle_plank",
    label: "Prancha central rachada",
    cell: "C5",
    clue: "A madeira central estala sob pressao. Reforcar corda nao salva quem pisar direto nela.",
    correct: "plank",
    objectiveId: "trocar_prancha_central",
  },
  {
    id: "bank_anchor",
    label: "Estaca da margem solta",
    cell: "E4",
    clue: "A margem firme foi escavada. Sem uma estaca nova, a ponte abre para o lado quando a carroca passa.",
    correct: "stake",
    objectiveId: "cravar_estaca_margem",
  },
];

interface CrossingTask {
  id: string;
  label: string;
  clue: string;
  correct: string;
  objectiveId: string;
}

const CROSSINGS: CrossingTask[] = [
  {
    id: "children",
    label: "Criancas assustadas",
    clue: "Elas querem atravessar correndo. A ponte segura melhor passos pequenos, um por vez.",
    correct: "line",
    objectiveId: "atravessar_criancas_ponte",
  },
  {
    id: "cart",
    label: "Carroca de mantimentos",
    clue: "A roda pesada puxa a ponte para a margem escavada. Alguem precisa travar as laterais durante a passagem.",
    correct: "brace",
    objectiveId: "atravessar_carroca_ponte",
  },
  {
    id: "elderly",
    label: "Casal idoso",
    clue: "Eles andam devagar e podem parar no meio se a ponte balancar. Precisam de escolta bem perto.",
    correct: "escort",
    objectiveId: "atravessar_idosos_ponte",
  },
];

const REPAIR_ACTIONS = [
  { id: "tension", label: "Esticar corda", style: ButtonStyle.Primary },
  { id: "knot", label: "Refazer no", style: ButtonStyle.Secondary },
  { id: "plank", label: "Trocar prancha", style: ButtonStyle.Success },
  { id: "stake", label: "Cravar estaca", style: ButtonStyle.Danger },
] as const;

const CROSSING_ACTIONS = [
  { id: "line", label: "Fila unica", style: ButtonStyle.Primary },
  { id: "brace", label: "Travar laterais", style: ButtonStyle.Secondary },
  { id: "escort", label: "Escoltar de perto", style: ButtonStyle.Success },
] as const;

export interface DamagedBridgeState {
  stage?: "BRIEFING" | "REPAIR" | "CROSSING" | "SABOTEUR" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  repairs?: string[];
  crossings?: string[];
  mistakes?: number;
  contributors?: string[];
  leaderSeen?: boolean;
  combatStarted?: boolean;
}

export interface DamagedBridgeChoice {
  key: string;
  name: string;
}

export interface DamagedBridgeContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: DamagedBridgeVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): DamagedBridgeVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): DamagedBridgeState {
  const state = readState<DamagedBridgeState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.repairs = state.repairs ?? [];
  state.crossings = state.crossings ?? [];
  state.mistakes = state.mistakes ?? 0;
  state.contributors = state.contributors ?? [];
  state.leaderSeen = state.leaderSeen ?? false;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function turns(
  def: DamagedBridgeContext["def"],
  key: "briefingTurns" | "saboteurTurns" | "returnTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: DamagedBridgeContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: DamagedBridgeContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 100_000);
}

function gruntTemplate(def: DamagedBridgeContext["def"]): string {
  return String(def.data?.gruntTemplate ?? "bridge_saboteur");
}

function leaderTemplate(def: DamagedBridgeContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "bridge_saboteur_leader");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<DamagedBridgeContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "DAMAGED_BRIDGE") continue;
    const variant = variantFor(def);
    if (channelId && channelId !== variant.routeChannelId) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveDamagedBridge(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<DamagedBridgeContext | null> {
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

export function availableDamagedBridgeNpcs(
  state: DamagedBridgeState,
  channelId: string,
  variant: DamagedBridgeVariant,
): DamagedBridgeChoice[] {
  if (channelId !== variant.routeChannelId) return [];
  if (state.stage === "BRIEFING") return [{ key: variant.foreman.key, name: variant.foreman.name }];
  if (state.stage === "SABOTEUR" && !state.combatStarted) return [{ key: variant.saboteur.key, name: variant.saboteur.name }];
  if (state.stage === "RETURN") return [{ key: variant.foreman.key, name: `${variant.foreman.name} (relatorio)` }];
  return [];
}

export async function damagedBridgeMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: DamagedBridgeContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ctx.variant.routeChannelId) return null;
  const state = ensureState(ctx.inst.stateJson);

  if (state.stage === "BRIEFING" || state.stage === "RETURN") {
    entities.push(npcEntity(ctx.variant.foreman), ...bridgeEntities(state));
    return state.stage === "BRIEFING"
      ? `\nMissao ativa: **${ctx.def.name}** - fale com o mestre de obras usando \`/interagir npc\`.`
      : `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio da ponte usando \`/interagir npc\`.`;
  }

  if (state.stage === "REPAIR") {
    entities.push(...bridgeEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startRepairPuzzle(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - reforce a ponte pelo painel enviado no canal. Erros: **${state.mistakes}/${maxMistakes(ctx.def)}**.`;
  }

  if (state.stage === "CROSSING") {
    entities.push(...bridgeEntities(state), ...civilianEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startCrossingPuzzle(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - oriente a travessia civil pelo painel enviado no canal. Grupos seguros: **${state.crossings?.length ?? 0}/3**.`;
  }

  if (state.stage === "SABOTEUR") {
    entities.push(npcEntity(ctx.variant.saboteur), ...bridgeEntities(state));
    if (!state.leaderSeen) {
      state.leaderSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        ctx.variant.saboteur,
        "(o time encontra os sabotadores escondidos observando a ponte reparada)",
        "Mostre irritacao porque a sabotagem falhou e tente intimidar o time antes do combate.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o lider dos sabotadores usando \`/interagir npc\`.`;
  }

  if (state.stage === "FIGHT") {
    entities.push(npcEntity(ctx.variant.saboteur));
    if (!(await getActiveSession(interaction.channelId))) await startBridgeCombat(interaction, ctx);
    return `\nMissao ativa: **${ctx.def.name}** - derrote os sabotadores escondidos.`;
  }

  return null;
}

function npcEntity(npc: BridgeNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#8e5b2a",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function bridgeEntities(state: DamagedBridgeState): RenderEntity[] {
  const done = new Set(state.repairs ?? []);
  return [
    ...REPAIRS.map((task) => ({
      cell: task.cell,
      label: done.has(task.id) ? "\u2705" : "\u{1FAA2}",
      color: done.has(task.id) ? "#2ecc71" : "#a0522d",
      kind: "MARKER" as const,
      name: task.label,
    })),
    { cell: "C4", label: "\u{1F309}", color: "#3498db", kind: "MARKER" as const, name: "Ponte sabotada" },
  ];
}

function civilianEntities(state: DamagedBridgeState): RenderEntity[] {
  const done = new Set(state.crossings ?? []);
  return [
    { cell: "A3", id: "children", label: "\u{1F9D2}", name: "Criancas" },
    { cell: "B2", id: "cart", label: "\u{1F6D2}", name: "Carroca" },
    { cell: "E3", id: "elderly", label: "\u{1F9D3}", name: "Casal idoso" },
  ].map((entry) => ({
    cell: entry.cell,
    label: done.has(entry.id) ? "\u2705" : entry.label,
    color: done.has(entry.id) ? "#2ecc71" : "#f1c40f",
    kind: "MARKER" as const,
    name: entry.name,
  }));
}

async function speak(
  channel: TextBasedChannel | null,
  npc: BridgeNpc,
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

export async function interactDamagedBridge(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveDamagedBridge(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableDamagedBridgeNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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

export async function continueDamagedBridgeMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveDamagedBridge(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableDamagedBridgeNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: DamagedBridgeContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DAMAGED_BRIDGE") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.foreman.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.foreman,
      playerMessage,
      done
        ? "Ultima fala: mande o time usar /mapa para reforcar cordas, nos, pranchas e estacas antes da travessia dos civis."
        : "Explique que a ponte da rota comercial foi sabotada e civis precisam atravessar sem esperar a ponte ser reconstruida inteira.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "REPAIR";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_alerta_ponte");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` para abrir o painel de reparo da ponte.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.saboteur.key && state.stage === "SABOTEUR") {
    const fight = turn >= turns(def, "saboteurTurns", 2);
    await speak(
      channel,
      ctx.variant.saboteur,
      playerMessage,
      fight
        ? "Ultima fala: admita que sabotou a ponte para fechar a rota comercial e inicie combate com os comparsas."
        : "Tente intimidar o time, irritado porque civis atravessaram mesmo com a sabotagem.",
      fight ? 1 : 0,
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_sabotadores");
      await setState(inst.id, state);
      await startBridgeCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.foreman.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.foreman,
      playerMessage,
      done
        ? "Ultima fala: confirme que a ponte foi estabilizada, civis cruzaram e sabotadores foram capturados. Encerre a missao."
        : "Receba o relatorio sobre reparo, travessia civil e sabotadores escondidos.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_ponte");
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

function repairEmbed(state: DamagedBridgeState, task: RepairTask, result?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xa0522d)
    .setTitle(`Reparo da ponte: ${task.label}`)
    .setDescription(
      [
        task.clue,
        "",
        `Reparos seguros: **${state.repairs?.length ?? 0}/${REPAIRS.length}**`,
        `Erros: **${state.mistakes ?? 0}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function crossingEmbed(state: DamagedBridgeState, task: CrossingTask, result?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`Travessia da ponte: ${task.label}`)
    .setDescription(
      [
        task.clue,
        "",
        `Grupos seguros: **${state.crossings?.length ?? 0}/${CROSSINGS.length}**`,
        `Erros: **${state.mistakes ?? 0}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function actionRow(instanceId: string, mode: "repair" | "cross"): ActionRowBuilder<ButtonBuilder> {
  const actions = mode === "repair" ? REPAIR_ACTIONS : CROSSING_ACTIONS;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...actions.map((action) =>
      new ButtonBuilder()
        .setCustomId(`damaged-bridge:${mode}:${instanceId}:${action.id}`)
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

async function startRepairPuzzle(
  channel: TextBasedChannel | null,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DAMAGED_BRIDGE") return;
  const partyIds = await partyMemberIds(guildId, actorDiscordId);
  let state = ensureState(inst.stateJson);
  let task = REPAIRS.find((entry) => !(state.repairs ?? []).includes(entry.id));
  if (!task) return;
  const msg = await channel.send({ embeds: [repairEmbed(state, task)], components: [actionRow(instanceId, "repair")] });

  while (task) {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) => i.customId.startsWith(`damaged-bridge:repair:${instanceId}:`),
      })) as ButtonInteraction;

      if (!partyIds.includes(btn.user.id)) {
        await btn.reply({ content: "Apenas membros da party desta missao podem reparar a ponte.", ephemeral: true });
        continue;
      }

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      task = REPAIRS.find((entry) => !(state.repairs ?? []).includes(entry.id));
      if (!task) break;
      const action = btn.customId.split(":").at(-1) ?? "";
      if (action !== task.correct) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        await setState(instanceId, state);
        if (state.mistakes >= maxMistakes(def)) {
          await btn.update({
            embeds: [repairEmbed(state, task, "A ponte rangeu demais e a patrulha fechou a passagem antes que alguem se ferisse.")],
            components: [],
          });
          await failMission(instanceId, channel, "a ponte ficou instavel demais durante o reparo.");
          return;
        }
        await btn.update({
          embeds: [repairEmbed(state, task, `A tentativa de <@${btn.user.id}> fez a ponte balancar. O reparo ainda precisa da acao certa.`)],
          components: [actionRow(instanceId, "repair")],
        });
        continue;
      }

      state.repairs = [...new Set([...(state.repairs ?? []), task.id])];
      state.contributors = [...new Set([...(state.contributors ?? []), btn.user.id])];
      await markObjective(instanceId, task.objectiveId);
      await setState(instanceId, state);
      task = REPAIRS.find((entry) => !(state.repairs ?? []).includes(entry.id));
      if (!task) {
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("Ponte reforcada")
              .setDescription("Cordas, nos, prancha e estaca foram estabilizados. Agora os civis podem atravessar com orientacao."),
          ],
          components: [],
        });
        break;
      }
      await btn.update({
        embeds: [repairEmbed(state, task, `Reparo anterior concluido por <@${btn.user.id}>.`)],
        components: [actionRow(instanceId, "repair")],
      });
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("O reparo foi interrompido. Use `/mapa` para retomar a ponte.");
      return;
    }
  }

  state.stage = "CROSSING";
  state.running = false;
  await markObjective(instanceId, "reforcar_ponte");
  await setState(instanceId, state);
  await channel.send("A ponte esta reforcada. Use `/mapa` para orientar a travessia dos civis.");
}

async function startCrossingPuzzle(
  channel: TextBasedChannel | null,
  guildId: string,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DAMAGED_BRIDGE") return;
  const partyIds = await partyMemberIds(guildId, actorDiscordId);
  let state = ensureState(inst.stateJson);
  let task = CROSSINGS.find((entry) => !(state.crossings ?? []).includes(entry.id));
  if (!task) return;
  const msg = await channel.send({ embeds: [crossingEmbed(state, task)], components: [actionRow(instanceId, "cross")] });

  while (task) {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) => i.customId.startsWith(`damaged-bridge:cross:${instanceId}:`),
      })) as ButtonInteraction;

      if (!partyIds.includes(btn.user.id)) {
        await btn.reply({ content: "Apenas membros da party desta missao podem orientar os civis.", ephemeral: true });
        continue;
      }

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      task = CROSSINGS.find((entry) => !(state.crossings ?? []).includes(entry.id));
      if (!task) break;
      const action = btn.customId.split(":").at(-1) ?? "";
      if (action !== task.correct) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        await setState(instanceId, state);
        if (state.mistakes >= maxMistakes(def)) {
          await btn.update({
            embeds: [crossingEmbed(state, task, "A travessia virou tumulto e a patrulha recuou os civis para longe da ponte.")],
            components: [],
          });
          await failMission(instanceId, channel, "os civis foram colocados em risco na ponte.");
          return;
        }
        await btn.update({
          embeds: [crossingEmbed(state, task, `A orientacao de <@${btn.user.id}> quase desequilibrou o grupo.`)],
          components: [actionRow(instanceId, "cross")],
        });
        continue;
      }

      state.crossings = [...new Set([...(state.crossings ?? []), task.id])];
      state.contributors = [...new Set([...(state.contributors ?? []), btn.user.id])];
      await markObjective(instanceId, task.objectiveId);
      await setState(instanceId, state);
      task = CROSSINGS.find((entry) => !(state.crossings ?? []).includes(entry.id));
      if (!task) {
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("Civis atravessaram")
              .setDescription("Todos cruzaram a ponte sem ferimentos. Movimentos suspeitos aparecem entre as arvores."),
          ],
          components: [],
        });
        break;
      }
      await btn.update({
        embeds: [crossingEmbed(state, task, `Grupo anterior atravessou com ajuda de <@${btn.user.id}>.`)],
        components: [actionRow(instanceId, "cross")],
      });
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A travessia foi interrompida. Use `/mapa` para retomar.");
      return;
    }
  }

  state.stage = "SABOTEUR";
  state.running = false;
  await markObjective(instanceId, "atravessar_civis_ponte");
  await setState(instanceId, state);
  await channel.send("Os civis estao seguros, mas os sabotadores escondidos se revelam. Use `/mapa`.");
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

async function startBridgeCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: DamagedBridgeContext["def"],
  variant: DamagedBridgeVariant,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: variant.routeScenarioId,
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
    await channel.send(
      `Os sabotadores saem do esconderijo! ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`,
    );
  }
}

async function startBridgeCombat(interaction: ChatInputCommandInteraction, ctx: DamagedBridgeContext): Promise<void> {
  await startBridgeCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

export async function onDamagedBridgeCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DAMAGED_BRIDGE") return;
  const state = ensureState(inst.stateJson);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_sabotadores_ponte");
  await setState(inst.id, state);
  await interaction.followUp("Os sabotadores foram derrotados. Fale com o mestre de obras para entregar o relatorio da ponte.");
}

export function damagedBridgeVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
