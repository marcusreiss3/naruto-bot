// Formulas de preco das lojas (secoes 3.1 e 7.4). Puro: sem Prisma, sem
// Discord, sem relogio. Todo handler, embed e servico chama daqui — nao existe
// segunda formula de imposto no projeto.

import { ECONOMY } from "../../config/balance.js";
import {
  isGeneralMarketMaterial,
  shopSellsItem,
  retailBase,
  shopBuyBase,
  type ShopType,
} from "../../data/shops.js";
import type { RecipeDef } from "../../data/recipes.js";

// Preco de varejo: teto(base x (1 + taxa)). O acrescimo NAO vai para o cofre —
// ele some da circulacao junto com o resto (secao 3.1).
export function retailPrice(base: number, taxRate: number): number {
  return Math.ceil(base * (1 + taxRate));
}

// O que a loja paga ao jogador: piso(base x (1 - taxa)). A retencao e' um
// encargo de servico e tambem nao credita cofre.
export function shopPurchasePrice(base: number, taxRate: number): number {
  return Math.floor(base * (1 - taxRate));
}

// Recompra de emergencia do Mercado Geral: 30% do valor de referencia.
export function npcBuybackPrice(reference: number): number {
  return Math.floor(reference * ECONOMY.npcBuybackRate);
}

// Preco de balcao do Mercado Geral para materia bruta. O markup existe para
// impedir arbitragem contra a loja municipal (comprar barato do NPC e revender
// caro a vila).
export function generalMarketPrice(base: number, taxRate: number): number {
  return retailPrice(base * ECONOMY.generalMarketMarkup, taxRate);
}

// Orcamento diario de compra de ingrediente de uma loja.
export function dailyPurchaseBudget(populationFactor: number): number {
  return Math.floor(ECONOMY.shopDailyBudgetBase * populationFactor);
}

// Valor do lote no Contrato de Empreendedor NPC.
export function wholesaleValue(lotQty: number, reference: number): number {
  return Math.floor(lotQty * reference * ECONOMY.wholesaleRate);
}

// ---------------- Consultas de catalogo ----------------

export interface PricedProduct {
  itemId: string;
  base: number;
  price: number;
}

export interface PricedIngredient {
  itemId: string;
  base: number;
  price: number;
}

// Quanto o jogador paga por um produto DESTA loja. `undefined` = esta loja nao
// vende esse item, e nenhum customId forjado muda isso.
//
// O `sellsHere` importa: sem ele, um id de item valido daria preco em qualquer
// balcao, e o Ichiraku venderia kunai se alguem o abastecesse.
export function productPrice(
  shopType: ShopType,
  itemId: string,
  taxRate: number,
): number | undefined {
  if (shopType === "MERCADO_GERAL") return generalMarketItemPrice(itemId, taxRate);
  if (!shopSellsItem(shopType, itemId)) return undefined;
  const base = retailBase(itemId);
  if (base === undefined) return undefined;
  return retailPrice(base, taxRate);
}

// Mercado Geral: materia bruta com markup. Produto de loja municipal nao e'
// vendido aqui — o NPC nao produz equipamento nem comida preparada.
//
// Isto e' so' a ELEGIBILIDADE de preco. Estar aqui nao quer dizer que ha' o que
// comprar: o que esta a venda hoje sao as quatro ofertas do dia, e quem checa
// isso e' `buyFromGeneralMarket` contra `GeneralMarketOffer`.
export function generalMarketItemPrice(itemId: string, taxRate: number): number | undefined {
  if (!isGeneralMarketMaterial(itemId)) return undefined;
  const base = shopBuyBase(itemId);
  if (base === undefined) return undefined;
  return generalMarketPrice(base, taxRate);
}

// Quanto a loja paga por uma unidade do ingrediente. `0` significa que a loja
// NAO oferece compra daquele item: a secao 7.4 proibe "pagar 0 Ryo"
// silenciosamente, entao quem chama trata 0 como recusa.
export function ingredientPrice(itemId: string, taxRate: number): number | undefined {
  const base = shopBuyBase(itemId);
  if (base === undefined) return undefined;
  return shopPurchasePrice(base, taxRate);
}

// ---------------- Custo estimado de uma receita ----------------

// Custo dos insumos pelo preco de compra ATUAL, para o painel mostrar margem.
// E' estimativa de exibicao: nao vale como saldo e nunca e' escrito no banco.
// Ingrediente sem base de compra (Madeira Reforcada, sal, lenha...) entra como
// 0 e e' devolvido em `semPreco` para o embed avisar.
export interface RecipeCostEstimate {
  custo: number;
  semPreco: string[];
}

export function estimateRecipeCost(recipe: RecipeDef, taxRate: number): RecipeCostEstimate {
  let custo = 0;
  const semPreco: string[] = [];

  for (const ingredient of recipe.ingredients) {
    const candidatos = ingredient.itemId ? [ingredient.itemId] : (ingredient.anyOf ?? []);
    // `anyOf`: o custo estimado usa a alternativa mais barata que tenha preco.
    const precos = candidatos
      .map((id) => ingredientPrice(id, taxRate))
      .filter((preco): preco is number => preco !== undefined);
    if (precos.length === 0) {
      semPreco.push(candidatos[0] ?? "?");
      continue;
    }
    custo += Math.min(...precos) * ingredient.qty;
  }

  return { custo, semPreco };
}

// Margem estimada de um produto: varejo menos custo dos insumos.
export function estimateMargin(
  recipe: RecipeDef,
  taxRate: number,
): { varejo: number; custo: number; margem: number; semPreco: string[] } | undefined {
  const base = retailBase(recipe.outputItemId);
  if (base === undefined) return undefined;
  const varejo = retailPrice(base, taxRate) * recipe.outputQty;
  const { custo, semPreco } = estimateRecipeCost(recipe, taxRate);
  return { varejo, custo, margem: varejo - custo, semPreco };
}

// ---------------- Limites de quantidade ----------------

// Quantas unidades cabem numa compra: o menor entre pedido, estoque e o que o
// Ryo do jogador paga. Puro para poder ser testado sem banco; a trava de
// verdade continua sendo o UPDATE condicional na transacao.
export function affordableBuyQty(
  pedido: number,
  estoque: number,
  ryoDoJogador: number,
  precoUnitario: number,
): number {
  if (precoUnitario <= 0) return 0;
  const cabeNoBolso = Math.floor(Math.max(0, ryoDoJogador) / precoUnitario);
  return Math.max(0, Math.min(pedido, estoque, cabeNoBolso));
}

// Quantas unidades a loja consegue comprar: o menor entre pedido, inventario,
// espaco livre, orcamento diario restante e Ryo livre do cofre.
export function acceptableSellQty(
  pedido: number,
  inventario: number,
  espacoLivre: number,
  orcamentoRestante: number,
  cofreLivre: number,
  precoUnitario: number,
): number {
  if (precoUnitario <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      pedido,
      inventario,
      espacoLivre,
      Math.floor(Math.max(0, orcamentoRestante) / precoUnitario),
      Math.floor(Math.max(0, cofreLivre) / precoUnitario),
    ),
  );
}
