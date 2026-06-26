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
import {
  MANSAO_HOKAGE_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
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

interface RegionalNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface DepotWorker extends RegionalNpc {
  objectiveId: string;
  fixedClue: string;
}

interface SupplyDepotVariant {
  id: string;
  villageName: string;
  administrationName: string;
  depotName: string;
  administrationChannelId: string;
  depotChannelId: string;
  depotScenarioId: string;
  clerk: RegionalNpc;
  quartermaster: RegionalNpc;
  workers: DepotWorker[];
}

const KONOHA_VARIANT: SupplyDepotVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  administrationName: "Mansao do Hokage",
  depotName: "Deposito de Suprimentos da Rota",
  administrationChannelId: MANSAO_HOKAGE_CHANNEL_ID,
  depotChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  depotScenarioId: "rota_comercial_konoha",
  clerk: {
    key: "supply_depot_clerk_konoha",
    name: "Kaede Mori (ordem de defesa)",
    persona: "supply_depot_clerk_konoha",
    imageFile: "npcs/mission-clerk-konoha.png",
    cell: "C3",
  },
  quartermaster: {
    key: "supply_depot_quartermaster_konoha",
    name: "Hideo Sarutobi (almoxarife)",
    persona: "supply_depot_quartermaster_konoha",
    imageFile: "npcs/depot-quartermaster-konoha.png",
    cell: "C3",
  },
  workers: [
    {
      key: "supply_depot_worker_sora",
      name: "Sora (estoquista)",
      persona: "supply_depot_worker_sora",
      imageFile: "npcs/depot-worker-konoha.png",
      cell: "B3",
      objectiveId: "inspecionar_sora",
      fixedClue: "Sora assinou o registro da manha e sabe que as caixas medicas usam lacre verde.",
    },
    {
      key: "supply_depot_worker_mina",
      name: "Mina (carregadora)",
      persona: "supply_depot_worker_mina",
      imageFile: "npcs/depot-worker-konoha.png",
      cell: "D4",
      objectiveId: "inspecionar_mina",
      fixedClue: "Mina assinou o registro da manha e sabe que a entrada oeste esta com a fechadura quebrada.",
    },
    {
      key: "supply_depot_worker_tetsu",
      name: "Tetsu (funcionario novo)",
      persona: "supply_depot_worker_tetsu",
      imageFile: "npcs/depot-worker-konoha.png",
      cell: "E7",
      objectiveId: "inspecionar_tetsu",
      fixedClue: "Tetsu nao aparece no registro e afirma, incorretamente, que as armas ficam na entrada leste.",
    },
  ],
};

const VARIANTS: Record<string, SupplyDepotVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface DecisionStep {
  title: string;
  clue: string;
  correct: string;
  options: { value: string; label: string; description: string }[];
}

const DEFENSE_STEPS: DecisionStep[] = [
  {
    title: "Entrada vulneravel",
    clue: "A fechadura da entrada oeste esta quebrada e marcas recentes seguem ate ela.",
    correct: "barricade_west",
    options: [
      { value: "barricade_west", label: "Barricar entrada oeste", description: "Fecha o acesso confirmado pelas pistas." },
      { value: "barricade_east", label: "Barricar entrada leste", description: "Protege uma entrada sem sinais de invasao." },
      { value: "open_both", label: "Manter as duas abertas", description: "Facilita o acesso dos invasores." },
    ],
  },
  {
    title: "Caixas prioritarias",
    clue: "Medicamentos com lacre verde precisam ficar longe das entradas durante o confronto.",
    correct: "move_medicine",
    options: [
      { value: "move_medicine", label: "Mover medicamentos", description: "Leva os itens mais urgentes para a sala interna." },
      { value: "move_tools", label: "Mover ferramentas", description: "Sao uteis, mas podem ser substituidas mais facilmente." },
      { value: "leave_all", label: "Nao mover nada", description: "Mantem os remedios expostos." },
    ],
  },
  {
    title: "Posicao do time",
    clue: "A bifurcacao da rota permite que outra equipe se aproxime sem ser vista do chao.",
    correct: "lookout",
    options: [
      { value: "lookout", label: "Posicionar um vigia", description: "Permite avisar sobre uma segunda onda." },
      { value: "all_inside", label: "Todos dentro", description: "Deixa a rota sem observacao." },
      { value: "chase", label: "Patrulhar longe", description: "Abandona as caixas durante o ataque." },
    ],
  },
];

const SUPPLY_STEPS: DecisionStep[] = [
  {
    title: "Remedios expostos",
    clue: "A primeira onda derrubou uma estante e abriu o corredor da sala interna.",
    correct: "seal_medicine",
    options: [
      { value: "seal_medicine", label: "Selar sala medica", description: "Protege os remedios antes da proxima onda." },
      { value: "count_food", label: "Contar alimentos", description: "Nao fecha o acesso aos medicamentos." },
      { value: "move_outside", label: "Levar para fora", description: "Coloca os remedios diretamente na rota." },
    ],
  },
  {
    title: "Pergaminhos de armas",
    clue: "Os selos de armazenamento foram deslocados e podem se romper com outro impacto.",
    correct: "reinforce_seals",
    options: [
      { value: "reinforce_seals", label: "Reforcar os selos", description: "Impede que armas se espalhem no deposito." },
      { value: "open_scrolls", label: "Abrir pergaminhos", description: "Expoe as armas durante o ataque." },
      { value: "stack_scrolls", label: "Empilhar pergaminhos", description: "Nao estabiliza os selos danificados." },
    ],
  },
  {
    title: "Reserva de alimentos",
    clue: "Uma lamparina caiu perto dos sacos de arroz e precisa ser removida antes do novo ataque.",
    correct: "remove_flame",
    options: [
      { value: "remove_flame", label: "Apagar e afastar a chama", description: "Evita incendio quando a segunda onda chegar." },
      { value: "wet_food", label: "Encharcar os sacos", description: "Estraga a reserva de alimentos." },
      { value: "ignore_flame", label: "Ignorar a lamparina", description: "Mantem risco de incendio no deposito." },
    ],
  },
];

export interface SupplyDepotState {
  stage?:
    | "BRIEFING"
    | "TO_DEPOT"
    | "QUARTERMASTER"
    | "INSPECT"
    | "ACCUSE"
    | "DEFENSE"
    | "WAVE_ONE"
    | "SECURE_SUPPLIES"
    | "WAVE_TWO"
    | "RETURN"
    | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  inspected?: string[];
  running?: boolean;
  mistakes?: number;
  decisionStep?: number;
  combatStarted?: boolean;
}

export interface SupplyDepotChoice {
  key: string;
  name: string;
}

export interface SupplyDepotContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: SupplyDepotVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): SupplyDepotVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): SupplyDepotState {
  const state = readState<SupplyDepotState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.inspected = state.inspected ?? [];
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  state.decisionStep = state.decisionStep ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function turns(
  def: SupplyDepotContext["def"],
  key: "briefingTurns" | "quartermasterTurns" | "workerTurns" | "thanksTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: SupplyDepotContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: SupplyDepotContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function raiderTemplate(def: SupplyDepotContext["def"]): string {
  return String(def.data?.raiderTemplate ?? "depot_raider");
}

function captainTemplate(def: SupplyDepotContext["def"]): string {
  return String(def.data?.captainTemplate ?? "depot_raider_captain");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<SupplyDepotContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "SUPPLY_DEPOT_DEFENSE") continue;
    const variant = variantFor(def);
    if (channelId && ![variant.administrationChannelId, variant.depotChannelId].includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveSupplyDepot(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<SupplyDepotContext | null> {
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

export function availableSupplyDepotNpcs(
  state: SupplyDepotState,
  channelId: string,
  variant: SupplyDepotVariant,
): SupplyDepotChoice[] {
  if (channelId === variant.administrationChannelId && state.stage === "BRIEFING") {
    return [{ key: variant.clerk.key, name: variant.clerk.name }];
  }
  if (channelId !== variant.depotChannelId) return [];
  if (state.stage === "QUARTERMASTER" || state.stage === "RETURN") {
    return [{
      key: variant.quartermaster.key,
      name: state.stage === "RETURN" ? `${variant.quartermaster.name} (relatorio)` : variant.quartermaster.name,
    }];
  }
  if (state.stage === "INSPECT") {
    if (state.activeNpc) {
      const active = variant.workers.find((worker) => worker.key === state.activeNpc);
      return active ? [{ key: active.key, name: active.name }] : [];
    }
    return variant.workers
      .filter((worker) => !(state.inspected ?? []).includes(worker.key))
      .map((worker) => ({ key: worker.key, name: worker.name }));
  }
  return [];
}

export async function supplyDepotMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: SupplyDepotContext,
  entities: RenderEntity[],
): Promise<string | null> {
  let state = ensureState(ctx.inst.stateJson);
  const { variant } = ctx;
  if (interaction.channelId === variant.administrationChannelId) {
    if (state.stage !== "BRIEFING") return null;
    entities.push(npcEntity(variant.clerk));
    return `\nMissao ativa: **${ctx.def.name}** - receba o briefing com \`/interagir npc\`.`;
  }
  if (interaction.channelId !== variant.depotChannelId) return null;

  entities.push(...depotEntities(state, variant));
  if (state.stage === "TO_DEPOT") {
    state.stage = "QUARTERMASTER";
    await markObjective(ctx.inst.id, "chegar_deposito");
    await setState(ctx.inst.id, state);
  }
  if (state.stage === "QUARTERMASTER") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com ${variant.quartermaster.name} usando \`/interagir npc\`.`;
  }
  if (state.stage === "INSPECT") {
    return `\nMissao ativa: **${ctx.def.name}** - inspecione os tres funcionarios com \`/interagir npc\`. Inspecionados: **${state.inspected?.length ?? 0}/3**.`;
  }
  if (state.stage === "ACCUSE") {
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startAccusation(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - identifique o infiltrado no painel.`;
  }
  if (state.stage === "DEFENSE") {
    if (!state.running) {
      state.running = true;
      state.decisionStep = 0;
      await setState(ctx.inst.id, state);
      void startDecisionPuzzle(interaction.channel, ctx.inst.id, interaction.user.id, "DEFENSE").catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - prepare a defesa do deposito.`;
  }
  if (state.stage === "WAVE_ONE") {
    await retryCombat(interaction, ctx, "ONE");
    return `\nMissao ativa: **${ctx.def.name}** - derrote a primeira onda de invasores.`;
  }
  if (state.stage === "SECURE_SUPPLIES") {
    if (!state.running) {
      state.running = true;
      state.decisionStep = 0;
      await setState(ctx.inst.id, state);
      void startDecisionPuzzle(interaction.channel, ctx.inst.id, interaction.user.id, "SUPPLIES").catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - proteja os suprimentos antes da segunda onda.`;
  }
  if (state.stage === "WAVE_TWO") {
    await retryCombat(interaction, ctx, "TWO");
    return `\nMissao ativa: **${ctx.def.name}** - derrote o capitao e a segunda onda.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio ao almoxarife usando \`/interagir npc\`.`;
  }
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#3498db",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function depotEntities(state: SupplyDepotState, variant: SupplyDepotVariant): RenderEntity[] {
  const entities: RenderEntity[] = [
    { cell: "B2", label: "\u{1F4E6}", color: "#27ae60", kind: "MARKER", name: "Medicamentos" },
    { cell: "D8", label: "\u{1F4DC}", color: "#8e44ad", kind: "MARKER", name: "Pergaminhos de armas" },
    { cell: "E3", label: "\u{1F35A}", color: "#f1c40f", kind: "MARKER", name: "Alimentos" },
  ];
  if (["QUARTERMASTER", "RETURN"].includes(state.stage ?? "")) entities.push(npcEntity(variant.quartermaster));
  if (["INSPECT", "ACCUSE"].includes(state.stage ?? "")) entities.push(...variant.workers.map(npcEntity));
  return entities;
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

export async function interactSupplyDepot(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveSupplyDepot(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableSupplyDepotNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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

export async function continueSupplyDepotMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveSupplyDepot(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableSupplyDepotNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, ctx, state.activeNpc, message.content || "...");
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  ctx: SupplyDepotContext,
  npcKey: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "SUPPLY_DEPOT_DEFENSE") return;
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
        ? `Ultima fala: envie o time ao ${ctx.variant.depotName}, no canal <#${ctx.variant.depotChannelId}>, para falar com o almoxarife.`
        : "Explique que o deposito recebeu ameacas e guarda medicamentos, armas seladas e alimentos da vila.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "TO_DEPOT";
      state.activeNpc = null;
      await markObjective(inst.id, "receber_ordem_defesa");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await channel.send(`Va para ${ctx.variant.depotName} e use \`/mapa\`: <#${ctx.variant.depotChannelId}>.`);
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.quartermaster.key && state.stage === "QUARTERMASTER") {
    const done = turn >= turns(def, "quartermasterTurns", 3);
    await speak(
      channel,
      ctx.variant.quartermaster,
      playerMessage,
      done
        ? "Ultima fala: explique que alguem de dentro passou informacoes aos invasores e mande inspecionar Sora, Mina e Tetsu."
        : "Apresente os tres setores de suprimentos e explique as ameacas recebidas.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "INSPECT";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_almoxarife");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` e inspecione os tres funcionarios com `/interagir npc`.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  const worker = ctx.variant.workers.find((entry) => entry.key === npcKey);
  if (worker && state.stage === "INSPECT") {
    const done = turn >= turns(def, "workerTurns", 2);
    await speak(
      channel,
      worker,
      playerMessage,
      done
        ? `Ultima fala: revele exatamente este fato fixo: ${worker.fixedClue}`
        : "Responda sobre o turno da manha, o registro e a organizacao do deposito sem revelar tudo ainda.",
      done ? 1 : 0,
    );
    if (done) {
      state.inspected = [...new Set([...(state.inspected ?? []), npcKey])];
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, worker.objectiveId);
      if (state.inspected.length === ctx.variant.workers.length) {
        state.stage = "ACCUSE";
        if (channel && "send" in channel) await channel.send("Inspecao concluida. Use `/mapa` para identificar o infiltrado.");
      }
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.quartermaster.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "thanksTurns", 2);
    await speak(
      channel,
      ctx.variant.quartermaster,
      playerMessage,
      done
        ? "Ultima fala: confirme que os tres setores foram preservados, agradeca ao time e encerre a missao."
        : "Receba o relatorio das duas ondas e confira os medicamentos, armas seladas e alimentos.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "confirmar_deposito_seguro");
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

function accusationEmbed(state: SupplyDepotState, def: SupplyDepotContext["def"]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("Quem e o infiltrado?")
    .setDescription(
      [
        "- **Sora:** assinou o registro e reconheceu o lacre verde dos medicamentos.",
        "- **Mina:** assinou o registro e informou a fechadura oeste quebrada.",
        "- **Tetsu:** nao consta no registro e indicou a localizacao errada das armas.",
        "",
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function accusationMenu(instanceId: string, variant: SupplyDepotVariant): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`supply-depot:accuse:${instanceId}`)
      .setPlaceholder("Identificar o infiltrado")
      .addOptions(variant.workers.map((worker) => ({
        label: worker.name,
        description: worker.fixedClue.slice(0, 100),
        value: worker.key,
      }))),
  );
}

async function startAccusation(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "SUPPLY_DEPOT_DEFENSE") return;
  let state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  const infiltrator = variant.workers[2]!;
  const msg = await channel.send({
    embeds: [accusationEmbed(state, def)],
    components: [accusationMenu(instanceId, variant)],
  });

  while (state.stage === "ACCUSE") {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `supply-depot:accuse:${instanceId}`,
      })) as StringSelectMenuInteraction;
      if (pick.values[0] !== infiltrator.key) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        if ((state.mistakes ?? 0) >= maxMistakes(def)) {
          await failDepotMission(instanceId, msg, "Acusacoes erradas permitiram que o infiltrado abrisse o deposito antes da defesa.");
          return;
        }
        await setState(instanceId, state);
        await pick.update({
          embeds: [accusationEmbed(state, def)],
          components: [accusationMenu(instanceId, variant)],
        });
        continue;
      }
      state.stage = "DEFENSE";
      state.running = false;
      state.decisionStep = 0;
      await markObjective(instanceId, "identificar_infiltrado_deposito");
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("Infiltrado descoberto")
            .setDescription("Tetsu foge pela rota depois de ser confrontado. O ataque e iminente. Use `/mapa` para preparar a defesa."),
        ],
        components: [],
      });
      return;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A acusacao expirou. Use `/mapa` para abrir as provas novamente.");
      return;
    }
  }
}

function decisionEmbed(
  state: SupplyDepotState,
  def: SupplyDepotContext["def"],
  mode: "DEFENSE" | "SUPPLIES",
  result?: string,
): EmbedBuilder {
  const steps = mode === "DEFENSE" ? DEFENSE_STEPS : SUPPLY_STEPS;
  const step = steps[state.decisionStep ?? 0];
  return new EmbedBuilder()
    .setColor(mode === "DEFENSE" ? 0x3498db : 0xf39c12)
    .setTitle(mode === "DEFENSE" ? "Preparar a Defesa" : "Proteger os Suprimentos")
    .setDescription(
      [
        `Etapas: **${state.decisionStep ?? 0}/${steps.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        result ?? "",
        step ? `**${step.title}:** ${step.clue}` : "Preparacao concluida.",
      ].filter(Boolean).join("\n"),
    );
}

function decisionMenu(
  instanceId: string,
  state: SupplyDepotState,
  mode: "DEFENSE" | "SUPPLIES",
): ActionRowBuilder<StringSelectMenuBuilder> {
  const steps = mode === "DEFENSE" ? DEFENSE_STEPS : SUPPLY_STEPS;
  const step = steps[state.decisionStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`supply-depot:${mode.toLowerCase()}:${instanceId}:${(state.decisionStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description,
        value: option.value,
      }))),
  );
}

async function startDecisionPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
  mode: "DEFENSE" | "SUPPLIES",
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "SUPPLY_DEPOT_DEFENSE") return;
  let state = ensureState(inst.stateJson);
  const steps = mode === "DEFENSE" ? DEFENSE_STEPS : SUPPLY_STEPS;
  const msg = await channel.send({
    embeds: [decisionEmbed(state, def, mode)],
    components: [decisionMenu(instanceId, state, mode)],
  });
  while ((state.decisionStep ?? 0) < steps.length) {
    const index = state.decisionStep ?? 0;
    const step = steps[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId &&
          i.customId === `supply-depot:${mode.toLowerCase()}:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;
      let result: string;
      if (pick.values[0] === step.correct) {
        state.decisionStep = index + 1;
        result = "**Decisao correta.**";
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Essa escolha deixaria uma entrada ou categoria de suprimentos vulneravel.**";
      }
      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failDepotMission(instanceId, msg, "Falhas de preparacao permitiram que os invasores alcancassem os suprimentos.");
        return;
      }
      await setState(instanceId, state);
      const done = (state.decisionStep ?? 0) >= steps.length;
      await pick.update({
        embeds: [decisionEmbed(state, def, mode, result)],
        components: done ? [] : [decisionMenu(instanceId, state, mode)],
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A preparacao expirou. Use `/mapa` para retomar.");
      return;
    }
  }
  state.stage = mode === "DEFENSE" ? "WAVE_ONE" : "WAVE_TWO";
  state.running = false;
  state.combatStarted = false;
  state.decisionStep = 0;
  await markObjective(instanceId, mode === "DEFENSE" ? "preparar_defesa_deposito" : "proteger_suprimentos");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle(mode === "DEFENSE" ? "Primeira onda chegando" : "Segunda onda chegando")
        .setDescription("Use `/mapa` para iniciar o combate."),
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
    attrs: {
      ninjutsu: char.attributes?.ninjutsu ?? 1,
      iryo: char.attributes?.iryo ?? 1,
      taijutsu: char.attributes?.taijutsu ?? 1,
      genjutsu: char.attributes?.genjutsu ?? 1,
      kenjutsu: char.attributes?.kenjutsu ?? 1,
    },
  };
}

async function startDepotCombat(
  interaction: ChatInputCommandInteraction,
  ctx: SupplyDepotContext,
  wave: "ONE" | "TWO",
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const { players, attrsById } = await gatherPartyPlayers(interaction.channel, guildId, starterFrom(char));
  const npcs = wave === "ONE"
    ? [{ templateId: raiderTemplate(ctx.def) }, { templateId: raiderTemplate(ctx.def) }]
    : [
        { templateId: captainTemplate(ctx.def) },
        { templateId: raiderTemplate(ctx.def) },
        { templateId: raiderTemplate(ctx.def) },
      ];
  const session = await startCombat({
    channelId: interaction.channelId,
    guildId,
    scenarioId: ctx.variant.depotScenarioId,
    players,
    npcs,
    missionInstanceId: ctx.inst.id,
  });
  await cacheAttrs(session, attrsById);
  if (interaction.channel && "send" in interaction.channel) {
    await interaction.channel.send(
      wave === "ONE"
        ? `Dois invasores atacam a entrada oeste! ${players.length} ninja(s) na defesa. Use \`/mapa\`.`
        : `O capitao lidera a segunda onda com dois invasores! ${players.length} ninja(s) na defesa. Use \`/mapa\`.`,
    );
  }
}

async function retryCombat(
  interaction: ChatInputCommandInteraction,
  ctx: SupplyDepotContext,
  wave: "ONE" | "TWO",
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  const state = ensureState(ctx.inst.stateJson);
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startDepotCombat(interaction, ctx, wave);
}

async function failDepotMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Deposito comprometido").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onSupplyDepotCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "SUPPLY_DEPOT_DEFENSE") return;
  const state = ensureState(inst.stateJson);
  if (state.stage === "WAVE_ONE") {
    state.stage = "SECURE_SUPPLIES";
    state.running = false;
    state.combatStarted = false;
    state.decisionStep = 0;
    await markObjective(inst.id, "derrotar_primeira_onda");
    await setState(inst.id, state);
    await interaction.followUp("A primeira onda caiu, mas as estantes foram atingidas. Use `/mapa` para proteger as caixas antes do novo ataque.");
    return;
  }
  if (state.stage === "WAVE_TWO") {
    state.stage = "RETURN";
    state.combatStarted = false;
    await markObjective(inst.id, "derrotar_segunda_onda");
    await setState(inst.id, state);
    await interaction.followUp("O capitao e a segunda onda foram derrotados. Fale com o almoxarife usando `/interagir npc`.");
  }
}

export function supplyDepotVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
