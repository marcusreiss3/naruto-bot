import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance.js";
import { rollTrainingBlueXp, rollTrainingTarget } from "../src/services/characters/reaction-training-service.js";

describe("treino de reflexos", () => {
  it("tem uma tentativa diária e meta equivalente a uma missão rank C", () => {
    expect(BALANCE.xp.trainingDailyLimit).toBe(1);
    expect(BALANCE.xp.trainingReward).toBe(250);
  });

  it("sorteia posição no grid e mantém o alvo por 1,25 segundo", () => {
    const now = new Date("2026-08-22T15:00:00.000Z");
    const values = [0.5, 0.99]; // azul, último espaço do grid
    const target = rollTrainingTarget(now, () => values.shift() ?? 0);
    expect(target.kind).toBe("BLUE");
    expect(target.slot).toBe(8);
    expect(target.expiresAt.getTime() - now.getTime()).toBe(1_250);
  });

  it("não ultrapassa a meta diária ao clicar no alvo azul", () => {
    expect(rollTrainingBlueXp(235, 250, () => 0.99)).toBe(15);
  });
});
