import { prisma } from "../../db/client.js";

export const TRAINING_DURATION_MS = 30 * 60 * 1000;

const expirationTimers = new Map<string, ReturnType<typeof setTimeout>>();

function parseFlags(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function clampInfiniteHp(
  hp: number,
  hpMax: number,
  flags: Record<string, unknown>,
): number {
  return flags.infiniteHp === true ? hpMax : hp;
}

export function trainingExpirationFromFlags(flags: Record<string, unknown>): number | null {
  if (flags.isTrainingDummy !== true || typeof flags.expiresAt !== "number") return null;
  return flags.expiresAt;
}

async function expireTrainingSession(sessionId: string): Promise<string | null> {
  const session = await prisma.combatSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session || session.status !== "ACTIVE") return null;
  const isTraining = session.participants.some(
    (p) => trainingExpirationFromFlags(parseFlags(p.flagsJson)) !== null,
  );
  if (!isTraining) return null;

  await prisma.combatSession.update({
    where: { id: sessionId },
    data: { status: "ENDED" },
  });
  expirationTimers.delete(sessionId);
  return session.channelId;
}

export function scheduleTrainingExpiration(
  sessionId: string,
  expiresAt: number,
  onExpired?: (channelId: string) => Promise<void> | void,
): void {
  const previous = expirationTimers.get(sessionId);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(async () => {
    const channelId = await expireTrainingSession(sessionId).catch(() => null);
    if (channelId && onExpired) {
      await Promise.resolve(onExpired(channelId)).catch(() => undefined);
    }
  }, Math.max(0, expiresAt - Date.now()));
  timer.unref();
  expirationTimers.set(sessionId, timer);
}

// Recria os timers depois de um restart do bot. Sessoes que venceram enquanto
// ele estava offline sao encerradas imediatamente.
export async function restoreTrainingExpirations(
  onExpired?: (channelId: string) => Promise<void> | void,
): Promise<void> {
  const sessions = await prisma.combatSession.findMany({
    where: { status: "ACTIVE" },
    include: { participants: true },
  });
  for (const session of sessions) {
    const expiresAt = session.participants
      .map((p) => trainingExpirationFromFlags(parseFlags(p.flagsJson)))
      .find((value): value is number => value !== null);
    if (expiresAt === undefined) continue;
    if (expiresAt <= Date.now()) {
      const channelId = await expireTrainingSession(session.id);
      if (channelId && onExpired) await onExpired(channelId);
    } else {
      scheduleTrainingExpiration(session.id, expiresAt, onExpired);
    }
  }
}
