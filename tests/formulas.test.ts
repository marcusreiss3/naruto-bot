import { describe, it, expect } from "vitest";
import { moveRange, maxHp } from "../src/services/characters/formulas.js";
import { BALANCE } from "../src/config/balance.js";

describe("formulas", () => {
  it("movimento = 2 + floor(taijutsu/15)", () => {
    expect(moveRange()).toBe(2);
  });

  it("hp escala com nivel e taijutsu", () => {
    const { hpBase, hpPerLevel, hpPerTaijutsu } = BALANCE;
    expect(maxHp(1, 1)).toBe(hpBase + hpPerLevel + hpPerTaijutsu);
    expect(maxHp(10, 10)).toBeGreaterThan(maxHp(1, 1));
  });
});
