import { prisma } from "../../db/client.js";
import { MISSIONS } from "../../data/missions/index.js";
import type { MissionDef } from "../../data/types.js";
import type { NinjaRank, Rank } from "../../config/enums.js";

export const DAILY_MISSION_RANKS = ["D", "C", "B"] as const;
export type DailyMissionRank = (typeof DAILY_MISSION_RANKS)[number];
export type DailyMissionOffers = Record<DailyMissionRank, string>;

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

function makeOffers(charId: string, dayKey: string): DailyMissionOffers {
  const offers = {} as DailyMissionOffers;
  for (const rank of DAILY_MISSION_RANKS) {
    const choices = MISSIONS.filter((mission) => isBoardMission(mission) && mission.rank === rank);
    if (!choices.length) throw new Error(`Não há missões de rank ${rank} para o mural.`);
    offers[rank] = choices[hash(`${charId}:${dayKey}:${rank}`) % choices.length]!.id;
  }
  return offers;
}

function parseOffers(raw: string): DailyMissionOffers | null {
  try {
    const data = JSON.parse(raw) as Partial<Record<DailyMissionRank, unknown>>;
    const offers = {} as DailyMissionOffers;
    for (const rank of DAILY_MISSION_RANKS) {
      const missionId = data[rank];
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

  const offers = makeOffers(charId, dayKey);
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
  const claims = await prisma.dailyMissionClaim.findMany({ where: { charId, dayKey }, select: { rank: true } });
  return new Set(claims.map((claim) => claim.rank).filter((rank): rank is DailyMissionRank => DAILY_MISSION_RANKS.includes(rank as DailyMissionRank)));
}

export async function claimDailyMission(
  charId: string,
  ninjaRank: NinjaRank,
  rank: DailyMissionRank,
): Promise<{ ok: boolean; mission?: MissionDef; error?: string }> {
  if (!canClaimDailyMissionRank(ninjaRank, rank)) {
    return { ok: false, error: "Seu rank ninja não pode aceitar esta missão." };
  }
  const board = await getDailyMissionBoard(charId);
  const mission = MISSIONS.find((item) => item.id === board.offers[rank]);
  if (!mission || !isBoardMission(mission)) return { ok: false, error: "A oferta desta missão expirou. Abra o mural novamente." };

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.dailyMissionClaim.findUnique({ where: { charId_dayKey_rank: { charId, dayKey: board.dayKey, rank } } });
      if (claimed) throw new DailyMissionBoardError("Você já aceitou a missão deste rank hoje.");

      const active = await tx.missionInstance.findFirst({ where: { charId, missionId: mission.id, status: "ACTIVE" } });
      if (active) throw new DailyMissionBoardError("Esta missão já está ativa para seu personagem.");

      const instance = await tx.missionInstance.create({ data: { charId, missionId: mission.id } });
      if (mission.objectives.length) {
        await tx.missionObjectiveState.createMany({
          data: mission.objectives.map((objective) => ({ instanceId: instance.id, objectiveId: objective.id })),
        });
      }
      await tx.dailyMissionClaim.create({ data: { charId, dayKey: board.dayKey, rank, missionId: mission.id } });
    });
  } catch (error) {
    if (error instanceof DailyMissionBoardError) return { ok: false, error: error.message };
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return { ok: false, error: "Você já aceitou a missão deste rank hoje." };
    }
    throw error;
  }
  return { ok: true, mission };
}

class DailyMissionBoardError extends Error {}

export function getDailyMissionOffer(offers: DailyMissionOffers, rank: DailyMissionRank): MissionDef {
  const mission = MISSIONS.find((item) => item.id === offers[rank]);
  if (!mission) throw new Error("Missão do mural não encontrada.");
  return mission;
}
