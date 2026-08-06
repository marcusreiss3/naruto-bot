import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { getNode } from "../src/data/element-trees/index.js";
import { FUINJUTSU_TREE } from "../src/data/fuinjutsu-tree.js";
import { buildMechanicsSummary } from "../src/services/characters/skill-description.js";

describe("árvore de Fuinjutsu", () => {
  it("registra seus cinco jutsus ativos na árvore e no catálogo", () => {
    const ids = ["fuin_metodo_selamento_fogo", "fuin_selo_cinco_elementos", "fuin_selamento_contrato", "fuin_formacao_cordas_luz", "fuin_ligacao_pano"];
    expect(ids.map(getNode).every(Boolean)).toBe(true);
    expect(ids.map(getAbility).every(Boolean)).toBe(true);
    expect(FUINJUTSU_TREE.every((node) => node.pool === "fuinjutsu")).toBe(true);
  });

  it("mantém o Selamento de Contrato como controle de contrato sem dano bruto", () => {
    const ability = getAbility("fuin_selamento_contrato")!;
    expect(ability.effects).toEqual([{ effectId: "CONTRACT_SEAL", duration: 2, chance: 0.85 }]);
    expect(ability.baseDamage).toBe(6);
  });

  it("gasta um Pergaminho Rank B no Método de Selamento de Fogo", () => {
    const ability = getAbility("fuin_metodo_selamento_fogo")!;
    expect(ability.requiredItems).toEqual([
      { itemId: "pergaminho_rank_b", amount: 1, exhaustToItemId: "pergaminho_rank_b_gasto" },
    ]);
    expect(buildMechanicsSummary(ability)).toMatch(/Gasta 1x Pergaminho Rank B; restaure-o para usar novamente/);
  });
});
