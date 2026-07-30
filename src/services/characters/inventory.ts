import {
  ITEM_CATEGORIES,
  getItem,
  type ItemCategory,
  type ItemDef,
} from "../../data/items.js";
import { prisma } from "../../db/client.js";

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

export async function equipInventoryItem(
  charId: string,
  itemId: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const item = getItem(itemId);
  if (!item || !item.actions.includes("EQUIP")) {
    return { ok: false, error: "Este item não pode ser equipado." };
  }
  const owned = await prisma.inventoryItem.findFirst({
    where: { charId, itemId, qty: { gt: 0 } },
  });
  if (!owned) return { ok: false, error: `Você não possui ${item.name}.` };

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
  if (amount <= 0) return { ok: false, error: "Quantidade inválida." };
  return prisma.$transaction(async (tx) => {
    const owned = await tx.inventoryItem.findFirst({ where: { charId, itemId } });
    const itemName = getItem(itemId)?.name ?? owned?.name ?? itemId;
    if (!owned || owned.qty < amount) {
      return { ok: false as const, error: `Você não possui ${amount} unidade(s) de ${itemName}.` };
    }
    const remaining = owned.qty - amount;
    if (remaining > 0) {
      await tx.inventoryItem.update({ where: { id: owned.id }, data: { qty: remaining } });
    } else {
      await tx.inventoryItem.delete({ where: { id: owned.id } });
      await tx.userCharacter.updateMany({
        where: { id: charId, equippedItemId: itemId },
        data: { equippedItemId: null },
      });
    }
    return { ok: true as const, remaining };
  });
}

export async function restoreSpentScroll(charId: string, spentItemId: string): Promise<{ ok: true; name: string; cost: number } | { ok: false; error: string }> {
  const spent = getItem(spentItemId);
  const restoredId = spent?.restoresItemId;
  if (!spent || !restoredId || !spent.ryoValue) return { ok: false, error: "Este item não é um pergaminho gasto." };
  const cost = Math.ceil(spent.ryoValue / 2);
  return prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUnique({ where: { id: charId }, select: { ryo: true } });
    const owned = await tx.inventoryItem.findFirst({ where: { charId, itemId: spentItemId, qty: { gt: 0 } } });
    if (!owned) return { ok: false as const, error: `Você não possui ${spent.name}.` };
    if (!char || char.ryo < cost) return { ok: false as const, error: `Você precisa de ${cost} ryō para restaurar este pergaminho.` };
    if (owned.qty === 1) await tx.inventoryItem.delete({ where: { id: owned.id } });
    else await tx.inventoryItem.update({ where: { id: owned.id }, data: { qty: owned.qty - 1 } });
    const active = getItem(restoredId)!;
    const already = await tx.inventoryItem.findFirst({ where: { charId, itemId: restoredId } });
    if (already) await tx.inventoryItem.update({ where: { id: already.id }, data: { qty: already.qty + 1 } });
    else await tx.inventoryItem.create({ data: { charId, itemId: restoredId, name: active.name, qty: 1 } });
    await tx.userCharacter.update({ where: { id: charId }, data: { ryo: { decrement: cost } } });
    return { ok: true as const, name: active.name, cost };
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

    const rows = requiredItems.length
      ? await tx.inventoryItem.findMany({
          where: { charId, itemId: { in: requiredItems.map((requirement) => requirement.itemId) } },
        })
      : [];
    const byId = new Map(rows.map((row) => [row.itemId, row]));

    for (const requirement of requiredItems) {
      const row = byId.get(requirement.itemId);
      if (!row || row.qty < requirement.amount) {
        const name = getItem(requirement.itemId)?.name ?? requirement.itemId;
        return { ok: false as const, error: `Esta técnica exige ${requirement.amount}x ${name}.` };
      }
    }

    const consumed: string[] = [];
    for (const requirement of requiredItems.filter((entry) => entry.consume || entry.exhaustToItemId)) {
      const row = byId.get(requirement.itemId)!;
      const remaining = row.qty - requirement.amount;
      if (remaining > 0) {
        await tx.inventoryItem.update({ where: { id: row.id }, data: { qty: remaining } });
      } else {
        await tx.inventoryItem.delete({ where: { id: row.id } });
        await tx.userCharacter.updateMany({
          where: { id: charId, equippedItemId: requirement.itemId },
          data: { equippedItemId: null },
        });
      }
      if (requirement.exhaustToItemId) {
        const spent = getItem(requirement.exhaustToItemId);
        const existingSpent = await tx.inventoryItem.findFirst({ where: { charId, itemId: requirement.exhaustToItemId } });
        if (existingSpent) await tx.inventoryItem.update({ where: { id: existingSpent.id }, data: { qty: existingSpent.qty + requirement.amount } });
        else await tx.inventoryItem.create({ data: { charId, itemId: requirement.exhaustToItemId, name: spent?.name ?? requirement.exhaustToItemId, qty: requirement.amount } });
        consumed.push(`${requirement.amount}x ${getItem(requirement.itemId)?.name ?? requirement.itemId} (gasto)`);
      } else {
        consumed.push(`${requirement.amount}x ${getItem(requirement.itemId)?.name ?? requirement.itemId}`);
      }
    }
    return { ok: true as const, consumed };
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
  return prisma.$transaction(async (tx) => {
    const source = await tx.inventoryItem.findFirst({ where: { charId: fromCharId, itemId } });
    const item = getItem(itemId);
    const name = item?.name ?? source?.name ?? itemId;
    if (!source || source.qty < amount) {
      return { ok: false as const, error: `Você não possui ${amount}x ${name}.` };
    }
    if (item && !item.stackable && amount > 1) {
      return { ok: false as const, error: `${name} não pode ser transferido nessa quantidade.` };
    }
    const remaining = source.qty - amount;
    if (remaining) await tx.inventoryItem.update({ where: { id: source.id }, data: { qty: remaining } });
    else await tx.inventoryItem.delete({ where: { id: source.id } });
    if (!remaining) {
      await tx.userCharacter.updateMany({
        where: { id: fromCharId, equippedItemId: itemId },
        data: { equippedItemId: null },
      });
    }
    const target = await tx.inventoryItem.findFirst({ where: { charId: toCharId, itemId } });
    if (target) await tx.inventoryItem.update({ where: { id: target.id }, data: { qty: target.qty + amount } });
    else await tx.inventoryItem.create({ data: { charId: toCharId, itemId, name, qty: amount } });
    return { ok: true as const, name };
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
  return prisma.$transaction(async (tx) => {
    const source = await tx.inventoryItem.findFirst({ where: { charId, itemId } });
    const name = getItem(itemId)?.name ?? source?.name ?? itemId;
    if (!source || source.qty < amount) {
      return { ok: false as const, error: `Você não possui ${amount}x ${name}.` };
    }
    const remaining = source.qty - amount;
    if (remaining) await tx.inventoryItem.update({ where: { id: source.id }, data: { qty: remaining } });
    else await tx.inventoryItem.delete({ where: { id: source.id } });
    if (!remaining) {
      await tx.userCharacter.updateMany({
        where: { id: charId, equippedItemId: itemId },
        data: { equippedItemId: null },
      });
    }
    await tx.droppedItem.create({
      data: { sessionId, cell, itemId, name, kind: `ITEM:${amount}`, ownerCharId: charId },
    });
    return { ok: true as const, name };
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
    const owned = await tx.inventoryItem.findFirst({ where: { charId, itemId: drop.itemId } });
    if (owned) await tx.inventoryItem.update({ where: { id: owned.id }, data: { qty: owned.qty + amount } });
    else await tx.inventoryItem.create({
      data: { charId, itemId: drop.itemId, name: drop.name, qty: amount },
    });
    await tx.droppedItem.delete({ where: { id: drop.id } });
    return { ok: true as const, name: drop.name, amount };
  });
}

export async function prepareExplosiveKunai(
  charId: string,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const kunai = await tx.inventoryItem.findFirst({ where: { charId, itemId: "kunai" } });
    const paper = await tx.inventoryItem.findFirst({ where: { charId, itemId: "papel_bomba" } });
    if (!kunai?.qty) return { ok: false as const, error: "Você precisa de uma Kunai." };
    if (!paper?.qty) return { ok: false as const, error: "Você precisa de um Papel Bomba." };

    for (const row of [kunai, paper]) {
      if (row.qty === 1) await tx.inventoryItem.delete({ where: { id: row.id } });
      else await tx.inventoryItem.update({ where: { id: row.id }, data: { qty: row.qty - 1 } });
    }
    if (kunai.qty === 1) {
      await tx.userCharacter.updateMany({
        where: { id: charId, equippedItemId: "kunai" },
        data: { equippedItemId: null },
      });
    }

    const explosive = await tx.inventoryItem.findFirst({
      where: { charId, itemId: "kunai_explosiva" },
    });
    const total = (explosive?.qty ?? 0) + 1;
    if (explosive) {
      await tx.inventoryItem.update({ where: { id: explosive.id }, data: { qty: total } });
    } else {
      await tx.inventoryItem.create({
        data: {
          charId,
          itemId: "kunai_explosiva",
          name: getItem("kunai_explosiva")!.name,
          qty: 1,
        },
      });
    }
    return { ok: true as const, total };
  });
}
