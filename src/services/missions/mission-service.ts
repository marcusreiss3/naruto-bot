import { prisma } from "../../db/client.js";
import { getMission } from "../../data/missions/index.js";
import type { MissionDef } from "../../data/types.js";
import { addXp } from "../characters/character-service.js";

export async function assignMission(charId: string, missionId: string): Promise<{ ok: boolean; error?: string }> {
  const def = getMission(missionId);
  if (!def) return { ok: false, error: "Missão desconhecida." };
  const existing = await prisma.missionInstance.findFirst({
    where: { charId, missionId, status: "ACTIVE" },
  });
  if (existing) return { ok: false, error: "Personagem já tem essa missão ativa." };
  const inst = await prisma.missionInstance.create({ data: { charId, missionId } });
  for (const o of def.objectives) {
    await prisma.missionObjectiveState.create({ data: { instanceId: inst.id, objectiveId: o.id } });
  }
  return { ok: true };
}

export async function removeMission(charId: string, missionId: string): Promise<void> {
  await prisma.missionInstance.deleteMany({ where: { charId, missionId, status: "ACTIVE" } });
}

export async function getActiveMissions(charId: string) {
  return prisma.missionInstance.findMany({
    where: { charId, status: "ACTIVE" },
    include: { objectives: true },
  });
}

export async function getActiveInstanceForChannel(charId: string, channelId: string) {
  const instances = await getActiveMissions(charId);
  for (const inst of instances) {
    const def = getMission(inst.missionId);
    if (def?.channelId === channelId) return { inst, def };
  }
  return null;
}

export async function getInstance(instanceId: string) {
  return prisma.missionInstance.findUnique({ where: { id: instanceId }, include: { objectives: true } });
}

// Acha a missão de bandidos ativa do personagem (independe do canal — ela cruza
// o centro comercial e a floresta).
export async function getActiveBanditInstance(charId: string) {
  const instances = await getActiveMissions(charId);
  for (const inst of instances) {
    const def = getMission(inst.missionId);
    if (def?.type === "BANDIT_FIGHT") return { inst, def };
  }
  return null;
}

export function readState<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return {} as T;
  }
}

export async function setState(instanceId: string, state: unknown): Promise<void> {
  await prisma.missionInstance.update({
    where: { id: instanceId },
    data: { stateJson: JSON.stringify(state) },
  });
}

export async function markObjective(instanceId: string, objectiveId: string): Promise<void> {
  await prisma.missionObjectiveState.updateMany({
    where: { instanceId, objectiveId },
    data: { done: true },
  });
}

export async function completeMission(charId: string, missionId: string): Promise<{ rewards: MissionDef["rewards"] } | null> {
  const def = getMission(missionId);
  const inst = await prisma.missionInstance.findFirst({ where: { charId, missionId, status: "ACTIVE" } });
  if (!def || !inst) return null;
  await prisma.missionInstance.update({ where: { id: inst.id }, data: { status: "COMPLETED" } });
  // recompensas
  await addXp(charId, def.rewards.xp);
  await prisma.userCharacter.update({ where: { id: charId }, data: { ryo: { increment: def.rewards.ryo } } });
  for (const it of def.rewards.items ?? []) {
    await prisma.inventoryItem.create({ data: { charId, itemId: it.itemId, name: it.name, qty: it.qty } });
  }
  return { rewards: def.rewards };
}
