import { describe, it, expect } from "vitest";
import { spawnCat, catMissionStep, type CatState, type CatMissionData } from "../src/services/missions/cat.js";
import { getScenarioById } from "../src/data/scenarios/index.js";
import { distanceCells } from "../src/utils/grid.js";

const scenario = getScenarioById("praca_folha")!;
const data: CatMissionData = {
  catMoveMin: 1,
  catMoveMax: 2,
  fleeMin: 2,
  fleeMax: 4,
  captureBaseChance: 1,
};

describe("missão do gato", () => {
  it("spawn cria célula válida diferente do jogador", () => {
    const cell = spawnCat(scenario, "A1");
    expect(cell).not.toBe("A1");
    expect(/^[A-F](?:[1-9]|10)$/.test(cell)).toBe(true);
  });

  it("captura quando jogador entra na célula do gato (chance=1)", () => {
    const state: CatState = { catCell: "C3", playerCell: "A1", turns: 0 };
    const res = catMissionStep(state, "C3", scenario, data);
    expect(res.captured).toBe(true);
  });

  it("falha de captura faz o gato fugir para outra célula", () => {
    const state: CatState = { catCell: "C3", playerCell: "A1", turns: 0 };
    const res = catMissionStep(state, "C3", scenario, { ...data, captureBaseChance: 0 });
    expect(res.captured).toBe(false);
    expect(res.state.catCell).not.toBe("C3");
  });

  it("gato se afasta do jogador quando não capturado", () => {
    const state: CatState = { catCell: "C3", playerCell: "C1", turns: 0 };
    const res = catMissionStep(state, "C2", scenario, { ...data, captureBaseChance: 0 });
    // gato deve manter ou aumentar a distancia do jogador
    const before = distanceCells("C2", "C3");
    const after = distanceCells("C2", res.state.catCell);
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
