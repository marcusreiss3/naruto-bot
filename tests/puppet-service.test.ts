import { describe, expect, it } from "vitest";
import { applyCraftDiscount, puppetCapabilities, puppetMechanismCap } from "../src/services/puppets/puppet-service.js";

describe("puppetCapabilities", () => {
  it("extraAbilitySlot só liga com o nó do clã Shirogane", () => {
    expect(puppetCapabilities([]).extraAbilitySlot).toBe(false);
    expect(puppetCapabilities(["shirogane_braco_extra"]).extraAbilitySlot).toBe(true);
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
