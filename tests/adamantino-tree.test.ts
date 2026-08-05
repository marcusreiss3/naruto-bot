import { describe, expect, it } from "vitest";
import { ADAMANTINO_TREE } from "../src/data/adamantino-tree.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";

// Ordem = COMPLEXIDADE da técnica, não poder bruto. O Super Peteleco é a raiz
// por ser o truque mais simples do estilo; a árvore sobe até a liberação do
// selo (Cem Forças).
const IDS = [
  "adamantino_super_peteleco",
  "adamantino_pe_dor_celestial",
  "adamantino_impacto_flor_cerejeira",
  "adamantino_destruicao_pilar",
  "adamantino_impacto_flor_florescimento",
  "adamantino_cem_forcas",
] as const;

describe("árvore Punho Adamantino", () => {
  it("é indexada, ativa e paga os nós com Taijutsu", () => {
    const indexed = new Set(allNodes().map((node) => node.id));
    const jutsus = ADAMANTINO_TREE.filter((node) => node.kind === "JUTSU");
    expect(jutsus.map((node) => node.id)).toEqual(IDS);
    for (const node of jutsus) {
      expect(indexed.has(node.id)).toBe(true);
      expect(node.kind).toBe("JUTSU");
      expect(node.pool).toBe("taijutsu");
      expect(node.reqAttribute?.attribute).toBe("iryoNinjutsu");
      expect(getAbility(node.id)?.category).toBe("TAIJUTSU");
    }
  });

  it("mantém a exigência crescente de Iryō e o buff das Cem Forças", () => {
    const jutsus = ADAMANTINO_TREE.filter((node) => node.kind === "JUTSU");
    // agora estritamente crescente, acompanhando a ordem da árvore
    expect(jutsus.map((node) => node.reqAttribute?.value)).toEqual([2, 6, 12, 18, 24, 28]);
    const cem = getAbility("adamantino_cem_forcas")!;
    expect(cem.resource).toBe("chakra");
    expect(cem.effects).toContainEqual({ effectId: "EMPOWERED", duration: 3, empoweredScope: "physical" });
  });

  it("tem as três passivas de estilo encadeadas a partir de um jutsu próprio, pagas com Iryō", () => {
    const passivas = ADAMANTINO_TREE.filter((node) => node.kind === "PASSIVE");
    expect(passivas.map((node) => node.id)).toEqual(["tai_adamantino_controle", "tai_adamantino_ruptura", "tai_adamantino_forca"]);
    expect(passivas[0]!.requires).toEqual(["adamantino_super_peteleco"]);
    expect(passivas[1]!.requires).toEqual(["tai_adamantino_controle"]);
    expect(passivas[2]!.requires).toEqual(["tai_adamantino_ruptura"]);
    for (const node of passivas) expect(node.pool).toBe("iryoNinjutsu");
  });
});
