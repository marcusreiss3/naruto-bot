import { describe, expect, it } from "vitest";
import { ARHAT_TREE } from "../src/data/arhat-tree.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";

const IDS = [
  "arhat_palmada_colapso",
  "arhat_ombro",
  "arhat_joelhada",
  "arhat_palmada_ascendente",
  "arhat_palma_compressao",
  "arhat_golpe_rocha",
] as const;

describe("árvore Punho Arhat", () => {
  it("é indexada, usa pontos de Taijutsu e só contém jutsus ativos", () => {
    const indexed = new Set(allNodes().map((node) => node.id));
    expect(ARHAT_TREE.map((node) => node.id)).toEqual(IDS);
    for (const node of ARHAT_TREE) {
      expect(indexed.has(node.id)).toBe(true);
      expect(node.kind).toBe("JUTSU");
      expect(node.pool).toBe("taijutsu");
      expect(node.grantsAbilityId).toBe(node.id);
      expect(getAbility(node.id)?.category).toBe("TAIJUTSU");
    }
    expect(ARHAT_TREE.every((node) => node.kind !== "PASSIVE")).toBe(true);
  });

  it("mantém a progressão de impacto e controle", () => {
    expect(ARHAT_TREE[0]!.requires).toEqual([]);
    expect(ARHAT_TREE.find((node) => node.id === "arhat_palmada_ascendente")!.requires).toEqual(["arhat_joelhada"]);
    expect(getAbility("arhat_palmada_ascendente")!.push).toBe(4);
    expect(getAbility("arhat_palma_compressao")!.shape).toBe("RADIUS");
    expect(getAbility("arhat_golpe_rocha")!.baseDamage).toBeGreaterThan(getAbility("arhat_palma_compressao")!.baseDamage!);
  });
});
