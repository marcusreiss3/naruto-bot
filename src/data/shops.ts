// Catalogo das lojas de vila (secao 7 de docs/economia-vilas.md).
//
// Conteudo puro: nenhum preco final e' calculado aqui. Este arquivo declara as
// BASES (`shopBuyBase`, `retailBase`) e quem negocia o que; a taxa da vila e o
// arredondamento ficam em services/economy/shop-pricing.ts, para nao existirem
// duas formulas de imposto no projeto.
//
// Regra que rege o desenho todo (secao 7.3): recurso tem preco de COMPRA e
// produto tem preco de VENDA. Nao existe item que a loja compre e revenda pelo
// mesmo balcao — isso viraria conversao gratuita de material em Ryo.

import { villageShopRecipes, type RecipeStation } from "./recipes.js";

export const SHOP_TYPES = [
  "MERCADO_GERAL",
  "EMPORIO",
  "MARCENARIA",
  "FUNDICAO",
  "ICHIRAKU",
  "OFICINA_SELOS",
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

export const SHOP_STATUSES = [
  "LOCKED",
  "CONSTRUCTING",
  "AWAITING_CHANNEL",
  "ACTIVE",
  "SUSPENDED",
] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

export interface ShopDef {
  type: ShopType;
  name: string;
  emoji: string;
  description: string;
  // Loja municipal tem estoque, orcamento e livro-caixa. O Mercado Geral e' um
  // NPC externo: nao tem estoque, nao move o cofre e nao pode ser administrado.
  municipal: boolean;
  // Estacao de producao no catalogo de receitas. Sem estacao, a loja nao
  // produz nada — nem por customId forjado, porque o servico consulta daqui.
  station?: RecipeStation;
  // Situacao com que a loja nasce no seed.
  initialStatus: ShopStatus;
}

export const SHOPS: ShopDef[] = [
  {
    type: "MERCADO_GERAL",
    name: "Mercado Geral",
    emoji: "🧺",
    description:
      "Barracas de fora da vila. Vendem matéria bruta e fazem recompra de emergência; nada aqui passa pelo cofre.",
    municipal: false,
    initialStatus: "ACTIVE",
  },
  {
    type: "EMPORIO",
    name: "Empório de Alimentos",
    emoji: "🍎",
    description: "Compra ingredientes de cozinha dos ninjas e revende o básico do dia a dia.",
    municipal: true,
    initialStatus: "ACTIVE",
  },
  {
    type: "MARCENARIA",
    name: "Marcenaria",
    emoji: "🪵",
    description: "Compra madeira, fibra e papel para as obras e para a Oficina de Selos.",
    municipal: true,
    initialStatus: "ACTIVE",
  },
  {
    type: "FUNDICAO",
    name: "Fundição Ninja",
    emoji: "🔥",
    description: "Forja da vila: compra minério e produz aço, pólvora e o equipamento avançado.",
    municipal: true,
    station: "FUNDICAO",
    initialStatus: "ACTIVE",
  },
  {
    type: "ICHIRAKU",
    name: "Ichiraku — Casa de Lámen",
    emoji: "🍜",
    description: "Cozinha da vila. Única loja construível: precisa de obra do Kage para abrir.",
    municipal: true,
    station: "ICHIRAKU",
    initialStatus: "LOCKED",
  },
  {
    type: "OFICINA_SELOS",
    name: "Oficina de Selos",
    emoji: "📜",
    description: "Prepara Tinta de Selo e Pergaminho de Arsenal, sob escassez semanal.",
    municipal: true,
    station: "OFICINA_SELOS",
    initialStatus: "ACTIVE",
  },
];

const SHOP_MAP = new Map(SHOPS.map((shop) => [shop.type, shop]));

export function getShop(type: string): ShopDef | undefined {
  return SHOP_MAP.get(type as ShopType);
}

export function isShopType(value: unknown): value is ShopType {
  return (SHOP_TYPES as readonly unknown[]).includes(value);
}

export const MUNICIPAL_SHOPS = SHOPS.filter((shop) => shop.municipal);

// ---------------- O que cada loja compra do jogador ----------------

// Tabela da secao 7.4, copiada sem acrescimo. O jogador recebe
// piso(base x (1 - taxa)); se der 0, a loja simplesmente nao oferece compra.
//
// Materiais raros NAO entram aqui de proposito (secao 7.4): Minerio Raro e
// Madeira Reforcada so' chegam a vila por doacao e abastecimento do Kage.
//
// Materiais que a tabela do spec nao cita (sal, lenha, lingote de ferro)
// tambem ficam de fora: alimentar a producao com eles e' papel do estoque
// central + abastecimento, exatamente como a Madeira Reforcada da Oficina.
export interface IngredientDef {
  itemId: string;
  shopBuyBase: number;
  shops: ShopType[];
}

export const SHOP_INGREDIENTS: IngredientDef[] = [
  { itemId: "madeira", shopBuyBase: 5, shops: ["MARCENARIA"] },
  { itemId: "fibra_vegetal", shopBuyBase: 4, shops: ["MARCENARIA", "EMPORIO"] },
  { itemId: "fruta", shopBuyBase: 8, shops: ["EMPORIO", "ICHIRAKU"] },
  { itemId: "erva_medicinal", shopBuyBase: 7, shops: ["EMPORIO", "ICHIRAKU"] },
  { itemId: "minerio_ferro", shopBuyBase: 12, shops: ["FUNDICAO"] },
  { itemId: "pedra", shopBuyBase: 3, shops: ["FUNDICAO"] },
  { itemId: "carvao", shopBuyBase: 6, shops: ["FUNDICAO", "ICHIRAKU"] },
  { itemId: "argila", shopBuyBase: 5, shops: ["FUNDICAO"] },
  { itemId: "carne_crua", shopBuyBase: 9, shops: ["EMPORIO", "ICHIRAKU"] },
  { itemId: "peixe_cru", shopBuyBase: 8, shops: ["EMPORIO", "ICHIRAKU"] },
  { itemId: "couro", shopBuyBase: 7, shops: ["EMPORIO", "FUNDICAO"] },
  { itemId: "grao", shopBuyBase: 5, shops: ["EMPORIO", "ICHIRAKU"] },
  { itemId: "agua_limpa", shopBuyBase: 3, shops: ["EMPORIO", "ICHIRAKU"] },
  { itemId: "farinha", shopBuyBase: 10, shops: ["EMPORIO", "ICHIRAKU"] },
  { itemId: "caldo", shopBuyBase: 14, shops: ["ICHIRAKU"] },
  { itemId: "tempero", shopBuyBase: 8, shops: ["ICHIRAKU"] },
  { itemId: "papel", shopBuyBase: 6, shops: ["MARCENARIA", "OFICINA_SELOS"] },
  { itemId: "tinta_de_selo", shopBuyBase: 12, shops: ["OFICINA_SELOS"] },
];

const INGREDIENT_MAP = new Map(SHOP_INGREDIENTS.map((row) => [row.itemId, row]));

export function shopBuyBase(itemId: string): number | undefined {
  return INGREDIENT_MAP.get(itemId)?.shopBuyBase;
}

// O que esta loja aceita comprar do jogador, na ordem da tabela.
export function ingredientsBoughtBy(shopType: ShopType): IngredientDef[] {
  return SHOP_INGREDIENTS.filter((row) => row.shops.includes(shopType));
}

export function shopBuysItem(shopType: ShopType, itemId: string): boolean {
  return INGREDIENT_MAP.get(itemId)?.shops.includes(shopType) ?? false;
}

// ---------------- O que cada loja vende ao jogador ----------------

// `retailBase` global da secao 3.1, mais os seis produtos de loja definidos na
// secao 7.4. O preco final e' teto(base x (1 + taxa)); o Ryo pago some da
// circulacao e o cofre NAO e' creditado (secao 3.1 e 7.3).
export interface ProductDef {
  itemId: string;
  retailBase: number;
  shop: ShopType;
}

// Tabela da secao 7.3.1: TODA loja municipal e' balcao de varejo, nao so' as
// que fabricam. A Marcenaria e o Emporio vendem materia-prima do proprio
// estoque, e por isso `Comprar` nunca mais fica desativado "porque a loja nao
// produz" — fica desativado so' quando nao ha estoque fisico.
//
// A margem (retailBase > shopBuyBase do mesmo item) e' a conveniencia de
// mercado. Ela e' segura porque o item precisa EXISTIR em VillageShopStock
// para ser vendido: comprar da loja e revender para ela sempre perde Ryo, e
// transferir central -> loja nao cria produto nenhum (secao 7.3).
export const SHOP_PRODUCTS: ProductDef[] = [
  // Fundição Ninja — armas e ferramentas ja existentes. Nenhuma arma nova.
  { itemId: "kunai", retailBase: 35, shop: "FUNDICAO" },
  { itemId: "shuriken", retailBase: 22, shop: "FUNDICAO" },
  { itemId: "senbon", retailBase: 18, shop: "FUNDICAO" },
  { itemId: "fuma_shuriken", retailBase: 120, shop: "FUNDICAO" },
  { itemId: "papel_bomba", retailBase: 55, shop: "FUNDICAO" },
  { itemId: "bomba_fumaca", retailBase: 50, shop: "FUNDICAO" },
  { itemId: "fios_aco_ninja", retailBase: 45, shop: "FUNDICAO" },
  { itemId: "katana", retailBase: 450, shop: "FUNDICAO" },
  { itemId: "lamina_chakra", retailBase: 2400, shop: "FUNDICAO" },
  // ...e o balcao de materia mineral e metal processado (secao 7.3.1).
  { itemId: "minerio_ferro", retailBase: 18, shop: "FUNDICAO" },
  { itemId: "pedra", retailBase: 5, shop: "FUNDICAO" },
  { itemId: "carvao", retailBase: 9, shop: "FUNDICAO" },
  { itemId: "argila", retailBase: 8, shop: "FUNDICAO" },
  { itemId: "lingote_ferro", retailBase: 30, shop: "FUNDICAO" },
  { itemId: "aco", retailBase: 55, shop: "FUNDICAO" },
  { itemId: "polvora", retailBase: 25, shop: "FUNDICAO" },

  // Empório de Alimentos — basico do dia a dia.
  { itemId: "fruta", retailBase: 10, shop: "EMPORIO" },
  { itemId: "carne_crua", retailBase: 12, shop: "EMPORIO" },
  { itemId: "peixe_cru", retailBase: 11, shop: "EMPORIO" },
  { itemId: "grao", retailBase: 8, shop: "EMPORIO" },
  { itemId: "farinha", retailBase: 14, shop: "EMPORIO" },
  { itemId: "agua_limpa", retailBase: 5, shop: "EMPORIO" },
  { itemId: "erva_medicinal", retailBase: 11, shop: "EMPORIO" },
  { itemId: "pao", retailBase: 14, shop: "EMPORIO" },

  // Marcenaria — deixou de ser so' compradora.
  { itemId: "madeira", retailBase: 8, shop: "MARCENARIA" },
  { itemId: "fibra_vegetal", retailBase: 7, shop: "MARCENARIA" },
  { itemId: "papel", retailBase: 10, shop: "MARCENARIA" },
  { itemId: "lenha", retailBase: 6, shop: "MARCENARIA" },

  // Ichiraku — comida preparada.
  { itemId: "carne_cozida", retailBase: 18, shop: "ICHIRAKU" },
  { itemId: "peixe_cozido", retailBase: 16, shop: "ICHIRAKU" },
  { itemId: "dango", retailBase: 30, shop: "ICHIRAKU" },
  { itemId: "ensopado", retailBase: 35, shop: "ICHIRAKU" },
  { itemId: "lamen", retailBase: 48, shop: "ICHIRAKU" },

  // Oficina de Selos — `ryoValue` do item continua 300, para a restauracao do
  // pergaminho gasto seguir custando 150 (secao 7.4).
  { itemId: "papel", retailBase: 10, shop: "OFICINA_SELOS" },
  { itemId: "tinta_de_selo", retailBase: 24, shop: "OFICINA_SELOS" },
  { itemId: "pergaminho_arsenal", retailBase: 300, shop: "OFICINA_SELOS" },
];

// Chaveado por LOJA+ITEM: desde a 7.3.1 o mesmo item aparece em balcoes
// diferentes (Papel na Marcenaria e na Oficina), entao um mapa por itemId
// perderia silenciosamente uma das linhas.
const PRODUCT_MAP = new Map(SHOP_PRODUCTS.map((row) => [`${row.shop}:${row.itemId}`, row]));

// Base de varejo do item, independente de balcao. E' o "valor de referencia"
// global da secao 3.1 — usado pela recompra do NPC e pelo contrato de atacado.
// Um item so' pode ter UMA base, mesmo vendido em duas lojas; o teste
// "retailBase e' unico por item" trava isso.
const RETAIL_BY_ITEM = new Map(SHOP_PRODUCTS.map((row) => [row.itemId, row.retailBase]));

export function retailBase(itemId: string): number | undefined {
  return RETAIL_BY_ITEM.get(itemId);
}

export function productsSoldBy(shopType: ShopType): ProductDef[] {
  return SHOP_PRODUCTS.filter((row) => row.shop === shopType);
}

export function shopSellsItem(shopType: ShopType, itemId: string): boolean {
  return PRODUCT_MAP.has(`${shopType}:${itemId}`);
}

// ---------------- Mercado Geral (NPC externo) ----------------

// "Barracas de fora da vila", com selecao diaria pequena, cara e variavel
// (secao 7.2.1). Nao tem estoque municipal, nao move cofre e nao produz nada.
//
// Este e' o universo ELEGIVEL, com o peso do sorteio. O que esta a venda hoje
// sao as quatro ofertas persistidas em `GeneralMarketOffer` — ser elegivel nao
// basta para comprar.
//
// So' materia BRUTA: os processados (farinha, papel, caldo, tempero, tinta) e
// os raros ficam de fora para nao curto-circuitarem o craft e as lojas da vila.
export interface MarketOfferDef {
  itemId: string;
  weight: number;
}

export const GENERAL_MARKET_POOL: MarketOfferDef[] = [
  // Comum
  { itemId: "madeira", weight: 100 },
  { itemId: "pedra", weight: 100 },
  { itemId: "fibra_vegetal", weight: 100 },
  { itemId: "agua_limpa", weight: 100 },
  // Menos comum
  { itemId: "minerio_ferro", weight: 55 },
  { itemId: "carvao", weight: 55 },
  { itemId: "argila", weight: 55 },
  { itemId: "grao", weight: 55 },
  { itemId: "couro", weight: 55 },
  // Difícil
  { itemId: "erva_medicinal", weight: 20 },
];

// Quem PODE ser sorteado. Continua sendo o gate de preco do NPC: item fora
// desta lista nao tem preco de balcao nem com customId forjado.
export const GENERAL_MARKET_MATERIALS = GENERAL_MARKET_POOL.map((row) => row.itemId);

export function isGeneralMarketMaterial(itemId: string): boolean {
  return GENERAL_MARKET_MATERIALS.includes(itemId);
}

// Valor de referencia do item para a recompra de emergencia do Mercado Geral.
// Produto usa o varejo; materia-prima usa a base de compra das lojas.
export function referenceValue(itemId: string): number | undefined {
  return retailBase(itemId) ?? shopBuyBase(itemId);
}

// ---------------- O que o Kage pode abastecer ----------------

// Secao 7.3.1, ultimo paragrafo: o catalogo de `Abastecer` so' permite insumo
// de receita DAQUELA loja e item vendavel nela. Sem esse gate da' para empurrar
// kunai para a Marcenaria — estoque que ninguem consegue usar nem comprar, e
// que so' sai pela retirada administrativa.
//
// Insumo de receita entra mesmo sem varejo: a Madeira Reforcada da Oficina e o
// sal do Ichiraku nao sao vendidos a ninguem, mas precisam chegar la'.
export function restockableItems(shopType: ShopType): string[] {
  const permitidos = new Set(productsSoldBy(shopType).map((row) => row.itemId));
  const station = getShop(shopType)?.station;
  if (station) {
    for (const recipe of villageShopRecipes(station)) {
      for (const ingredient of recipe.ingredients) {
        if (ingredient.itemId) permitidos.add(ingredient.itemId);
        for (const alternativa of ingredient.anyOf ?? []) permitidos.add(alternativa);
      }
    }
  }
  return [...permitidos];
}

export function canRestockItem(shopType: ShopType, itemId: string): boolean {
  return restockableItems(shopType).includes(itemId);
}

// ---------------- Contrato de Empreendedor NPC ----------------

// Unica venda comercial que credita o cofre (secao 7.3). O valor segue a regra
// unica `piso(lote x referencia x ECONOMY.wholesaleRate)`; com 0,875 o lote de
// 10 Lámen da' exatamente os 420 Ryo do exemplo da secao 7.6.
//
// So' loja municipal com producao propria tem contrato: vender atacado o que a
// vila apenas comprou do jogador seria transformar o cofre em revendedor.
export interface WholesaleContractDef {
  id: string;
  shop: ShopType;
  itemId: string;
  lotQty: number;
}

export const WHOLESALE_CONTRACTS: WholesaleContractDef[] = [
  { id: "ichiraku_lamen", shop: "ICHIRAKU", itemId: "lamen", lotQty: 10 },
  { id: "fundicao_papel_bomba", shop: "FUNDICAO", itemId: "papel_bomba", lotQty: 5 },
  { id: "oficina_pergaminho", shop: "OFICINA_SELOS", itemId: "pergaminho_arsenal", lotQty: 3 },
];

export function contractsFor(shopType: ShopType): WholesaleContractDef[] {
  return WHOLESALE_CONTRACTS.filter((row) => row.shop === shopType);
}

export function getContract(id: string): WholesaleContractDef | undefined {
  return WHOLESALE_CONTRACTS.find((row) => row.id === id);
}

// ---------------- Obra do Ichiraku ----------------

// Custo-base da secao 7.2, antes do fator de populacao. O fator e' congelado no
// inicio da obra: a caixa de confirmacao da secao 7.7 mostra 3.750 Ryo / 150
// madeira / 90 pedra / 80 grao com fator 0,50, que e' exatamente metade disto.
export const ICHIRAKU_CONSTRUCTION = {
  buildingType: "SHOP" as const,
  buildingKey: "ICHIRAKU" as const,
  shop: "ICHIRAKU" as ShopType,
  baseCostRyo: 7500,
  baseCostItems: { madeira: 300, pedra: 180, grao: 160 } as Record<string, number>,
  durationMs: 5 * 24 * 60 * 60_000,
};
