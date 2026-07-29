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

type CorpseStage = "BRIEFING" | "INVESTIGATE" | "CONFRONT" | "FIGHT" | "RETURN" | "DONE";
type ClueId = "hospital" | "market" | "alley";

const MAX_MISTAKES = 3;
const INVESTIGATION_EMOJI = "<:investigation:1523544296379383949>";

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
  requiredEvidence: number;
  actions: { id: string; label: string; detail: string }[];
  question: string;
  deductions: { id: string; label: string }[];
  correct: string;
  success: string;
}

interface InvestigationProgress {
  evidence?: string[];
  evidenceUsers?: Record<string, string>;
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
    title: "Pulso no cad�ver",
    marker: { cell: "D4", label: "MED", color: "#74b9ff", kind: "MARKER", name: "Maca selada" },
    witness: medicNpc,
    intro:
      "O corpo foi declarado morto, mas o monitor ainda registra um pulso fraco e regular demais. Descubram se est�o diante de um cad�ver reanimado, de um clone inst�vel ou de uma v�tima mantida artificialmente entre a vida e a morte.",
    requiredEvidence: 3,
    actions: [
      { id: "pulse", label: "Medir o pulso", detail: "O pulso existe, mas bate em intervalos iguais demais. Parece regulado por selo, n�o por reflexo natural do corpo." },
      { id: "seal", label: "Procurar selos", detail: "H� micro-selos pr�ximos �s veias do pesco�o. Eles seguram o corpo em coma profundo, simulando morte aparente." },
      { id: "toxin", label: "Testar o sangue", detail: "O sangue cont�m um anest�sico raro que reduz respira��o e tremores, enganando exames m�dicos r�pidos." },
      { id: "chakra", label: "Ler o chakra", detail: "O chakra n�o nasce do corpo: ele entra por pontos finos, como se algu�m alimentasse a v�tima de fora." },
    ],
    question: "Qual � o estado real do corpo?",
    deductions: [
      { id: "dead_puppet", label: "Cad�ver reanimado por jutsu" },
      { id: "suspended_victim", label: "V�tima viva em suspens�o" },
      { id: "shadow_clone", label: "Clone inst�vel prestes a sumir" },
      { id: "poison_sleep", label: "Sono causado por veneno comum" },
    ],
    correct: "suspended_victim",
    success: "O time conclui que a v�tima ainda est� viva. O caso n�o � necromancia: algu�m est� usando medicina e selos para fingir morte.",
  },
  market: {
    id: "market",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    objectiveId: "investigar_compra_suspeita",
    title: "A compra do morto",
    marker: { cell: "E5", label: "ERV", color: "#2ecc71", kind: "MARKER", name: "Balc�o de ervas" },
    witness: {
      key: "corpse_market_herbalist",
      name: "Mina, herborista",
      persona: "corpse_market_herbalist",
      imageFile: "npcs/market_vendor_hina.png",
      cell: "E4",
    },
    intro:
      "A v�tima apareceu no mercado depois de ter sido declarada morta. A compra parece banal, mas os detalhes podem revelar se algu�m estava usando o rosto dela como disfarce vivo.",
    requiredEvidence: 3,
    actions: [
      { id: "herb", label: "Examinar as ervas", detail: "As ervas compradas reduzem batimento e tremor. Elas servem para manter algu�m parecendo morto por mais tempo." },
      { id: "receipt", label: "Checar o recibo", detail: "A assinatura copia o nome da v�tima, mas a press�o da caneta � fraca e guiada, como m�o sem for�a pr�pria." },
      { id: "coin", label: "Examinar a moeda", detail: "A moeda cheira a conservante hospitalar. Ela veio do mesmo ambiente onde o corpo estava guardado." },
      { id: "witness", label: "Ouvir Mina", detail: "Mina diz que o comprador n�o piscava e movia a cabe�a com atraso, como se obedecesse a um comando distante." },
    ],
    question: "O que a compra prova?",
    deductions: [
      { id: "victim_shopped", label: "A v�tima acordou sozinha" },
      { id: "identity_control", label: "Algu�m usou a v�tima como disfarce vivo" },
      { id: "merchant_lied", label: "Mina inventou a hist�ria" },
      { id: "simple_poison", label: "Era apenas compra de veneno" },
    ],
    correct: "identity_control",
    success: "A compra prova que o rosto da v�tima foi usado como disfarce vivo. O respons�vel queria criar apari��es imposs�veis para confundir as testemunhas.",
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
      "No beco, a v�tima foi vista andando sem apoiar o peso no ch�o. O caminho n�o parece uma fuga: parece o trajeto de um corpo controlado � dist�ncia.",
    requiredEvidence: 3,
    actions: [
      { id: "footprints", label: "Examinar o ch�o", detail: "Quase n�o h� pegadas completas. O corpo foi parcialmente suspenso e puxado por cima, sem caminhar de verdade." },
      { id: "roof", label: "Olhar os telhados", detail: "H� cortes finos nos beirais. Fios de chakra passaram por ali e queimaram a madeira." },
      { id: "needle", label: "Procurar agulhas", detail: "Uma agulha quebrada tem selo m�dico de condu��o. Ela serve para prender fios de chakra em pontos nervosos." },
      { id: "witness", label: "Ouvir Riku", detail: "Riku viu a cabe�a virar antes do resto do corpo, como uma marionete recebendo comando atrasado." },
    ],
    question: "Como a v�tima se movia?",
    deductions: [
      { id: "free_escape", label: "Ela fugia por conta pr�pria" },
      { id: "remote_control", label: "Era controlada por fios e selos" },
      { id: "wall_walk", label: "Usava andar em parede" },
      { id: "genjutsu_only", label: "Foi apenas genjutsu nas testemunhas" },
    ],
    correct: "remote_control",
    success: "Os rastros mostram controle remoto por fios de chakra e selos m�dicos. O respons�vel deve estar perto o bastante para comandar os corpos.",
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
    if (current.stage === "RETURN") return [{ key: medicNpc.key, name: `${medicNpc.name} (relat�rio)` }];
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
      ? `\nMiss�o ativa: **${ctx.def.name}** - fale com a Dra. Shiori usando \`/interagir npc\`.`
      : `\nMiss�o ativa: **${ctx.def.name}** - entregue o relat�rio final para a Dra. Shiori.`;
  }

  if (state.stage === "INVESTIGATE") {
    const clue = clueByChannel(interaction.channelId);
    if (!clue) return nextNote(state, ctx.def.name);
    if (state.clues?.[clue.id]) {
      entities.push({ ...clue.marker, name: `${clue.marker.name} (analisado)`, color: "#2ecc71" });
      return `\nMiss�o ativa: **${ctx.def.name}** - pista j� analisada: **${clue.title}**.`;
    }
    entities.push(clue.marker, npcEntity(clue.witness));
    state.runningClue = clue.id;
    await setState(ctx.inst.id, state);
    void startCluePanel(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, clue).catch(() => undefined);
    return `\nMiss�o ativa: **${ctx.def.name}** - um quadro de investiga��o foi enviado neste canal.`;
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
    return `\nMiss�o ativa: **${ctx.def.name}** - confronte Metsu usando \`/interagir npc\`.`;
  }

  if (interaction.channelId === BECO_KONOHA_CHANNEL_ID && state.stage === "FIGHT") {
    if (!(await getActiveSession(interaction.channelId))) await startCorpseCombat(interaction, ctx);
    return `\nMiss�o ativa: **${ctx.def.name}** - derrote Metsu e os corpos controlados.`;
  }

  return nextNote(state, ctx.def.name);
}

function nextNote(state: CorpsePulseState, missionName: string): string | null {
  if (state.stage === "INVESTIGATE") {
    return `\nMiss�o ativa: **${missionName}** - investigue <#${HOSPITAL_KONOHA_CHANNEL_ID}>, <#${CENTRO_COMERCIAL_CHANNEL_ID}> e <#${BECO_KONOHA_CHANNEL_ID}>.`;
  }
  if (state.stage === "CONFRONT" || state.stage === "FIGHT") {
    return `\nMiss�o ativa: **${missionName}** - siga para o Beco de Konoha: <#${BECO_KONOHA_CHANNEL_ID}>.`;
  }
  if (state.stage === "RETURN") {
    return `\nMiss�o ativa: **${missionName}** - volte ao Hospital de Konoha: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`;
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
    await interaction.reply({ content: "Voc� (ou sua party) n�o tem essa miss�o ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableCorpsePulseNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC n�o est� dispon�vel nesta etapa.", ephemeral: true });
    return;
  }
  const clue = Object.values(CLUES).find((candidate) => candidate.witness.key === npcKey);
  if (clue && state.stage === "INVESTIGATE") {
    await interaction.deferReply({ ephemeral: true });
    await speak(interaction.channel, clue.witness, "(o time pede depoimento)", "Entregue uma pista fixa sem resolver a dedu��o pelo time.", 0);
    await interaction.editReply(`Voc� ouviu **${choice.name}**. Use o quadro enviado pelo /mapa para fechar a tese.`);
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
  await interaction.editReply(`Voc� se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
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
        ? "�ltima fala: mande investigar Hospital, Centro Comercial e Beco antes que o corpo pare de respirar de vez."
        : "Explique o corpo com pulso imposs�vel e as apari��es depois da morte.",
      done ? 2 : 0,
    );
    if (done) {
      state.stage = "INVESTIGATE";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_caso_cadaver");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await channel.send(`Investiguem as tr�s frentes: <#${HOSPITAL_KONOHA_CHANNEL_ID}>, <#${CENTRO_COMERCIAL_CHANNEL_ID}> e <#${BECO_KONOHA_CHANNEL_ID}>.`);
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
        ? "�ltima fala: Metsu rejeita a pris�o, puxa os fios dos corpos controlados e inicia combate."
        : "Reaja �s provas do time com frieza cl�nica, justificando a t�cnica como aproveitamento de feridos abandonados.",
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
        ? "�ltima fala: confirme que a v�tima foi estabilizada, os selos foram removidos e a miss�o est� encerrada."
        : "Receba o relat�rio sobre o corpo em suspens�o, a compra falsa e os fios no beco.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_cadaver");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
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
  progress.evidenceUsers = progress.evidenceUsers ?? {};
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

function contributorCount(progress: Required<InvestigationProgress>): number {
  const ids = Object.keys(progress.investigators);
  if (ids.length > 0) return ids.length;
  return new Set(Object.values(progress.contributors).filter(Boolean)).size;
}

function evidenceReady(clue: ClueDef, progress: Required<InvestigationProgress>, quorum: number): boolean {
  return progress.evidence.length >= clue.requiredEvidence && contributorCount(progress) >= quorum;
}

function voteCounts(progress: Required<InvestigationProgress>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const vote of Object.values(progress.votes)) counts[vote] = (counts[vote] ?? 0) + 1;
  return counts;
}

function voteNames(progress: Required<InvestigationProgress>, deductionId: string): string[] {
  return Object.entries(progress.votes)
    .filter(([, vote]) => vote === deductionId)
    .map(([userId]) => progress.voters[userId] ?? "voto registrado");
}

function consensusPick(progress: Required<InvestigationProgress>, quorum: number): string | null {
  const counts = voteCounts(progress);
  return Object.entries(counts).find(([, count]) => count >= quorum)?.[0] ?? null;
}

function panelEmbed(state: CorpsePulseState, clue: ClueDef, allowed: Set<string>, result?: string): EmbedBuilder {
  const progress = progressFor(state, clue);
  const quorum = quorumSize(allowed);
  const ready = evidenceReady(clue, progress, quorum);
  const actions = new Map(clue.actions.map((action) => [action.id, action]));
  const deductions = new Map(clue.deductions.map((deduction) => [deduction.id, deduction]));
  const evidenceLines = progress.evidence.map((id) => {
    const action = actions.get(id);
    const author = progress.contributors[id] ? ` - ${progress.contributors[id]}` : "";
    return action ? `${INVESTIGATION_EMOJI} **${action.label}**${author}\n${action.detail}` : `${INVESTIGATION_EMOJI} ${id}`;
  });
  const counts = voteCounts(progress);
  const voteLines = clue.deductions.map((deduction) => {
    const count = counts[deduction.id] ?? 0;
    const names = voteNames(progress, deduction.id);
    return `${count > 0 ? `${count} voto(s)` : "sem votos"} - ${deduction.label}${names.length ? ` (${names.join(", ")})` : ""}`;
  });
  const consensus = consensusPick(progress, quorum);

  return new EmbedBuilder()
    .setColor(ready ? 0x9b59b6 : 0x74b9ff)
    .setTitle(`Investiga��o - ${clue.title}`)
    .setDescription([
      clue.intro,
      "",
      "Coletem evid�ncias, votem numa tese e usem **Enviar tese** quando houver consenso.",
      `Pistas conclu�das: **${Object.values(state.clues ?? {}).filter(Boolean).length}/3** | Erros: **${state.mistakes ?? 0}/${MAX_MISTAKES}**`,
      result ?? "",
    ].filter(Boolean).join("\n"))
    .addFields(
      {
        name: "Evid�ncias coletadas",
        value: evidenceLines.length > 0 ? evidenceLines.join("\n\n").slice(0, 1024) : "Nenhuma evid�ncia firme ainda.",
      },
      {
        name: "Equipe",
        value: `${contributorCount(progress)}/${quorum} participante(s) contribuindo | ${progress.evidence.length}/${clue.requiredEvidence} evid�ncias m�nimas`,
        inline: true,
      },
      {
        name: "Envio",
        value: consensus ? `Consenso atual: **${deductions.get(consensus)?.label ?? consensus}**` : "Sem consenso ainda.",
        inline: true,
      },
      {
        name: "Tese",
        value: ready ? `${clue.question}\n${voteLines.join("\n")}`.slice(0, 1024) : "Bloqueada at� a equipe reunir evid�ncias suficientes.",
      },
    );
}

function panelRows(
  instanceId: string,
  clue: ClueDef,
  state: CorpsePulseState,
  allowed: Set<string>,
  disabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const progress = progressFor(state, clue);
  const quorum = quorumSize(allowed);
  const ready = evidenceReady(clue, progress, quorum);
  const needsMoreInvestigators = contributorCount(progress) < quorum;
  const hasConsensus = Boolean(consensusPick(progress, quorum));
  const evidenceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...clue.actions.map((action) =>
      new ButtonBuilder()
        .setCustomId(`corpse-invest:${instanceId}:${clue.id}:evidence:${action.id}`)
        .setLabel(action.label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || (progress.evidence.includes(action.id) && !needsMoreInvestigators)),
    ),
  );
  const deductionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...clue.deductions.map((deduction) =>
      new ButtonBuilder()
        .setCustomId(`corpse-invest:${instanceId}:${clue.id}:deduce:${deduction.id}`)
        .setLabel(deduction.label)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || !ready),
    ),
  );
  const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`corpse-invest:${instanceId}:${clue.id}:submit:case`)
      .setLabel("Enviar tese")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !ready || !hasConsensus),
    new ButtonBuilder()
      .setCustomId(`corpse-invest:${instanceId}:${clue.id}:clear:vote`)
      .setLabel("Limpar meu voto")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !ready),
  );
  return [evidenceRow, deductionRow, controlRow];
}

async function allowedDiscordIds(instanceId: string, guildId: string): Promise<Set<string>> {
  const inst = await getInstance(instanceId);
  if (!inst) return new Set();
  const owner = await prisma.userCharacter.findUnique({ where: { id: inst.charId }, select: { discordId: true } });
  if (!owner) return new Set();
  return new Set(await partyMemberIds(guildId, owner.discordId));
}

async function startCluePanel(channel: TextBasedChannel | null, guildId: string, instanceId: string, clue: ClueDef): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CORPSE_PULSE") return;
  let state = ensureState(inst.stateJson);
  const allowed = await allowedDiscordIds(instanceId, guildId);
  progressFor(state, clue);
  const msg = await channel.send({ embeds: [panelEmbed(state, clue, allowed)], components: panelRows(instanceId, clue, state, allowed) });
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
          await btn.reply({ content: "A��o de investiga��o inv�lida.", ephemeral: true });
        continue;
      }
      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      const progress = progressFor(state, clue);
      let result: string | undefined;

      if (actionKind === "evidence") {
        const action = clue.actions.find((candidate) => candidate.id === pick);
        if (!action) {
          await btn.reply({ content: "Essa evid�ncia n�o existe nesta cena.", ephemeral: true });
          continue;
        }
        if (progress.evidence.includes(pick)) {
          if (progress.evidenceUsers[pick] === btn.user.id || progress.investigators[btn.user.id]) {
            await btn.reply({ content: "Essa evid�ncia j� foi registrada. Deixe outro membro validar outra parte.", ephemeral: true });
            continue;
          }
          progress.investigators[btn.user.id] = btn.user.username;
          result = `**${btn.user.username}** validou uma evid�ncia j� encontrada.`;
          await setState(instanceId, state);
          await btn.update({ embeds: [panelEmbed(state, clue, allowed, result)], components: panelRows(instanceId, clue, state, allowed) });
          continue;
        }
        if (allowed.size > 1 && contributorCount(progress) < quorumSize(allowed) && progress.investigators[btn.user.id]) {
          await btn.reply({ content: "Voc� j� contribuiu nesta investiga��o. Deixe outro membro da party assumir uma evid�ncia.", ephemeral: true });
          continue;
        }
        progress.evidence.push(pick);
        progress.contributors[pick] = btn.user.username;
        progress.evidenceUsers[pick] = btn.user.id;
        progress.investigators[btn.user.id] = btn.user.username;
        progress.votes = {};
        progress.voters = {};
        result = `**${btn.user.username}** adicionou uma evid�ncia ao quadro.`;
        await setState(instanceId, state);
        await btn.update({ embeds: [panelEmbed(state, clue, allowed, result)], components: panelRows(instanceId, clue, state, allowed) });
        continue;
      }

      if (actionKind === "clear") {
        delete progress.votes[btn.user.id];
        delete progress.voters[btn.user.id];
        result = `**${btn.user.username}** limpou o pr�prio voto.`;
        await setState(instanceId, state);
        await btn.update({ embeds: [panelEmbed(state, clue, allowed, result)], components: panelRows(instanceId, clue, state, allowed) });
        continue;
      }

      if (actionKind === "submit") {
        const consensus = consensusPick(progress, quorumSize(allowed));
        if (!consensus) {
          await btn.reply({ content: "Ainda n�o h� consenso.", ephemeral: true });
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
            result += `\n\nAs tr�s frentes apontam para Metsu, um m�dico renegado operando no Beco de Konoha: <#${BECO_KONOHA_CHANNEL_ID}>.`;
          }
          await setState(instanceId, state);
          await btn.update({ embeds: [panelEmbed(state, clue, allowed, result)], components: [] });
          return;
        }
        state.mistakes = (state.mistakes ?? 0) + 1;
        progress.votes = {};
        progress.voters = {};
        result = "**Tese enviada, mas rejeitada pelos fatos.** Revisem as evid�ncias antes de enviar de novo.";
        if ((state.mistakes ?? 0) >= MAX_MISTAKES) {
          state.runningClue = null;
          await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED", stateJson: JSON.stringify(state) } });
          await btn.update({
            embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Caso perdido").setDescription("Erros demais deram tempo para Metsu remover a prova viva.")],
            components: [],
          });
          return;
        }
        await setState(instanceId, state);
        await btn.update({ embeds: [panelEmbed(state, clue, allowed, result)], components: panelRows(instanceId, clue, state, allowed) });
        continue;
      }

      if (actionKind !== "deduce") {
        await btn.reply({ content: "A��o de investiga��o inv�lida.", ephemeral: true });
        continue;
      }
      if (!evidenceReady(clue, progress, quorumSize(allowed))) {
        await btn.reply({ content: "Ainda faltam evid�ncias ou participa��o da equipe para fechar uma tese.", ephemeral: true });
        continue;
      }
      progress.votes[btn.user.id] = pick;
      progress.voters[btn.user.id] = btn.user.username;
      const consensus = consensusPick(progress, quorumSize(allowed));
      result = consensus
        ? `**${btn.user.username}** votou. H� consenso; use **Enviar tese**.`
        : `**${btn.user.username}** votou. A equipe ainda precisa concordar.`;
      await setState(instanceId, state);
      await btn.update({ embeds: [panelEmbed(state, clue, allowed, result)], components: panelRows(instanceId, clue, state, allowed) });
    }
  } catch {
    state.runningClue = null;
    await setState(instanceId, state);
    await msg.edit({ embeds: [panelEmbed(state, clue, allowed, "A cena esfriou, mas o quadro foi preservado.")], components: panelRows(instanceId, clue, state, allowed, true) }).catch(() => undefined);
    await channel.send("A pista esfriou. Use `/mapa` neste canal para retomar a an�lise.");
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
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
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
  await cacheAttrs(session, attrsById);
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
  await interaction.followUp(`Metsu foi contido e a v�tima ainda respira. Volte ao Hospital de Konoha: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`);
}

