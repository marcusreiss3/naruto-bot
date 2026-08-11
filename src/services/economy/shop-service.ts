// Servico unico das lojas de vila (secao 7.8 do spec).
//
// TUDO que move item, Ryo, estoque, orcamento ou livro-caixa de loja passa por
// aqui. Os handlers de /loja e da aba Comercio de /vila so' validam a
// interacao, chamam uma funcao daqui e desenham o embed — nenhum deles repete
// formula de preco nem escreve no banco.
//
// Invariantes que o resto do arquivo protege:
//
//   compra do jogador  -> Ryo do jogador SAI da circulacao; cofre NAO muda.
//   venda do jogador   -> cofre paga; item vai para o estoque DA LOJA.
//   abastecer          -> estoque central -> estoque da loja; ninguem recebe Ryo.
//   produzir           -> insumos viram produto no mesmo estoque; nao gera Ryo.
//   contrato atacado   -> UNICA venda comercial que credita o cofre.
//
// Toda condicao de saldo/estoque/orcamento vai na clausula WHERE do proprio
// UPDATE. Nao existe `findFirst` usado como trava em lugar nenhum daqui.

import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem } from "../../data/items.js";
import { getRecipe, villageShopRecipes, type RecipeDef } from "../../data/recipes.js";
import {
  GENERAL_MARKET_MATERIALS,
  MUNICIPAL_SHOPS,
  SHOPS,
  contractsFor,
  getContract,
  getShop,
  ingredientsBoughtBy,
  productsSoldBy,
  referenceValue,
  shopBuysItem,
  type ShopStatus,
  type ShopType,
} from "../../data/shops.js";
import { VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import { addInventoryItem, getInventoryQty, removeInventoryItem } from "../characters/inventory.js";
import { grantCharacterRyo, spendCharacterRyo } from "./character-economy.js";
import { EconomyError, runEconomy } from "./errors.js";
import { recordLedger, type Tx } from "./ledger.js";
import { activePopulation } from "./population.js";
import {
  dailyPurchaseBudget,
  generalMarketItemPrice,
  ingredientPrice,
  npcBuybackPrice,
  productPrice,
  wholesaleValue,
} from "./shop-pricing.js";
import { addVillageStock, removeVillageStock, getVillageStockQty } from "./village-economy.js";
import { dayKeyFor, weekKeyFor } from "./week.js";

// ---------------- Fundacao ----------------

// Cria as seis lojas de cada vila. Idempotente: nao mexe em status, estoque,
// orcamento nem canal ja gravados — em especial, NAO devolve um Ichiraku ativo
// para LOCKED num redeploy.
//
// Aceita um client para o seed poder usar a propria conexao.
export async function ensureVillageShops(db: Tx = prisma): Promise<number> {
  const villages = await db.village.findMany({ select: { id: true } });
  let criadas = 0;
  for (const village of villages) {
    for (const shop of SHOPS) {
      const existente = await db.villageShop.findUnique({
        where: { villageId_shopType: { villageId: village.id, shopType: shop.type } },
        select: { id: true },
      });
      if (existente) continue;
      await db.villageShop.create({
        data: {
          villageId: village.id,
          shopType: shop.type,
          status: shop.initialStatus,
          capacity: ECONOMY.shopCapacity,
        },
      });
      criadas += 1;
    }
  }
  return criadas;
}

export async function findShop(villageId: VillageId, shopType: ShopType) {
  return prisma.villageShop.findUnique({
    where: { villageId_shopType: { villageId, shopType } },
  });
}

// Carrega a loja garantindo que ela existe. Usado dentro de transacao.
async function requireShop(tx: Tx, villageId: VillageId, shopType: ShopType) {
  const shop = await tx.villageShop.findUnique({
    where: { villageId_shopType: { villageId, shopType } },
  });
  if (!shop) throw new EconomyError("Esta loja ainda não existe nesta vila.");
  return shop;
}

// Loja aberta para negocio. Ichiraku em obra, aguardando canal ou suspenso nao
// compra, nao vende e nao produz (secao 7.2).
function assertShopOpen(shop: { status: string; shopType: string }): void {
  if (shop.status === "ACTIVE") return;
  const nome = getShop(shop.shopType)?.name ?? shop.shopType;
  const motivo: Record<string, string> = {
    LOCKED: `${nome} ainda não foi construído nesta vila.`,
    CONSTRUCTING: `${nome} está em obras.`,
    AWAITING_CHANNEL: `${nome} está pronto, mas ainda aguarda a criação do canal. Avise a staff.`,
    SUSPENDED: `${nome} está suspenso pela staff.`,
  };
  throw new EconomyError(motivo[shop.status] ?? `${nome} não está aberto.`);
}

// ---------------- Estoque da loja ----------------

export async function getShopStockQty(tx: Tx, shopId: string, itemId: string): Promise<number> {
  const row = await tx.villageShopStock.findUnique({
    where: { shopId_itemId: { shopId, itemId } },
    select: { qty: true },
  });
  return row?.qty ?? 0;
}

// Soma ao estoque da loja respeitando a capacidade. A capacidade e' checada no
// WHERE do UPDATE de `stockUnits` (o total denormalizado), porque SOMA de
// varias linhas nao cabe numa clausula WHERE. Quem perder a corrida derruba a
// transacao inteira em vez de estourar o limite.
async function addShopStock(
  tx: Tx,
  shop: { id: string; capacity: number; shopType: string },
  itemId: string,
  qty: number,
): Promise<number> {
  if (!Number.isInteger(qty) || qty <= 0) throw new EconomyError("Quantidade inválida.");
  const { count } = await tx.villageShop.updateMany({
    where: { id: shop.id, stockUnits: { lte: shop.capacity - qty } },
    data: { stockUnits: { increment: qty } },
  });
  if (count === 0) {
    const nome = getShop(shop.shopType)?.name ?? shop.shopType;
    throw new EconomyError(`${nome} não tem espaço para ${qty} unidade(s) (limite ${shop.capacity}).`);
  }
  const name = getItem(itemId)?.name ?? itemId;
  const row = await tx.villageShopStock.upsert({
    where: { shopId_itemId: { shopId: shop.id, itemId } },
    create: { shopId: shop.id, itemId, name, qty },
    update: { qty: { increment: qty }, name },
    select: { qty: true },
  });
  return row.qty;
}

// Mesma trava do inventario: a condicao `qty >= n` vai no WHERE do UPDATE.
// A pilha zerada fica com qty 0, igual ao inventario pessoal (decisao da 01).
async function removeShopStock(
  tx: Tx,
  shopId: string,
  itemId: string,
  qty: number,
): Promise<number> {
  if (!Number.isInteger(qty) || qty <= 0) throw new EconomyError("Quantidade inválida.");
  const { count } = await tx.villageShopStock.updateMany({
    where: { shopId, itemId, qty: { gte: qty } },
    data: { qty: { decrement: qty } },
  });
  if (count === 0) {
    const name = getItem(itemId)?.name ?? itemId;
    throw new EconomyError(`A loja não tem ${qty}x ${name} em estoque.`);
  }
  await tx.villageShop.update({ where: { id: shopId }, data: { stockUnits: { decrement: qty } } });
  return getShopStockQty(tx, shopId, itemId);
}

// ---------------- Orcamento diario de compra ----------------

// Vira o dia da loja quando a chave gravada nao e' a de hoje. O reset e' um
// UPDATE condicional: duas transacoes no mesmo instante nao zeram duas vezes,
// e a segunda simplesmente nao acha linha para atualizar.
async function rolloverDailyBudget(
  tx: Tx,
  shop: { id: string; villageId: string; budgetDayKey: string },
  dayKey: string,
): Promise<void> {
  if (shop.budgetDayKey === dayKey) return;
  const { count } = await tx.villageShop.updateMany({
    where: { id: shop.id, budgetDayKey: { not: dayKey } },
    data: { budgetDayKey: dayKey, dailyBudgetSpent: 0, wholesaleDayKey: dayKey, wholesaleCount: 0 },
  });
  if (count > 0) {
    await recordLedger(tx, {
      type: "SHOP_DAILY_RESET",
      villageId: shop.villageId,
      reason: `Orçamento diário reaberto (${dayKey})`,
      meta: { shopId: shop.id, dayKey },
    });
  }
}

export interface ShopBudget {
  total: number;
  gasto: number;
  restante: number;
}

export async function shopBudgetView(
  villageId: VillageId,
  shopId: string,
  now = new Date(),
): Promise<ShopBudget> {
  const [shop, pop] = await Promise.all([
    prisma.villageShop.findUniqueOrThrow({ where: { id: shopId } }),
    activePopulation(villageId, now),
  ]);
  const total = dailyPurchaseBudget(pop.factor);
  // Dia virado mas ainda nao gravado: o painel ja mostra o orcamento cheio.
  const gasto = shop.budgetDayKey === dayKeyFor(now) ? shop.dailyBudgetSpent : 0;
  return { total, gasto, restante: Math.max(0, total - gasto) };
}

// ---------------- Visao de uma loja ----------------

export interface ShopProductLine {
  itemId: string;
  name: string;
  price: number;
  estoque: number;
}

export interface ShopIngredientLine {
  itemId: string;
  name: string;
  price: number;
}

export interface ShopView {
  villageId: VillageId;
  shopType: ShopType;
  shopId: string | null;
  name: string;
  emoji: string;
  status: ShopStatus;
  municipal: boolean;
  taxRate: number;
  capacity: number;
  stockUnits: number;
  budget: ShopBudget | null;
  produtos: ShopProductLine[];
  ingredientes: ShopIngredientLine[];
  discordChannelId: string | null;
}

export async function shopView(
  villageId: VillageId,
  shopType: ShopType,
  now = new Date(),
): Promise<ShopView> {
  const def = getShop(shopType);
  if (!def) throw new EconomyError("Loja desconhecida.");
  const village = await prisma.village.findUniqueOrThrow({ where: { id: villageId } });
  const shop = await findShop(villageId, shopType);
  const taxRate = village.taxRate;

  // Mercado Geral e' NPC: sem estoque municipal, sem orcamento, sem cofre.
  if (!def.municipal) {
    return {
      villageId,
      shopType,
      shopId: shop?.id ?? null,
      name: def.name,
      emoji: def.emoji,
      status: "ACTIVE",
      municipal: false,
      taxRate,
      capacity: 0,
      stockUnits: 0,
      budget: null,
      produtos: GENERAL_MARKET_MATERIALS.map((itemId) => ({
        itemId,
        name: getItem(itemId)?.name ?? itemId,
        price: generalMarketItemPrice(itemId, taxRate) ?? 0,
        // Estoque de NPC e' ilimitado; o painel mostra "—".
        estoque: Number.POSITIVE_INFINITY,
      })),
      ingredientes: [],
      discordChannelId: null,
    };
  }

  if (!shop) throw new EconomyError("Esta loja ainda não existe nesta vila.");

  const estoques = await prisma.villageShopStock.findMany({
    where: { shopId: shop.id, qty: { gt: 0 } },
  });
  const porItem = new Map(estoques.map((row) => [row.itemId, row.qty]));

  return {
    villageId,
    shopType,
    shopId: shop.id,
    name: def.name,
    emoji: def.emoji,
    status: shop.status as ShopStatus,
    municipal: true,
    taxRate,
    capacity: shop.capacity,
    stockUnits: shop.stockUnits,
    budget: await shopBudgetView(villageId, shop.id, now),
    produtos: productsSoldBy(shopType).map((row) => ({
      itemId: row.itemId,
      name: getItem(row.itemId)?.name ?? row.itemId,
      price: productPrice(shopType, row.itemId, taxRate) ?? 0,
      estoque: porItem.get(row.itemId) ?? 0,
    })),
    ingredientes: ingredientsBoughtBy(shopType)
      .map((row) => ({
        itemId: row.itemId,
        name: getItem(row.itemId)?.name ?? row.itemId,
        price: ingredientPrice(row.itemId, taxRate) ?? 0,
      }))
      // Secao 7.4: preco 0 significa "a loja nao oferece compra", nunca
      // "pagamos 0 Ryo". Some da lista.
      .filter((row) => row.price > 0),
    discordChannelId: shop.discordChannelId,
  };
}

// Lista para o menu inicial: as seis lojas com a situacao real.
export async function villageShopMenu(villageId: VillageId) {
  const linhas = await prisma.villageShop.findMany({ where: { villageId } });
  const porTipo = new Map(linhas.map((row) => [row.shopType, row]));
  return SHOPS.map((def) => ({
    def,
    status: (porTipo.get(def.type)?.status ?? def.initialStatus) as ShopStatus,
    discordChannelId: porTipo.get(def.type)?.discordChannelId ?? null,
  }));
}

// ---------------- Compra do jogador ----------------

export interface BuyOutcome {
  itemId: string;
  name: string;
  qty: number;
  precoUnitario: number;
  total: number;
  saldo: number;
  estoqueRestante: number | null;
}

// Compra comum: o Ryo sai do jogador e some da circulacao. O cofre NAO e'
// creditado — nem a receita-base, nem o acrescimo da taxa (secoes 3.1 e 7.3).
export async function buyFromShop(
  charId: string,
  villageId: VillageId,
  shopType: ShopType,
  itemId: string,
  qty: number,
  actorDiscordId: string,
) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };

  return runEconomy(
    async (): Promise<BuyOutcome> =>
      prisma.$transaction(async (tx) => {
        const village = await tx.village.findUniqueOrThrow({ where: { id: villageId } });
        // Preco recalculado DENTRO da transacao: o painel pode ter sido aberto
        // antes de o Kage mudar a taxa.
        const precoUnitario = productPrice(shopType, itemId, village.taxRate);
        if (precoUnitario === undefined || precoUnitario <= 0) {
          throw new EconomyError(`${item.name} não é vendido aqui.`);
        }
        const total = precoUnitario * qty;
        const def = getShop(shopType);

        // Mercado Geral: NPC externo, estoque ilimitado, sem cofre e sem loja.
        if (def && !def.municipal) {
          const saldo = await spendCharacterRyo(tx, {
            charId,
            amount: total,
            type: "NPC_SALE",
            reason: `Compra de ${qty}x ${item.name} no Mercado Geral`,
            errorMessage: `Você precisa de ${total} Ryō para comprar ${qty}x ${item.name}.`,
            meta: { shopType, itemId, qty, precoUnitario },
          });
          await addInventoryItem(tx, charId, itemId, qty);
          return {
            itemId,
            name: item.name,
            qty,
            precoUnitario,
            total,
            saldo,
            estoqueRestante: null,
          };
        }

        const shop = await requireShop(tx, villageId, shopType);
        assertShopOpen(shop);
        // Retira do estoque ANTES de cobrar: se o ultimo item ja tiver sido
        // vendido, a condicao do UPDATE falha e a transacao inteira cai sem
        // encostar no Ryo do jogador.
        const estoqueRestante = await removeShopStock(tx, shop.id, itemId, qty);
        const saldo = await spendCharacterRyo(tx, {
          charId,
          amount: total,
          type: "SHOP_SALE_TO_PLAYER",
          villageId,
          reason: `Compra de ${qty}x ${item.name} — ${def?.name ?? shopType}`,
          actorDiscordId,
          errorMessage: `Você precisa de ${total} Ryō para comprar ${qty}x ${item.name}.`,
          // treasuryDelta 0 e' explicito: este lancamento tem villageId para
          // aparecer no historico da loja, mas o cofre nao se move.
          meta: { shopType, itemId, qty, precoUnitario, treasuryDelta: 0 },
        });
        await addInventoryItem(tx, charId, itemId, qty);
        return { itemId, name: item.name, qty, precoUnitario, total, saldo, estoqueRestante };
      }),
  );
}

// ---------------- Venda do jogador para a loja ----------------

export interface SellOutcome {
  itemId: string;
  name: string;
  qty: number;
  precoUnitario: number;
  total: number;
  saldo: number;
  estoqueLoja: number;
}

// A loja compra ingrediente do inventario pessoal, paga o jogador com Ryo do
// cofre e move o item para o estoque DA LOJA (secao 7.3). Valida, na ordem,
// preco, orcamento diario, capacidade, inventario e cofre — tudo na mesma
// transacao.
export async function sellToShop(
  charId: string,
  villageId: VillageId,
  shopType: ShopType,
  itemId: string,
  qty: number,
  actorDiscordId: string,
  now = new Date(),
) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };
  if (!shopBuysItem(shopType, itemId)) {
    return { ok: false as const, error: `${getShop(shopType)?.name ?? shopType} não compra ${item.name}.` };
  }

  // O orcamento depende da populacao ativa, que e' uma consulta pesada: fica
  // fora da transacao de proposito (SQLite escreve em serie).
  const pop = await activePopulation(villageId, now);
  const orcamentoTotal = dailyPurchaseBudget(pop.factor);
  const dayKey = dayKeyFor(now);

  return runEconomy(
    async (): Promise<SellOutcome> =>
      prisma.$transaction(async (tx) => {
        const village = await tx.village.findUniqueOrThrow({ where: { id: villageId } });
        const precoUnitario = ingredientPrice(itemId, village.taxRate);
        if (precoUnitario === undefined || precoUnitario <= 0) {
          throw new EconomyError(
            `Com o imposto atual, ${item.name} sairia por 0 Ryō — a loja não compra por esse preço.`,
          );
        }
        const total = precoUnitario * qty;

        const shop = await requireShop(tx, villageId, shopType);
        assertShopOpen(shop);
        await rolloverDailyBudget(tx, shop, dayKey);

        // Orcamento diario: a condicao vai no WHERE, entao duas vendas
        // simultaneas nao estouram o teto do dia.
        const { count } = await tx.villageShop.updateMany({
          where: {
            id: shop.id,
            budgetDayKey: dayKey,
            dailyBudgetSpent: { lte: orcamentoTotal - total },
          },
          data: { dailyBudgetSpent: { increment: total } },
        });
        if (count === 0) {
          const gasto = shop.budgetDayKey === dayKey ? shop.dailyBudgetSpent : 0;
          throw new EconomyError(
            `O orçamento de compra de hoje não cobre isso: restam ${Math.max(0, orcamentoTotal - gasto)} de ${orcamentoTotal} Ryō.`,
          );
        }

        await removeInventoryItem(tx, charId, itemId, qty, `Você não possui ${qty}x ${item.name}.`);
        const estoqueLoja = await addShopStock(tx, shop, itemId, qty);

        // Cofre paga. `debitTreasury` nao serve aqui porque precisamos travar
        // no Ryo LIVRE (cofre menos reserva de obra/ordem), nao no total.
        const livre = village.treasuryRyo - village.reservedRyo;
        if (livre < total) {
          throw new EconomyError(
            `O cofre de ${VILLAGE_NAMES[villageId]} tem ${Math.max(0, livre)} Ryō livres; a compra custa ${total}.`,
          );
        }
        const pago = await tx.village.updateMany({
          where: { id: villageId, treasuryRyo: village.treasuryRyo, reservedRyo: village.reservedRyo },
          data: { treasuryRyo: { decrement: total } },
        });
        if (pago.count === 0) {
          throw new EconomyError("O cofre mudou durante a venda. Tente de novo.");
        }

        const saldo = await grantCharacterRyo(tx, {
          charId,
          amount: total,
          type: "SHOP_BUY_FROM_PLAYER",
          villageId,
          reason: `${getShop(shopType)?.name ?? shopType} comprou ${qty}x ${item.name}`,
          actorDiscordId,
          meta: { shopType, itemId, qty, precoUnitario, treasuryDelta: -total },
        });
        return { itemId, name: item.name, qty, precoUnitario, total, saldo, estoqueLoja };
      }),
  );
}

// ---------------- Recompra de emergencia (Mercado Geral) ----------------

// NPC externo paga 30% do valor de referencia. Nao toca cofre nem estoque da
// vila: o item some e o Ryo vem do nada, igual a recompensa de missao.
export async function sellToGeneralMarket(charId: string, itemId: string, qty: number) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };
  if (item.rare) {
    return { ok: false as const, error: `${item.name} é um recurso raro: nenhuma loja compra.` };
  }
  const referencia = referenceValue(itemId);
  const precoUnitario = referencia === undefined ? 0 : npcBuybackPrice(referencia);
  if (precoUnitario <= 0) {
    return { ok: false as const, error: `Ninguém dá Ryō por ${item.name}.` };
  }

  const total = precoUnitario * qty;
  return runEconomy(async () => {
    const saldo = await prisma.$transaction(async (tx) => {
      await removeInventoryItem(tx, charId, itemId, qty, `Você não possui ${qty}x ${item.name}.`);
      return grantCharacterRyo(tx, {
        charId,
        amount: total,
        type: "NPC_SALE",
        reason: `Recompra de ${qty}x ${item.name} no Mercado Geral`,
        meta: { itemId, qty, precoUnitario },
      });
    });
    return { name: item.name, qty, precoUnitario, total, saldo };
  });
}

// ---------------- Abastecimento (Kage) ----------------

// Estoque central -> estoque da loja. Ninguem recebe Ryo: se o Kage fosse pago
// por isso, seria possivel esvaziar o cofre atraves de uma loja (secao 7.3).
export async function restockShop(
  villageId: VillageId,
  shopType: ShopType,
  itemId: string,
  qty: number,
  actorDiscordId: string,
) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };

  return runEconomy(async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      const shop = await requireShop(tx, villageId, shopType);
      if (shop.status === "LOCKED" || shop.status === "CONSTRUCTING") {
        throw new EconomyError(`${getShop(shopType)?.name ?? shopType} ainda não pode receber estoque.`);
      }
      const central = await removeVillageStock(tx, {
        villageId,
        itemId,
        qty,
        type: "SHOP_RESTOCK",
        reason: `Abastecimento de ${getShop(shopType)?.name ?? shopType}`,
        actorDiscordId,
        meta: { shopType, shopId: shop.id, treasuryDelta: 0 },
      });
      const loja = await addShopStock(tx, shop, itemId, qty);
      return { central, loja };
    });
    return { name: item.name, qty, ...resultado };
  });
}

// Estoque da loja -> estoque central. Nunca entrega direto ao Kage: entregar a
// um ninja e' a acao ja auditada de retirada de estoque da vila (secao 7.6).
export async function withdrawShopProduct(
  villageId: VillageId,
  shopType: ShopType,
  itemId: string,
  qty: number,
  motivo: string,
  actorDiscordId: string,
) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const razao = motivo.trim();
  if (razao.length < ECONOMY.withdrawalReasonMin || razao.length > ECONOMY.withdrawalReasonMax) {
    return {
      ok: false as const,
      error: `O motivo precisa ter de ${ECONOMY.withdrawalReasonMin} a ${ECONOMY.withdrawalReasonMax} caracteres.`,
    };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };

  return runEconomy(async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      const shop = await requireShop(tx, villageId, shopType);
      const loja = await removeShopStock(tx, shop.id, itemId, qty);
      const central = await addVillageStock(tx, {
        villageId,
        itemId,
        qty,
        type: "SHOP_WITHDRAWAL",
        reason: razao,
        actorDiscordId,
        meta: { shopType, shopId: shop.id, treasuryDelta: 0 },
      });
      return { loja, central };
    });
    return { name: item.name, qty, ...resultado };
  });
}

// ---------------- Producao municipal ----------------

export type CraftSource = "SHOP" | "CENTRAL";

export interface ShopCraftOutcome {
  recipe: RecipeDef;
  vezes: number;
  produzido: number;
  consumido: { itemId: string; qty: number }[];
  origem: CraftSource;
  estoqueLoja: number;
  restanteNaSemana: number | null;
}

// Receitas que ESTA loja pode produzir. Quem nao tem estacao (Mercado Geral,
// Empório, Marcenaria) devolve lista vazia — e' o mesmo gate que impede
// producao por customId forjado, porque o servico so' consulta daqui.
export function recipesForShop(shopType: ShopType): RecipeDef[] {
  const station = getShop(shopType)?.station;
  return station ? villageShopRecipes(station) : [];
}

function requireShopRecipe(shopType: ShopType, recipeId: string): RecipeDef {
  const recipe = getRecipe(recipeId);
  const permitidas = recipesForShop(shopType);
  if (!recipe || !permitidas.some((row) => row.id === recipe.id)) {
    throw new EconomyError("Esta receita não pertence a esta loja.");
  }
  return recipe;
}

// Resolve `anyOf` contra o estoque de origem, preferindo a alternativa que o
// Kage escolheu no painel. Resolve TUDO antes de consumir QUALQUER coisa: a
// secao 7.6 proibe retirar ingrediente parcialmente.
async function resolveShopIngredients(
  tx: Tx,
  recipe: RecipeDef,
  vezes: number,
  ler: (itemId: string) => Promise<number>,
  preferido?: string,
): Promise<{ itemId: string; qty: number }[]> {
  const itens: { itemId: string; qty: number }[] = [];
  for (const ingredient of recipe.ingredients) {
    const necessario = ingredient.qty * vezes;
    const candidatos = ingredient.itemId ? [ingredient.itemId] : (ingredient.anyOf ?? []);
    const ordenados =
      preferido && candidatos.includes(preferido)
        ? [preferido, ...candidatos.filter((id) => id !== preferido)]
        : candidatos;

    let escolhido: string | null = null;
    for (const candidato of ordenados) {
      if ((await ler(candidato)) >= necessario) {
        escolhido = candidato;
        break;
      }
    }
    if (!escolhido) {
      const nomes = candidatos.map((id) => getItem(id)?.name ?? id).join(" ou ");
      throw new EconomyError(`Faltam insumos: ${necessario}x ${nomes}.`);
    }
    itens.push({ itemId: escolhido, qty: necessario });
  }
  return itens;
}

// Producao municipal. Consome do estoque escolhido e deposita o produto SEMPRE
// no estoque da loja. Nao gera Ryo para ninguem (secao 7.6).
export async function shopCraft(input: {
  villageId: VillageId;
  shopType: ShopType;
  recipeId: string;
  vezes: number;
  origem: CraftSource;
  actorDiscordId: string;
  preferido?: string;
  now?: Date;
}) {
  if (!Number.isInteger(input.vezes) || input.vezes <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const now = input.now ?? new Date();
  const weekKey = weekKeyFor(now);

  return runEconomy(
    async (): Promise<ShopCraftOutcome> =>
      prisma.$transaction(async (tx) => {
        const recipe = requireShopRecipe(input.shopType, input.recipeId);
        const shop = await requireShop(tx, input.villageId, input.shopType);
        assertShopOpen(shop);

        // Escassez do Pergaminho de Arsenal: 3 por vila por competencia. O
        // contador vive no banco com a chave da semana ao lado, entao reinicio,
        // troca de Kage ou segunda tentativa nao contornam o limite.
        let restanteNaSemana: number | null = null;
        if (recipe.outputItemId === "pergaminho_arsenal") {
          if (shop.weeklyCraftKey !== weekKey) {
            await tx.villageShop.updateMany({
              where: { id: shop.id, weeklyCraftKey: { not: weekKey } },
              data: { weeklyCraftKey: weekKey, weeklyCraftCount: 0 },
            });
          }
          const produzidos = recipe.outputQty * input.vezes;
          const { count } = await tx.villageShop.updateMany({
            where: {
              id: shop.id,
              weeklyCraftKey: weekKey,
              weeklyCraftCount: { lte: ECONOMY.sealScrollsPerWeek - produzidos },
            },
            data: { weeklyCraftCount: { increment: produzidos } },
          });
          if (count === 0) {
            const feitos = shop.weeklyCraftKey === weekKey ? shop.weeklyCraftCount : 0;
            throw new EconomyError(
              `A Oficina já preparou ${feitos} de ${ECONOMY.sealScrollsPerWeek} Pergaminhos nesta competência.`,
            );
          }
          restanteNaSemana = ECONOMY.sealScrollsPerWeek - (
            (shop.weeklyCraftKey === weekKey ? shop.weeklyCraftCount : 0) + produzidos
          );
        }

        const ler =
          input.origem === "CENTRAL"
            ? (itemId: string) => getVillageStockQty(tx, input.villageId, itemId)
            : (itemId: string) => getShopStockQty(tx, shop.id, itemId);
        const consumido = await resolveShopIngredients(
          tx,
          recipe,
          input.vezes,
          ler,
          input.preferido,
        );

        for (const insumo of consumido) {
          if (input.origem === "CENTRAL") {
            await removeVillageStock(tx, {
              villageId: input.villageId,
              itemId: insumo.itemId,
              qty: insumo.qty,
              type: "SHOP_CRAFT",
              reason: `Insumo de ${recipe.name} (estoque central)`,
              actorDiscordId: input.actorDiscordId,
            });
          } else {
            await removeShopStock(tx, shop.id, insumo.itemId, insumo.qty);
          }
        }

        const produzido = recipe.outputQty * input.vezes;
        const estoqueLoja = await addShopStock(tx, shop, recipe.outputItemId, produzido);
        await recordLedger(tx, {
          type: "SHOP_CRAFT",
          villageId: input.villageId,
          itemId: recipe.outputItemId,
          itemQty: produzido,
          actorDiscordId: input.actorDiscordId,
          reason: `${getShop(input.shopType)?.name ?? input.shopType} produziu ${produzido}x ${recipe.name}`,
          meta: {
            shopId: shop.id,
            shopType: input.shopType,
            recipeId: recipe.id,
            origem: input.origem,
            consumido,
          },
        });

        return {
          recipe,
          vezes: input.vezes,
          produzido,
          consumido,
          origem: input.origem,
          estoqueLoja,
          restanteNaSemana,
        };
      }),
  );
}

// Quantos Pergaminhos ainda cabem na competencia. Só leitura, para o painel.
export async function sealScrollsLeft(
  villageId: VillageId,
  now = new Date(),
): Promise<{ feitos: number; limite: number }> {
  const shop = await findShop(villageId, "OFICINA_SELOS");
  const weekKey = weekKeyFor(now);
  const feitos = shop && shop.weeklyCraftKey === weekKey ? shop.weeklyCraftCount : 0;
  return { feitos, limite: ECONOMY.sealScrollsPerWeek };
}

// ---------------- Contrato de Empreendedor NPC ----------------

export interface ContractOffer {
  id: string;
  itemId: string;
  name: string;
  lotQty: number;
  valor: number;
  emEstoque: number;
}

export async function contractOffers(
  villageId: VillageId,
  shopType: ShopType,
): Promise<ContractOffer[]> {
  const shop = await findShop(villageId, shopType);
  if (!shop) return [];
  const estoques = await prisma.villageShopStock.findMany({ where: { shopId: shop.id } });
  const porItem = new Map(estoques.map((row) => [row.itemId, row.qty]));

  return contractsFor(shopType).map((contract) => ({
    id: contract.id,
    itemId: contract.itemId,
    name: getItem(contract.itemId)?.name ?? contract.itemId,
    lotQty: contract.lotQty,
    valor: wholesaleValue(contract.lotQty, referenceValue(contract.itemId) ?? 0),
    emEstoque: porItem.get(contract.itemId) ?? 0,
  }));
}

// Unica venda comercial que credita o cofre. O valor do contrato entra UMA vez;
// nao ha imposto extra por cima e isso nao dispara uma venda comum.
export async function acceptWholesaleContract(
  villageId: VillageId,
  contractId: string,
  actorDiscordId: string,
  now = new Date(),
) {
  const contract = getContract(contractId);
  if (!contract) return { ok: false as const, error: "Contrato desconhecido." };
  const referencia = referenceValue(contract.itemId);
  if (referencia === undefined) return { ok: false as const, error: "Contrato sem valor de referência." };
  const valor = wholesaleValue(contract.lotQty, referencia);
  const dayKey = dayKeyFor(now);
  const nome = getItem(contract.itemId)?.name ?? contract.itemId;

  return runEconomy(async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      const shop = await requireShop(tx, villageId, contract.shop);
      assertShopOpen(shop);

      // Limite diario, com a chave do dia ao lado do contador.
      if (shop.wholesaleDayKey !== dayKey) {
        await tx.villageShop.updateMany({
          where: { id: shop.id, wholesaleDayKey: { not: dayKey } },
          data: { wholesaleDayKey: dayKey, wholesaleCount: 0 },
        });
      }
      const { count } = await tx.villageShop.updateMany({
        where: {
          id: shop.id,
          wholesaleDayKey: dayKey,
          wholesaleCount: { lt: ECONOMY.wholesaleContractsPerDay },
        },
        data: { wholesaleCount: { increment: 1 } },
      });
      if (count === 0) {
        throw new EconomyError("Esta loja já fechou o contrato de atacado de hoje.");
      }

      // Lote completo ou nada: a condicao `qty >= lote` esta no WHERE.
      const estoque = await removeShopStock(tx, shop.id, contract.itemId, contract.lotQty);
      const cofre = await tx.village.update({
        where: { id: villageId },
        data: { treasuryRyo: { increment: valor } },
        select: { treasuryRyo: true },
      });
      await recordLedger(tx, {
        type: "SHOP_WHOLESALE_CONTRACT",
        villageId,
        ryoDelta: valor,
        itemId: contract.itemId,
        itemQty: -contract.lotQty,
        actorDiscordId,
        reason: `Contrato de atacado: ${contract.lotQty}x ${nome}`,
        meta: { contractId, shopType: contract.shop, valor, treasuryDelta: valor },
      });
      return { cofre: cofre.treasuryRyo, estoque };
    });
    return { name: nome, lotQty: contract.lotQty, valor, ...resultado };
  });
}

// ---------------- Historico ----------------

const SHOP_LEDGER_TYPES = [
  "SHOP_BUY_FROM_PLAYER",
  "SHOP_SALE_TO_PLAYER",
  "SHOP_WHOLESALE_CONTRACT",
  "SHOP_RESTOCK",
  "SHOP_CRAFT",
  "SHOP_WITHDRAWAL",
] as const;

// Ultimos lancamentos que tocaram esta loja. Filtra pelo shopType gravado em
// `metaJson` — o livro-caixa continua sendo um so'.
export async function shopHistory(villageId: VillageId, shopType: ShopType, take = 10) {
  const linhas = await prisma.villageLedger.findMany({
    where: { villageId, type: { in: [...SHOP_LEDGER_TYPES] } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return linhas
    .filter((linha) => {
      try {
        return (JSON.parse(linha.metaJson) as { shopType?: string }).shopType === shopType;
      } catch {
        return false;
      }
    })
    .slice(0, take);
}

export const MUNICIPAL_SHOP_TYPES = MUNICIPAL_SHOPS.map((shop) => shop.type);
