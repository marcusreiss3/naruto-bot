import { prisma } from "../../db/client.js";
import { getMission } from "../../data/missions/index.js";
import type { MissionDef } from "../../data/types.js";
import { addXp } from "../characters/character-service.js";
import { recordDailyQuestEvent } from "../daily-quests/daily-quest-service.js";
import { grantCharacterRyo } from "../economy/character-economy.js";
import { accumulateMissionActivity } from "../economy/weekly-tax.js";
import { PERFORMANCE_LIMITS, warnIfSlow } from "../../utils/performance.js";
import { clearBoardClaim } from "./daily-mission-board.js";
import { emoji } from "../../ui/economy-emojis.js";
import { divider, ryo, singleCard, text, titleBlock, v2Public, type TopLevel } from "../../ui/economy-components-v2.js";

// Emoji de XP e' proprio da tela de missao (nao faz parte do mapa geral de
// economy-emojis.ts). Ryo usa o helper compartilhado — o id fixo que morava
// aqui antes era o emoji ERRADO, divergente do usado no resto do bot.
const EXP_EMOJI = "<:exp:1523544859103854712>";

export interface MissionCompleteResult {
  rewards: MissionDef["rewards"];
  halved?: boolean;
}

// `extraNote` e' pra contexto adicional que nao depende do resultado (ex.:
// /admin dizendo pra quem a missao foi concluida). O aviso de recompensa pela
// metade e' automatico: aparece sozinho quando result.halved vem true, sem
// nenhum dos ~45 chamadores precisar saber que esse caso existe.
export function buildMissionCompleteEmbed(
  missionName: string,
  result: MissionCompleteResult,
  extraNote?: string,
): { components: TopLevel[]; flags: number } {
  const notes: string[] = [];
  if (result.halved) notes.push("Recompensa reduzida pela metade: você já tinha concluído esta missão antes.");
  if (extraNote) notes.push(extraNote);

  const children = [
    titleBlock("sucesso", "Missão concluída", `${missionName} foi concluída com sucesso.`),
    text(`${EXP_EMOJI} **${result.rewards.xp.toLocaleString("pt-BR")} XP**\n${ryo(`**${result.rewards.ryo.toLocaleString("pt-BR")} Ryō**`)}`),
    ...(notes.length ? [divider(), ...notes.map((note) => text(`-# ${emoji("aviso")} ${note}`))] : []),
  ];
  return v2Public(singleCard("cofre", children));
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

export async function completeMission(charId: string, missionId: string): Promise<MissionCompleteResult | null> {
  const def = getMission(missionId);
  const inst = await prisma.missionInstance.findFirst({ where: { charId, missionId, status: "ACTIVE" } });
  if (!def || !inst) return null;
  await prisma.missionInstance.update({ where: { id: inst.id }, data: { status: "COMPLETED" } });

  // halfReward e' marcado na criacao da instancia (ver claimDailyMission em
  // daily-mission-board.ts): um integrante de party que entra numa missao do
  // mural que ele mesmo ja tinha concluido antes recebe metade.
  const halved = inst.halfReward === true;
  const rewards: MissionDef["rewards"] = halved
    ? { xp: Math.round(def.rewards.xp / 2), ryo: Math.round(def.rewards.ryo / 2) }
    : def.rewards;

  // Rank e vila do INSTANTE da conclusao: subir de rank ou trocar de cargo
  // depois nao pode mexer no que ja foi acumulado (sem imposto retroativo).
  const snapshot = await prisma.userCharacter.findUnique({
    where: { id: charId },
    select: { ninjaRank: true, villageId: true },
  });

  // A recompensa e' SEMPRE integral (ou metade, se halved) e imediata; o
  // imposto e' semanal e so' desconta no fechamento de domingo. Ryo e
  // acumulador tributavel entram na mesma transacao: ou os dois, ou nenhum.
  await prisma.$transaction(async (tx) => {
    // grantCharacterRyo rejeita amount <= 0 (EconomyError) — missao com
    // recompensa so' em XP (ex.: mestre de estilo, que ja cobrou ryo como
    // custo) tem rewards.ryo = 0 de proposito, entao pula o grant em vez de
    // deixar a transacao inteira estourar.
    if (rewards.ryo > 0) {
      await grantCharacterRyo(tx, {
        charId,
        amount: rewards.ryo,
        type: "MISSION_REWARD",
        reason: `Missão ${def.name}`,
        meta: { missionId, rank: def.rank },
      });
    }
    await accumulateMissionActivity(tx, {
      charId,
      ninjaRank: snapshot?.ninjaRank ?? "ACADEMIA",
      villageId: snapshot?.villageId ?? null,
      xp: rewards.xp,
      ryo: rewards.ryo,
    });
  });

  // addXp por ultimo: ele consome XP ao subir de nivel, entao UserCharacter.xp
  // e' residual e nunca serve de base para a meta semanal — quem guarda a base
  // e' o WeeklyTaxActivity acima, com rewards.xp cru.
  await addXp(charId, rewards.xp);
  await recordDailyQuestEvent(charId, { type: "MISSION" });
  return { rewards, halved };
}

// Abandonar: sem recompensa (nem devolucao do que ja' foi gasto — ex: ryo e
// itens ja entregues ao mestre de estilo em GATHER continuam gastos). A
// instancia some do /missoes minhas; se ela tinha um claim do mural pra hoje,
// clearBoardClaim libera o rank de novo. Bloqueado durante combate vinculado
// a esta missao pelo mesmo motivo que o hospital: nao da pra desistir no
// meio da luta.
export async function abandonMission(
  charId: string,
  instanceId: string,
): Promise<{ ok: boolean; error?: string; missionName?: string }> {
  const inst = await prisma.missionInstance.findUnique({ where: { id: instanceId } });
  if (!inst || inst.charId !== charId || inst.status !== "ACTIVE") {
    return { ok: false, error: "Esta missão não está mais ativa." };
  }
  const def = getMission(inst.missionId);
  if (!def) return { ok: false, error: "Missão desconhecida." };

  const liveCombat = await prisma.combatSession.findFirst({
    where: { missionInstanceId: inst.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (liveCombat) return { ok: false, error: "Você não pode abandonar esta missão durante o combate." };

  await prisma.missionInstance.update({ where: { id: inst.id }, data: { status: "ABANDONED" } });
  await clearBoardClaim(charId, inst.missionId);
  return { ok: true, missionName: def.name };
}
