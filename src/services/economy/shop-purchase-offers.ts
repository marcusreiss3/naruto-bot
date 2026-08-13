// Cotas diárias de compra dos NPCs municipais.
//
// Orçamento em Ryō não basta para conter farm: um único recurso barato poderia
// consumir toda a compra da loja. Esta camada cria ofertas finitas por item.
// Cada vila recebe uma seleção diferente por dia e por loja; a seleção e as
// quantidades ficam persistidas, portanto reiniciar o bot não rerrola nada.

import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { ingredientsBoughtBy, type ShopType } from "../../data/shops.js";
import type { VillageId } from "../../data/villages.js";
import { activePopulation } from "./population.js";
import { dayKeyFor } from "./week.js";
import { dailyRandom } from "./general-market.js";

export interface ShopPurchaseOffer {
  itemId: string;
  initialQty: number;
  remainingQty: number;
}

// Mais jogadores ativos ampliam tanto a variedade que o vendedor procura
// quanto a quantidade que ele aceita. O teto mantém uma vila grande longe de
// virar comprador infinito; o piso faz uma vila pequena ter comércio útil.
export function purchaseOfferCount(eligibleItems: number, activePlayers: number): number {
  if (eligibleItems <= 0) return 0;
  const raw = 1 + Math.ceil(Math.max(0, activePlayers) * ECONOMY.shopPurchaseOffersPerActive);
  return Math.min(
    eligibleItems,
    ECONOMY.shopPurchaseOffersMax,
    Math.max(ECONOMY.shopPurchaseOffersMin, raw),
  );
}

export function purchaseOfferQuantity(activePlayers: number): number {
  const raw = Math.ceil(Math.max(0, activePlayers) * ECONOMY.shopPurchaseQtyPerActive);
  return Math.min(ECONOMY.shopPurchaseQtyMax, Math.max(ECONOMY.shopPurchaseQtyMin, raw));
}

// Sorteio sem repetição. `rand` injetável deixa o comportamento testável;
// produção usa a semente de vila/loja/dia abaixo para duas chamadas concorrentes
// sempre chegarem ao mesmo conjunto de itens.
export function pickPurchaseOfferItems(
  itemIds: string[],
  count: number,
  rand: () => number = Math.random,
): string[] {
  const remaining = [...itemIds];
  const picked: string[] = [];
  while (remaining.length && picked.length < Math.min(count, itemIds.length)) {
    const index = Math.min(remaining.length - 1, Math.floor(rand() * remaining.length));
    picked.push(remaining[index]!);
    remaining.splice(index, 1);
  }
  return picked;
}

function toOffer(row: { itemId: string; initialQty: number; remainingQty: number }): ShopPurchaseOffer {
  return { itemId: row.itemId, initialQty: row.initialQty, remainingQty: row.remainingQty };
}

// Idempotente como a caravana: a chave única evita duplicação e a semente
// estável evita que uma corrida entre abertura de /loja e o job diário escolha
// conjuntos diferentes. A primeira criação do dia congela população e cotas.
export async function ensureShopPurchaseOffers(
  villageId: VillageId,
  shopType: ShopType,
  now = new Date(),
): Promise<ShopPurchaseOffer[]> {
  const shop = await prisma.villageShop.findUnique({
    where: { villageId_shopType: { villageId, shopType } },
    select: { id: true },
  });
  if (!shop) return [];

  const dayKey = dayKeyFor(now);
  const existing = await prisma.villageShopPurchaseOffer.findMany({
    where: { shopId: shop.id, dayKey },
    orderBy: { itemId: "asc" },
  });
  if (existing.length) return existing.map(toOffer);

  const eligible = ingredientsBoughtBy(shopType).map((row) => row.itemId);
  if (!eligible.length) return [];
  const population = await activePopulation(villageId, now);
  const selected = pickPurchaseOfferItems(
    eligible,
    purchaseOfferCount(eligible.length, population.ativos),
    dailyRandom(`${villageId}:${shopType}`, dayKey),
  );
  const quantity = purchaseOfferQuantity(population.ativos);

  for (const itemId of selected) {
    await prisma.villageShopPurchaseOffer
      .upsert({
        where: { shopId_dayKey_itemId: { shopId: shop.id, dayKey, itemId } },
        create: { shopId: shop.id, dayKey, itemId, initialQty: quantity, remainingQty: quantity },
        update: {},
      })
      .catch(() => null);
  }

  const created = await prisma.villageShopPurchaseOffer.findMany({
    where: { shopId: shop.id, dayKey },
    orderBy: { itemId: "asc" },
  });
  return created.map(toOffer);
}

export async function runShopPurchaseOfferPass(now = new Date()): Promise<number> {
  const shops = await prisma.villageShop.findMany({
    where: { shopType: { not: "MERCADO_GERAL" } },
    select: { id: true, villageId: true, shopType: true },
  });
  let created = 0;
  for (const shop of shops) {
    const before = await prisma.villageShopPurchaseOffer.count({
      where: { shopId: shop.id, dayKey: dayKeyFor(now) },
    });
    const offers = await ensureShopPurchaseOffers(shop.villageId as VillageId, shop.shopType as ShopType, now);
    if (before === 0 && offers.length) created += 1;
  }
  return created;
}
