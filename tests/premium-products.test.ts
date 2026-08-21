import { describe, expect, it } from "vitest";
import { PREMIUM_PRODUCTS, getPremiumProduct } from "../src/data/premium-products.js";

describe("catálogo da Loja Premium", () => {
  it("expõe os produtos premium com custos válidos", () => {
    expect(PREMIUM_PRODUCTS.map((product) => product.id)).toEqual(["clan_spin", "trait_spin", "attribute_respec", "fighting_style_reset", "character_reset"]);
    for (const product of PREMIUM_PRODUCTS) expect(product.cost).toBeGreaterThan(0);
  });

  it("busca produtos pelo identificador e rejeita identificadores desconhecidos", () => {
    expect(getPremiumProduct("clan_spin")).toMatchObject({ spinField: "clanSpins", cost: 400 });
    expect(getPremiumProduct("trait_spin")).toMatchObject({ spinField: "traitSpins", cost: 300 });
    expect(getPremiumProduct("attribute_respec")).toMatchObject({ kind: "RESPEC", cost: 2000 });
    expect(getPremiumProduct("fighting_style_reset")).toMatchObject({ kind: "FIGHTING_STYLE_RESET", cost: 1500 });
    expect(getPremiumProduct("character_reset")).toMatchObject({ kind: "CHARACTER_RESET", cost: 5000 });
    expect(getPremiumProduct("outro")).toBeUndefined();
  });
});
