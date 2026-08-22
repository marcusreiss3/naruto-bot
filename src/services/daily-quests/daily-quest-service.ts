import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import type { GatherAction } from "../../data/gathering.js";
import type { ShopType } from "../../data/shops.js";
import { nextDailyAt } from "../economy/week.js";
import { log } from "../../utils/logger.js";

export const DAILY_QUEST_REWARD_INGOTS = 20;
export const DAILY_QUEST_PER_DAY = 3;
export const WEEKLY_QUEST_REWARD_INGOTS = 150;
export const WEEKLY_QUEST_PER_WEEK = 3;
// Duas variações da mesma atividade ainda deixam a rotação imprevisível, mas
// impedem dias frustrantes com as três metas sendo, por exemplo, compras.
export const DAILY_QUEST_MAX_PER_CATEGORY = 2;

type QuestKind = "CRAFT" | "MISSION" | "NPC_WIN" | "PVP_WIN" | "GATHER" | "SHOP";

export interface DailyQuestDef {
  id: string;
  kind: QuestKind;
  description: string;
  target: number;
  recipeId?: string;
  action?: GatherAction;
  itemId?: string;
  shopType?: ShopType;
}

// Todas as receitas abaixo existem no /criar pessoal. Os alvos de coleta
// também são itens realmente obtidos pela ação correspondente.
export const DAILY_QUESTS: readonly DailyQuestDef[] = [
  { id: "craft_kunai", kind: "CRAFT", description: "Crie 1 Kunai com /criar.", target: 1, recipeId: "kunai" },
  { id: "craft_shuriken", kind: "CRAFT", description: "Crie 1 Shuriken com /criar.", target: 1, recipeId: "shuriken" },
  { id: "craft_senbon", kind: "CRAFT", description: "Crie Senbon com /criar.", target: 1, recipeId: "senbon" },
  { id: "craft_pao", kind: "CRAFT", description: "Crie 1 Pão com /criar.", target: 1, recipeId: "pao" },
  { id: "complete_mission", kind: "MISSION", description: "Conclua uma missão de qualquer rank.", target: 1 },
  { id: "defeat_npc", kind: "NPC_WIN", description: "Derrote um NPC em combate.", target: 1 },
  { id: "win_pvp", kind: "PVP_WIN", description: "Enfrente outro jogador e vença o combate.", target: 1 },
  { id: "gather_wood", kind: "GATHER", description: "Colete 5 Madeiras com /acao coletar.", target: 5, action: "COLETAR", itemId: "madeira" },
  { id: "gather_meat", kind: "GATHER", description: "Colete 5 Carnes Cruas com /acao cacar.", target: 5, action: "CACAR", itemId: "carne_crua" },
  { id: "gather_fish", kind: "GATHER", description: "Colete 5 Peixes Crus com /acao pescar.", target: 5, action: "PESCAR", itemId: "peixe_cru" },
  { id: "gather_water", kind: "GATHER", description: "Colete 5 Águas Limpas com /acao coletar-agua.", target: 5, action: "COLETAR_AGUA", itemId: "agua_limpa" },
  { id: "gather_iron", kind: "GATHER", description: "Colete 5 Minérios de Ferro com /acao minerar.", target: 5, action: "MINERAR", itemId: "minerio_ferro" },
  { id: "shop_general", kind: "SHOP", description: "Compre algo no Mercado Geral.", target: 1, shopType: "MERCADO_GERAL" },
  { id: "shop_emporio", kind: "SHOP", description: "Compre algo no Empório de Alimentos.", target: 1, shopType: "EMPORIO" },
  { id: "shop_foundry", kind: "SHOP", description: "Compre algo na Fundição Ninja.", target: 1, shopType: "FUNDICAO" },
  { id: "shop_ichiraku", kind: "SHOP", description: "Compre algo no Ichiraku.", target: 1, shopType: "ICHIRAKU" },
] as const;

export interface WeeklyQuestDef extends DailyQuestDef {}

// As semanais usam as mesmas atividades do jogo, mas em escala suficiente
// para exigir constância ao longo da semana, não apenas uma sessão curta.
export const WEEKLY_QUESTS: readonly WeeklyQuestDef[] = [
  { id: "weekly_craft_kunai", kind: "CRAFT", description: "Crie 30 Kunais com /criar.", target: 30, recipeId: "kunai" },
  { id: "weekly_craft_shuriken", kind: "CRAFT", description: "Crie 30 Shurikens com /criar.", target: 30, recipeId: "shuriken" },
  { id: "weekly_craft_senbon", kind: "CRAFT", description: "Crie Senbon 30 vezes com /criar.", target: 30, recipeId: "senbon" },
  { id: "weekly_craft_pao", kind: "CRAFT", description: "Crie 25 Pães com /criar.", target: 25, recipeId: "pao" },
  { id: "weekly_complete_missions", kind: "MISSION", description: "Conclua 12 missões de qualquer rank.", target: 12 },
  { id: "weekly_defeat_npcs", kind: "NPC_WIN", description: "Derrote 30 NPCs em combate.", target: 30 },
  { id: "weekly_win_pvp", kind: "PVP_WIN", description: "Vença 7 duelos contra jogadores.", target: 7 },
  { id: "weekly_gather_wood", kind: "GATHER", description: "Colete 65 Madeiras com /acao coletar.", target: 65, action: "COLETAR", itemId: "madeira" },
  { id: "weekly_gather_meat", kind: "GATHER", description: "Colete 65 Carnes Cruas com /acao cacar.", target: 65, action: "CACAR", itemId: "carne_crua" },
  { id: "weekly_gather_fish", kind: "GATHER", description: "Colete 65 Peixes Crus com /acao pescar.", target: 65, action: "PESCAR", itemId: "peixe_cru" },
  { id: "weekly_gather_water", kind: "GATHER", description: "Colete 65 Águas Limpas com /acao coletar-agua.", target: 65, action: "COLETAR_AGUA", itemId: "agua_limpa" },
  { id: "weekly_gather_iron", kind: "GATHER", description: "Colete 65 Minérios de Ferro com /acao minerar.", target: 65, action: "MINERAR", itemId: "minerio_ferro" },
  { id: "weekly_shop_general", kind: "SHOP", description: "Compre 30 itens no Mercado Geral.", target: 30, shopType: "MERCADO_GERAL" },
  { id: "weekly_shop_emporio", kind: "SHOP", description: "Compre 30 itens no Empório de Alimentos.", target: 30, shopType: "EMPORIO" },
  { id: "weekly_shop_foundry", kind: "SHOP", description: "Compre 30 itens na Fundição Ninja.", target: 30, shopType: "FUNDICAO" },
  { id: "weekly_shop_ichiraku", kind: "SHOP", description: "Compre 30 itens no Ichiraku.", target: 30, shopType: "ICHIRAKU" },
] as const;

const QUEST_BY_ID = new Map(DAILY_QUESTS.map((quest) => [quest.id, quest]));
const WEEKLY_QUEST_BY_ID = new Map(WEEKLY_QUESTS.map((quest) => [quest.id, quest]));

export type DailyQuestEvent =
  | { type: "CRAFT"; recipeId: string; amount?: number }
  | { type: "MISSION"; amount?: number }
  | { type: "NPC_WIN"; amount?: number }
  | { type: "PVP_WIN"; amount?: number }
  | { type: "GATHER"; action: GatherAction; loot: readonly { itemId: string; qty: number }[] }
  | { type: "SHOP"; shopType: ShopType; amount?: number };

export interface DailyQuestStatus {
  quest: DailyQuestDef;
  progress: number;
  completedAt: Date | null;
}

export interface WeeklyQuestStatus {
  quest: WeeklyQuestDef;
  progress: number;
  completedAt: Date | null;
}

function brasiliaDayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getDailyQuestDay(now?: Date): string {
  return brasiliaDayKey(now);
}

export function selectDailyQuests(rng: () => number = Math.random): DailyQuestDef[] {
  return selectQuestPool(DAILY_QUESTS, DAILY_QUEST_PER_DAY, rng);
}

export function selectWeeklyQuests(rng: () => number = Math.random): WeeklyQuestDef[] {
  return selectQuestPool(WEEKLY_QUESTS, WEEKLY_QUEST_PER_WEEK, rng);
}

function selectQuestPool<T extends DailyQuestDef>(quests: readonly T[], desiredCount: number, rng: () => number): T[] {
  const pool = [...quests];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  const selected: T[] = [];
  const categoryCounts = new Map<QuestKind, number>();
  for (const quest of pool) {
    const categoryCount = categoryCounts.get(quest.kind) ?? 0;
    if (categoryCount >= DAILY_QUEST_MAX_PER_CATEGORY) continue;
    selected.push(quest);
    categoryCounts.set(quest.kind, categoryCount + 1);
    if (selected.length === desiredCount) break;
  }
  return selected;
}

function respectsCategoryCap(quests: readonly DailyQuestDef[]): boolean {
  const counts = new Map<QuestKind, number>();
  for (const quest of quests) {
    const next = (counts.get(quest.kind) ?? 0) + 1;
    if (next > DAILY_QUEST_MAX_PER_CATEGORY) return false;
    counts.set(quest.kind, next);
  }
  return true;
}

function parseQuestIds(raw: string): DailyQuestDef[] | null {
  try {
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids) || ids.length !== DAILY_QUEST_PER_DAY || new Set(ids).size !== ids.length) return null;
    const quests = ids.map((id) => typeof id === "string" ? QUEST_BY_ID.get(id) : undefined);
    if (!quests.every((quest): quest is DailyQuestDef => Boolean(quest))) return null;
    return respectsCategoryCap(quests) ? quests : null;
  } catch {
    return null;
  }
}

function parseWeeklyQuestIds(raw: string): WeeklyQuestDef[] | null {
  try {
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids) || ids.length !== WEEKLY_QUEST_PER_WEEK || new Set(ids).size !== ids.length) return null;
    const quests = ids.map((id) => typeof id === "string" ? WEEKLY_QUEST_BY_ID.get(id) : undefined);
    if (!quests.every((quest): quest is WeeklyQuestDef => Boolean(quest))) return null;
    return respectsCategoryCap(quests) ? quests : null;
  } catch {
    return null;
  }
}

export async function getDailyQuestRotation(guildId: string, now = new Date()): Promise<{ dayKey: string; quests: DailyQuestDef[] }> {
  const dayKey = brasiliaDayKey(now);
  const existing = await prisma.dailyQuestRotation.findUnique({ where: { guildId_dayKey: { guildId, dayKey } } });
  const parsed = existing ? parseQuestIds(existing.questIdsJson) : null;
  if (parsed) return { dayKey, quests: parsed };

  const chosen = selectDailyQuests();
  const questIdsJson = JSON.stringify(chosen.map((quest) => quest.id));
  try {
    const row = existing
      ? await prisma.dailyQuestRotation.update({ where: { id: existing.id }, data: { questIdsJson } })
      : await prisma.dailyQuestRotation.create({ data: { guildId, dayKey, questIdsJson } });
    return { dayKey, quests: parseQuestIds(row.questIdsJson) ?? chosen };
  } catch (error) {
    // Dois comandos à meia-noite podem tentar criar a mesma rotação. Quem
    // perder a unicidade sempre relê a vencedora, para não haver dois dias.
    if ((error as { code?: string }).code !== "P2002") throw error;
    const winner = await prisma.dailyQuestRotation.findUniqueOrThrow({ where: { guildId_dayKey: { guildId, dayKey } } });
    return { dayKey, quests: parseQuestIds(winner.questIdsJson) ?? chosen };
  }
}

export async function getDailyQuestStatus(charId: string, guildId: string, now = new Date()): Promise<{ dayKey: string; quests: DailyQuestStatus[] }> {
  const rotation = await getDailyQuestRotation(guildId, now);
  const rows = await prisma.dailyQuestProgress.findMany({ where: { charId, dayKey: rotation.dayKey } });
  const byQuest = new Map(rows.map((row) => [row.questId, row]));
  return {
    dayKey: rotation.dayKey,
    quests: rotation.quests.map((quest) => {
      const row = byQuest.get(quest.id);
      return { quest, progress: Math.min(row?.progress ?? 0, quest.target), completedAt: row?.completedAt ?? null };
    }),
  };
}

// A chave semanal é o domingo local que abriu a rotação, deliberadamente
// separada da competência do imposto, cujo corte ocorre domingo às 22:00.
export function getWeeklyQuestWeek(now = new Date()): string {
  const [year, month, day] = brasiliaDayKey(now).split("-").map(Number);
  const localDate = new Date(Date.UTC(year!, month! - 1, day!));
  localDate.setUTCDate(localDate.getUTCDate() - localDate.getUTCDay());
  return localDate.toISOString().slice(0, 10);
}

export async function getWeeklyQuestRotation(guildId: string, now = new Date()): Promise<{ weekKey: string; quests: WeeklyQuestDef[] }> {
  const weekKey = getWeeklyQuestWeek(now);
  const existing = await prisma.weeklyQuestRotation.findUnique({ where: { guildId_weekKey: { guildId, weekKey } } });
  const parsed = existing ? parseWeeklyQuestIds(existing.questIdsJson) : null;
  if (parsed) return { weekKey, quests: parsed };

  const chosen = selectWeeklyQuests();
  const questIdsJson = JSON.stringify(chosen.map((quest) => quest.id));
  try {
    const row = existing
      ? await prisma.weeklyQuestRotation.update({ where: { id: existing.id }, data: { questIdsJson } })
      : await prisma.weeklyQuestRotation.create({ data: { guildId, weekKey, questIdsJson } });
    return { weekKey, quests: parseWeeklyQuestIds(row.questIdsJson) ?? chosen };
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const winner = await prisma.weeklyQuestRotation.findUniqueOrThrow({ where: { guildId_weekKey: { guildId, weekKey } } });
    return { weekKey, quests: parseWeeklyQuestIds(winner.questIdsJson) ?? chosen };
  }
}

export async function getWeeklyQuestStatus(charId: string, guildId: string, now = new Date()): Promise<{ weekKey: string; quests: WeeklyQuestStatus[] }> {
  const rotation = await getWeeklyQuestRotation(guildId, now);
  const rows = await prisma.weeklyQuestProgress.findMany({ where: { charId, weekKey: rotation.weekKey } });
  const byQuest = new Map(rows.map((row) => [row.questId, row]));
  return {
    weekKey: rotation.weekKey,
    quests: rotation.quests.map((quest) => {
      const row = byQuest.get(quest.id);
      return { quest, progress: Math.min(row?.progress ?? 0, quest.target), completedAt: row?.completedAt ?? null };
    }),
  };
}

function progressFromEvent(quest: DailyQuestDef, event: DailyQuestEvent): number {
  const amount = (value: number | undefined) => Math.max(1, Math.floor(value ?? 1));
  if (quest.kind === "CRAFT" && event.type === "CRAFT" && quest.recipeId === event.recipeId) return amount(event.amount);
  if (quest.kind === "MISSION" && event.type === "MISSION") return amount(event.amount);
  if (quest.kind === "NPC_WIN" && event.type === "NPC_WIN") return amount(event.amount);
  if (quest.kind === "PVP_WIN" && event.type === "PVP_WIN") return amount(event.amount);
  if (quest.kind === "SHOP" && event.type === "SHOP" && quest.shopType === event.shopType) return amount(event.amount);
  if (quest.kind === "GATHER" && event.type === "GATHER" && quest.action === event.action) {
    return event.loot.find((entry) => entry.itemId === quest.itemId)?.qty ?? 0;
  }
  return 0;
}

async function awardCompletion(
  tx: Prisma.TransactionClient,
  identity: { discordId: string; guildId: string },
  ingots: number,
): Promise<void> {
  await tx.premiumWallet.upsert({
    where: { discordId_guildId: identity },
    create: { ...identity, ingots },
    update: { ingots: { increment: ingots } },
  });
}

async function recordEventOnce(charId: string, event: DailyQuestEvent, now: Date): Promise<DailyQuestDef[]> {
  const identity = await prisma.userCharacter.findUnique({ where: { id: charId }, select: { discordId: true, guildId: true } });
  if (!identity) return [];
  const rotation = await getDailyQuestRotation(identity.guildId, now);
  const completed: DailyQuestDef[] = [];

  await prisma.$transaction(async (tx) => {
    for (const quest of rotation.quests) {
      const delta = progressFromEvent(quest, event);
      if (delta <= 0) continue;
      const existing = await tx.dailyQuestProgress.findUnique({
        where: { charId_dayKey_questId: { charId, dayKey: rotation.dayKey, questId: quest.id } },
      });
      if (existing?.completedAt) continue;
      const next = Math.min(quest.target, (existing?.progress ?? 0) + delta);
      const finished = next >= quest.target;

      if (existing) {
        const changed = await tx.dailyQuestProgress.updateMany({
          where: { id: existing.id, completedAt: null },
          data: { progress: next, ...(finished ? { completedAt: now } : {}) },
        });
        if (changed.count !== 1 || !finished) continue;
      } else {
        await tx.dailyQuestProgress.create({
          data: { charId, dayKey: rotation.dayKey, questId: quest.id, progress: next, ...(finished ? { completedAt: now } : {}) },
        });
        if (!finished) continue;
      }

      await awardCompletion(tx, identity, DAILY_QUEST_REWARD_INGOTS);
      completed.push(quest);
    }
  });
  return completed;
}

// Falhas na telemetria de uma diária não podem desfazer uma compra, coleta ou
// combate já concluídos. P2002 só ocorre em ações simultâneas; a segunda
// tentativa então encontra o progresso criado pela primeira.
export async function recordDailyQuestEvent(charId: string, event: DailyQuestEvent, now = new Date()): Promise<DailyQuestDef[]> {
  try {
    return await recordEventOnce(charId, event, now);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return recordEventOnce(charId, event, now);
    log.error("Falha ao registrar missão diária:", error);
    return [];
  }
}

async function recordWeeklyEventOnce(charId: string, event: DailyQuestEvent, now: Date): Promise<WeeklyQuestDef[]> {
  const identity = await prisma.userCharacter.findUnique({ where: { id: charId }, select: { discordId: true, guildId: true } });
  if (!identity) return [];
  const rotation = await getWeeklyQuestRotation(identity.guildId, now);
  const completed: WeeklyQuestDef[] = [];

  await prisma.$transaction(async (tx) => {
    for (const quest of rotation.quests) {
      const delta = progressFromEvent(quest, event);
      if (delta <= 0) continue;
      const existing = await tx.weeklyQuestProgress.findUnique({
        where: { charId_weekKey_questId: { charId, weekKey: rotation.weekKey, questId: quest.id } },
      });
      if (existing?.completedAt) continue;
      const next = Math.min(quest.target, (existing?.progress ?? 0) + delta);
      const finished = next >= quest.target;

      if (existing) {
        const changed = await tx.weeklyQuestProgress.updateMany({
          where: { id: existing.id, completedAt: null },
          data: { progress: next, ...(finished ? { completedAt: now } : {}) },
        });
        if (changed.count !== 1 || !finished) continue;
      } else {
        await tx.weeklyQuestProgress.create({
          data: { charId, weekKey: rotation.weekKey, questId: quest.id, progress: next, ...(finished ? { completedAt: now } : {}) },
        });
        if (!finished) continue;
      }

      await awardCompletion(tx, identity, WEEKLY_QUEST_REWARD_INGOTS);
      completed.push(quest);
    }
  });
  return completed;
}

export async function recordWeeklyQuestEvent(charId: string, event: DailyQuestEvent, now = new Date()): Promise<WeeklyQuestDef[]> {
  try {
    return await recordWeeklyEventOnce(charId, event, now);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return recordWeeklyEventOnce(charId, event, now);
    log.error("Falha ao registrar missão semanal:", error);
    return [];
  }
}

// Porta única para os eventos do jogo: uma ação pode avançar a diária e a
// semanal correspondentes, mas as recompensas e os limites continuam isolados.
export async function recordActivityQuestEvent(charId: string, event: DailyQuestEvent, now = new Date()): Promise<void> {
  await Promise.all([recordDailyQuestEvent(charId, event, now), recordWeeklyQuestEvent(charId, event, now)]);
}

let dailyQuestTimer: NodeJS.Timeout | null = null;
let weeklyQuestTimer: NodeJS.Timeout | null = null;

export async function ensureDailyQuestRotations(now = new Date()): Promise<void> {
  const guilds = await prisma.userCharacter.findMany({ distinct: ["guildId"], select: { guildId: true } });
  await Promise.all(guilds.map(({ guildId }) => getDailyQuestRotation(guildId, now)));
}

export async function ensureWeeklyQuestRotations(now = new Date()): Promise<void> {
  const guilds = await prisma.userCharacter.findMany({ distinct: ["guildId"], select: { guildId: true } });
  await Promise.all(guilds.map(({ guildId }) => getWeeklyQuestRotation(guildId, now)));
}

function nextWeeklyQuestAt(now = new Date()): Date {
  const [year, month, day] = brasiliaDayKey(now).split("-").map(Number);
  const localDate = new Date(Date.UTC(year!, month! - 1, day!));
  const daysUntilSunday = (7 - localDate.getUTCDay()) % 7;
  let next = new Date(Date.UTC(year!, month! - 1, day! + daysUntilSunday, 3));
  if (next.getTime() <= now.getTime()) next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
  return next;
}

export async function startDailyQuestScheduler(): Promise<void> {
  await Promise.all([ensureDailyQuestRotations(), ensureWeeklyQuestRotations()]);
  if (dailyQuestTimer) clearTimeout(dailyQuestTimer);
  if (weeklyQuestTimer) clearTimeout(weeklyQuestTimer);
  const schedule = () => {
    const target = nextDailyAt(new Date(), 0, 0);
    dailyQuestTimer = setTimeout(() => {
      void ensureDailyQuestRotations().catch((error) => log.error("Falha ao virar missões diárias:", error)).finally(schedule);
    }, Math.max(1_000, target.getTime() - Date.now()));
  };
  schedule();
  const scheduleWeekly = () => {
    const target = nextWeeklyQuestAt(new Date());
    weeklyQuestTimer = setTimeout(() => {
      void ensureWeeklyQuestRotations().catch((error) => log.error("Falha ao virar missões semanais:", error)).finally(scheduleWeekly);
    }, Math.max(1_000, target.getTime() - Date.now()));
  };
  scheduleWeekly();
}

export function stopDailyQuestScheduler(): void {
  if (dailyQuestTimer) clearTimeout(dailyQuestTimer);
  if (weeklyQuestTimer) clearTimeout(weeklyQuestTimer);
  dailyQuestTimer = null;
  weeklyQuestTimer = null;
}
