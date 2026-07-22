import { describe, it, expect } from "vitest";
import { BALANCE } from "../src/config/balance.js";
import { EFFECT_IDS, effectLabel } from "../src/config/enums.js";
import {
  applyBurnStacks,
  burnTaijutsuMultiplier,
  clampDuration,
  defaultDurationFor,
  poisonTickDamage,
  healMultiplier,
  applySlowToMove,
  applyHasteToMove,
  hasteDodgeBonus,
  hasteFleeChanceBonus,
  hasteContactDamage,
  bleedExtraOnPhysical,
  isStunned,
  tickEffect,
  type EffectState,
} from "../src/services/combat/effects.js";

describe("efeitos", () => {
  it("todos os efeitos possuem nome legível em português", () => {
    for (const effectId of EFFECT_IDS) expect(effectLabel(effectId)).not.toBe(effectId);
    expect(effectLabel("ROOT")).toBe("Imobilização");
    expect(effectLabel("WET")).toBe("Encharcado");
    expect(effectLabel("FLEE_LOCK")).toBe("Bloqueio de Fuga");
  });
  it("lentidao reduz movimento pela metade", () => {
    const slow: EffectState[] = [{ effectId: "SLOW", stacks: 1, duration: 2 }];
    expect(applySlowToMove(4, slow)).toBe(2);
    expect(applySlowToMove(4, [])).toBe(4);
  });

  it("aceleracao aumenta movimento, esquiva e choque de contato", () => {
    const haste: EffectState[] = [{ effectId: "HASTE", stacks: 1, duration: 2 }];
    expect(applyHasteToMove(3, haste)).toBe(3 + BALANCE.effects.HASTE.moveBonus);
    expect(hasteDodgeBonus(haste)).toBe(BALANCE.effects.HASTE.dodgeBonus);
    expect(hasteFleeChanceBonus(haste)).toBe(BALANCE.effects.HASTE.fleeChanceBonus);
    expect(hasteContactDamage(haste)).toBe(BALANCE.effects.HASTE.contactDamage);
    expect(applyHasteToMove(3, [])).toBe(3);
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

  it("efeito com duracao zerada nao conta mais", () => {
    const expirado: EffectState[] = [{ effectId: "STUN", stacks: 1, duration: 0 }];
    expect(isStunned(expirado)).toBe(false);
    expect(isStunned([{ effectId: "STUN", stacks: 1, duration: 1 }])).toBe(true);
    // mesma regra para os demais: sangramento expirado nao corta cura
    expect(healMultiplier([{ effectId: "BLEED", stacks: 1, duration: 0 }])).toBe(1);
  });

  it("duracao padrao vem do balance quando o jutsu nao especifica", () => {
    expect(defaultDurationFor("STUN")).toBe(BALANCE.effects.STUN.defaultDuration);
    expect(defaultDurationFor("CONFUSION")).toBe(BALANCE.effects.CONFUSION.defaultDuration);
    expect(defaultDurationFor("ROOT")).toBe(BALANCE.effects.ROOT.defaultDuration);
    expect(defaultDurationFor("HASTE")).toBe(BALANCE.effects.HASTE.defaultDuration);
    expect(defaultDurationFor("NINJUTSU_BLOCK")).toBe(BALANCE.effects.NINJUTSU_BLOCK.defaultDuration);
    expect(defaultDurationFor("BURN")).toBe(1); // sem default proprio
  });

  it("veneno respeita o teto de duracao", () => {
    const max = BALANCE.effects.POISON.maxDuration;
    expect(clampDuration("POISON", max + 10)).toBe(max);
    expect(clampDuration("POISON", 2)).toBe(2);
    // outros efeitos nao tem teto
    expect(clampDuration("BURN", 99)).toBe(99);
  });

  it("tick expira o efeito na ultima rodada", () => {
    expect(tickEffect({ effectId: "BURN", stacks: 1, duration: 1 }).expired).toBe(true);
    expect(tickEffect({ effectId: "BURN", stacks: 1, duration: 2 }).expired).toBe(false);
    expect(tickEffect({ effectId: "BURN", stacks: 1, duration: 2 }).damage).toBe(
      BALANCE.effects.BURN.dmgPerTurn,
    );
    // efeito sem dano por turno nao tira vida
    expect(tickEffect({ effectId: "STUN", stacks: 1, duration: 2 }).damage).toBe(0);
  });
});
