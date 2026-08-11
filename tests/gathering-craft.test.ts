import { describe, expect, it } from "vitest";
import { ECONOMY } from "../src/config/balance.js";
import { FOOD_ITEMS, getItem, ITEMS, isRareResource } from "../src/data/items.js";
import {
  GATHER_ACTIONS,
  GATHER_ACTION_BY_SUBCOMMAND,
  GATHER_AREAS,
  MONTANHA_CHANNEL_ID,
  areaForChannel,
  areasForAction,
} from "../src/data/gathering.js";
import {
  PERSONAL_RECIPES,
  RECIPES,
  getRecipe,
  personalRecipe,
  villageShopRecipes,
} from "../src/data/recipes.js";
import { rollGathering } from "../src/services/economy/gathering.js";
import { satietyAfterEating } from "../src/services/economy/eating.js";

// RNG determinístico: consome a sequência na ordem em que a regra pede.
// Repete o último valor se acabar, para o teste não quebrar por falta de números.
function seq(...valores: number[]) {
  let i = 0;
  return () => valores[Math.min(i++, valores.length - 1)] ?? 0;
}

const montanha = GATHER_AREAS.find((a) => a.id === "MONTANHA")!;
const floresta = GATHER_AREAS.find((a) => a.id === "FLORESTA")!;
const rio = GATHER_AREAS.find((a) => a.id === "RIO")!;

function total(loot: { itemId: string; qty: number }[]): number {
  return loot.reduce((sum, entry) => sum + entry.qty, 0);
}

describe("catálogo de materiais e alimentos", () => {
  it("registra todos os materiais da especificação, empilháveis e sem ação", () => {
    const esperados = [
      "madeira", "pedra", "minerio_ferro", "carvao", "argila", "fibra_vegetal",
      "erva_medicinal", "grao", "agua_limpa", "couro", "sal",
      "lingote_ferro", "aco", "papel", "polvora", "farinha", "lenha", "caldo",
      "tempero", "tinta_de_selo", "minerio_raro", "madeira_reforcada",
    ];
    for (const id of esperados) {
      const item = getItem(id);
      expect(item, id).toBeDefined();
      expect(item!.category, id).toBe("MATERIAL");
      expect(item!.stackable, id).toBe(true);
      expect(item!.actions, id).toEqual([]);
    }
  });

  it("dá a cada alimento a saciedade da tabela da especificação", () => {
    const esperado: Record<string, number> = {
      carne_crua: 4,
      peixe_cru: 4,
      fruta: 8,
      pao: 16,
      carne_cozida: 18,
      peixe_cozido: 16,
      ensopado: 25,
      dango: 22,
      lamen: 40,
    };
    for (const [id, satiety] of Object.entries(esperado)) {
      expect(getItem(id)?.satiety, id).toBe(satiety);
      expect(getItem(id)?.category, id).toBe("FOOD");
    }
    expect(FOOD_ITEMS.map((item) => item.id).sort()).toEqual(Object.keys(esperado).sort());
  });

  it("marca só os dois raros e não cria arma nova", () => {
    expect(ITEMS.filter((item) => item.rare).map((item) => item.id)).toEqual([
      "minerio_raro",
      "madeira_reforcada",
    ]);
    expect(isRareResource("minerio_raro")).toBe(true);
    expect(isRareResource("madeira")).toBe(false);
    // As sete armas continuam sendo as mesmas de antes desta etapa.
    expect(ITEMS.filter((item) => item.category === "WEAPON").map((item) => item.id)).toEqual([
      "kunai", "shuriken", "fuma_shuriken", "senbon", "kunai_explosiva", "katana", "lamina_chakra",
    ]);
  });

  it("mantém ids únicos", () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
  });
});

describe("áreas de coleta", () => {
  it("registra as seis áreas, incluindo a Montanha", () => {
    expect(GATHER_AREAS).toHaveLength(6);
    expect(areaForChannel(MONTANHA_CHANNEL_ID)?.id).toBe("MONTANHA");
    expect(MONTANHA_CHANNEL_ID).toBe("1515881137170546852");
  });

  it("não permite ação fora do canal correto", () => {
    // Minerar só existe em Montanha e Caverna.
    expect(areasForAction("MINERAR").map((a) => a.id)).toEqual(["MONTANHA", "CAVERNA"]);
    expect(floresta.pools.MINERAR).toBeUndefined();
    expect(rio.pools.CACAR).toBeUndefined();
    expect(areaForChannel("000000")).toBeUndefined();
  });

  it("permite pescar só no rio e coletar água só em rio e caverna", () => {
    expect(areasForAction("PESCAR").map((a) => a.id)).toEqual(["RIO"]);
    expect(areasForAction("COLETAR_AGUA").map((a) => a.id)).toEqual(["RIO", "CAVERNA"]);
  });

  it("mapeia os cinco subcomandos do Discord", () => {
    expect(Object.keys(GATHER_ACTION_BY_SUBCOMMAND).sort()).toEqual([
      "cacar", "coletar", "coletar-agua", "minerar", "pescar",
    ]);
    expect(Object.values(GATHER_ACTION_BY_SUBCOMMAND).sort()).toEqual([...GATHER_ACTIONS].sort());
  });

  it("só oferece recursos que existem no catálogo", () => {
    for (const area of GATHER_AREAS) {
      for (const pool of Object.values(area.pools)) {
        for (const itemId of pool) expect(getItem(itemId), `${area.id}/${itemId}`).toBeDefined();
      }
    }
  });
});

describe("sorteio de coleta", () => {
  it("distribui de 3 a 7 unidades entre os recursos da área", () => {
    // Sequência: [quantidade] [um sorteio por unidade] [dado do raro].
    // O último valor é 1 para o raro não entrar e sujar a contagem.
    expect(total(rollGathering(montanha, "MINERAR", seq(0, 0, 0, 0, 1)))).toBe(ECONOMY.gatherMin);
    expect(
      total(rollGathering(montanha, "MINERAR", seq(0.99, 0, 0, 0, 0, 0, 0, 0, 1))),
    ).toBe(ECONOMY.gatherMax);
  });

  it("dá 2 a 5 do alvo principal e 0 a 2 do secundário na caça", () => {
    const minimo = rollGathering(floresta, "CACAR", seq(0, 0, 1));
    expect(minimo).toEqual([{ itemId: "carne_crua", qty: ECONOMY.huntMin }]);

    const maximo = rollGathering(floresta, "CACAR", seq(0.99, 0.99, 1));
    expect(maximo).toEqual([
      { itemId: "carne_crua", qty: ECONOMY.huntMax },
      { itemId: "couro", qty: ECONOMY.huntSecondaryMax },
    ]);
  });

  it("dá peixe na pesca, nunca carne", () => {
    const loot = rollGathering(rio, "PESCAR", seq(0, 0, 1));
    expect(loot[0]?.itemId).toBe("peixe_cru");
    expect(loot.map((l) => l.itemId)).not.toContain("carne_crua");
  });

  it("solta Minério Raro só na mineração, a 5%", () => {
    // Último rng é o dado do raro: 0.04 < 5% passa, 0.05 não.
    const comRaro = rollGathering(montanha, "MINERAR", seq(0, 0, 0, 0, 0.04));
    expect(comRaro).toContainEqual({ itemId: "minerio_raro", qty: 1 });

    const semRaro = rollGathering(montanha, "MINERAR", seq(0, 0, 0, 0, 0.05));
    expect(semRaro.map((l) => l.itemId)).not.toContain("minerio_raro");
  });

  it("solta Madeira Reforçada só na coleta natural", () => {
    const coleta = rollGathering(floresta, "COLETAR", seq(0, 0, 0, 0, 0.01));
    expect(coleta).toContainEqual({ itemId: "madeira_reforcada", qty: 1 });
  });

  it("nunca troca os raros entre mineração e coleta", () => {
    // Mesmo com o dado do raro cravado em 0, cada ação só pode soltar o seu.
    const mineracao = rollGathering(montanha, "MINERAR", seq(0, 0, 0, 0, 0));
    expect(mineracao.map((l) => l.itemId)).not.toContain("madeira_reforcada");

    const coleta = rollGathering(floresta, "COLETAR", seq(0, 0, 0, 0, 0));
    expect(coleta.map((l) => l.itemId)).not.toContain("minerio_raro");
  });

  it("não solta raro em caça, pesca nem coleta de água", () => {
    for (const [area, action] of [
      [floresta, "CACAR"],
      [rio, "PESCAR"],
      [rio, "COLETAR_AGUA"],
    ] as const) {
      const loot = rollGathering(area, action, seq(0, 0, 0, 0, 0, 0, 0, 0, 0));
      expect(loot.filter((l) => isRareResource(l.itemId)), `${area.id}/${action}`).toEqual([]);
    }
  });

  it("devolve vazio para ação que a área não permite", () => {
    expect(rollGathering(floresta, "MINERAR", seq(0))).toEqual([]);
  });
});

describe("catálogo de receitas", () => {
  it("expõe no craft pessoal apenas o processamento básico permitido", () => {
    expect(PERSONAL_RECIPES.map((r) => r.id)).toEqual([
      "lingote_ferro", "papel", "farinha", "lenha", "kunai", "shuriken", "senbon", "pao",
    ]);
  });

  it("bloqueia receita municipal mesmo com id forjado", () => {
    const proibidas = [
      "aco", "polvora", "tinta_de_selo", "lamen", "dango", "ensopado",
      "carne_cozida", "peixe_cozido", "caldo", "tempero",
      "fuma_shuriken", "papel_bomba", "bomba_fumaca", "fios_aco_ninja",
      "kunai_explosiva", "katana", "lamina_chakra", "pergaminho_arsenal",
    ];
    for (const id of proibidas) {
      // A receita existe no catálogo…
      expect(getRecipe(id), id).toBeDefined();
      // …mas a porta do /craft recusa.
      expect(personalRecipe(id), id).toBeUndefined();
    }
  });

  it("liga cada receita municipal à sua estrutura", () => {
    expect(villageShopRecipes("OFICINA_SELOS").map((r) => r.id)).toEqual([
      "tinta_de_selo",
      "pergaminho_arsenal",
    ]);
    expect(villageShopRecipes("ICHIRAKU").map((r) => r.id)).toContain("lamen");
    expect(villageShopRecipes("FUNDICAO").map((r) => r.id)).toContain("aco");
  });

  it("usa a receita canônica de Lámen, com carne OU peixe", () => {
    const lamen = getRecipe("lamen")!;
    expect(lamen.scope).toBe("villageShop");
    expect(lamen.station).toBe("ICHIRAKU");
    expect(lamen.ingredients).toEqual([
      { itemId: "farinha", qty: 1 },
      { itemId: "caldo", qty: 1 },
      { anyOf: ["carne_crua", "peixe_cru"], qty: 1 },
      { itemId: "agua_limpa", qty: 1 },
      { itemId: "tempero", qty: 1 },
    ]);
  });

  it("declara Tinta de Selo e Pergaminho de Arsenal como exclusivos da Oficina", () => {
    expect(getRecipe("tinta_de_selo")!.ingredients).toEqual([
      { itemId: "carvao", qty: 1 },
      { itemId: "erva_medicinal", qty: 1 },
      { itemId: "agua_limpa", qty: 1 },
    ]);
    expect(getRecipe("pergaminho_arsenal")!.ingredients).toEqual([
      { itemId: "papel", qty: 8 },
      { itemId: "tinta_de_selo", qty: 2 },
      { itemId: "madeira_reforcada", qty: 1 },
      { itemId: "erva_medicinal", qty: 1 },
    ]);
  });

  it("usa a receita de Pão da tabela de alimentos", () => {
    const pao = personalRecipe("pao")!;
    expect(pao.ingredients).toEqual([
      { itemId: "farinha", qty: 2 },
      { itemId: "agua_limpa", qty: 1 },
      { itemId: "lenha", qty: 1 },
    ]);
    expect(pao.outputQty).toBe(1);
    expect(getItem("pao")?.satiety).toBe(16);
  });

  it("dá 3 senbon por lingote", () => {
    expect(personalRecipe("senbon")).toMatchObject({ outputQty: 3 });
  });

  it("só usa ids de item que existem, em ingrediente e produto", () => {
    for (const recipe of RECIPES) {
      expect(getItem(recipe.outputItemId), recipe.id).toBeDefined();
      for (const ingredient of recipe.ingredients) {
        for (const id of ingredient.itemId ? [ingredient.itemId] : (ingredient.anyOf ?? [])) {
          expect(getItem(id), `${recipe.id}/${id}`).toBeDefined();
        }
      }
    }
  });

  it("não repete id de receita", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
});

describe("saciedade", () => {
  it("soma por unidade e nunca passa de 100", () => {
    expect(satietyAfterEating(50, 16, 1)).toBe(66);
    expect(satietyAfterEating(50, 16, 2)).toBe(82);
    expect(satietyAfterEating(90, 40, 1)).toBe(ECONOMY.satietyMax);
    expect(satietyAfterEating(0, 4, 3)).toBe(12);
  });
});
