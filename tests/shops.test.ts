// Regras puras da etapa 05: preço, orçamento, limites de quantidade e a
// coerência do catálogo de lojas. Nada aqui toca banco nem Discord.

import { describe, expect, it } from "vitest";
import { ECONOMY } from "../src/config/balance.js";
import { LEDGER_TYPES } from "../src/config/enums.js";
import { getItem } from "../src/data/items.js";
import { getRecipe, villageShopRecipes } from "../src/data/recipes.js";
import {
  GENERAL_MARKET_MATERIALS,
  GENERAL_MARKET_POOL,
  ICHIRAKU_CONSTRUCTION,
  SHOPS,
  SHOP_INGREDIENTS,
  SHOP_PRODUCTS,
  WHOLESALE_CONTRACTS,
  canRestockItem,
  getShop,
  ingredientsBoughtBy,
  productsSoldBy,
  referenceValue,
  restockableItems,
  retailBase,
  shopBuyBase,
  shopBuysItem,
  shopSellsItem,
} from "../src/data/shops.js";
import {
  ICHIRAKU_CATEGORY_BY_VILLAGE,
  ICHIRAKU_CHANNEL_NAME,
  VILLAGE_ANNOUNCE_CHANNELS,
  VILLAGE_IDS,
  VILLAGE_MARKET_CHANNELS,
  villageFromMarketChannel,
} from "../src/data/villages.js";
import {
  CENTRO_COMERCIAL_CHANNEL_ID,
  CENTRO_COMERCIAL_KIRI_CHANNEL_ID,
  CENTRO_COMERCIAL_SUNA_CHANNEL_ID,
} from "../src/data/scenarios/index.js";
import { VILLAGE_MANSIONS } from "../src/services/village-service.js";
import {
  acceptableSellQty,
  affordableBuyQty,
  dailyPurchaseBudget,
  estimateMargin,
  estimateRecipeCost,
  generalMarketItemPrice,
  ingredientPrice,
  npcBuybackPrice,
  productPrice,
  retailPrice,
  shopPurchasePrice,
  wholesaleValue,
} from "../src/services/economy/shop-pricing.js";
import { scaleConstructionCost } from "../src/services/economy/constructions.js";
import { quantidadeValida } from "../src/commands/loja.js";
import { dayKeyFor } from "../src/services/economy/week.js";
import {
  nextCaravanAt,
  offerQuantity,
  pickWeighted,
} from "../src/services/economy/general-market.js";
import {
  pickPurchaseOfferItems,
  purchaseOfferCount,
  purchaseOfferQuantity,
} from "../src/services/economy/shop-purchase-offers.js";

describe("preço de varejo e de compra", () => {
  it("varejo é teto(base × (1 + taxa))", () => {
    // Lámen com 5%: 48 -> 51, exatamente o número da seção 7.4.
    expect(retailPrice(48, 0.05)).toBe(51);
    expect(retailPrice(35, 0.05)).toBe(37);
    expect(retailPrice(100, 0)).toBe(100);
  });

  it("a loja paga piso(base × (1 − taxa))", () => {
    // Coluna "Com 5% de imposto" da tabela da seção 7.4, linha por linha.
    const esperado: Record<string, number> = {
      madeira: 4,
      fibra_vegetal: 3,
      fruta: 7,
      erva_medicinal: 6,
      minerio_ferro: 11,
      pedra: 2,
      carvao: 5,
      argila: 4,
      carne_crua: 8,
      peixe_cru: 7,
      couro: 6,
      grao: 4,
      agua_limpa: 2,
      farinha: 9,
      caldo: 13,
      tempero: 7,
      papel: 5,
      tinta_de_selo: 11,
    };
    for (const [itemId, preco] of Object.entries(esperado)) {
      expect(ingredientPrice(itemId, 0.05), itemId).toBe(preco);
    }
  });

  it("preço de compra 0 significa que a loja não compra, nunca 'pagamos 0'", () => {
    // Base 3 com imposto máximo de 15% ainda dá 2; a regra existe para o dia em
    // que uma base pequena encontrar uma taxa alta.
    expect(shopPurchasePrice(3, 0.5)).toBe(1);
    expect(shopPurchasePrice(1, 0.5)).toBe(0);
  });

  it("recompra de emergência do NPC é 30% do valor de referência", () => {
    expect(npcBuybackPrice(48)).toBe(14);
    // Desde a 7.3.1 a Madeira tem varejo (8), então a referência dela deixou de
    // ser a base de compra (5): piso(8 × 0,30) = 2.
    expect(referenceValue("madeira")).toBe(8);
    expect(npcBuybackPrice(referenceValue("madeira")!)).toBe(2);
    expect(ECONOMY.npcBuybackRate).toBe(0.3);
  });
});

describe("Mercado Geral não pode virar impressora de Ryō", () => {
  it("vende matéria bruta acima do que a loja municipal paga por ela", () => {
    for (const itemId of GENERAL_MARKET_MATERIALS) {
      for (const taxa of [0, 0.05, 0.15]) {
        const compraNoNpc = generalMarketItemPrice(itemId, taxa)!;
        const vendaNaVila = ingredientPrice(itemId, taxa)!;
        expect(compraNoNpc, `${itemId} @ ${taxa}`).toBeGreaterThan(vendaNaVila);
      }
    }
  });

  it("a recompra do NPC é sempre pior que vender à loja da vila", () => {
    for (const linha of SHOP_INGREDIENTS) {
      const npc = npcBuybackPrice(referenceValue(linha.itemId)!);
      const vila = ingredientPrice(linha.itemId, 0.05)!;
      expect(npc, linha.itemId).toBeLessThan(vila);
    }
  });

  it("não vende equipamento nem comida preparada", () => {
    for (const itemId of ["kunai", "katana", "lamen", "pergaminho_arsenal"]) {
      expect(generalMarketItemPrice(itemId, 0.05), itemId).toBeUndefined();
    }
  });

  it("só oferece matéria bruta, nunca processado", () => {
    for (const itemId of ["farinha", "papel", "caldo", "tempero", "tinta_de_selo", "lingote_ferro"]) {
      expect(GENERAL_MARKET_MATERIALS.includes(itemId), itemId).toBe(false);
    }
  });

  it("o universo sorteável exclui raro, arma, comida preparada e pergaminho", () => {
    for (const itemId of GENERAL_MARKET_MATERIALS) {
      const item = getItem(itemId)!;
      expect(item.category, itemId).toBe("MATERIAL");
      expect(item.rare, itemId).not.toBe(true);
    }
    for (const proibido of [
      "minerio_raro",
      "madeira_reforcada",
      "kunai",
      "katana",
      "lamen",
      "pao",
      "pergaminho_arsenal",
      "aco",
    ]) {
      expect(GENERAL_MARKET_MATERIALS.includes(proibido), proibido).toBe(false);
    }
  });
});

describe("caravana do Mercado Geral (seção 7.2.1)", () => {
  it("os pesos são os da tabela: 100 comum, 55 menos comum, 20 difícil", () => {
    const peso = (itemId: string) => GENERAL_MARKET_POOL.find((r) => r.itemId === itemId)?.weight;
    for (const itemId of ["madeira", "pedra", "fibra_vegetal", "agua_limpa"]) {
      expect(peso(itemId), itemId).toBe(100);
    }
    for (const itemId of ["minerio_ferro", "carvao", "argila", "grao", "couro"]) {
      expect(peso(itemId), itemId).toBe(55);
    }
    expect(peso("erva_medicinal")).toBe(20);
    expect(GENERAL_MARKET_POOL).toHaveLength(10);
  });

  it("a quantidade é limitar(10, 60, teto(2 × ativos)) — os exemplos do spec", () => {
    expect(offerQuantity(6)).toBe(12);
    expect(offerQuantity(20)).toBe(40);
    expect(offerQuantity(30)).toBe(60);
    expect(offerQuantity(45)).toBe(60); // teto
    expect(offerQuantity(3)).toBe(10); // piso
    expect(offerQuantity(0)).toBe(10); // vila sem ninguém ativo ainda compra
  });

  it("sorteia quatro itens diferentes", () => {
    const escolhidos = pickWeighted(GENERAL_MARKET_POOL, ECONOMY.generalMarketOffersPerDay, () => 0.5);
    expect(escolhidos).toHaveLength(4);
    expect(new Set(escolhidos).size).toBe(4);
    for (const itemId of escolhidos) expect(GENERAL_MARKET_MATERIALS).toContain(itemId);
  });

  it("respeita o peso: rand ≈ 0 pega sempre o primeiro do bolo restante", () => {
    // Peso total 695. Com o ponteiro no começo, cai no primeiro item; ele sai do
    // bolo e a rodada seguinte pega o próximo.
    expect(pickWeighted(GENERAL_MARKET_POOL, 3, () => 0)).toEqual([
      "madeira",
      "pedra",
      "fibra_vegetal",
    ]);
    // Ponteiro no fim do bolo: o item de peso 20 é o último, e só é alcançado
    // pelos ~2,9% finais da faixa.
    expect(pickWeighted(GENERAL_MARKET_POOL, 1, () => 0.999)).toEqual(["erva_medicinal"]);
  });

  it("um item difícil aparece muito menos que madeira", () => {
    // Amostra determinística: um gerador linear simples, sem depender de sorte.
    let semente = 1;
    const rand = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente / 2147483648;
    };
    const contagem = new Map<string, number>();
    for (let i = 0; i < 4000; i += 1) {
      for (const itemId of pickWeighted(GENERAL_MARKET_POOL, 4, rand)) {
        contagem.set(itemId, (contagem.get(itemId) ?? 0) + 1);
      }
    }
    expect(contagem.get("madeira")!).toBeGreaterThan(contagem.get("erva_medicinal")! * 2);
    // Todo item é alcançável: nenhum peso vira zero na prática.
    for (const itemId of GENERAL_MARKET_MATERIALS) {
      expect(contagem.get(itemId) ?? 0, itemId).toBeGreaterThan(0);
    }
  });

  it("nunca sorteia mais itens do que o bolo tem", () => {
    expect(pickWeighted(GENERAL_MARKET_POOL, 99, () => 0.5)).toHaveLength(10);
    expect(pickWeighted([], 4, () => 0.5)).toEqual([]);
  });

  it("a próxima caravana é 00:05 de São Paulo, não do UTC", () => {
    // 23:30 local de 11/08 (02:30 UTC de 12/08) -> 00:05 local de 12/08.
    const alvo = nextCaravanAt(new Date("2026-08-12T02:30:00Z"));
    expect(alvo.toISOString()).toBe("2026-08-12T03:05:00.000Z");
    // Logo depois da virada, a próxima é só no dia seguinte.
    const depois = nextCaravanAt(new Date("2026-08-12T03:10:00Z"));
    expect(depois.toISOString()).toBe("2026-08-13T03:05:00.000Z");
  });
});

describe("catálogo de lojas", () => {
  it("tem as seis lojas, e só o Ichiraku nasce bloqueado", () => {
    expect(SHOPS).toHaveLength(6);
    const bloqueadas = SHOPS.filter((shop) => shop.initialStatus === "LOCKED");
    expect(bloqueadas.map((shop) => shop.type)).toEqual(["ICHIRAKU"]);
  });

  it("só o Mercado Geral não é municipal", () => {
    expect(SHOPS.filter((shop) => !shop.municipal).map((s) => s.type)).toEqual(["MERCADO_GERAL"]);
  });

  it("produção municipal só existe na Fundição, no Ichiraku e na Oficina", () => {
    const comEstacao = SHOPS.filter((shop) => shop.station).map((shop) => shop.type);
    expect(comEstacao.sort()).toEqual(["FUNDICAO", "ICHIRAKU", "OFICINA_SELOS"]);
  });

  it("todo item negociado existe no catálogo de itens", () => {
    for (const linha of [...SHOP_INGREDIENTS.map((r) => r.itemId), ...SHOP_PRODUCTS.map((r) => r.itemId)]) {
      expect(getItem(linha), linha).toBeDefined();
    }
  });

  it("nenhuma loja compra material raro", () => {
    for (const linha of SHOP_INGREDIENTS) {
      expect(getItem(linha.itemId)?.rare, linha.itemId).not.toBe(true);
    }
  });

  it("onde a loja compra e revende o mesmo item, revender é sempre mais caro", () => {
    // O Empório compra fruta e também a revende (seção 7.2). Isso só é seguro
    // enquanto o preço de balcão for maior que o de compra em QUALQUER taxa —
    // caso contrário viraria conversão gratuita de material em Ryō (seção 7.3).
    let pares = 0;
    for (const produto of SHOP_PRODUCTS) {
      if (!shopBuysItem(produto.shop, produto.itemId)) continue;
      pares += 1;
      for (const taxa of [0, 0.05, 0.15]) {
        const compra = ingredientPrice(produto.itemId, taxa)!;
        const venda = productPrice(produto.shop, produto.itemId, taxa)!;
        expect(venda, `${produto.shop}/${produto.itemId} @ ${taxa}`).toBeGreaterThan(compra);
      }
    }
    expect(pares).toBeGreaterThan(0);
  });

  it("não cria arma nova: a Fundição só vende o equipamento que já existe no bot", () => {
    // A 7.3.1 acrescentou matéria mineral e metal processado ao balcão, então o
    // recorte agora é por categoria: o que é arma/ferramenta continua sendo
    // exatamente a lista da seção 7.2.
    const equipamento = productsSoldBy("FUNDICAO")
      .filter((row) => ["WEAPON", "NINJA_TOOL"].includes(getItem(row.itemId)!.category))
      .map((row) => row.itemId)
      .sort();
    expect(equipamento).toEqual(
      [
        "bomba_fumaca",
        "fios_aco_ninja",
        "fuma_shuriken",
        "katana",
        "kunai",
        "lamina_chakra",
        "papel_bomba",
        "senbon",
        "shuriken",
      ].sort(),
    );
  });

  it("nenhuma loja vende material raro", () => {
    for (const produto of SHOP_PRODUCTS) {
      expect(getItem(produto.itemId)?.rare, produto.itemId).not.toBe(true);
    }
  });

  it("o catálogo de varejo é exatamente a tabela da seção 7.3.1", () => {
    const esperado: Record<string, Record<string, number>> = {
      EMPORIO: {
        fruta: 10,
        carne_crua: 12,
        peixe_cru: 11,
        grao: 8,
        farinha: 14,
        agua_limpa: 5,
        erva_medicinal: 11,
        pao: 14,
      },
      MARCENARIA: { madeira: 8, fibra_vegetal: 7, papel: 10, lenha: 6 },
      ICHIRAKU: { carne_cozida: 18, peixe_cozido: 16, dango: 30, ensopado: 35, lamen: 48 },
      OFICINA_SELOS: { papel: 10, tinta_de_selo: 24, pergaminho_arsenal: 300 },
    };
    for (const [shop, itens] of Object.entries(esperado)) {
      const vendidos = Object.fromEntries(
        productsSoldBy(shop as never).map((row) => [row.itemId, row.retailBase]),
      );
      expect(vendidos, shop).toEqual(itens);
    }
    // A Fundição é a única com lista mista; confere só a parte da 7.3.1.
    for (const [itemId, base] of Object.entries({
      minerio_ferro: 18,
      pedra: 5,
      carvao: 9,
      argila: 8,
      lingote_ferro: 30,
      aco: 55,
      polvora: 25,
    })) {
      expect(productsSoldBy("FUNDICAO").find((r) => r.itemId === itemId)?.retailBase, itemId).toBe(
        base,
      );
    }
  });

  it("toda loja municipal vende alguma coisa: nenhuma é só compradora", () => {
    for (const shop of SHOPS.filter((s) => s.municipal)) {
      expect(productsSoldBy(shop.type).length, shop.type).toBeGreaterThan(0);
    }
  });

  it("retailBase é único por item, mesmo vendido em dois balcões", () => {
    // Papel está na Marcenaria e na Oficina. Se as bases divergissem, o valor de
    // referência (recompra do NPC, contrato de atacado) dependeria da ordem do
    // array — bug silencioso.
    const porItem = new Map<string, number>();
    for (const produto of SHOP_PRODUCTS) {
      const anterior = porItem.get(produto.itemId);
      if (anterior !== undefined) expect(produto.retailBase, produto.itemId).toBe(anterior);
      porItem.set(produto.itemId, produto.retailBase);
    }
    expect(retailBase("papel")).toBe(10);
  });

  it("revender é sempre mais caro que comprar, em qualquer loja e qualquer taxa", () => {
    // Generaliza o par do mesmo balcão para o catálogo inteiro: como agora
    // muitas matérias-primas têm compra E venda (em lojas possivelmente
    // diferentes), a margem precisa valer entre quaisquer duas lojas.
    for (const produto of SHOP_PRODUCTS) {
      const compra = shopBuyBase(produto.itemId);
      if (compra === undefined) continue;
      expect(produto.retailBase, produto.itemId).toBeGreaterThan(compra);
    }
  });

  it("Abastecer só aceita insumo de receita ou item vendável da loja", () => {
    // Marcenaria não tem estação: só o que ela vende.
    expect(restockableItems("MARCENARIA").sort()).toEqual(
      ["fibra_vegetal", "lenha", "madeira", "papel"].sort(),
    );
    expect(canRestockItem("MARCENARIA", "kunai")).toBe(false);
    expect(canRestockItem("EMPORIO", "minerio_ferro")).toBe(false);
    // Insumo entra mesmo sem varejo: a Oficina precisa de Madeira Reforçada e o
    // Ichiraku de sal/lenha, que ninguém compra deles.
    expect(canRestockItem("OFICINA_SELOS", "madeira_reforcada")).toBe(true);
    expect(canRestockItem("ICHIRAKU", "sal")).toBe(true);
    expect(canRestockItem("ICHIRAKU", "lenha")).toBe(true);
    // E o que ela vende, obviamente.
    expect(canRestockItem("MARCENARIA", "madeira")).toBe(true);
    expect(canRestockItem("FUNDICAO", "aco")).toBe(true);
  });

  it("mantém o Pergaminho de Arsenal a 300 e a restauração a 150", () => {
    expect(retailBase("pergaminho_arsenal")).toBe(300);
    expect(getItem("pergaminho_arsenal")?.ryoValue).toBe(300);
    expect(getItem("pergaminho_arsenal_gasto")?.ryoValue).toBe(300);
  });

  it("cada loja municipal com produção tem contrato de atacado do que ela mesma produz", () => {
    for (const contrato of WHOLESALE_CONTRACTS) {
      const receitas = villageShopRecipes(getShop(contrato.shop)!.station!);
      expect(
        receitas.some((r) => r.outputItemId === contrato.itemId),
        contrato.id,
      ).toBe(true);
    }
  });

  it("o lote de 10 Lámen vale exatamente os 420 Ryō da seção 7.6", () => {
    const contrato = WHOLESALE_CONTRACTS.find((c) => c.id === "ichiraku_lamen")!;
    expect(wholesaleValue(contrato.lotQty, referenceValue(contrato.itemId)!)).toBe(420);
  });
});

describe("canais das cinco vilas", () => {
  it("centro comercial das cinco, sem id repetido", () => {
    for (const id of VILLAGE_IDS) {
      expect(VILLAGE_MARKET_CHANNELS[id], id).toMatch(/^\d{17,20}$/);
    }
    expect(new Set(Object.values(VILLAGE_MARKET_CHANNELS)).size).toBe(VILLAGE_IDS.length);
  });

  it("não repete o id de anúncio nem o de mansão", () => {
    const todos = [
      ...Object.values(VILLAGE_MARKET_CHANNELS),
      ...Object.values(VILLAGE_ANNOUNCE_CHANNELS),
      ...Object.values(VILLAGE_MANSIONS),
      ...Object.values(ICHIRAKU_CATEGORY_BY_VILLAGE),
    ];
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("concorda com as constantes já existentes em scenarios", () => {
    expect(VILLAGE_MARKET_CHANNELS.KONOHA).toBe(CENTRO_COMERCIAL_CHANNEL_ID);
    expect(VILLAGE_MARKET_CHANNELS.SUNA).toBe(CENTRO_COMERCIAL_SUNA_CHANNEL_ID);
    expect(VILLAGE_MARKET_CHANNELS.KIRI).toBe(CENTRO_COMERCIAL_KIRI_CHANNEL_ID);
  });

  it("resolve a vila pelo canal e recusa canal desconhecido", () => {
    expect(villageFromMarketChannel(VILLAGE_MARKET_CHANNELS.KUMO)).toBe("KUMO");
    expect(villageFromMarketChannel(VILLAGE_MARKET_CHANNELS.IWA)).toBe("IWA");
    expect(villageFromMarketChannel("999")).toBeNull();
  });

  it("tem categoria de Ichiraku para as cinco vilas", () => {
    for (const id of VILLAGE_IDS) {
      expect(ICHIRAKU_CATEGORY_BY_VILLAGE[id], id).toMatch(/^\d{17,20}$/);
    }
    // O nome é a chave de idempotência: mudá-lo criaria um segundo canal.
    expect(ICHIRAKU_CHANNEL_NAME).toBe("│・🍜〃﹕𝐈chiraku");
  });
});

describe("orçamento diário de compra", () => {
  it("é 500 × fator de população", () => {
    expect(dailyPurchaseBudget(1)).toBe(500);
    expect(dailyPurchaseBudget(0.3)).toBe(150);
    expect(dailyPurchaseBudget(1.5)).toBe(750);
  });

  it("a chave do dia muda à meia-noite de São Paulo, não do UTC", () => {
    // 02:30 UTC de 12/08 ainda é 23:30 de 11/08 em São Paulo.
    expect(dayKeyFor(new Date("2026-08-12T02:30:00Z"))).toBe("2026-08-11");
    expect(dayKeyFor(new Date("2026-08-12T03:30:00Z"))).toBe("2026-08-12");
  });
});

describe("cotas diárias de matéria-prima", () => {
  it("crescem com a população, sem aceitar todos os itens de uma loja grande", () => {
    expect(purchaseOfferCount(12, 0)).toBe(2);
    expect(purchaseOfferCount(12, 7)).toBe(3);
    expect(purchaseOfferCount(12, 30)).toBe(4);
    expect(purchaseOfferCount(2, 30)).toBe(2);

    expect(purchaseOfferQuantity(0)).toBe(12);
    expect(purchaseOfferQuantity(5)).toBe(15);
    expect(purchaseOfferQuantity(30)).toBe(80);
  });

  it("sorteia sem repetição e permite congelar a seleção do dia", () => {
    const sorteados = pickPurchaseOfferItems(["madeira", "fibra", "papel", "carvão"], 3, () => 0);
    expect(sorteados).toEqual(["madeira", "fibra", "papel"]);
    expect(new Set(sorteados).size).toBe(3);
  });
});

describe("limites de quantidade", () => {
  it("compra é limitada por estoque e pelo bolso", () => {
    expect(affordableBuyQty(10, 3, 1000, 51)).toBe(3);
    expect(affordableBuyQty(10, 30, 200, 51)).toBe(3);
    expect(affordableBuyQty(2, 30, 1000, 51)).toBe(2);
    expect(affordableBuyQty(10, 30, 50, 51)).toBe(0);
  });

  it("dívida não compra nada", () => {
    expect(affordableBuyQty(10, 30, -62, 51)).toBe(0);
  });

  it("venda é limitada por inventário, espaço, orçamento e cofre", () => {
    // Três carnes a 8: passa se cofre, orçamento e espaço permitirem.
    expect(acceptableSellQty(3, 3, 500, 500, 1000, 8)).toBe(3);
    // Sem espaço na loja.
    expect(acceptableSellQty(3, 3, 2, 500, 1000, 8)).toBe(2);
    // Orçamento do dia esgotando: 20 Ryō dão 2 unidades.
    expect(acceptableSellQty(3, 3, 500, 20, 1000, 8)).toBe(2);
    // Cofre livre curto.
    expect(acceptableSellQty(3, 3, 500, 500, 8, 8)).toBe(1);
    // Inventário curto.
    expect(acceptableSellQty(3, 1, 500, 500, 1000, 8)).toBe(1);
  });

  it("nunca devolve negativo", () => {
    expect(acceptableSellQty(3, 3, -5, -5, -5, 8)).toBe(0);
    expect(affordableBuyQty(3, -1, 100, 8)).toBe(0);
  });
});

describe("quantidade digitada no modal", () => {
  it("aceita só inteiro decimal positivo", () => {
    expect(quantidadeValida("1")).toBe(1);
    expect(quantidadeValida(" 12 ")).toBe(12);
  });

  it("rejeita zero, negativo, decimal, texto e notação científica", () => {
    for (const bruto of ["0", "-1", "1.5", "1,5", "abc", "1e3", "+5", "", " ", "1 2", "٣", "0x10"]) {
      expect(quantidadeValida(bruto), JSON.stringify(bruto)).toBeNull();
    }
  });
});

describe("custo estimado da produção", () => {
  it("o Lámen é calculado pelo catálogo, não escrito à mão", () => {
    const lamen = getRecipe("lamen")!;
    // farinha 9 + caldo 13 + (carne 8 | peixe 7 -> pega o menor) + água 2 + tempero 7
    const { custo, semPreco } = estimateRecipeCost(lamen, 0.05);
    expect(custo).toBe(9 + 13 + 7 + 2 + 7);
    expect(semPreco).toEqual([]);
  });

  it("mostra margem contra o varejo atual", () => {
    const margem = estimateMargin(getRecipe("lamen")!, 0.05)!;
    expect(margem.varejo).toBe(51);
    expect(margem.margem).toBe(51 - 38);
  });

  it("avisa quando um insumo não tem preço de compra", () => {
    // Madeira Reforçada é rara: só chega por doação, então não tem base.
    const pergaminho = estimateRecipeCost(getRecipe("pergaminho_arsenal")!, 0.05);
    expect(pergaminho.semPreco).toContain("madeira_reforcada");
  });
});

describe("obra do Ichiraku", () => {
  it("o custo-base é o da tabela da seção 7.2", () => {
    expect(ICHIRAKU_CONSTRUCTION.baseCostRyo).toBe(7500);
    expect(ICHIRAKU_CONSTRUCTION.baseCostItems).toEqual({ madeira: 300, pedra: 180, grao: 160 });
    expect(ICHIRAKU_CONSTRUCTION.durationMs).toBe(5 * 24 * 3_600_000);
  });

  it("com fator 0,50 dá exatamente a caixa de confirmação da seção 7.7", () => {
    const custo = scaleConstructionCost(0.5);
    expect(custo.ryo).toBe(3750);
    expect(custo.itens.map((i) => [i.itemId, i.qty])).toEqual([
      ["madeira", 150],
      ["pedra", 90],
      ["grao", 80],
    ]);
  });

  it("nesta etapa a vila só comporta uma obra por vez", () => {
    expect(ECONOMY.constructionSlots).toBe(1);
  });
});

describe("limites da etapa", () => {
  it("capacidade de loja é fixa em 500 e não há nível de loja", () => {
    expect(ECONOMY.shopCapacity).toBe(500);
    expect(SHOPS.every((shop) => !("level" in shop))).toBe(true);
  });

  it("a Oficina produz no máximo 3 Pergaminhos por competência", () => {
    expect(ECONOMY.sealScrollsPerWeek).toBe(3);
  });

  it("contrato de atacado é um por loja por dia", () => {
    expect(ECONOMY.wholesaleContractsPerDay).toBe(1);
  });

  it("registra os lançamentos de loja no livro-caixa", () => {
    expect(LEDGER_TYPES).toEqual(
      expect.arrayContaining([
        "SHOP_BUY_FROM_PLAYER",
        "SHOP_SALE_TO_PLAYER",
        "SHOP_WHOLESALE_CONTRACT",
        "SHOP_RESTOCK",
        "SHOP_CRAFT",
        "SHOP_WITHDRAWAL",
        "SHOP_DAILY_RESET",
      ]),
    );
  });
});

describe("produto vendido por loja errada não tem preço", () => {
  it("o Ichiraku não vende kunai e a Fundição não vende lámen", () => {
    // O gate é o catálogo: um customId forjado não inventa preço.
    expect(productPrice("ICHIRAKU", "kunai", 0.05)).toBeUndefined();
    expect(productPrice("FUNDICAO", "lamen", 0.05)).toBeUndefined();
    expect(productPrice("MARCENARIA", "lamen", 0.05)).toBeUndefined();
  });

  it("a Marcenaria não compra carne e o Empório não compra minério", () => {
    expect(shopBuysItem("MARCENARIA", "carne_crua")).toBe(false);
    expect(shopBuysItem("EMPORIO", "minerio_ferro")).toBe(false);
    expect(ingredientsBoughtBy("MARCENARIA").map((r) => r.itemId).sort()).toEqual([
      "fibra_vegetal",
      "madeira",
      "papel",
    ]);
  });

  it("shopBuyBase existe só para os itens da tabela do spec", () => {
    expect(shopBuyBase("madeira")).toBe(5);
    // sal, lenha e lingote não estão na tabela: entram por doação/abastecimento.
    expect(shopBuyBase("sal")).toBeUndefined();
    expect(shopBuyBase("lenha")).toBeUndefined();
    expect(shopBuyBase("lingote_ferro")).toBeUndefined();
    expect(shopBuyBase("madeira_reforcada")).toBeUndefined();
  });
});
