import { describe, it, expect } from "vitest";
import {
  applyBurnStacks,
  burnTaijutsuMultiplier,
  poisonTickDamage,
  healMultiplier,
  applySlowToMove,
  bleedExtraOnPhysical,
  type EffectState,
} from "../src/services/combat/effects.js";

describe("efeitos", () => {
  it("lentidao reduz movimento pela metade", () => {
    const slow: EffectState[] = [{ effectId: "SLOW", stacks: 1, duration: 2 }];
    expect(applySlowToMove(4, slow)).toBe(2);
    expect(applySlowToMove(4, [])).toBe(4);
  });

  it("queimadura: stacks reduzem taijutsu e explode em 5", () => {
    expect(burnTaijutsuMultiplier(2)).toBeCloseTo(0.9);
    const r1 = applyBurnStacks(3, 1); // ->4
    expect(r1.stacks).toBe(4);
    expect(r1.explosionDamage).toBe(0);
    const r2 = applyBurnStacks(4, 1); // ->5 explode e zera
    expect(r2.stacks).toBe(0);
    expect(r2.explosionDamage).toBeGreaterThan(0);
  });

  it("veneno aumenta dano por stack", () => {
    expect(poisonTickDamage(2)).toBeGreaterThan(poisonTickDamage(1));
    expect(poisonTickDamage(4)).toBeGreaterThan(poisonTickDamage(2));
  });

  it("sangramento corta cura pela metade e adiciona dano fisico", () => {
    const bleed: EffectState[] = [{ effectId: "BLEED", stacks: 1, duration: 3 }];
    expect(healMultiplier(bleed)).toBe(0.5);
    expect(healMultiplier([])).toBe(1);
    expect(bleedExtraOnPhysical(bleed)).toBeGreaterThan(0);
    expect(bleedExtraOnPhysical([])).toBe(0);
  });
});
