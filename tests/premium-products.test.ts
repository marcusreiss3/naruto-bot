import { describe, expect, it } from "vitest";
import { PREMIUM_PRODUCTS, getPremiumProduct } from "../src/data/premium-products.js";

describe("catálogo da Loja Premium", () => {
  it("expõe Giros de Clã e de Traço com custos válidos", () => {
    expect(PREMIUM_PRODUCTS.map((product) => product.id)).toEqual(["clan_spin", "trait_spin"]);
    for (const product of PREMIUM_PRODUCTS) expect(product.cost).toBeGreaterThan(0);
  });

  it("busca produtos pelo identificador e rejeita identificadores desconhecidos", () => {
    expect(getPremiumProduct("clan_spin")?.spinField).toBe("clanSpins");
    expect(getPremiumProduct("trait_spin")?.spinField).toBe("traitSpins");
    expect(getPremiumProduct("outro")).toBeUndefined();
  });
});
