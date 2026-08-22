import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { getNode } from "../src/data/element-trees/index.js";
import { FUINJUTSU_TREE } from "../src/data/fuinjutsu-tree.js";
import { buildMechanicsSummary } from "../src/services/characters/skill-description.js";

describe("árvore de Fuinjutsu", () => {
  it("registra seus oito jutsus ativos na árvore e no catálogo", () => {
    const ids = ["fuin_metodo_selamento_fogo", "fuin_selo_cinco_elementos", "fuin_selamento_contrato", "fuin_selo_quatro_simbolos_reverso", "fuin_formacao_cordas_luz", "fuin_ligacao_pano", "fuin_rugido_confinamento_leao", "fuin_selo_auto_amaldicoamento"];
    expect(ids.map(getNode).every(Boolean)).toBe(true);
    expect(ids.map(getAbility).every(Boolean)).toBe(true);
    expect(FUINJUTSU_TREE.every((node) => node.pool === "fuinjutsu")).toBe(true);
  });

  it("mantém o Selo dos Tenketsu exclusivo dos Hyūga", () => {
    const rugido = getAbility("fuin_rugido_confinamento_leao")!;
    expect(rugido.effects).toEqual([
      { effectId: "NINJUTSU_BLOCK", duration: 2, chance: 0.85 },
      { effectId: "ROOT", duration: 1, chance: 0.75 },
    ]);
    expect(rugido.effects!.some((effect) => effect.effectId === "TENKETSU_SEAL")).toBe(false);
  });

  it("arma o Selo Reverso antes da derrota e sela Ninjutsu apenas em inimigos próximos", () => {
    const selo = getAbility("fuin_selo_quatro_simbolos_reverso")!;
    expect(selo.actionType).toBe("BONUS");
    expect(selo.oncePerCombat).toBe(true);
    expect(selo.deathTrigger).toEqual({
      radius: 2,
      effects: [{ effectId: "ROOT", duration: 1 }, { effectId: "NINJUTSU_BLOCK", duration: 2 }],
    });
  });

  it("mantém o Selamento de Contrato como controle de contrato sem dano bruto", () => {
    const ability = getAbility("fuin_selamento_contrato")!;
    expect(ability.effects).toEqual([{ effectId: "CONTRACT_SEAL", duration: 2, chance: 0.85 }]);
    expect(ability.baseDamage).toBe(6);
  });

  it("abre a árvore pelo Método de Selamento de Fogo, com a Caligrafia de Selos logo abaixo", () => {
    const raizes = FUINJUTSU_TREE.filter((n) => n.requires.length === 0);
    expect(raizes.map((n) => n.id)).toEqual(["fuin_metodo_selamento_fogo"]);

    // `fuin_raiz` mantem o id antigo mas hoje e' o segundo no de Supressao
    const caligrafia = getNode("fuin_raiz")!;
    expect(caligrafia.name).toBe("Caligrafia de Selos");
    expect(caligrafia.kind).toBe("PASSIVE");
    expect(caligrafia.requires).toEqual(["fuin_metodo_selamento_fogo"]);

    // os dois galhos penduram na nova raiz
    expect(getNode("fuin_formacao_cordas_luz")!.requires).toEqual(["fuin_metodo_selamento_fogo"]);
    expect(getNode("fuin_traco_contencao")!.requires).toEqual(["fuin_raiz"]);
  });

  it("não deixa um nó exigir outro de nível mais alto que o próprio", () => {
    for (const node of FUINJUTSU_TREE) {
      for (const reqId of node.requires) {
        const parent = FUINJUTSU_TREE.find((n) => n.id === reqId);
        expect(parent, `${node.id} requer ${reqId} inexistente`).toBeTruthy();
        expect(parent!.reqLevel, `${node.id} vem antes de ${reqId}`).toBeLessThanOrEqual(node.reqLevel);
      }
    }
  });

  it("gasta um Pergaminho de Arsenal no Método de Selamento de Fogo", () => {
    const ability = getAbility("fuin_metodo_selamento_fogo")!;
    expect(ability.requiredItems).toEqual([
      { itemId: "pergaminho_arsenal", amount: 1, exhaustToItemId: "pergaminho_arsenal_gasto" },
    ]);
    expect(buildMechanicsSummary(ability)).toMatch(/Gasta 1x Pergaminho de Arsenal; restaure-o para usar novamente/);
  });
});
