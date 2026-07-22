import { describe, it, expect } from "vitest";
import { fleeCheck, adjacentEnemyCount } from "../src/services/combat/flee.js";
import { BALANCE } from "../src/config/balance.js";

const base = { fleeingCell: "D4", enemyCells: [], taijutsu: 10, energia: 100 };

describe("fuga: inimigos adjacentes", () => {
  it("conta so quem esta colado (distancia 1, diagonal inclusa)", () => {
    expect(adjacentEnemyCount("D4", ["D5", "E5", "D6", "A1"])).toBe(2);
  });
});

describe("fuga: bloqueios", () => {
  it("FLEE_LOCK impede ate de tentar", () => {
    const r = fleeCheck({ ...base, fleeLocked: true });
    expect(r.allowed).toBe(false);
    expect(r.chance).toBe(0);
  });

  it("FLEE_LOCK vence a fuga garantida", () => {
    const r = fleeCheck({ ...base, fleeLocked: true, guaranteed: true });
    expect(r.allowed).toBe(false);
  });

  it("sem energia nao tenta", () => {
    expect(fleeCheck({ ...base, energia: 0 }).allowed).toBe(false);
  });
});

describe("fuga: chance", () => {
  it("fuga garantida vai a 100%", () => {
    const r = fleeCheck({ ...base, guaranteed: true, enemyCells: ["D5", "E5", "C3"] });
    expect(r.chance).toBe(1);
  });

  it("cada inimigo colado reduz a chance", () => {
    const livre = fleeCheck(base).chance;
    const cercado = fleeCheck({ ...base, enemyCells: ["D5"] }).chance;
    expect(cercado).toBeLessThan(livre);
  });

  it("taijutsu aumenta a chance", () => {
    const lento = fleeCheck({ ...base, taijutsu: 1 }).chance;
    const agil = fleeCheck({ ...base, taijutsu: 40 }).chance;
    expect(agil).toBeGreaterThan(lento);
  });

  it("bonus da armadura aumenta a chance sem garantir fuga", () => {
    const normal = fleeCheck(base).chance;
    const armor = fleeCheck({ ...base, chanceBonus: BALANCE.effects.HASTE.fleeChanceBonus }).chance;
    expect(armor).toBeGreaterThan(normal);
    expect(armor).toBeLessThan(1);
  });

  it("chance fica dentro do piso e do teto", () => {
    const cercado = fleeCheck({ ...base, taijutsu: 0, enemyCells: ["D5", "E5", "C3", "C4", "C5"] });
    expect(cercado.chance).toBeGreaterThanOrEqual(BALANCE.flee.minChance);
    const solto = fleeCheck({ ...base, taijutsu: 999 });
    expect(solto.chance).toBeLessThanOrEqual(BALANCE.flee.maxChance);
  });
});
