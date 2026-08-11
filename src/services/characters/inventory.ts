import {
  ITEM_CATEGORIES,
  getItem,
  type ItemCategory,
  type ItemDef,
} from "../../data/items.js";
import { prisma } from "../../db/client.js";
import { EconomyError, runEconomy } from "../economy/errors.js";
import type { Tx } from "../economy/ledger.js";
import { spendCharacterRyo } from "../economy/character-economy.js";

export interface InventoryEntry {
  itemId: string;
  name: string;
  qty: number;
}

export interface DisplayInventoryEntry extends InventoryEntry {
  item: ItemDef | null;
}

export interface InventoryGroup {
  category: ItemCategory;
  entries: DisplayInventoryEntry[];
}

export function groupInventory(entries: InventoryEntry[]): InventoryGroup[] {
  const grouped = new Map<ItemCategory, DisplayInventoryEntry[]>();

  for (const entry of entries) {
    if (entry.qty <= 0) continue;
    const item = getItem(entry.itemId) ?? null;
    const category = item?.category ?? "OTHER";
    const list = grouped.get(category) ?? [];
    list.push({ ...entry, item });
    grouped.set(category, list);
  }

  return ITEM_CATEGORIES.flatMap((category) => {
    const categoryEntries = grouped.get(category);
    if (!categoryEntries?.length) return [];
    categoryEntries.sort((a, b) =>
      (a.item?.name ?? a.name).localeCompare(b.item?.name ?? b.name, "pt-BR"),
    );
    return [{ category, entries: categoryEntries }];
  });
}

// ---------------- Helpers unicos de inventario ----------------
//
// Toda escrita de inventario passa por aqui. A trava real e' o
// @@unique([charId, itemId]) do schema: `findFirst` nunca e' usado como se
// fosse lock, porque entre o SELECT e o UPDATE cabe outra transacao.
//
// Uma pilha esvaziada fica gravada com qty 0 em vez de ser apagada. Isso evita
// a corrida entre "apagar a linha zerada" e "outra transacao acabou de somar
// nela"; todo leitor ja filtra qty > 0.

export async function getInventoryQty(tx: Tx, charId: string, itemId: string): Promise<number> {
  const row = await tx.inventoryItem.findUnique({
    where: { charId_itemId: { charId, itemId } },
    select: { qty: true },
  });
  return row?.qty ?? 0;
}

export async function hasInventoryItem(
  tx: Tx,
  charId: string,
  itemId: string,
  amount = 1,
): Promise<boolean> {
  return (await getInventoryQty(tx, charId, itemId)) >= amount;
}

// Soma a pilha (criando se nao existir) e devolve o total. O upsert na chave
// unica e' o que impede duas pilhas do mesmo item.
export async function addInventoryItem(
  tx: Tx,
  charId: string,
  itemId: string,
  amount: number,
  nameHint?: string,
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new EconomyError("Quantidade inválida.");
  const name = getItem(itemId)?.name ?? nameHint ?? itemId;
  const row = await tx.inventoryItem.upsert({
    where: { charId_itemId: { charId, itemId } },
    create: { charId, itemId, name, qty: amount },
    update: { qty: { increment: amount }, name },
    select: { qty: true },
  });
  return row.qty;
}

// Retira da pilha e devolve o que sobrou. A condicao `qty >= amount` vai no
// WHERE do proprio UPDATE: duas retiradas concorrentes nao conseguem levar a
// quantidade abaixo de zero, e quem perder a corrida derruba sua transacao
// inteira em vez de gravar um saldo invalido.
export async function removeInventoryItem(
  tx: Tx,
  charId: string,
  itemId: string,
  amount: number,
  errorMessage?: string,
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new EconomyError("Quantidade inválida.");
  const name = getItem(itemId)?.name ?? itemId;
  const { count } = await tx.inventoryItem.updateMany({
    where: { charId, itemId, qty: { gte: amount } },
    data: { qty: { decrement: amount } },
  });
  if (count === 0) {
    throw new EconomyError(errorMessage ?? `Você não possui ${amount}x ${name}.`);
  }
  const remaining = await getInventoryQty(tx, charId, itemId);
  if (remaining === 0) {
    // Zerou a pilha: nao pode continuar equipado.
    await tx.userCharacter.updateMany({
      where: { id: charId, equippedItemId: itemId },
      data: { equippedItemId: null },
    });
  }
  return remaining;
}

export async function equipInventoryItem(
  charId: string,
  itemId: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const item = getItem(itemId);
  if (!item || !item.actions.includes("EQUIP")) {
    return { ok: false, error: "Este item não pode ser equipado." };
  }
  if (!(await hasInventoryItem(prisma, charId, itemId))) {
    return { ok: false, error: `Você não possui ${item.name}.` };
  }

  await prisma.userCharacter.update({
    where: { id: charId },
    data: { equippedItemId: itemId },
  });
  return { ok: true, name: item.name };
}

export async function unequipInventoryItem(
  charId: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const char = await prisma.userCharacter.findUnique({
    where: { id: charId },
    select: { equippedItemId: true },
  });
  if (!char?.equippedItemId) return { ok: false, error: "Você não possui uma arma equipada." };
  const name = getItem(char.equippedItemId)?.name ?? char.equippedItemId;
  await prisma.userCharacter.update({
    where: { id: charId },
    data: { equippedItemId: null },
  });
  return { ok: true, name };
}

export async function consumeInventoryItem(
  charId: string,
  itemId: string,
  amount = 1,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const itemName = getItem(itemId)?.name ?? itemId;
  return runEconomy(async () => {
    const remaining = await prisma.$transaction((tx) =>
      removeInventoryItem(
        tx,
        charId,
        itemId,
        amount,
        `Você não possui ${amount} unidade(s) de ${itemName}.`,
      ),
    );
    return { remaining };
  });
}

export async function restoreSpentScroll(charId: string, spentItemId: string): Promise<{ ok: true; name: string; cost: number } | { ok: false; error: string }> {
  const spent = getItem(spentItemId);
  const restoredId = spent?.restoresItemId;
  if (!spent || !restoredId || !spent.ryoValue) return { ok: false, error: "Este item não é um pergaminho gasto." };
  const cost = Math.ceil(spent.ryoValue / 2);
  const active = getItem(restoredId)!;
  return runEconomy(async () => {
    await prisma.$transaction(async (tx) => {
      await removeInventoryItem(tx, charId, spentItemId, 1, `Você não possui ${spent.name}.`);
      await addInventoryItem(tx, charId, restoredId, 1);
      // Gasto de Ryo com trava no proprio UPDATE (e auditoria) — ver
      // services/economy/character-economy.ts.
      await spendCharacterRyo(tx, {
        charId,
        amount: cost,
        type: "NPC_SALE",
        reason: `Restauração de ${spent.name}`,
        errorMessage: `Você precisa de ${cost} ryō para restaurar este pergaminho.`,
        meta: { spentItemId, restoredId },
      });
    });
    return { name: active.name, cost };
  });
}

export async function validateAndConsumeAbilityItems(
  charId: string,
  requiredItems: { itemId: string; amount: number; consume?: boolean; exhaustToItemId?: string }[] = [],
  equippedItemIds: string[] = [],
): Promise<{ ok: true; consumed: string[] } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUnique({
      where: { id: charId },
      select: { equippedItemId: true },
    });
    if (!char) return { ok: false as const, error: "Personagem não encontrado." };

    if (equippedItemIds.length && (!char.equippedItemId || !equippedItemIds.includes(char.equippedItemId))) {
      const names = equippedItemIds.map((id) => getItem(id)?.name ?? id).join(" ou ");
      return { ok: false as const, error: `Equipe ${names} para usar esta técnica.` };
    }

    // Checagem previa so' para a mensagem de erro ficar boa; a trava de
    // verdade e' o WHERE condicional dentro de removeInventoryItem abaixo.
    for (const requirement of requiredItems) {
      if (!(await hasInventoryItem(tx, charId, requirement.itemId, requirement.amount))) {
        const name = getItem(requirement.itemId)?.name ?? requirement.itemId;
        return { ok: false as const, error: `Esta técnica exige ${requirement.amount}x ${name}.` };
      }
    }

    const consumed: string[] = [];
    for (const requirement of requiredItems.filter((entry) => entry.consume || entry.exhaustToItemId)) {
      const name = getItem(requirement.itemId)?.name ?? requirement.itemId;
      await removeInventoryItem(
        tx,
        charId,
        requirement.itemId,
        requirement.amount,
        `Esta técnica exige ${requirement.amount}x ${name}.`,
      );
      if (requirement.exhaustToItemId) {
        await addInventoryItem(tx, charId, requirement.exhaustToItemId, requirement.amount);
        consumed.push(`${requirement.amount}x ${name} (gasto)`);
      } else {
        consumed.push(`${requirement.amount}x ${name}`);
      }
    }
    return { ok: true as const, consumed };
  }).catch((err) => {
    if (err instanceof EconomyError) return { ok: false as const, error: err.message };
    throw err;
  });
}

export async function transferInventoryItem(
  fromCharId: string,
  toCharId: string,
  itemId: string,
  amount: number,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (fromCharId === toCharId) return { ok: false, error: "Escolha outro personagem." };
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: "Quantidade inválida." };
  const item = getItem(itemId);
  const name = item?.name ?? itemId;
  if (item && !item.stackable && amount > 1) {
    return { ok: false, error: `${name} não pode ser transferido nessa quantidade.` };
  }
  return runEconomy(async () => {
    await prisma.$transaction(async (tx) => {
      await removeInventoryItem(tx, fromCharId, itemId, amount);
      await addInventoryItem(tx, toCharId, itemId, amount, name);
    });
    return { name };
  });
}

export async function dropInventoryItem(
  charId: string,
  sessionId: string,
  cell: string,
  itemId: string,
  amount: number,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: "Quantidade inválida." };
  const name = getItem(itemId)?.name ?? itemId;
  return runEconomy(async () => {
    await prisma.$transaction(async (tx) => {
      await removeInventoryItem(tx, charId, itemId, amount);
      await tx.droppedItem.create({
        data: { sessionId, cell, itemId, name, kind: `ITEM:${amount}`, ownerCharId: charId },
      });
    });
    return { name };
  });
}

export async function pickUpInventoryItem(
  charId: string,
  sessionId: string,
  cell: string,
): Promise<{ ok: true; name: string; amount: number } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const drop = await tx.droppedItem.findFirst({
      where: { sessionId, cell, kind: { startsWith: "ITEM:" } },
      orderBy: { id: "asc" },
    });
    if (!drop) return { ok: false as const, error: "Não há item largado nesta célula." };
    const amount = Math.max(1, Number(drop.kind.slice(5)) || 1);
    await addInventoryItem(tx, charId, drop.itemId, amount, drop.name);
    await tx.droppedItem.delete({ where: { id: drop.id } });
    return { ok: true as const, name: drop.name, amount };
  });
}

export async function prepareExplosiveKunai(
  charId: string,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  return runEconomy(async () => {
    const total = await prisma.$transaction(async (tx) => {
      await removeInventoryItem(tx, charId, "kunai", 1, "Você precisa de uma Kunai.");
      await removeInventoryItem(tx, charId, "papel_bomba", 1, "Você precisa de um Papel Bomba.");
      return addInventoryItem(tx, charId, "kunai_explosiva", 1);
    });
    return { total };
  });
}
