import { describe, expect, it } from "vitest";
import { applyCraftDiscount, puppetCapabilities, puppetMechanismCap } from "../src/services/puppets/puppet-service.js";

describe("puppetCapabilities", () => {
  it("extraAbilitySlot só liga com o nó do clã Shirogane", () => {
    expect(puppetCapabilities([]).extraAbilitySlot).toBe(false);
    expect(puppetCapabilities(["shirogane_braco_extra"]).extraAbilitySlot).toBe(true);
  });

  it("reflete somente os bônus descritos nas três carapaças", () => {
    expect(puppetCapabilities(["kugutsu_carapaca_ofensiva"]).shellDamageBonus).toBeCloseTo(0.10);
    expect(puppetCapabilities(["kugutsu_carapaca_ofensiva_ii"]).shellDamageBonus).toBeCloseTo(0.18);
    expect(puppetCapabilities(["kugutsu_carapaca_ofensiva_iii"]).shellDamageBonus).toBeCloseTo(0.25);
    expect(puppetCapabilities(["kugutsu_carapaca_ofensiva_iv"]).shellDamageBonus).toBeCloseTo(0.35);
    expect(puppetCapabilities(["kugutsu_carapaca_defensiva_iii"]).shellHpBonus).toBeCloseTo(0.45);
    expect(puppetCapabilities(["kugutsu_carapaca_defensiva_iii"]).shellShieldBonus).toBeCloseTo(0.45);
    expect(puppetCapabilities(["kugutsu_carapaca_efeito_ii"]).shellEffectTurns).toBe(2);
    const effectApex = puppetCapabilities(["kugutsu_carapaca_efeito", "kugutsu_carapaca_efeito_ii", "kugutsu_carapaca_efeito_iii"]);
    expect(effectApex.shellEffectTurns).toBe(2);
    expect(effectApex.shellDotCostMult).toBeCloseTo(0.9);
  });
});

describe("puppetMechanismCap", () => {
  it("teto padrão é 2 sem o nó do clã", () => {
    expect(puppetMechanismCap(false, false, false)).toBe(2);
  });

  it("teto sobe pra 3 quando tem o nó e nenhuma outra marionete reservou a vaga", () => {
    expect(puppetMechanismCap(true, false, false)).toBe(3);
  });

  it("teto fica em 2 se outra marionete já reservou a vaga extra", () => {
    expect(puppetMechanismCap(true, false, true)).toBe(2);
  });

  it("uma vez reservada nesta marionete (puppet.extraSlot), o teto é 3 mesmo sem o nó (nao reverte)", () => {
    expect(puppetMechanismCap(false, true, false)).toBe(3);
  });
});

describe("applyCraftDiscount", () => {
  it("aplica o multiplicador ao Ryō e arredonda", () => {
    const { ryo } = applyCraftDiscount(100, [], 0.9);
    expect(ryo).toBe(90);
  });

  it("nunca zera um ingrediente (piso de 1 unidade)", () => {
    const { ingredients } = applyCraftDiscount(0, [{ itemId: "x", qty: 1 }], 0.5);
    expect(ingredients[0]!.qty).toBe(1);
  });

  it("mult neutro (1) não altera nada", () => {
    const { ryo, ingredients } = applyCraftDiscount(50, [{ itemId: "y", qty: 4 }], 1);
    expect(ryo).toBe(50);
    expect(ingredients[0]!.qty).toBe(4);
  });
});
