import { describe, it, expect } from "vitest";
import { resolveAreaCells } from "../src/services/combat/combat-math.js";
import { meetsRequirements } from "../src/services/characters/requirements.js";
import { getAbility } from "../src/data/index.js";
import { getScenarioById } from "../src/data/scenarios/index.js";

describe("seleção de alvos / área", () => {
  it("LINE seleciona células em linha reta", () => {
    const scenario = getScenarioById("floresta")!;
    const ab = getAbility("katon_ryuuka")!; // LINE range 6
    const cells = resolveAreaCells(ab, "A1", "A6", scenario);
    expect(cells).toContain("A2");
    expect(cells).toContain("A6");
    expect(cells).not.toContain("B2");
  });

  it("MELEE/SINGLE atinge só o alvo", () => {
    const scenario = getScenarioById("floresta")!;
    const ab = getAbility("tai_soco_forte")!;
    const cells = resolveAreaCells(ab, "A1", "A2", scenario);
    expect(cells).toEqual(["A2"]);
  });
});

describe("desbloqueio de jutsu", () => {
  it("Fogo nível 2 exige Fogo + nível 10 + Ninjutsu 10", () => {
    const ab = getAbility("katon_housenka")!;
    const fail = meetsRequirements(ab, {
      level: 9,
      attrs: { ninjutsu: 10, iryo: 1, taijutsu: 1, genjutsu: 1, kenjutsu: 1 },
      elements: ["FOGO"],
      clanId: null,
    });
    expect(fail).toBe(false);
    const ok = meetsRequirements(ab, {
      level: 10,
      attrs: { ninjutsu: 10, iryo: 1, taijutsu: 1, genjutsu: 1, kenjutsu: 1 },
      elements: ["FOGO"],
      clanId: null,
    });
    expect(ok).toBe(true);
    const noElement = meetsRequirements(ab, {
      level: 20,
      attrs: { ninjutsu: 20, iryo: 1, taijutsu: 1, genjutsu: 1, kenjutsu: 1 },
      elements: ["AGUA"],
      clanId: null,
    });
    expect(noElement).toBe(false);
  });
});

describe("integridade de dados", () => {
  it("desarme: ken_desarme aplica efeito DISARM", () => {
    const ab = getAbility("ken_desarme")!;
    expect(ab.effects?.some((e) => e.effectId === "DISARM")).toBe(true);
  });
});
