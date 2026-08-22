import { randomUUID } from "node:crypto";
import { BALANCE } from "../../config/balance.js";
import { prisma } from "../../db/client.js";
import { dayKeyFor } from "../economy/week.js";
import { addXp } from "./character-service.js";

export type TrainingTargetKind = "BLUE" | "BLACK";
export type TrainingStatus = "ACTIVE" | "COMPLETED" | "FAILED";

export interface TrainingTarget {
  token: string;
  kind: TrainingTargetKind;
  slot: number;
  expiresAt: Date;
}

const INTRO_DURATION_MS = 5_000;
// O alvo é salvo antes da mensagem ser editada. Esta margem só cobre o tempo
// dessa edição; armTrainingTarget troca pela janela real de 1,25 s logo depois.
const TARGET_SETUP_GRACE_MS = 10_000;

export function rollTrainingTarget(
  now = new Date(),
  rng: () => number = Math.random,
  previousSlot?: number,
): TrainingTarget {
  const slots = Array.from({ length: BALANCE.xp.training.gridSize ** 2 }, (_, index) => index)
    .filter((slot) => slot !== previousSlot);
  return {
    token: randomUUID(),
    kind: rng() < BALANCE.xp.training.blackChance ? "BLACK" : "BLUE",
    slot: slots[Math.min(slots.length - 1, Math.floor(rng() * slots.length))]!,
    expiresAt: new Date(now.getTime() + BALANCE.xp.training.targetLifetimeMs),
  };
}

export function rollTrainingBlueXp(current: number, goal: number, rng: () => number = Math.random): number {
  const min = BALANCE.xp.training.blueXpMin;
  const max = BALANCE.xp.training.blueXpMax;
  const raw = Math.floor(rng() * (max - min + 1)) + min;
  return Math.max(0, Math.min(goal - current, raw));
}

export async function startTrainingSession(charId: string, now = new Date()) {
  const dayKey = dayKeyFor(now);
  const existing = await prisma.trainingSession.findUnique({ where: { charId_dayKey: { charId, dayKey } } });
  if (existing) return { session: existing, created: false };

  try {
    const session = await prisma.trainingSession.create({
      data: {
        charId,
        dayKey,
        status: "INTRO",
        xpGoal: BALANCE.xp.trainingReward,
        introEndsAt: new Date(now.getTime() + INTRO_DURATION_MS),
      },
    });
    return { session, created: true };
  } catch (error) {
    // Duas execuções simultâneas de /treino devem consumir uma única tentativa.
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const session = await prisma.trainingSession.findUniqueOrThrow({ where: { charId_dayKey: { charId, dayKey } } });
      return { session, created: false };
    }
    throw error;
  }
}

export async function beginTrainingSession(sessionId: string, now = new Date()) {
  await prisma.trainingSession.updateMany({
    where: { id: sessionId, status: "INTRO", introEndsAt: { lte: now } },
    data: { status: "ACTIVE", introEndsAt: null },
  });
  return prisma.trainingSession.findUnique({ where: { id: sessionId } });
}

export async function issueTrainingTarget(
  sessionId: string,
  now = new Date(),
  expectedToken?: string,
  rng: () => number = Math.random,
) {
  const session = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "ACTIVE") return session;

  const target = rollTrainingTarget(now, rng, session.activeSlot ?? undefined);
  const eligibility = expectedToken
    ? { activeToken: expectedToken, expiresAt: { lte: now } }
    : { OR: [{ activeToken: null }, { expiresAt: { lte: now } }] };
  const updated = await prisma.trainingSession.updateMany({
    where: { id: sessionId, status: "ACTIVE", ...eligibility },
    data: {
      activeToken: target.token,
      activeKind: target.kind,
      activeSlot: target.slot,
      // O prazo real começa só depois que o Discord confirmou a edição da
      // mensagem. Sem isso, a latência da API roubava parte dos 1,25 s.
      expiresAt: new Date(now.getTime() + TARGET_SETUP_GRACE_MS),
    },
  });
  if (updated.count === 0) return prisma.trainingSession.findUnique({ where: { id: sessionId } });
  return prisma.trainingSession.findUnique({ where: { id: sessionId } });
}

/** Começa a contagem do alvo depois que ele já está visível no container. */
export async function armTrainingTarget(sessionId: string, token: string, now = new Date()) {
  const expiresAt = new Date(now.getTime() + BALANCE.xp.training.targetLifetimeMs);
  const armed = await prisma.trainingSession.updateMany({
    where: { id: sessionId, status: "ACTIVE", activeToken: token },
    data: { expiresAt },
  });
  if (armed.count === 0) return prisma.trainingSession.findUnique({ where: { id: sessionId } });
  return prisma.trainingSession.findUnique({ where: { id: sessionId } });
}

export type TrainingHitResult =
  | { ok: false; reason: "STALE" | "OWNER" | "MISSING" }
  | { ok: true; kind: TrainingTargetKind; gainedXp: number; session: Awaited<ReturnType<typeof prisma.trainingSession.findUniqueOrThrow>> };

export async function hitTrainingTarget(input: {
  sessionId: string;
  charId: string;
  token: string;
  now?: Date;
  rng?: () => number;
}): Promise<TrainingHitResult> {
  const now = input.now ?? new Date();
  const session = await prisma.trainingSession.findUnique({ where: { id: input.sessionId } });
  if (!session) return { ok: false, reason: "MISSING" };
  if (session.charId !== input.charId) return { ok: false, reason: "OWNER" };
  if (session.status !== "ACTIVE" || session.activeToken !== input.token || !session.expiresAt || session.expiresAt <= now) {
    return { ok: false, reason: "STALE" };
  }

  if (session.activeKind === "BLACK") {
    const failed = await prisma.trainingSession.updateMany({
      where: { id: session.id, status: "ACTIVE", activeToken: input.token, expiresAt: { gt: now } },
      data: { status: "FAILED", activeToken: null, activeKind: null, activeSlot: null, expiresAt: null, endedAt: now },
    });
    if (failed.count === 0) return { ok: false, reason: "STALE" };
    return {
      ok: true,
      kind: "BLACK",
      gainedXp: 0,
      session: await prisma.trainingSession.findUniqueOrThrow({ where: { id: session.id } }),
    };
  }

  const gainedXp = rollTrainingBlueXp(session.xpEarned, session.xpGoal, input.rng);
  const total = session.xpEarned + gainedXp;
  const completed = total >= session.xpGoal;
  const hit = await prisma.trainingSession.updateMany({
    where: { id: session.id, status: "ACTIVE", activeToken: input.token, expiresAt: { gt: now } },
    data: {
      xpEarned: total,
      status: completed ? "COMPLETED" : "ACTIVE",
      activeToken: null,
      activeKind: null,
      activeSlot: null,
      expiresAt: null,
      ...(completed ? { endedAt: now } : {}),
    },
  });
  if (hit.count === 0) return { ok: false, reason: "STALE" };

  await addXp(session.charId, gainedXp);
  return {
    ok: true,
    kind: "BLUE",
    gainedXp,
    session: await prisma.trainingSession.findUniqueOrThrow({ where: { id: session.id } }),
  };
}

export async function resetTrainingCooldown(charId: string, now = new Date()): Promise<boolean> {
  const deleted = await prisma.trainingSession.deleteMany({ where: { charId, dayKey: dayKeyFor(now) } });
  return deleted.count > 0;
}
