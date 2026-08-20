import { prisma } from "../../db/client.js";
import { MISSIONS } from "../../data/missions/index.js";
import type { MissionDef } from "../../data/types.js";
import { NINJA_RANK_LABELS, type NinjaRank, type Rank } from "../../config/enums.js";
import { getMyParty } from "../party/party-service.js";

export const DAILY_MISSION_RANKS = ["D", "C", "B"] as const;
export type DailyMissionRank = (typeof DAILY_MISSION_RANKS)[number];
// null = personagem ja concluiu todas as missoes desse rank; o mural mostra
// "Sem missões disponíveis" no lugar em vez de repetir uma ja feita.
export type DailyMissionOffers = Record<DailyMissionRank, string | null>;

// Prazo pra terminar uma missao aceita no mural. Checado so' na leitura
// (sweepExpiredBoardMissions) — sem scheduler ativo, sem aviso no Discord.
const BOARD_MISSION_TTL_MS = 3 * 60 * 60 * 1000;

// Rank C: Genin so' aceita com um Chunin/Jonin/Kage na party.
// Rank B: Chunin so' aceita com OUTRO Chunin/Jonin/Kage na party.
// Kage entra na checagem (superior a Jonin) mas nao aparece no texto de erro
// a pedido — e' um caso especifico demais pra valer a pena escrever.
export function partnerRankRequirement(ninjaRank: NinjaRank, rank: DailyMissionRank): readonly NinjaRank[] | null {
  if (rank === "C" && ninjaRank === "GENIN") return ["CHUNIN", "JONIN", "KAGE"];
  if (rank === "B" && ninjaRank === "CHUNIN") return ["CHUNIN", "JONIN", "KAGE"];
  return null;
}

function boardDayKey(now = new Date()): string {
  // O fuso deixa toda a comunidade virar junta a meia-noite de Brasília,
  // independente do fuso do servidor onde o bot estiver hospedado.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === kind)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getDailyMissionBoardDay(now?: Date): string {
  return boardDayKey(now);
}

export function canClaimDailyMissionRank(ninjaRank: NinjaRank, rank: DailyMissionRank): boolean {
  if (ninjaRank === "GENIN") return rank === "D" || rank === "C";
  return ["CHUNIN", "JONIN", "KAGE"].includes(ninjaRank);
}

function isBoardMission(mission: MissionDef): mission is MissionDef & { rank: DailyMissionRank } {
  return DAILY_MISSION_RANKS.includes(mission.rank as DailyMissionRank) && mission.type !== "MESTRE_ESTILO";
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

// missionId de tudo que o personagem ja concluiu, alguma vez — usado pra
// nao repetir oferta no mural pessoal (ver makeOffers). Historico completo,
// nao so' hoje: diferente de getDailyMissionClaimedMissionIds.
async function completedMissionIds(charId: string): Promise<Set<string>> {
  const rows = await prisma.missionInstance.findMany({ where: { charId, status: "COMPLETED" }, select: { missionId: true } });
  return new Set(rows.map((row) => row.missionId));
}

async function makeOffers(charId: string, dayKey: string): Promise<DailyMissionOffers> {
  const done = await completedMissionIds(charId);
  const offers = {} as DailyMissionOffers;
  for (const rank of DAILY_MISSION_RANKS) {
    const all = MISSIONS.filter((mission) => isBoardMission(mission) && mission.rank === rank);
    if (!all.length) throw new Error(`Não há missões de rank ${rank} para o mural.`);
    const choices = all.filter((mission) => !done.has(mission.id));
    offers[rank] = choices.length ? choices[hash(`${charId}:${dayKey}:${rank}`) % choices.length]!.id : null;
  }
  return offers;
}

function parseOffers(raw: string): DailyMissionOffers | null {
  try {
    const data = JSON.parse(raw) as Partial<Record<DailyMissionRank, unknown>>;
    const offers = {} as DailyMissionOffers;
    for (const rank of DAILY_MISSION_RANKS) {
      const missionId = data[rank];
      if (missionId === null) {
        offers[rank] = null;
        continue;
      }
      const mission = typeof missionId === "string" ? MISSIONS.find((item) => item.id === missionId) : undefined;
      if (!mission || !isBoardMission(mission) || mission.rank !== rank) return null;
      offers[rank] = mission.id;
    }
    return offers;
  } catch {
    return null;
  }
}

export async function getDailyMissionBoard(charId: string, now?: Date): Promise<{ dayKey: string; offers: DailyMissionOffers }> {
  const dayKey = boardDayKey(now);
  const existing = await prisma.dailyMissionBoard.findUnique({ where: { charId_dayKey: { charId, dayKey } } });
  const parsed = existing ? parseOffers(existing.offersJson) : null;
  if (parsed) return { dayKey, offers: parsed };

  const offers = await makeOffers(charId, dayKey);
  if (existing) {
    await prisma.dailyMissionBoard.update({ where: { id: existing.id }, data: { offersJson: JSON.stringify(offers) } });
  } else {
    // O upsert absorve dois /mapa simultâneos sem trocar as ofertas do dia.
    const stored = await prisma.dailyMissionBoard.upsert({
      where: { charId_dayKey: { charId, dayKey } },
      create: { charId, dayKey, offersJson: JSON.stringify(offers) },
      update: {},
    });
    return { dayKey, offers: parseOffers(stored.offersJson) ?? offers };
  }
  return { dayKey, offers };
}

export async function getDailyMissionClaims(charId: string, dayKey: string): Promise<Set<DailyMissionRank>> {
  await sweepExpiredBoardMissions(charId, dayKey);
  const claims = await prisma.dailyMissionClaim.findMany({ where: { charId, dayKey }, select: { rank: true } });
  return new Set(claims.map((claim) => claim.rank).filter((rank): rank is DailyMissionRank => DAILY_MISSION_RANKS.includes(rank as DailyMissionRank)));
}

// missionId de tudo que o personagem tem aceito hoje — usado por /missoes
// minhas pra saber quais instancias ativas vieram do mural (so' essas podem
// ser abandonadas e "voltam" pro mural; missoes de historia nao passam por aqui).
export async function getDailyMissionClaimedMissionIds(charId: string, dayKey: string): Promise<Set<string>> {
  await sweepExpiredBoardMissions(charId, dayKey);
  const claims = await prisma.dailyMissionClaim.findMany({ where: { charId, dayKey }, select: { missionId: true } });
  return new Set(claims.map((claim) => claim.missionId));
}

// Prazo de 3h estourado sem concluir = abandono automatico e silencioso: sem
// recompensa, some do /missoes minhas, libera o rank de novo no mural. So'
// mexe em instancias com claim hoje (missoes de historia, sem expiresAt,
// nunca entram aqui).
export async function sweepExpiredBoardMissions(charId: string, dayKey: string, now = new Date()): Promise<void> {
  const claims = await prisma.dailyMissionClaim.findMany({ where: { charId, dayKey } });
  for (const claim of claims) {
    const inst = await prisma.missionInstance.findFirst({
      where: { charId, missionId: claim.missionId, status: "ACTIVE" },
    });
    if (inst?.expiresAt && inst.expiresAt.getTime() <= now.getTime()) {
      await prisma.$transaction([
        prisma.missionInstance.update({ where: { id: inst.id }, data: { status: "ABANDONED" } }),
        prisma.dailyMissionClaim.delete({ where: { id: claim.id } }),
      ]);
    }
  }
}

interface BoardParticipant {
  charId: string;
  discordId: string;
  ninjaRank: NinjaRank;
  displayName: string;
}

// Bloqueia a party inteira se QUALQUER integrante elegivel (o clamante ou
// quem na party tambem aceitaria este rank) ja usou o slot diario desse
// rank hoje — ativo (pede pra sair da party ou abandonar) ou concluido
// (so' pede pra sair, nao ha o que abandonar).
async function findBlockingParticipant(
  participants: BoardParticipant[],
  dayKey: string,
  rank: DailyMissionRank,
  selfCharId: string,
): Promise<string | null> {
  for (const participant of participants) {
    const claim = await prisma.dailyMissionClaim.findUnique({
      where: { charId_dayKey_rank: { charId: participant.charId, dayKey, rank } },
    });
    if (!claim) continue;
    const isSelf = participant.charId === selfCharId;
    const activeInst = await prisma.missionInstance.findFirst({
      where: { charId: participant.charId, missionId: claim.missionId, status: "ACTIVE" },
    });
    if (activeInst) {
      return isSelf
        ? "Você já aceitou a missão deste rank hoje."
        : `${participant.displayName} já está em uma missão ativa de rank ${rank}. Peça para ele(a) sair da party ou abandonar a missão em /missoes minhas.`;
    }
    return isSelf
      ? "Você já completou a missão deste rank hoje."
      : `${participant.displayName} já completou a missão de rank ${rank} hoje. Peça para ele(a) sair da party.`;
  }
  return null;
}

export async function claimDailyMission(
  charId: string,
  discordId: string,
  guildId: string,
  ninjaRank: NinjaRank,
  rank: DailyMissionRank,
): Promise<{ ok: boolean; mission?: MissionDef; error?: string }> {
  if (!canClaimDailyMissionRank(ninjaRank, rank)) {
    return { ok: false, error: "Seu rank ninja não pode aceitar esta missão." };
  }
  const board = await getDailyMissionBoard(charId);
  const offerId = board.offers[rank];
  if (!offerId) return { ok: false, error: "Você já completou todas as missões de rank " + rank + " disponíveis. Volte amanhã." };
  const mission = MISSIONS.find((item) => item.id === offerId);
  if (!mission || !isBoardMission(mission)) return { ok: false, error: "A oferta desta missão expirou. Abra o mural novamente." };

  await sweepExpiredBoardMissions(charId, board.dayKey);

  const party = await getMyParty(guildId, discordId);
  const partyDiscordIds = (party?.memberIds ?? []).filter((id) => id !== discordId);
  const partyChars = partyDiscordIds.length
    ? await prisma.userCharacter.findMany({
        where: { guildId, discordId: { in: partyDiscordIds } },
        select: { id: true, discordId: true, ninjaRank: true, name: true, displayName: true },
      })
    : [];

  const requirement = partnerRankRequirement(ninjaRank, rank);
  if (requirement) {
    const hasPartner = partyChars.some((member) => requirement.includes(member.ninjaRank as NinjaRank));
    if (!hasPartner) {
      const labels = requirement
        .filter((r) => r !== "KAGE")
        .map((r) => NINJA_RANK_LABELS[r])
        .join(" ou ");
      return { ok: false, error: `Você precisa de um(a) ${labels} na sua party para aceitar uma missão de rank ${rank}.` };
    }
  }

  // Quem recebe a missao junto: o clamante + integrantes da party cujo rank
  // ninja tambem aceitaria este rank sozinho (Academia e Genin em rank B
  // nunca entram — canClaimDailyMissionRank ja barra os dois).
  const participants: BoardParticipant[] = [
    { charId, discordId, ninjaRank, displayName: "Você" },
    ...partyChars
      .filter((member) => canClaimDailyMissionRank(member.ninjaRank as NinjaRank, rank))
      .map((member) => ({
        charId: member.id,
        discordId: member.discordId,
        ninjaRank: member.ninjaRank as NinjaRank,
        displayName: member.displayName ?? member.name,
      })),
  ];

  for (const participant of participants) {
    await sweepExpiredBoardMissions(participant.charId, board.dayKey);
  }

  const blocked = await findBlockingParticipant(participants, board.dayKey, rank, charId);
  if (blocked) return { ok: false, error: blocked };

  try {
    await prisma.$transaction(async (tx) => {
      const expiresAt = new Date(Date.now() + BOARD_MISSION_TTL_MS);
      for (const participant of participants) {
        // Quem entra via party numa missao que ja tinha concluido antes (por
        // isso ela nao aparece mais na propria oferta dele) pode repeti-la,
        // mas so' por metade da recompensa — ver completeMission().
        const priorCompletion = await tx.missionInstance.findFirst({
          where: { charId: participant.charId, missionId: mission.id, status: "COMPLETED" },
          select: { id: true },
        });
        const instance = await tx.missionInstance.create({
          data: { charId: participant.charId, missionId: mission.id, expiresAt, halfReward: priorCompletion !== null },
        });
        if (mission.objectives.length) {
          await tx.missionObjectiveState.createMany({
            data: mission.objectives.map((objective) => ({ instanceId: instance.id, objectiveId: objective.id })),
          });
        }
        await tx.dailyMissionClaim.create({
          data: { charId: participant.charId, dayKey: board.dayKey, rank, missionId: mission.id },
        });
      }
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return { ok: false, error: "Você já aceitou a missão deste rank hoje." };
    }
    throw error;
  }
  return { ok: true, mission };
}

// Chamado por abandonMission() (mission-service.ts) pra qualquer instancia
// abandonada: se ela tinha um claim do mural hoje, apaga (libera o rank pra
// pegar de novo). Pra missao que nunca veio do mural (mestre de estilo,
// historia...) e' um no-op silencioso — nao existe claim pra apagar.
export async function clearBoardClaim(charId: string, missionId: string): Promise<void> {
  const dayKey = boardDayKey();
  await prisma.dailyMissionClaim.deleteMany({ where: { charId, dayKey, missionId } });
}

// null = sem oferta disponivel pra esse rank (personagem ja concluiu todas).
export function getDailyMissionOffer(offers: DailyMissionOffers, rank: DailyMissionRank): MissionDef | null {
  const id = offers[rank];
  if (!id) return null;
  return MISSIONS.find((item) => item.id === id) ?? null;
}
