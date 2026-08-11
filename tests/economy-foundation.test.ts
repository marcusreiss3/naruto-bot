import { describe, expect, it } from "vitest";
import { ECONOMY } from "../src/config/balance.js";
import { LEDGER_TYPES, NINJA_RANKS, NINJA_RANK_LABELS } from "../src/config/enums.js";
import { VILLAGE_IDS, VILLAGE_NAMES, isVillageId, normalizeVillageId } from "../src/data/villages.js";
import {
  formatRyo,
  isNinjaRank,
  isTaxableRank,
  normalizeNinjaRank,
  rankAtLeast,
} from "../src/services/economy/character-economy.js";
import {
  planInventoryConsolidation,
  type InventoryRow,
} from "../src/services/economy/inventory-migration.js";
import { weekEndFor, weekKeyFor, weekStartFor } from "../src/services/economy/week.js";

function row(over: Partial<InventoryRow> & Pick<InventoryRow, "id">): InventoryRow {
  return { charId: "c1", itemId: "kunai", name: "Kunai", qty: 1, ...over };
}

describe("consolidação de pilhas duplicadas (migration)", () => {
  it("soma as quantidades e mantém a linha de menor id", () => {
    const plans = planInventoryConsolidation([
      row({ id: "b", qty: 3 }),
      row({ id: "a", qty: 5 }),
    ]);

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      charId: "c1",
      itemId: "kunai",
      keepId: "a",
      totalQty: 8,
      name: "Kunai",
      deleteIds: ["b"],
    });
  });

  it("não gera plano quando cada personagem/item já tem uma pilha só", () => {
    expect(
      planInventoryConsolidation([
        row({ id: "a", qty: 2 }),
        row({ id: "b", charId: "c2", qty: 7 }),
        row({ id: "c", itemId: "shuriken", name: "Shuriken", qty: 4 }),
      ]),
    ).toEqual([]);
  });

  it("separa duplicatas por personagem e por item", () => {
    const plans = planInventoryConsolidation([
      row({ id: "a", qty: 1 }),
      row({ id: "b", qty: 2 }),
      row({ id: "c", charId: "c2", itemId: "shuriken", name: "Shuriken", qty: 3 }),
      row({ id: "d", charId: "c2", itemId: "shuriken", name: "Shuriken", qty: 4 }),
    ]);

    expect(plans.map((plan) => [plan.charId, plan.itemId, plan.totalQty])).toEqual([
      ["c1", "kunai", 3],
      ["c2", "shuriken", 7],
    ]);
  });

  it("preserva o nome válido mesmo quando a pilha sobrevivente veio sem nome", () => {
    const plans = planInventoryConsolidation([
      row({ id: "a", name: "", qty: 1 }),
      row({ id: "b", name: "Kunai", qty: 2 }),
    ]);

    expect(plans[0]?.name).toBe("Kunai");
  });

  it("ignora o id cru gravado como nome e cai nele só se não houver alternativa", () => {
    const semNome = planInventoryConsolidation([
      row({ id: "a", itemId: "item_antigo", name: "item_antigo", qty: 1 }),
      row({ id: "b", itemId: "item_antigo", name: "  ", qty: 2 }),
    ]);
    expect(semNome[0]?.name).toBe("item_antigo");

    const comNome = planInventoryConsolidation([
      row({ id: "a", itemId: "item_antigo", name: "item_antigo", qty: 1 }),
      row({ id: "b", itemId: "item_antigo", name: "Lembrança", qty: 2 }),
    ]);
    expect(comNome[0]?.name).toBe("Lembrança");
  });

  it("trata quantidade negativa herdada como zero, nunca subtraindo do total", () => {
    const plans = planInventoryConsolidation([
      row({ id: "a", qty: -4 }),
      row({ id: "b", qty: 6 }),
    ]);

    expect(plans[0]?.totalQty).toBe(6);
  });
});

describe("rank narrativo do ninja", () => {
  it("tem os cinco ranks em ordem de progressão e todos rotulados", () => {
    expect(NINJA_RANKS).toEqual(["ACADEMIA", "GENIN", "CHUNIN", "JONIN", "KAGE"]);
    for (const rank of NINJA_RANKS) expect(NINJA_RANK_LABELS[rank]).toBeTruthy();
  });

  it("cai em ACADEMIA quando o valor é desconhecido", () => {
    expect(normalizeNinjaRank("JONIN")).toBe("JONIN");
    expect(normalizeNinjaRank("HOKAGE")).toBe("ACADEMIA");
    expect(normalizeNinjaRank(null)).toBe("ACADEMIA");
    expect(normalizeNinjaRank(undefined)).toBe("ACADEMIA");
    expect(isNinjaRank("GENIN")).toBe(true);
    expect(isNinjaRank("genin")).toBe(false);
  });

  it("compara ranks pela ordem de progressão", () => {
    expect(rankAtLeast("CHUNIN", "GENIN")).toBe(true);
    expect(rankAtLeast("GENIN", "GENIN")).toBe(true);
    expect(rankAtLeast("ACADEMIA", "GENIN")).toBe(false);
  });

  it("não tributa Academia e tributa de Genin para cima", () => {
    expect(isTaxableRank("ACADEMIA")).toBe(false);
    expect(NINJA_RANKS.filter(isTaxableRank)).toEqual(["GENIN", "CHUNIN", "JONIN", "KAGE"]);
  });
});

describe("exibição de Ryō", () => {
  it("mostra saldo negativo como dívida, nunca como disponível", () => {
    expect(formatRyo(-62)).toBe("Dívida: 62 Ryō");
    expect(formatRyo(0)).toBe("0 Ryō");
    expect(formatRyo(1500)).toBe("1.500 Ryō");
  });
});

describe("competência semanal", () => {
  // Domingo 2026-08-09, 22:00 em America/Sao_Paulo = 2026-08-10T01:00Z.
  const corte = new Date("2026-08-10T01:00:00.000Z");

  it("abre a competência exatamente no domingo 22:00 de São Paulo", () => {
    expect(weekStartFor(corte).toISOString()).toBe(corte.toISOString());
    expect(weekKeyFor(corte)).toBe("2026-08-09");
  });

  it("mantém um minuto antes do corte na competência anterior", () => {
    const antes = new Date(corte.getTime() - 60_000);
    expect(weekKeyFor(antes)).toBe("2026-08-02");
    expect(weekKeyFor(new Date(corte.getTime() + 60_000))).toBe("2026-08-09");
  });

  it("dá a mesma chave para qualquer instante dentro da semana", () => {
    const quarta = new Date("2026-08-12T15:30:00.000Z");
    const sabado = new Date("2026-08-15T23:00:00.000Z");
    expect(weekKeyFor(quarta)).toBe("2026-08-09");
    expect(weekKeyFor(sabado)).toBe("2026-08-09");
    expect(weekStartFor(quarta).toISOString()).toBe(weekStartFor(sabado).toISOString());
  });

  it("fecha a competência sete dias depois, encaixando na seguinte", () => {
    const fim = weekEndFor(corte);
    expect(fim.getTime() - weekStartFor(corte).getTime()).toBe(7 * 24 * 3_600_000);
    expect(weekKeyFor(fim)).toBe("2026-08-16");
  });
});

describe("vilas e livro-caixa", () => {
  it("registra as cinco vilas com nome", () => {
    expect(VILLAGE_IDS).toEqual(["KONOHA", "SUNA", "IWA", "KUMO", "KIRI"]);
    for (const id of VILLAGE_IDS) expect(VILLAGE_NAMES[id]).toBeTruthy();
  });

  it("cai em Konoha quando a vila é desconhecida", () => {
    expect(normalizeVillageId("KIRI")).toBe("KIRI");
    expect(normalizeVillageId("OTOGAKURE")).toBe("KONOHA");
    expect(isVillageId("OTOGAKURE")).toBe(false);
  });

  it("cobre os tipos mínimos de lançamento exigidos pela especificação", () => {
    const minimos = [
      "WEEKLY_ACTIVITY_TAX",
      "DONATION_RYO",
      "DONATION_ITEM",
      "CONSTRUCTION_COST",
      "MAINTENANCE_COST",
      "PASSIVE_PRODUCTION",
      "STOCK_WITHDRAWAL",
      "NPC_SALE",
      "KAGE_WITHDRAWAL",
      "ADMIN_ADJUSTMENT",
      "SHOP_BUY_FROM_PLAYER",
      "SHOP_SALE_TO_PLAYER",
      "SHOP_WHOLESALE_CONTRACT",
      "SHOP_RESTOCK",
      "SHOP_CRAFT",
      "SHOP_WITHDRAWAL",
    ];
    expect(LEDGER_TYPES).toEqual(expect.arrayContaining(minimos));
    expect(new Set(LEDGER_TYPES).size).toBe(LEDGER_TYPES.length);
  });

  it("mantém a taxa padrão dentro da faixa configurada", () => {
    expect(ECONOMY.defaultTaxRate).toBeGreaterThanOrEqual(ECONOMY.minTaxRate);
    expect(ECONOMY.defaultTaxRate).toBeLessThanOrEqual(ECONOMY.maxTaxRate);
    expect(ECONOMY.satietyStart).toBe(ECONOMY.satietyMax);
  });
});
