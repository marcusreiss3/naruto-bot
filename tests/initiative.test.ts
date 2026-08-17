import { describe, expect, it } from "vitest";
import { initiativeScore, orderByInitiative } from "../src/services/combat/initiative.js";

describe("iniciativa de combate", () => {
  it("usa Taijutsu como base e soma o bônus das passivas", () => {
    expect(initiativeScore({ taijutsu: 12 })).toBe(12);
    expect(initiativeScore({ taijutsu: 12 }, ["gen_raiz"])).toBe(13);
  });

  it("mantém a ordem de entrada quando há empate", () => {
    const ids = ["primeiro", "segundo", "terceiro"];
    const scores = new Map([["primeiro", 8], ["segundo", 12], ["terceiro", 8]]);

    expect(orderByInitiative(ids, scores)).toEqual(["segundo", "primeiro", "terceiro"]);
  });
});
