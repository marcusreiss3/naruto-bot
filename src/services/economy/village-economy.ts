import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem } from "../../data/items.js";
import { VILLAGE_IDS, VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import { EconomyError } from "./errors.js";
import { recordLedger, type LedgerEntry, type Tx } from "./ledger.js";
import { weekKeyFor } from "./week.js";

// ---------------- Fundacao ----------------

// Cria as cinco vilas com cofre e estoque vazios. Idempotente: pode rodar em
// todo deploy sem zerar taxa, cofre ou Kage ja definidos.
export async function ensureVillages(): Promise<void> {
  for (const id of VILLAGE_IDS) {
    await prisma.village.upsert({
      where: { id },
      create: { id, name: VILLAGE_NAMES[id], taxRate: ECONOMY.defaultTaxRate },
      update: { name: VILLAGE_NAMES[id] },
    });
  }
}

// Abre a competencia semanal corrente de cada vila congelando a taxa atual.
// Idempotente pela unicidade (villageId, weekKey): rodar de novo na mesma
// semana nao re-congela a taxa, que e' exatamente a protecao contra subir o
// imposto no meio da semana e cobrar retroativo.
export async function ensureCurrentTaxPeriods(now = new Date()): Promise<string> {
  const weekKey = weekKeyFor(now);
  const villages = await prisma.village.findMany();
  for (const village of villages) {
    await prisma.villageTaxPeriod.upsert({
      where: { villageId_weekKey: { villageId: village.id, weekKey } },
      create: { villageId: village.id, weekKey, taxRateFrozen: village.taxRate },
      update: {},
    });
  }
  return weekKey;
}

export async function getVillage(villageId: VillageId) {
  return prisma.village.findUnique({
    where: { id: villageId },
    include: { stock: { where: { qty: { gt: 0 } }, orderBy: { itemId: "asc" } } },
  });
}

// ---------------- Cofre ----------------

interface TreasuryMove {
  villageId: VillageId;
  amount: number; // sempre positivo; a direcao vem da funcao chamada
  type: LedgerEntry["type"];
  reason: string;
  actorDiscordId?: string | null;
  charId?: string | null;
  meta?: Record<string, unknown>;
}

function assertPositiveInt(amount: number, what: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError(`Quantidade inválida de ${what}.`);
  }
}

// Credita o cofre e grava o lancamento na MESMA transacao. Sempre chamado de
// dentro de um $transaction do caso de uso.
export async function creditTreasury(tx: Tx, move: TreasuryMove): Promise<number> {
  assertPositiveInt(move.amount, "Ryō");
  const updated = await tx.village.update({
    where: { id: move.villageId },
    data: { treasuryRyo: { increment: move.amount } },
    select: { treasuryRyo: true },
  });
  await recordLedger(tx, {
    type: move.type,
    villageId: move.villageId,
    ryoDelta: move.amount,
    actorDiscordId: move.actorDiscordId,
    charId: move.charId,
    reason: move.reason,
    meta: move.meta,
  });
  return updated.treasuryRyo;
}

// Debita o cofre com trava no proprio UPDATE: a condicao `treasuryRyo >= amount`
// vai na clausula WHERE, entao duas retiradas concorrentes nao conseguem passar
// as duas. `count === 0` significa saldo insuficiente e derruba a transacao.
// O cofre NUNCA fica negativo — o unico saldo que pode e' o do personagem, e so'
// na cobranca tributaria da etapa 2.
export async function debitTreasury(tx: Tx, move: TreasuryMove): Promise<number> {
  assertPositiveInt(move.amount, "Ryō");
  const { count } = await tx.village.updateMany({
    where: { id: move.villageId, treasuryRyo: { gte: move.amount } },
    data: { treasuryRyo: { decrement: move.amount } },
  });
  if (count === 0) {
    throw new EconomyError(`O cofre de ${VILLAGE_NAMES[move.villageId]} não tem ${move.amount} Ryō.`);
  }
  const village = await tx.village.findUniqueOrThrow({
    where: { id: move.villageId },
    select: { treasuryRyo: true },
  });
  await recordLedger(tx, {
    type: move.type,
    villageId: move.villageId,
    ryoDelta: -move.amount,
    actorDiscordId: move.actorDiscordId,
    charId: move.charId,
    reason: move.reason,
    meta: move.meta,
  });
  return village.treasuryRyo;
}

// Ajuste livre da staff: aceita delta negativo e nunca deixa o cofre abaixo de
// zero. Devolve o saldo final.
export async function adjustTreasury(
  tx: Tx,
  villageId: VillageId,
  delta: number,
  reason: string,
  actorDiscordId: string,
): Promise<number> {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new EconomyError("Informe um ajuste inteiro diferente de zero.");
  }
  const move = { villageId, amount: Math.abs(delta), type: "ADMIN_ADJUSTMENT" as const, reason, actorDiscordId };
  return delta > 0 ? creditTreasury(tx, move) : debitTreasury(tx, move);
}

// ---------------- Estoque central ----------------

interface StockMove {
  villageId: VillageId;
  itemId: string;
  qty: number; // sempre positivo
  type: LedgerEntry["type"];
  reason: string;
  actorDiscordId?: string | null;
  charId?: string | null;
  meta?: Record<string, unknown>;
}

export async function getVillageStockQty(tx: Tx, villageId: VillageId, itemId: string): Promise<number> {
  const row = await tx.villageStock.findUnique({
    where: { villageId_itemId: { villageId, itemId } },
    select: { qty: true },
  });
  return row?.qty ?? 0;
}

// Soma ao estoque central. O upsert em cima de @@unique([villageId, itemId])
// e' o que impede duas pilhas do mesmo item na mesma vila.
export async function addVillageStock(tx: Tx, move: StockMove): Promise<number> {
  assertPositiveInt(move.qty, "itens");
  const name = getItem(move.itemId)?.name ?? move.itemId;
  const row = await tx.villageStock.upsert({
    where: { villageId_itemId: { villageId: move.villageId, itemId: move.itemId } },
    create: { villageId: move.villageId, itemId: move.itemId, name, qty: move.qty },
    update: { qty: { increment: move.qty }, name },
    select: { qty: true },
  });
  await recordLedger(tx, {
    type: move.type,
    villageId: move.villageId,
    itemId: move.itemId,
    itemQty: move.qty,
    actorDiscordId: move.actorDiscordId,
    charId: move.charId,
    reason: move.reason,
    meta: move.meta,
  });
  return row.qty;
}

// Mesma trava do cofre: a condicao `qty >= move.qty` vai no WHERE do UPDATE.
export async function removeVillageStock(tx: Tx, move: StockMove): Promise<number> {
  assertPositiveInt(move.qty, "itens");
  const { count } = await tx.villageStock.updateMany({
    where: { villageId: move.villageId, itemId: move.itemId, qty: { gte: move.qty } },
    data: { qty: { decrement: move.qty } },
  });
  if (count === 0) {
    const name = getItem(move.itemId)?.name ?? move.itemId;
    throw new EconomyError(
      `O estoque de ${VILLAGE_NAMES[move.villageId]} não tem ${move.qty}x ${name}.`,
    );
  }
  await recordLedger(tx, {
    type: move.type,
    villageId: move.villageId,
    itemId: move.itemId,
    itemQty: -move.qty,
    actorDiscordId: move.actorDiscordId,
    charId: move.charId,
    reason: move.reason,
    meta: move.meta,
  });
  return getVillageStockQty(tx, move.villageId, move.itemId);
}
