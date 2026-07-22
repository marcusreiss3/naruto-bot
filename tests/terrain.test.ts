import { describe, it, expect } from "vitest";
import {
  makePatches,
  mergePatches,
  activePatches,
  clearKindAt,
  hasKindAt,
  hasActiveKind,
  effectiveObstacles,
  effectiveWater,
  effectiveLineBlockers,
  lineIsClear,
  terrainTickDamage,
  terrainMoveFactor,
  parseTerrain,
  serializeTerrain,
} from "../src/services/combat/terrain.js";
import type { ScenarioDef } from "../src/data/types.js";

const scenario: ScenarioDef = {
  id: "teste",
  name: "Teste",
  channelId: "0",
  rows: 8,
  cols: 8,
  description: "",
  terrain: "grass",
  cells: { obstacles: ["C3"], water: ["D4"], trees: ["E5"] },
};

describe("terreno: ciclo de vida", () => {
  it("mancha vale da rodada atual ate untilRound (inclusive)", () => {
    const p = makePatches(["A1"], "FIRE", 3, 2); // rodadas 3 e 4
    expect(p[0]!.untilRound).toBe(4);
    expect(activePatches(p, 4)).toHaveLength(1);
    expect(activePatches(p, 5)).toHaveLength(0);
  });

  it("duracao minima de 1 rodada", () => {
    expect(makePatches(["A1"], "FIRE", 5, 0)[0]!.untilRound).toBe(5);
  });

  it("refrescar a mesma celula estende, nao duplica", () => {
    const antigo = makePatches(["A1"], "FIRE", 1, 2); // ate 2
    const novo = makePatches(["A1"], "FIRE", 3, 2); // ate 4
    const merged = mergePatches(antigo, novo);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.untilRound).toBe(4);
  });

  it("tipos diferentes coexistem na mesma celula", () => {
    const merged = mergePatches(
      makePatches(["A1"], "FIRE", 1, 2),
      makePatches(["A1"], "SMOKE", 1, 2),
    );
    expect(merged).toHaveLength(2);
  });

  it("clearKindAt remove so o tipo pedido (fogo evapora agua)", () => {
    const patches = mergePatches(
      makePatches(["A1", "A2"], "WATER", 1, 3),
      makePatches(["A1"], "FIRE", 1, 3),
    );
    const out = clearKindAt(patches, ["A1"], "WATER");
    expect(hasKindAt(out, "A1", "WATER", 1)).toBe(false);
    expect(hasKindAt(out, "A2", "WATER", 1)).toBe(true);
    expect(hasKindAt(out, "A1", "FIRE", 1)).toBe(true);
  });
});

describe("terreno: consultas", () => {
  it("obstaculo temporario soma aos do cenario", () => {
    const patches = makePatches(["B2"], "OBSTACLE", 1, 2);
    const obs = effectiveObstacles(scenario, patches, 1);
    expect(obs.has("C3")).toBe(true); // do cenario
    expect(obs.has("B2")).toBe(true); // temporario
  });

  it("obstaculo expirado deixa de bloquear", () => {
    const patches = makePatches(["B2"], "OBSTACLE", 1, 1);
    expect(effectiveObstacles(scenario, patches, 2).has("B2")).toBe(false);
  });

  it("agua de jutsu soma a agua do cenario", () => {
    const water = effectiveWater(scenario, makePatches(["F6"], "WATER", 1, 2), 1);
    expect(water.has("D4")).toBe(true);
    expect(water.has("F6")).toBe(true);
  });

  it("fumaca e obstaculo cortam linha; fogo nao", () => {
    const blockers = effectiveLineBlockers(
      scenario,
      mergePatches(makePatches(["B2"], "SMOKE", 1, 2), makePatches(["B3"], "FIRE", 1, 2)),
      1,
    );
    expect(blockers.has("B2")).toBe(true);
    expect(blockers.has("E5")).toBe(true); // arvore do cenario
    expect(blockers.has("B3")).toBe(false); // fogo nao bloqueia visao
  });

  it("detecta fogo ativo em qualquer celula do campo", () => {
    const patches = makePatches(["H8"], "FIRE", 2, 2);
    expect(hasActiveKind(patches, "FIRE", 3)).toBe(true);
    expect(hasActiveKind(patches, "FIRE", 4)).toBe(false);
  });
});

describe("terreno: linha de visao", () => {
  it("linha limpa quando nada no meio", () => {
    expect(lineIsClear("A1", "A5", new Set(), scenario)).toBe(true);
  });

  it("bloqueador no meio corta a linha", () => {
    expect(lineIsClear("A1", "A5", new Set(["A3"]), scenario)).toBe(false);
  });

  it("bloqueador na propria celula de origem ou alvo nao conta", () => {
    expect(lineIsClear("A1", "A5", new Set(["A1"]), scenario)).toBe(true);
    expect(lineIsClear("A1", "A5", new Set(["A5"]), scenario)).toBe(true);
  });
});

describe("terreno: efeitos por celula", () => {
  it("chamas causam dano de tick; celula limpa nao", () => {
    const patches = makePatches(["A1"], "FIRE", 1, 2);
    expect(terrainTickDamage(patches, "A1", 1)).toBeGreaterThan(0);
    expect(terrainTickDamage(patches, "A2", 1)).toBe(0);
    expect(terrainTickDamage(patches, "A1", 9)).toBe(0); // expirou
  });

  it("pantano corta movimento; fora dele nao", () => {
    const patches = makePatches(["A1"], "SWAMP", 1, 2);
    expect(terrainMoveFactor(patches, "A1", 1)).toBeLessThan(1);
    expect(terrainMoveFactor(patches, "A2", 1)).toBe(1);
  });
});

describe("terreno: serializacao", () => {
  it("ida e volta preserva as manchas", () => {
    const p = makePatches(["A1", "A2"], "FIRE", 2, 3);
    expect(parseTerrain(serializeTerrain(p))).toEqual(p);
  });

  it("json invalido ou lixo vira lista vazia", () => {
    expect(parseTerrain("nao e json")).toEqual([]);
    expect(parseTerrain("{}")).toEqual([]);
    expect(parseTerrain('[{"cell":"A1","kind":"INVALIDO","untilRound":2}]')).toEqual([]);
  });
});
