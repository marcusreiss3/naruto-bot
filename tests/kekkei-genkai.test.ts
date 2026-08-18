import { describe, expect, it } from "vitest";
import { ELEMENT_TREES } from "../src/data/element-trees/index.js";
import { eligibleKekkeiGenkai, treeCompletion } from "../src/services/characters/kekkei-genkai.js";
import type { Element } from "../src/config/enums.js";

// Conjunto de ids que cobre exatamente `fraction` da arvore do elemento
// (arredondado pra cima) — pra testar o limiar de 25%/100% sem depender do
// numero exato de nos de cada arvore.
function partialOwnership(element: Element, fraction: number): Set<string> {
  const tree = ELEMENT_TREES[element];
  const count = Math.ceil(tree.length * fraction);
  return new Set(tree.slice(0, count).map((n) => n.id));
}

function fullOwnership(...elements: Element[]): Set<string> {
  const owned = new Set<string>();
  for (const el of elements) {
    for (const node of ELEMENT_TREES[el]) owned.add(node.id);
  }
  return owned;
}

describe("kekkei-genkai: treeCompletion", () => {
  it("0% sem nenhum no, 100% com todos", () => {
    expect(treeCompletion("FOGO", new Set())).toBe(0);
    expect(treeCompletion("FOGO", fullOwnership("FOGO"))).toBe(1);
  });

  it("fracao parcial bate com a proporcao de nos possuidos", () => {
    const owned = partialOwnership("FOGO", 0.25);
    const expected = owned.size / ELEMENT_TREES.FOGO.length;
    expect(treeCompletion("FOGO", owned)).toBeCloseTo(expected);
  });
});

describe("kekkei-genkai: eligibleKekkeiGenkai (fusao automatica)", () => {
  it("nao funde nada sem completar nenhuma receita", () => {
    const owned = partialOwnership("FOGO", 0.5);
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: null })).toBeNull();
  });

  it("Fogo+Agua completos fundem Vapor (sem clã)", () => {
    const owned = fullOwnership("FOGO", "AGUA");
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: null })).toBe("VAPOR");
  });

  it("Fogo+Terra completos fundem Lava; Fogo+Vento completos fundem Calor", () => {
    expect(eligibleKekkeiGenkai({ owned: fullOwnership("FOGO", "TERRA"), elements: [], clanId: null })).toBe("LAVA");
    expect(eligibleKekkeiGenkai({ owned: fullOwnership("FOGO", "VENTO"), elements: [], clanId: null })).toBe("CALOR");
  });

  it("Terra+Raio completos fundem Explosão", () => {
    const owned = fullOwnership("TERRA", "RAIO");
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: null })).toBe("EXPLOSAO");
  });

  it("Fogo+Terra+Vento completos fundem Poeira, nao Lava/Calor (prioridade pela receita maior)", () => {
    const owned = fullOwnership("FOGO", "TERRA", "VENTO");
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: null })).toBe("POEIRA");
  });

  it("ja possuir um kekkei genkai bloqueia fundir outro, mesmo completando a receita", () => {
    const owned = fullOwnership("FOGO", "AGUA");
    expect(eligibleKekkeiGenkai({ owned, elements: ["CRISTAL"], clanId: null })).toBeNull();
  });

  it("Terra+Agua completos fundem Cristal", () => {
    const owned = fullOwnership("TERRA", "AGUA");
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: null })).toBe("CRISTAL");
  });

  it("Onoki funde Poeira com so 25% de Fogo+Terra+Vento", () => {
    const owned = new Set([
      ...partialOwnership("FOGO", 0.25),
      ...partialOwnership("TERRA", 0.25),
      ...partialOwnership("VENTO", 0.25),
    ]);
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: "onoki" })).toBe("POEIRA");
  });

  it("sem ser Onoki, 25% de Fogo+Terra+Vento NAO funde Poeira", () => {
    const owned = new Set([
      ...partialOwnership("FOGO", 0.25),
      ...partialOwnership("TERRA", 0.25),
      ...partialOwnership("VENTO", 0.25),
    ]);
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: null })).toBeNull();
  });

  it("Bakurei funde Explosão com so 25% de Terra+Raio", () => {
    const owned = new Set([...partialOwnership("TERRA", 0.25), ...partialOwnership("RAIO", 0.25)]);
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: "bakurei" })).toBe("EXPLOSAO");
  });

  it("desconto do Onoki NAO vale pra outras receitas (ex: Lava, tambem Fogo+Terra)", () => {
    const owned = new Set([...partialOwnership("FOGO", 0.25), ...partialOwnership("TERRA", 0.25)]);
    expect(eligibleKekkeiGenkai({ owned, elements: [], clanId: "onoki" })).toBeNull();
  });
});
