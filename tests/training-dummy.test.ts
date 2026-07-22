import { describe, expect, it } from "vitest";
import { getNpc } from "../src/data/index.js";
import {
  clampInfiniteHp,
  TRAINING_DURATION_MS,
  trainingExpirationFromFlags,
} from "../src/services/combat/training-dummy.js";

describe("boneco de treino", () => {
  it("existe como NPC imóvel e sem ataques", () => {
    const dummy = getNpc("training_dummy");
    expect(dummy).toBeTruthy();
    expect(dummy!.abilityIds).toEqual([]);
  });

  it("recupera todo o HP independentemente do dano", () => {
    expect(clampInfiniteHp(0, 100, { infiniteHp: true })).toBe(100);
    expect(clampInfiniteHp(37, 100, { infiniteHp: true })).toBe(100);
    expect(clampInfiniteHp(37, 100, {})).toBe(37);
  });

  it("só reconhece expiração em participantes de treino", () => {
    expect(trainingExpirationFromFlags({ isTrainingDummy: true, expiresAt: 123 })).toBe(123);
    expect(trainingExpirationFromFlags({ expiresAt: 123 })).toBeNull();
    expect(trainingExpirationFromFlags({ isTrainingDummy: true, expiresAt: "123" })).toBeNull();
  });

  it("dura exatamente 30 minutos", () => {
    expect(TRAINING_DURATION_MS).toBe(30 * 60 * 1000);
  });
});
