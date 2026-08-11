import { describe, expect, it } from "vitest";
import { ECONOMY } from "../src/config/balance.js";
import { LEDGER_TYPES } from "../src/config/enums.js";
import { VILLAGE_ANNOUNCE_CHANNELS, VILLAGE_IDS } from "../src/data/villages.js";
import { availableTreasury, withdrawalAllowance } from "../src/services/economy/treasury.js";
import { acceptableQty, remainingBudget } from "../src/services/economy/collection-orders.js";
import { populationFactor } from "../src/services/economy/population.js";

describe("saldo disponível do cofre", () => {
  it("desconta a reserva e nunca fica negativo", () => {
    expect(availableTreasury(1000, 300)).toBe(700);
    expect(availableTreasury(1000, 0)).toBe(1000);
    // Reserva maior que o cofre não vira saldo negativo disponível.
    expect(availableTreasury(100, 500)).toBe(0);
  });
});

describe("limite de saque do Kage", () => {
  it("libera 10% do disponível por semana", () => {
    expect(withdrawalAllowance(1000, 0)).toBe(100);
    expect(withdrawalAllowance(999, 0)).toBe(99); // arredonda para baixo
  });

  it("desconta o que já foi sacado na mesma semana", () => {
    expect(withdrawalAllowance(1000, 40)).toBe(60);
    expect(withdrawalAllowance(1000, 100)).toBe(0);
    expect(withdrawalAllowance(1000, 250)).toBe(0);
  });

  it("respeita o teto por saque mesmo com cofre enorme", () => {
    // 10% de 1.000.000 = 100.000, mas o teto por saque é 2.000.
    expect(withdrawalAllowance(1_000_000, 0)).toBe(ECONOMY.kageWithdrawalCap);
  });

  it("não deixa sacar reserva de obra/ordem", () => {
    // Cofre 5.000 com 4.000 reservados: só 1.000 conta para o limite.
    expect(withdrawalAllowance(availableTreasury(5000, 4000), 0)).toBe(100);
  });
});

describe("orçamento da ordem de coleta", () => {
  it("mostra quanto ainda pode ser pago", () => {
    expect(remainingBudget(500, 120)).toBe(380);
    expect(remainingBudget(500, 500)).toBe(0);
    expect(remainingBudget(500, 700)).toBe(0);
  });

  it("aceita só o que cabe na meta", () => {
    // Meta 100, já entregou 95: cabem 5 mesmo oferecendo 7.
    expect(acceptableQty(100, 95, 1000, 0, 5, 7)).toBe(5);
  });

  it("aceita só o que cabe no orçamento", () => {
    // Sobram 12 Ryō a 5/unidade: cabem 2 unidades, não 7.
    expect(acceptableQty(100, 0, 100, 88, 5, 7)).toBe(2);
  });

  it("usa o menor entre meta, orçamento e o que foi oferecido", () => {
    expect(acceptableQty(10, 0, 1000, 0, 5, 3)).toBe(3);
    expect(acceptableQty(100, 100, 1000, 0, 5, 3)).toBe(0);
    expect(acceptableQty(100, 0, 10, 10, 5, 3)).toBe(0);
  });

  it("nunca devolve negativo", () => {
    expect(acceptableQty(10, 20, 100, 200, 5, 5)).toBe(0);
  });
});

describe("população ativa", () => {
  it("usa N/20 preso entre 0,30 e 1,50", () => {
    expect(populationFactor(20)).toBe(1);
    expect(populationFactor(10)).toBeCloseTo(0.5);
    expect(populationFactor(30)).toBeCloseTo(1.5);
  });

  it("aplica o piso para vila quase vazia", () => {
    expect(populationFactor(0)).toBe(ECONOMY.populationFactorMin);
    expect(populationFactor(1)).toBe(ECONOMY.populationFactorMin);
    expect(populationFactor(6)).toBe(ECONOMY.populationFactorMin);
  });

  it("aplica o teto para vila muito grande", () => {
    expect(populationFactor(500)).toBe(ECONOMY.populationFactorMax);
  });
});

describe("configuração de vila", () => {
  it("tem canal de anúncio para as cinco vilas, sem repetir id", () => {
    for (const id of VILLAGE_IDS) {
      expect(VILLAGE_ANNOUNCE_CHANNELS[id], id).toMatch(/^\d{17,20}$/);
    }
    expect(new Set(Object.values(VILLAGE_ANNOUNCE_CHANNELS)).size).toBe(VILLAGE_IDS.length);
  });

  it("registra os lançamentos de ordem de coleta e o aporte do Kage", () => {
    expect(LEDGER_TYPES).toEqual(
      expect.arrayContaining([
        "KAGE_DEPOSIT",
        "COLLECTION_ORDER_RESERVE",
        "COLLECTION_ORDER_PAYOUT",
        "COLLECTION_ORDER_REFUND",
      ]),
    );
  });

  it("mantém o prazo de ordem entre 1 hora e 7 dias", () => {
    expect(ECONOMY.orderMinDurationMs).toBe(3_600_000);
    expect(ECONOMY.orderMaxDurationMs).toBe(7 * 24 * 3_600_000);
  });
});
