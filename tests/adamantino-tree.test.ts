import { describe, expect, it } from "vitest";
import { ADAMANTINO_TREE } from "../src/data/adamantino-tree.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";

const IDS = [
  "adamantino_pe_dor_celestial",
  "adamantino_impacto_flor_cerejeira",
  "adamantino_impacto_flor_florescimento",
  "adamantino_cem_forcas",
  "adamantino_destruicao_pilar",
  "adamantino_super_peteleco",
] as const;

describe("árvore Punho Adamantino", () => {
  it("é indexada, ativa e paga os nós com Taijutsu", () => {
    const indexed = new Set(allNodes().map((node) => node.id));
    expect(ADAMANTINO_TREE.map((node) => node.id)).toEqual(IDS);
    for (const node of ADAMANTINO_TREE) {
      expect(indexed.has(node.id)).toBe(true);
      expect(node.kind).toBe("JUTSU");
      expect(node.pool).toBe("taijutsu");
      expect(node.reqAttribute?.attribute).toBe("iryoNinjutsu");
      expect(getAbility(node.id)?.category).toBe("TAIJUTSU");
    }
    expect(ADAMANTINO_TREE.every((node) => node.kind !== "PASSIVE")).toBe(true);
  });

  it("mantém a exigência crescente de Iryō e o buff das Cem Forças", () => {
    expect(ADAMANTINO_TREE.map((node) => node.reqAttribute?.value)).toEqual([8, 12, 18, 28, 20, 24]);
    const cem = getAbility("adamantino_cem_forcas")!;
    expect(cem.resource).toBe("chakra");
    expect(cem.effects).toContainEqual({ effectId: "EMPOWERED", duration: 3, empoweredScope: "physical" });
  });
});
