import {
  ComponentType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import {
  BECO_KONOHA_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { v2Edit, v2Public } from "../../ui/economy-components-v2.js";
import { investigationPanel, type InvestigationMemoryView } from "../../ui/mission-investigation-v2.js";
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  canUncoverClue,
  createMemorySequence,
  evaluateMemoryChoice,
  MEMORY_MAX_ATTEMPTS,
  MEMORY_PREPARE_SECONDS,
  MEMORY_WORD_DISPLAY_MS,
  rankBInvestigationMembers,
  RANK_B_PARTY_MAX,
} from "./investigation-party.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

type CorpseStage = "BRIEFING" | "INVESTIGATE" | "CONFRONT" | "FIGHT" | "RETURN" | "DONE";
type ClueId = "hospital" | "market" | "alley";

const MAX_MISTAKES = 2;

interface RegionalNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface ClueDef {
  id: ClueId;
  channelId: string;
  objectiveId: string;
  title: string;
  marker: RenderEntity;
  witness: RegionalNpc;
  intro: string;
  memoryWords: [string, string, string, string, string];
  actions: { id: string; label: string; detail: string }[];
  question: string;
  deductions: { id: string; label: string }[];
  correct: string;
  success: string;
}

interface InvestigationProgress {
  evidence?: string[];
  lostEvidence?: string[];
  evidenceUsers?: Record<string, string>;
  attemptUsers?: Record<string, string>;
  failedAttempts?: Record<string, number>;
  contributors?: Record<string, string>;
  investigators?: Record<string, string>;
  votes?: Record<string, string>;
  voters?: Record<string, string>;
}

export interface CorpsePulseState {
  stage?: CorpseStage;
  activeNpc?: string | null;
  talks?: Record<string, number>;
  clues?: Partial<Record<ClueId, boolean>>;
  investigations?: Partial<Record<ClueId, InvestigationProgress>>;
  runningClue?: ClueId | null;
  mistakes?: number;
  combatStarted?: boolean;
  bossSeen?: boolean;
}

interface CorpsePulseContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

const medicNpc: RegionalNpc = {
  key: "corpse_medical_clerk",
  name: "Dra. Shiori",
  persona: "corpse_medical_clerk",
  imageFile: "npcs/medical-shiori.png",
  cell: "C5",
};

const bossNpc: RegionalNpc = {
  key: "corpse_doctor_metsu",
  name: "Metsu",
  persona: "corpse_doctor_metsu",
  imageFile: "enemies/corpse-doctor-metsu.png",
  cell: "D5",
};

const CLUES: Record<ClueId, ClueDef> = {
  hospital: {
    id: "hospital",
    channelId: HOSPITAL_KONOHA_CHANNEL_ID,
    objectiveId: "investigar_corpo_suspenso",
    title: "Pulso no cadáver",
    marker: { cell: "D4", label: "MED", color: "#74b9ff", kind: "MARKER", name: "Maca selada" },
    witness: medicNpc,
    intro:
      "O corpo foi declarado morto, mas o monitor ainda registra um pulso fraco e regular demais. Descubram se estão diante de um cadáver reanimado, de um clone instável ou de uma vítima mantida artificialmente entre a vida e a morte.",
    memoryWords: ["Pulso", "Selo", "Sangue", "Chakra", "Veia"],
    actions: [
      { id: "pulse", label: "Medir o pulso", detail: "O pulso existe, mas bate em intervalos iguais demais. Parece regulado por selo, não por reflexo natural do corpo." },
      { id: "seal", label: "Procurar selos", detail: "Há micro-selos próximos às veias do pescoço. Eles seguram o corpo em coma profundo, simulando morte aparente." },
      { id: "toxin", label: "Testar o sangue", detail: "O sangue contém um anestésico raro que reduz respiração e tremores, enganando exames médicos rápidos." },
      { id: "chakra", label: "Ler o chakra", detail: "O chakra não nasce do corpo: ele entra por pontos finos, como se alguém alimentasse a vítima de fora." },
    ],
    question: "Qual é o estado real do corpo?",
    deductions: [
      { id: "dead_puppet", label: "Cadáver reanimado por jutsu" },
      { id: "suspended_victim", label: "Vítima viva em suspensão" },
      { id: "shadow_clone", label: "Clone instável prestes a sumir" },
      { id: "poison_sleep", label: "Sono causado por veneno comum" },
    ],
    correct: "suspended_victim",
    success: "O time conclui que a vítima ainda está viva. O caso não é necromancia: alguém está usando medicina e selos para fingir morte.",
  },
  market: {
    id: "market",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    objectiveId: "investigar_compra_suspeita",
    title: "A compra do morto",
    marker: { cell: "E5", label: "ERV", color: "#2ecc71", kind: "MARKER", name: "Balcão de ervas" },
    witness: {
      key: "corpse_market_herbalist",
      name: "Mina, herborista",
      persona: "corpse_market_herbalist",
      imageFile: "npcs/market_vendor_hina.png",
      cell: "E4",
    },
    intro:
      "A vítima apareceu no mercado depois de ter sido declarada morta. A compra parece banal, mas os detalhes podem revelar se alguém estava usando o rosto dela como disfarce vivo.",
    memoryWords: ["Ervas", "Recibo", "Moeda", "Testemunha", "Compra"],
    actions: [
      { id: "herb", label: "Examinar as ervas", detail: "As ervas compradas reduzem batimento e tremor. Elas servem para manter alguém parecendo morto por mais tempo." },
      { id: "receipt", label: "Checar o recibo", detail: "A assinatura copia o nome da vítima, mas a pressão da caneta é fraca e guiada, como mão sem força própria." },
      { id: "coin", label: "Examinar a moeda", detail: "A moeda cheira a conservante hospitalar. Ela veio do mesmo ambiente onde o corpo estava guardado." },
      { id: "witness", label: "Ouvir Mina", detail: "Mina diz que o comprador não piscava e movia a cabeça com atraso, como se obedecesse a um comando distante." },
    ],
    question: "O que a compra prova?",
    deductions: [
      { id: "victim_shopped", label: "A vítima acordou sozinha" },
      { id: "identity_control", label: "Alguém usou a vítima como disfarce vivo" },
      { id: "merchant_lied", label: "Mina inventou a história" },
      { id: "simple_poison", label: "Era apenas compra de veneno" },
    ],
    correct: "identity_control",
    success: "A compra prova que o rosto da vítima foi usado como disfarce vivo. O responsável queria criar aparições impossíveis para confundir as testemunhas.",
  },
  alley: {
    id: "alley",
    channelId: BECO_KONOHA_CHANNEL_ID,
    objectiveId: "investigar_rastro_beco",
    title: "Rastros sem pegadas",
    marker: { cell: "C5", label: "FIO", color: "#95a5a6", kind: "MARKER", name: "Fios nos beirais" },
    witness: {
      key: "corpse_alley_witness",
      name: "Riku, vigia do beco",
      persona: "corpse_alley_witness",
      imageFile: "npcs/alley-witness.png",
      cell: "C4",
    },
    intro:
      "No beco, a vítima foi vista andando sem apoiar o peso no chão. O caminho não parece uma fuga: parece o trajeto de um corpo controlado à distância.",
    memoryWords: ["Pegadas", "Telhado", "Agulha", "Fios", "Marionete"],
    actions: [
      { id: "footprints", label: "Examinar o chão", detail: "Quase não há pegadas completas. O corpo foi parcialmente suspenso e puxado por cima, sem caminhar de verdade." },
      { id: "roof", label: "Olhar os telhados", detail: "Há cortes finos nos beirais. Fios de chakra passaram por ali e queimaram a madeira." },
      { id: "needle", label: "Procurar agulhas", detail: "Uma agulha quebrada tem selo médico de condução. Ela serve para prender fios de chakra em pontos nervosos." },
      { id: "witness", label: "Ouvir Riku", detail: "Riku viu a cabeça virar antes do resto do corpo, como uma marionete recebendo comando atrasado." },
    ],
    question: "Como a vítima se movia?",
    deductions: [
      { id: "free_escape", label: "Ela fugia por conta própria" },
      { id: "remote_control", label: "Era controlada por fios e selos" },
      { id: "wall_walk", label: "Usava andar em parede" },
      { id: "genjutsu_only", label: "Foi apenas genjutsu nas testemunhas" },
    ],
    correct: "remote_control",
    success: "Os rastros mostram controle remoto por fios de chakra e selos médicos. O responsável deve estar perto o bastante para comandar os corpos.",
  },
};
function ensureState(raw: string): CorpsePulseState {
  const state = readState<CorpsePulseState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.clues = state.clues ?? {};
  state.investigations = state.investigations ?? {};
  state.runningClue = state.runningClue ?? null;
  state.mistakes = state.mistakes ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.bossSeen = state.bossSeen ?? false;
  return state;
}

function clueByChannel(channelId: string): ClueDef | null {
  return Object.values(CLUES).find((clue) => clue.channelId === channelId) ?? null;
}

function allCluesDone(state: CorpsePulseState): boolean {
  return Object.keys(CLUES).every((key) => state.clues?.[key as ClueId]);
}

async function findContextByCharId(charId: string, channelId?: string): Promise<CorpsePulseContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "CORPSE_PULSE") continue;
    const channels = [HOSPITAL_KONOHA_CHANNEL_ID, CENTRO_COMERCIAL_CHANNEL_ID, BECO_KONOHA_CHANNEL_ID];
    if (channelId && !channels.includes(channelId)) continue;
    return { inst, def, ownerCharId: charId };
  }
  return null;
}

export async function resolveCorpsePulse(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<CorpsePulseContext | null> {
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

export function availableCorpsePulseNpcs(
  state: CorpsePulseState,
  channelId: string,
): { key: string; name: string }[] {
  const current = ensureState(JSON.stringify(state));
  if (channelId === HOSPITAL_KONOHA_CHANNEL_ID) {
    if (current.stage === "BRIEFING") return [{ key: medicNpc.key, name: medicNpc.name }];
    if (current.stage === "RETURN") return [{ key: medicNpc.key, name: `${medicNpc.name} (relatório)` }];
  }
  if (current.stage === "INVESTIGATE") {
    const clue = clueByChannel(channelId);
    if (clue && !current.clues?.[clue.id]) return [{ key: clue.witness.key, name: clue.witness.name }];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID && current.stage === "CONFRONT") {
    return [{ key: bossNpc.key, name: bossNpc.name }];
  }
  return [];
}

export async function corpsePulseMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: CorpsePulseContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  if (interaction.channelId === HOSPITAL_KONOHA_CHANNEL_ID && (state.stage === "BRIEFING" || state.stage === "RETURN")) {
    entities.push(npcEntity(medicNpc));
    return state.stage === "BRIEFING"
      ? `\nMissão ativa: **${ctx.def.name}** - fale com a Dra. Shiori usando \`/interagir npc\`.`
      : `\nMissão ativa: **${ctx.def.name}** - entregue o relatório final para a Dra. Shiori.`;
  }

  if (state.stage === "INVESTIGATE") {
    const clue = clueByChannel(interaction.channelId);
    if (!clue) return nextNote(state, ctx.def.name);
    if (state.clues?.[clue.id]) {
      entities.push({ ...clue.marker, name: `${clue.marker.name} (analisado)`, color: "#2ecc71" });
      return `\nMissão ativa: **${ctx.def.name}** - pista já analisada: **${clue.title}**.`;
    }
    entities.push(clue.marker, npcEntity(clue.witness));
    state.runningClue = clue.id;
    await setState(ctx.inst.id, state);
    void startCluePanel(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, clue).catch(() => undefined);
    return `\nMissão ativa: **${ctx.def.name}** - um quadro de investigação foi enviado neste canal.`;
  }

  if (interaction.channelId === BECO_KONOHA_CHANNEL_ID && state.stage === "CONFRONT") {
    entities.push(npcEntity(bossNpc), { cell: "E5", label: "COR", color: "#7f8c8d", kind: "NPC", name: "Corpo controlado" });
    if (!state.activeNpc) {
      state.activeNpc = bossNpc.key;
      state.talks = state.talks ?? {};
      state.talks[bossNpc.key] = Math.max(state.talks[bossNpc.key] ?? 0, 1);
      await setState(ctx.inst.id, state);
    }
    if (!state.bossSeen) {
      state.bossSeen = true;
      await setState(ctx.inst.id, state);
      await speak(interaction.channel, bossNpc, "(o time chega ao beco com as provas)", "Apresente Metsu entre fios de chakra e corpos quase vivos.", 0);
    }
    return `\nMissão ativa: **${ctx.def.name}** - confronte Metsu usando \`/interagir npc\`.`;
  }

  if (interaction.channelId === BECO_KONOHA_CHANNEL_ID && state.stage === "FIGHT") {
    if (!(await getActiveSession(interaction.channelId))) await startCorpseCombat(interaction, ctx);
    return `\nMissão ativa: **${ctx.def.name}** - derrote Metsu e os corpos controlados.`;
  }

  return nextNote(state, ctx.def.name);
}

function nextNote(state: CorpsePulseState, missionName: string): string | null {
  if (state.stage === "INVESTIGATE") {
    return `\nMissão ativa: **${missionName}** - investigue <#${HOSPITAL_KONOHA_CHANNEL_ID}>, <#${CENTRO_COMERCIAL_CHANNEL_ID}> e <#${BECO_KONOHA_CHANNEL_ID}>.`;
  }
  if (state.stage === "CONFRONT" || state.stage === "FIGHT") {
    return `\nMissão ativa: **${missionName}** - siga para o Beco de Konoha: <#${BECO_KONOHA_CHANNEL_ID}>.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissão ativa: **${missionName}** - volte ao Hospital de Konoha: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`;
  }
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#74b9ff",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

async function speak(channel: TextBasedChannel | null, npc: RegionalNpc, message: string, extra: string, fallbackIndex: number): Promise<void> {
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

export async function interactCorpsePulse(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveCorpsePulse(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Você (ou sua party) não tem essa missão ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableCorpsePulseNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC não está disponível nesta etapa.", ephemeral: true });
    return;
  }
  const clue = Object.values(CLUES).find((candidate) => candidate.witness.key === npcKey);
  if (clue && state.stage === "INVESTIGATE") {
    await interaction.deferReply({ ephemeral: true });
    await speak(interaction.channel, clue.witness, "(o time pede depoimento)", "Entregue uma pista fixa sem resolver a dedução pelo time.", 0);
    await interaction.editReply(`Você ouviu **${choice.name}**. Use o quadro enviado pelo /mapa para fechar a tese.`);
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
  await interaction.editReply(`Você se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueCorpsePulseMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveCorpsePulse(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableCorpsePulseNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: CorpsePulseContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CORPSE_PULSE") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === medicNpc.key && state.stage === "BRIEFING") {
    const done = turn >= 2;
    await speak(
      channel,
      medicNpc,
      playerMessage,
      done
        ? "Última fala: mande investigar Hospital, Centro Comercial e Beco antes que o corpo pare de respirar de vez."
        : "Explique o corpo com pulso impossível e as aparições depois da morte.",
      done ? 2 : 0,
    );
    if (done) {
      state.stage = "INVESTIGATE";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_caso_cadaver");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await sendMissionNotice(channel, {
          kind: "investigacao",
          title: "Três frentes de investigação",
          description: "O corpo, a compra suspeita e os rastros precisam ser comparados antes do confronto.",
          itemsTitle: "Locais da investigação",
          items: [
            `<#${HOSPITAL_KONOHA_CHANNEL_ID}> — corpo em suspensão`,
            `<#${CENTRO_COMERCIAL_CHANNEL_ID}> — compra realizada pela vítima`,
            `<#${BECO_KONOHA_CHANNEL_ID}> — rastros sem pegadas`,
          ],
          footer: "Entre no canal indicado e use /mapa para abrir a pista.",
        });
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === bossNpc.key && state.stage === "CONFRONT") {
    const fight = turn >= 2;
    await speak(
      channel,
      bossNpc,
      playerMessage,
      fight
        ? "Última fala: Metsu rejeita a prisão, puxa os fios dos corpos controlados e inicia combate."
        : "Reaja às provas do time com frieza clínica, justificando a técnica como aproveitamento de feridos abandonados.",
      fight ? 2 : 0,
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_medico_renegado");
      await setState(inst.id, state);
      await startCorpseCombatFromActor(channel, channelId, guildId, actor, inst.id, def);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === medicNpc.key && state.stage === "RETURN") {
    const done = turn >= 2;
    await speak(
      channel,
      medicNpc,
      playerMessage,
      done
        ? "Última fala: confirme que a vítima foi estabilizada, os selos foram removidos e a missão está encerrada."
        : "Receba o relatório sobre o corpo em suspensão, a compra falsa e os fios no beco.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_cadaver");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send(buildMissionCompleteEmbed(def.name, result));
      }
    } else {
      await setState(inst.id, state);
    }
  }
}

function progressFor(state: CorpsePulseState, clue: ClueDef): Required<InvestigationProgress> {
  state.investigations = state.investigations ?? {};
  const progress = state.investigations[clue.id] ?? {};
  progress.evidence = progress.evidence ?? [];
  progress.lostEvidence = progress.lostEvidence ?? [];
  progress.evidenceUsers = progress.evidenceUsers ?? {};
  progress.attemptUsers = progress.attemptUsers ?? { ...progress.evidenceUsers };
  progress.failedAttempts = progress.failedAttempts ?? {};
  progress.contributors = progress.contributors ?? {};
  progress.investigators = progress.investigators ?? {};
  progress.votes = progress.votes ?? {};
  progress.voters = progress.voters ?? {};
  state.investigations[clue.id] = progress;
  return progress as Required<InvestigationProgress>;
}

function quorumSize(allowed: Set<string>): number {
  return Math.min(2, Math.max(1, allowed.size));
}

function evidenceReady(clue: ClueDef, progress: Required<InvestigationProgress>): boolean {
  return new Set([...progress.evidence, ...progress.lostEvidence]).size >= clue.actions.length;
}

function voteCounts(progress: Required<InvestigationProgress>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const vote of Object.values(progress.votes)) counts[vote] = (counts[vote] ?? 0) + 1;
  return counts;
}

function consensusPick(progress: Required<InvestigationProgress>, quorum: number): string | null {
  const counts = voteCounts(progress);
  return Object.entries(counts).find(([, count]) => count >= quorum)?.[0] ?? null;
}

function cluePanel(
  instanceId: string,
  state: CorpsePulseState,
  clue: ClueDef,
  members: string[],
  page: number,
  result?: string,
  disabled = false,
  memory?: InvestigationMemoryView,
) {
  const progress = progressFor(state, clue);
  const quorum = quorumSize(new Set(members));
  const ready = evidenceReady(clue, progress);
  const consensus = consensusPick(progress, quorum);
  return investigationPanel({
    prefix: "corpse-invest",
    instanceId,
    clueId: clue.id,
    title: clue.title,
    intro: clue.intro,
    actions: clue.actions,
    deductions: clue.deductions,
    question: clue.question,
    evidence: progress.evidence,
    lostEvidence: progress.lostEvidence,
    evidenceUsers: progress.evidenceUsers,
    attemptUsers: progress.attemptUsers,
    failedAttempts: progress.failedAttempts,
    contributors: progress.contributors,
    votes: progress.votes,
    voters: progress.voters,
    members,
    completedCases: Object.values(state.clues ?? {}).filter(Boolean).length,
    totalCases: Object.keys(CLUES).length,
    mistakes: state.mistakes ?? 0,
    maxMistakes: MAX_MISTAKES,
    ready,
    consensus,
    page,
    memory,
    result,
    disabled,
  });
}

async function allowedDiscordIds(instanceId: string, guildId: string): Promise<Set<string>> {
  const inst = await getInstance(instanceId);
  if (!inst) return new Set();
  const owner = await prisma.userCharacter.findUnique({ where: { id: inst.charId }, select: { discordId: true } });
  if (!owner) return new Set();
  return new Set(rankBInvestigationMembers(await partyMemberIds(guildId, owner.discordId)));
}

async function startCluePanel(channel: TextBasedChannel | null, guildId: string, instanceId: string, clue: ClueDef): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CORPSE_PULSE") return;
  let state = ensureState(inst.stateJson);
  const allowed = await allowedDiscordIds(instanceId, guildId);
  const members = [...allowed];
  let page = 0;
  let memory: InvestigationMemoryView | undefined;
  progressFor(state, clue);
  const msg = await channel.send(v2Public(cluePanel(instanceId, state, clue, members, page)));
  const deadline = Date.now() + 300_000;
  try {
    while (Date.now() < deadline) {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: Math.max(1_000, deadline - Date.now()),
        filter: (i: ButtonInteraction) =>
          allowed.has(i.user.id) && i.customId.startsWith(`corpse-invest:${instanceId}:${clue.id}:`),
      })) as ButtonInteraction;
      const [, , , actionKind, pick] = btn.customId.split(":");
      if (!actionKind || !pick) {
          await btn.reply({ content: "Ação de investigação inválida.", ephemeral: true });
        continue;
      }
      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      const progress = progressFor(state, clue);
      let result: string | undefined;

      if (actionKind === "memory") {
        if (!memory || memory.phase !== "repeat") {
          await btn.reply({ content: "Não há um desafio aguardando resposta.", ephemeral: true });
          continue;
        }
        if (btn.user.id !== memory.ownerId) {
          await btn.reply({ content: `Este desafio pertence a <@${memory.ownerId}>.`, ephemeral: true });
          continue;
        }
        const selected = Number(pick);
        if (!Number.isInteger(selected) || selected < 0 || selected >= memory.words.length) {
          await btn.reply({ content: "Palavra inválida.", ephemeral: true });
          continue;
        }
        const actionId = memory.actionId;
        const actionNumber = clue.actions.findIndex((candidate) => candidate.id === actionId) + 1;
        const memoryResult = evaluateMemoryChoice(memory.sequence, memory.position, selected);
        if (memoryResult === "wrong") {
          const failures = (progress.failedAttempts[actionId] ?? 0) + 1;
          progress.failedAttempts[actionId] = failures;
          memory = undefined;
          if (failures >= MEMORY_MAX_ATTEMPTS) {
            progress.lostEvidence.push(actionId);
            progress.attemptUsers[actionId] = btn.user.id;
            progress.contributors[actionId] = btn.user.username;
            progress.investigators[btn.user.id] = btn.user.username;
            progress.votes = {};
            progress.voters = {};
            result = `❌ **${btn.user.username}** errou pela segunda vez. A pista ${actionNumber} foi perdida.`;
            if (evidenceReady(clue, progress)) page = clue.actions.length;
          } else {
            result = `⚠️ **${btn.user.username}** errou a sequência da pista ${actionNumber}. Ainda resta uma tentativa.`;
          }
          await setState(instanceId, state);
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
          continue;
        }
        memory.position += 1;
        if (memoryResult === "next") {
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, memory)));
          continue;
        }
        progress.evidence.push(actionId);
        progress.evidenceUsers[actionId] = btn.user.id;
        progress.attemptUsers[actionId] = btn.user.id;
        progress.contributors[actionId] = btn.user.username;
        progress.investigators[btn.user.id] = btn.user.username;
        progress.votes = {};
        progress.voters = {};
        memory = undefined;
        result = `**${btn.user.username}** repetiu a sequência e desvendou a pista ${actionNumber}.`;
        if (evidenceReady(clue, progress)) page = clue.actions.length;
        await setState(instanceId, state);
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
        continue;
      }

      if (actionKind === "page") {
        const requestedPage = Number(pick);
        if (!Number.isInteger(requestedPage) || requestedPage < 0 || requestedPage > clue.actions.length) {
          await btn.reply({ content: "Página de investigação inválida.", ephemeral: true });
          continue;
        }
        page = requestedPage;
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page)));
        continue;
      }

      if (actionKind === "evidence") {
        const action = clue.actions.find((candidate) => candidate.id === pick);
        if (!action) {
          await btn.reply({ content: "Essa evidência não existe nesta cena.", ephemeral: true });
          continue;
        }
        if (progress.evidence.includes(pick) || progress.lostEvidence.includes(pick)) {
          await btn.reply({ content: "Essa pista já foi concluída. Escolha outra página.", ephemeral: true });
          continue;
        }
        const permission = canUncoverClue(btn.user.id, members, progress.attemptUsers, clue.actions.length);
        if (!permission.ok) {
          await btn.reply({ content: permission.reason, ephemeral: true });
          continue;
        }
        const challenge: InvestigationMemoryView = {
          ownerId: btn.user.id,
          actionId: pick,
          phase: "prepare",
          words: [...clue.memoryWords],
          sequence: createMemorySequence(clue.memoryWords.length),
          position: 0,
          countdown: MEMORY_PREPARE_SECONDS,
          displayPosition: 0,
        };
        memory = challenge;
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
        for (let count = MEMORY_PREPARE_SECONDS - 1; count >= 1; count -= 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
          challenge.countdown = count;
          await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
        challenge.phase = "memorize";
        for (let position = 0; position < challenge.sequence.length; position += 1) {
          challenge.displayPosition = position;
          await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
          await new Promise<void>((resolve) => setTimeout(resolve, MEMORY_WORD_DISPLAY_MS));
        }
        challenge.phase = "repeat";
        await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
        continue;
      }

      if (actionKind === "clear") {
        delete progress.votes[btn.user.id];
        delete progress.voters[btn.user.id];
        result = `**${btn.user.username}** limpou o próprio voto.`;
        await setState(instanceId, state);
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
        continue;
      }

      if (actionKind === "submit") {
        const consensus = consensusPick(progress, quorumSize(allowed));
        if (!consensus) {
          await btn.reply({ content: "Ainda não há consenso.", ephemeral: true });
          continue;
        }
        if (consensus === clue.correct) {
          state.clues![clue.id] = true;
          state.runningClue = null;
          result = `**Tese enviada e confirmada.** ${clue.success}`;
          await markObjective(instanceId, clue.objectiveId);
          if (allCluesDone(state)) {
            state.stage = "CONFRONT";
            await markObjective(instanceId, "ligar_pistas_cadaver");
            result += `\n\nAs três frentes apontam para Metsu, um médico renegado operando no Beco de Konoha: <#${BECO_KONOHA_CHANNEL_ID}>.`;
          }
          await setState(instanceId, state);
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result, true)));
          return;
        }
        state.mistakes = (state.mistakes ?? 0) + 1;
        progress.votes = {};
        progress.voters = {};
        result = "**Tese enviada, mas rejeitada pelos fatos.** Revisem as evidências antes de enviar de novo.";
        if ((state.mistakes ?? 0) >= MAX_MISTAKES) {
          state.runningClue = null;
          await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED", stateJson: JSON.stringify(state) } });
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, "❌ Caso perdido: erros demais deram tempo para Metsu remover a prova viva.", true)));
          return;
        }
        await setState(instanceId, state);
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
        continue;
      }

      if (actionKind !== "deduce") {
        await btn.reply({ content: "Ação de investigação inválida.", ephemeral: true });
        continue;
      }
      if (!evidenceReady(clue, progress)) {
        await btn.reply({ content: "Ainda faltam evidências ou participação da equipe para fechar uma tese.", ephemeral: true });
        continue;
      }
      progress.votes[btn.user.id] = pick;
      progress.voters[btn.user.id] = btn.user.username;
      const consensus = consensusPick(progress, quorumSize(allowed));
      result = consensus
        ? `**${btn.user.username}** votou. Há consenso; use **Enviar tese**.`
        : `**${btn.user.username}** votou. A equipe ainda precisa concordar.`;
      await setState(instanceId, state);
      await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
    }
  } catch {
    state.runningClue = null;
    await setState(instanceId, state);
    await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, "A cena esfriou, mas o quadro foi preservado.", true))).catch(() => undefined);
    await sendMissionNotice(channel, pausedMissionNotice("O painel foi preservado, mas esta sessão de análise expirou."));
  }
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

async function startCorpseCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: CorpsePulseContext["def"],
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const party = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const players = party.players.slice(0, RANK_B_PARTY_MAX);
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: String(def.data?.finalScenarioId ?? "beco_konoha"),
    players,
    npcs: [
      { templateId: String(def.data?.bossTemplate ?? "corpse_doctor_metsu") },
      ...Array.from({ length: Number(def.data?.puppetCount ?? 2) }, () => ({ templateId: String(def.data?.puppetTemplate ?? "corpse_puppet") })),
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, party.attrsById);
  if (channel && "send" in channel) {
    await channel.send(`Metsu puxa fios de chakra e os corpos controlados se erguem. ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`);
  }
}

async function startCorpseCombat(interaction: ChatInputCommandInteraction, ctx: CorpsePulseContext): Promise<void> {
  await startCorpseCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
  );
}

export async function onCorpsePulseCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CORPSE_PULSE") return;
  const state = ensureState(inst.stateJson);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_medico_renegado");
  await markObjective(inst.id, "estabilizar_vitima_cadaver");
  await setState(inst.id, state);
  await interaction.followUp(`Metsu foi contido e a vítima ainda respira. Volte ao Hospital de Konoha: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`);
}

