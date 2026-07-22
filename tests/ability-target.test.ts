import { describe, it, expect } from "vitest";
import { ALL_ABILITIES, getAbility, getScenarioById } from "../src/data/index.js";
import { isAreaShape, previewAbilityArea, type SessionFull } from "../src/services/combat/combat-engine.js";
import { resolveAreaCells } from "../src/services/combat/combat-math.js";

const scenario = getScenarioById("floresta")!;

// Sessao minima so com o que previewAbilityArea le.
function fakeSession(): SessionFull {
  const p = (id: string, cell: string, teamId: string) =>
    ({
      id,
      cell,
      teamId,
      hpCurrent: 100,
      effects: [],
      flags: {},
    }) as unknown as SessionFull["participants"][number];

  return {
    scenarioId: scenario.id,
    participants: [
      p("eu", "E5", "A"),
      p("aliado", "D6", "A"),
      p("inimigo", "E7", "B"),
      p("longe", "A1", "B"),
    ],
  } as unknown as SessionFull;
}

describe("alvo obrigatorio em jutsu de area", () => {
  it("todo jutsu de area precisa de alvo para ter direcao", () => {
    // shape SELF e o unico que dispensa alvo; area nunca dispensa
    for (const a of ALL_ABILITIES.filter(isAreaShape)) {
      expect(a.shape).not.toBe("SELF");
    }
  });

  it("sem celula de alvo, area nao resolve celula nenhuma", () => {
    const cone = getAbility("katon_goukakyuu")!;
    // sem alvo nao ha direcao: resolveAreaCells nao tem o que devolver
    expect(resolveAreaCells(cone, "E5", "", scenario)).toEqual([]);
    // e o preview recusa em vez de desenhar algo errado
    expect(previewAbilityArea(fakeSession(), "eu", cone, null)).toBeNull();
  });

  it("mirar na propria celula tambem nao gera area", () => {
    const cone = getAbility("katon_goukakyuu")!;
    expect(previewAbilityArea(fakeSession(), "eu", cone, "E5")).toBeNull();
  });

  it("com alvo, o preview separa aliado de inimigo", () => {
    const cone = getAbility("katon_goukakyuu")!;
    const prev = previewAbilityArea(fakeSession(), "eu", cone, "E8")!;
    expect(prev).not.toBeNull();
    expect(prev.enemies.map((p) => p.id)).toEqual(["inimigo"]);
    // aliado em D6 cai dentro do leque de 45 graus
    expect(prev.allies.map((p) => p.id)).toEqual(["aliado"]);
    // quem esta atras nao entra
    expect(prev.cells).not.toContain("A1");
  });

  it("o atacante nunca entra na propria area", () => {
    const cone = getAbility("katon_goukakyuu")!;
    const prev = previewAbilityArea(fakeSession(), "eu", cone, "E8")!;
    const todos = [...prev.enemies, ...prev.allies].map((p) => p.id);
    expect(todos).not.toContain("eu");
  });

  it("katon_goukakyuu e cone e cobra chakra", () => {
    const cone = getAbility("katon_goukakyuu")!;
    expect(cone.shape).toBe("CONE");
    expect(isAreaShape(cone)).toBe(true);
    expect(cone.cost).toBeGreaterThan(0);
  });
});
