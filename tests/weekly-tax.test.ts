import { describe, expect, it } from "vitest";
import { ECONOMY } from "../src/config/balance.js";
import { computeWeeklyTax } from "../src/services/economy/tax-math.js";
import { nextRunAt } from "../src/services/economy/tax-scheduler.js";
import {
  weekEndFromKey,
  weekKeyFor,
  weekStartFor,
  weekStartFromKey,
} from "../src/services/economy/week.js";

const TAXAS = { KONOHA: 0.05, SUNA: 0.07 };

describe("meta oculta de atividade", () => {
  it("não cobra nada com 1.599 XP, mesmo tendo recebido Ryō", () => {
    const r = computeWeeklyTax(
      [{ villageId: "KONOHA", taxableXp: 1599, taxableMissionRyo: 1400 }],
      TAXAS,
    );

    expect(r.exempt).toBe(true);
    expect(r.charges).toEqual([]);
    expect(r.totalRyo).toBe(0);
  });

  it("cobra 70 Ryō com 1.600 XP, 1.400 Ryō tributáveis e taxa congelada de 5%", () => {
    const r = computeWeeklyTax(
      [{ villageId: "KONOHA", taxableXp: 1600, taxableMissionRyo: 1400 }],
      TAXAS,
    );

    expect(r.exempt).toBe(false);
    expect(r.totalRyo).toBe(70);
    expect(r.charges).toEqual([
      { villageId: "KONOHA", taxRate: 0.05, taxableBase: 1400, taxRyo: 70 },
    ]);
  });

  it("usa a meta de 1.600 XP do balance", () => {
    expect(ECONOMY.weeklyTaxableXpGoal).toBe(1600);
    expect(
      computeWeeklyTax([{ villageId: "KONOHA", taxableXp: 1600, taxableMissionRyo: 100 }], TAXAS)
        .goal,
    ).toBe(1600);
  });

  it("soma o XP de todas as vilas para avaliar a meta", () => {
    // 900 + 700 = 1.600: nenhuma vila sozinha bate a meta, mas o total bate.
    const r = computeWeeklyTax(
      [
        { villageId: "KONOHA", taxableXp: 900, taxableMissionRyo: 1000 },
        { villageId: "SUNA", taxableXp: 700, taxableMissionRyo: 600 },
      ],
      TAXAS,
    );

    expect(r.exempt).toBe(false);
    expect(r.totalXp).toBe(1600);
  });
});

describe("repartição entre vilas", () => {
  it("cobra 50 para Konoha e 42 para Suna no exemplo da especificação", () => {
    const r = computeWeeklyTax(
      [
        { villageId: "KONOHA", taxableXp: 1400, taxableMissionRyo: 1000 },
        { villageId: "SUNA", taxableXp: 600, taxableMissionRyo: 600 },
      ],
      TAXAS,
    );

    expect(r.totalXp).toBe(2000);
    expect(r.charges).toEqual([
      { villageId: "KONOHA", taxRate: 0.05, taxableBase: 1000, taxRyo: 50 },
      { villageId: "SUNA", taxRate: 0.07, taxableBase: 600, taxRyo: 42 },
    ]);
    expect(r.totalRyo).toBe(92);
  });

  it("arredonda cada parcela para baixo", () => {
    // 333 x 5% = 16,65 -> 16
    const r = computeWeeklyTax(
      [{ villageId: "KONOHA", taxableXp: 1600, taxableMissionRyo: 333 }],
      TAXAS,
    );
    expect(r.charges[0]?.taxRyo).toBe(16);
  });

  it("não cobra parcela que arredonda para zero", () => {
    const r = computeWeeklyTax(
      [{ villageId: "KONOHA", taxableXp: 1600, taxableMissionRyo: 19 }],
      TAXAS,
    );
    expect(r.charges).toEqual([]);
    expect(r.totalRyo).toBe(0);
  });

  it("ignora vila sem competência aberta em vez de inventar uma taxa", () => {
    const r = computeWeeklyTax(
      [
        { villageId: "KONOHA", taxableXp: 1600, taxableMissionRyo: 1000 },
        { villageId: "IWA", taxableXp: 0, taxableMissionRyo: 800 },
      ],
      TAXAS,
    );

    expect(r.charges.map((c) => c.villageId)).toEqual(["KONOHA"]);
  });

  it("cobra zero com taxa congelada de 0%", () => {
    const r = computeWeeklyTax(
      [{ villageId: "KONOHA", taxableXp: 5000, taxableMissionRyo: 5000 }],
      { KONOHA: 0 },
    );
    expect(r.exempt).toBe(false);
    expect(r.totalRyo).toBe(0);
  });
});

describe("prazo derivado da chave da competência", () => {
  it("volta da chave para o mesmo início que a data produziu", () => {
    const quarta = new Date("2026-08-12T15:00:00.000Z");
    expect(weekStartFromKey(weekKeyFor(quarta)).toISOString()).toBe(
      weekStartFor(quarta).toISOString(),
    );
  });

  it("faz a competência vencer no domingo que lhe pertence, não quando foi gravada", () => {
    // Uma competência de julho gravada com atraso continua vencida em agosto:
    // o prazo sai da chave, nunca do instante em que a linha entrou no banco.
    expect(weekEndFromKey("2026-08-09").toISOString()).toBe("2026-08-17T01:00:00.000Z");
    expect(weekEndFromKey("2026-07-05").toISOString()).toBe("2026-07-13T01:00:00.000Z");
  });
});

describe("relógio do imposto", () => {
  it("agenda o próximo corte para o domingo 22:00 de São Paulo seguinte", () => {
    // Quarta, 2026-08-12. Proximo corte: domingo 2026-08-16 22:00 = 2026-08-17T01:00Z.
    const alvo = nextRunAt(new Date("2026-08-12T15:00:00.000Z"));
    expect(alvo.toISOString()).toBe("2026-08-17T01:00:00.000Z");
  });

  it("no instante do corte, agenda o domingo seguinte e não o atual", () => {
    const corte = new Date("2026-08-10T01:00:00.000Z");
    expect(weekKeyFor(corte)).toBe("2026-08-09");
    expect(nextRunAt(corte).toISOString()).toBe("2026-08-17T01:00:00.000Z");
  });
});
