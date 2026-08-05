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
  it("é indexada, usa pontos de Taijutsu e contém os jutsus ativos", () => {
    const indexed = new Set(allNodes().map((node) => node.id));
    const jutsus = ARHAT_TREE.filter((node) => node.kind === "JUTSU");
    expect(jutsus.map((node) => node.id)).toEqual(IDS);
    for (const node of jutsus) {
      expect(indexed.has(node.id)).toBe(true);
      expect(node.kind).toBe("JUTSU");
      expect(node.pool).toBe("taijutsu");
      expect(node.grantsAbilityId).toBe(node.id);
      expect(getAbility(node.id)?.category).toBe("TAIJUTSU");
    }
  });

  it("tem as três passivas de estilo encadeadas a partir de um jutsu próprio", () => {
    const passivas = ARHAT_TREE.filter((node) => node.kind === "PASSIVE");
    expect(passivas.map((node) => node.id)).toEqual(["tai_arhat_impacto", "tai_arhat_pressao", "tai_arhat_estabilidade"]);
    expect(passivas[0]!.requires).toEqual(["arhat_ombro"]);
    expect(passivas[1]!.requires).toEqual(["tai_arhat_impacto"]);
    expect(passivas[2]!.requires).toEqual(["tai_arhat_pressao"]);
  });

  it("mantém a progressão de impacto e controle", () => {
    expect(ARHAT_TREE[0]!.requires).toEqual([]);
    expect(ARHAT_TREE.find((node) => node.id === "arhat_palmada_ascendente")!.requires).toEqual(["arhat_joelhada"]);
    expect(getAbility("arhat_palmada_ascendente")!.push).toBe(4);
    expect(getAbility("arhat_palma_compressao")!.shape).toBe("RADIUS");
    expect(getAbility("arhat_golpe_rocha")!.baseDamage).toBeGreaterThan(getAbility("arhat_palma_compressao")!.baseDamage!);
  });
});
