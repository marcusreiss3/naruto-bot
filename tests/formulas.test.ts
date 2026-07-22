import { describe, it, expect } from "vitest";
import { moveRange, costAfterMastery, maxHp } from "../src/services/characters/formulas.js";
import { BALANCE } from "../src/config/balance.js";

describe("formulas", () => {
  it("movimento = 2 + floor(taijutsu/15)", () => {
    expect(moveRange(0)).toBe(2);
    expect(moveRange(14)).toBe(2);
    expect(moveRange(15)).toBe(3);
    expect(moveRange(30)).toBe(4);
  });

  it("maestria reduz custo", () => {
    expect(costAfterMastery(35, "BASICO")).toBe(35);
    expect(costAfterMastery(35, "CONTROLADO")).toBeLessThan(35);
    expect(costAfterMastery(35, "MESTRE")).toBeLessThan(costAfterMastery(35, "CONTROLADO"));
    // Rasengan ~20% apos controlado
    expect(costAfterMastery(35, "CONTROLADO")).toBe(25);
  });

  it("hp escala com nivel e taijutsu", () => {
    const { hpBase, hpPerLevel, hpPerTaijutsu } = BALANCE;
    expect(maxHp(1, 1)).toBe(hpBase + hpPerLevel + hpPerTaijutsu);
    expect(maxHp(10, 10)).toBeGreaterThan(maxHp(1, 1));
  });
});
