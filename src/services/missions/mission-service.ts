import { EmbedBuilder } from "discord.js";
import { prisma } from "../../db/client.js";
import { getMission } from "../../data/missions/index.js";
import type { MissionDef } from "../../data/types.js";
import { addXp } from "../characters/character-service.js";
import { grantCharacterRyo } from "../economy/character-economy.js";
import { accumulateMissionActivity } from "../economy/weekly-tax.js";
import { PERFORMANCE_LIMITS, warnIfSlow } from "../../utils/performance.js";

const CHECK_EMOJI = "<:check:1517556025614532658>";
const EXP_EMOJI = "<:exp:1523544859103854712>";
const RYO_EMOJI = "<:ryo:1523544228536516698>";
const COMPLETE_COLOR = "#2ECC71";

export function buildMissionCompleteEmbed(missionName: string, rewards: MissionDef["rewards"]): EmbedBuilder {
  const rewardLines = [`> ${EXP_EMOJI} **${rewards.xp} XP**`, `> ${RYO_EMOJI} **${rewards.ryo} ryo**`];

  return new EmbedBuilder()
    .setColor(COMPLETE_COLOR)
    .setTitle(`${CHECK_EMOJI} Missão concluída`)
    .setDescription(`> **${missionName}** foi concluída com sucesso.`)
    .addFields({ name: "Recompensas", value: rewardLines.join("\n") });
}

export async function assignMission(
  charId: string,
  missionId: string,
  initialState?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const def = getMission(missionId);
  if (!def) return { ok: false, error: "Missão desconhecida." };
  const existing = await prisma.missionInstance.findFirst({
    where: { charId, missionId, status: "ACTIVE" },
  });
  if (existing) return { ok: false, error: "Personagem já tem essa missão ativa." };
  // A instância e seus objetivos nascem juntos, em duas escritas em vez de
  // uma escrita por objetivo. A transação também evita missão parcialmente
  // criada se a criação de algum objetivo falhar.
  await prisma.$transaction(async (tx) => {
    const inst = await tx.missionInstance.create({
      data: { charId, missionId, ...(initialState ? { stateJson: JSON.stringify(initialState) } : {}) },
    });
    if (def.objectives.length) {
      await tx.missionObjectiveState.createMany({
        data: def.objectives.map((objective) => ({ instanceId: inst.id, objectiveId: objective.id })),
      });
    }
  });
  return { ok: true };
}

export async function removeMission(
  charId: string,
  missionId: string,
): Promise<{ instances: number; objectives: number; combats: number }> {
  const instances = await prisma.missionInstance.findMany({
    where: { charId, missionId },
    select: { id: true },
  });
  const instanceIds = instances.map((inst) => inst.id);
  if (instanceIds.length === 0) return { instances: 0, objectives: 0, combats: 0 };

  const sessions = await prisma.combatSession.findMany({
    where: { missionInstanceId: { in: instanceIds } },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);
  const participants = sessionIds.length
    ? await prisma.combatParticipant.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { id: true },
      })
    : [];
  const participantIds = participants.map((participant) => participant.id);

  const result = await prisma.$transaction(async (tx) => {
    if (participantIds.length) {
      await tx.effectInstance.deleteMany({ where: { participantId: { in: participantIds } } });
    }
    if (sessionIds.length) {
      await tx.droppedItem.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.combatParticipant.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.combatSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
    const objectives = await tx.missionObjectiveState.deleteMany({ where: { instanceId: { in: instanceIds } } });
    const removedInstances = await tx.missionInstance.deleteMany({ where: { id: { in: instanceIds } } });
    return { objectives: objectives.count, instances: removedInstances.count };
  });

  return { ...result, combats: sessionIds.length };
}

export async function getActiveMissions(charId: string) {
  return prisma.missionInstance.findMany({
    where: { charId, status: "ACTIVE" },
    include: { objectives: true },
  });
}

// Entrada barata para o roteador de mensagens. Antes dele, toda mensagem
// passava por todos os continuadores de missão, e cada um procurava o
// personagem e suas missões novamente. Aqui buscamos somente os ids das
// missões ativas uma vez e convertemos para seus tipos estáticos.
export async function getActiveMissionTypesForDiscord(
  discordId: string,
  guildId: string,
): Promise<Set<MissionDef["type"]>> {
  const startedAt = performance.now();
  const instances = await prisma.missionInstance.findMany({
    where: {
      status: "ACTIVE",
      character: { discordId, guildId },
    },
    select: { missionId: true },
  });
  const types = new Set<MissionDef["type"]>();
  for (const instance of instances) {
    const mission = getMission(instance.missionId);
    if (mission) types.add(mission.type);
  }
  warnIfSlow("query.missoes_ativas", startedAt, PERFORMANCE_LIMITS.queryMs, {
    active: instances.length,
  });
  return types;
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
  return getActiveInstanceByType(charId, "BANDIT_FIGHT");
}

// Acha a missão de escolta ativa do personagem (cruza a rota de Konoha e o deserto).
export async function getActiveEscortInstance(charId: string) {
  return getActiveInstanceByType(charId, "ESCORT");
}

// Primeira missão ativa do personagem com o tipo dado (independe do canal).
export async function getActiveInstanceByType(charId: string, type: MissionDef["type"]) {
  const instances = await getActiveMissions(charId);
  for (const inst of instances) {
    const def = getMission(inst.missionId);
    if (def?.type === type) return { inst, def };
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

  // Rank e vila do INSTANTE da conclusao: subir de rank ou trocar de cargo
  // depois nao pode mexer no que ja foi acumulado (sem imposto retroativo).
  const snapshot = await prisma.userCharacter.findUnique({
    where: { id: charId },
    select: { ninjaRank: true, villageId: true },
  });

  // A recompensa e' SEMPRE integral e imediata; o imposto e' semanal e so'
  // desconta no fechamento de domingo. Ryo e acumulador tributavel entram na
  // mesma transacao: ou os dois, ou nenhum.
  await prisma.$transaction(async (tx) => {
    await grantCharacterRyo(tx, {
      charId,
      amount: def.rewards.ryo,
      type: "MISSION_REWARD",
      reason: `Missão ${def.name}`,
      meta: { missionId, rank: def.rank },
    });
    await accumulateMissionActivity(tx, {
      charId,
      ninjaRank: snapshot?.ninjaRank ?? "ACADEMIA",
      villageId: snapshot?.villageId ?? null,
      xp: def.rewards.xp,
      ryo: def.rewards.ryo,
    });
  });

  // addXp por ultimo: ele consome XP ao subir de nivel, entao UserCharacter.xp
  // e' residual e nunca serve de base para a meta semanal — quem guarda a base
  // e' o WeeklyTaxActivity acima, com def.rewards.xp cru.
  await addXp(charId, def.rewards.xp);
  return { rewards: def.rewards };
}
