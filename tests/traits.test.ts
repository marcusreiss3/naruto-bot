import { describe, it, expect } from "vitest";
import { TRAITS, TRAIT_BUDGET, getTrait, getTraitPassive, traitsByRarity } from "../src/data/traits.js";
import { TRAIT_RARITIES } from "../src/config/enums.js";
import { characterPassiveMods, passiveMods } from "../src/services/combat/passives.js";
import { getPassive } from "../src/data/element-trees/passives.js";
import { getClanPassive } from "../src/data/clan-trees/passives.js";
import { effectiveNodeCost, viewTree } from "../src/services/characters/skill-tree.js";

describe("catalogo de traits", () => {
  it("ids sao unicos", () => {
    const ids = TRAITS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo id tem prefixo trait_", () => {
    for (const t of TRAITS) expect(t.id.startsWith("trait_")).toBe(true);
  });

  // O id da trait entra no MESMO array que os nos de arvore. Se colidisse com
  // um nodeId real, getPassive() venceria o lookup e a trait sumiria em
  // silencio — o jogador teria a trait e receberia a passiva errada.
  it("nenhum id colide com no' de arvore ou de cla", () => {
    for (const t of TRAITS) {
      expect(getPassive(t.id), `${t.id} colide com passiva de arvore`).toBeUndefined();
      expect(getClanPassive(t.id), `${t.id} colide com passiva de cla`).toBeUndefined();
    }
  });

  it("todo PP cabe no orcamento da raridade", () => {
    for (const t of TRAITS) {
      const faixa = TRAIT_BUDGET[t.rarity];
      expect(t.pp, `${t.id} (${t.rarity})`).toBeGreaterThanOrEqual(faixa.min);
      expect(t.pp, `${t.id} (${t.rarity})`).toBeLessThanOrEqual(faixa.max);
    }
  });

  it("toda raridade tem pelo menos uma trait", () => {
    for (const r of TRAIT_RARITIES) expect(traitsByRarity(r).length).toBeGreaterThan(0);
  });

  it("toda trait tem descricao", () => {
    for (const t of TRAITS) expect(t.description.trim().length).toBeGreaterThan(0);
  });

  // Trait com `mods` vazio compila e nunca faz nada: o jogador ganharia uma
  // linha no /perfil e zero efeito.
  it("nenhuma trait tem mods vazio", () => {
    for (const t of TRAITS) expect(Object.keys(t.mods).length, t.id).toBeGreaterThan(0);
  });
});

describe("traits entram pelo sistema de passivas", () => {
  it("getTraitPassive devolve um PassiveDef com nodeId = id da trait", () => {
    const t = TRAITS[0]!;
    expect(getTraitPassive(t.id)).toEqual({ nodeId: t.id, ...t.mods });
  });

  it("id desconhecido nao vira passiva", () => {
    expect(getTraitPassive("trait_que_nao_existe")).toBeUndefined();
    expect(getTrait("trait_que_nao_existe")).toBeUndefined();
  });

  it("characterPassiveMods le a trait como leria um no'", () => {
    const faro = getTrait("trait_faro_para_negocios")!;
    const mods = characterPassiveMods([faro.id]);
    expect(mods.ryoBonus).toBe(0.25);
    expect(mods.itemCostReduction).toBe(1);
  });

  it("passiveMods aplica a trait de dano na categoria certa", () => {
    const esp = getTrait("trait_especialista_ninjutsu")!;
    const ninjutsu = { id: "x", category: "NINJUTSU", scalingAttribute: "ninjutsu" } as never;
    const taijutsu = { id: "y", category: "TAIJUTSU", scalingAttribute: "taijutsu" } as never;
    expect(passiveMods([esp.id], ninjutsu).damageMult).toBe(1.1);
    expect(passiveMods([esp.id], taijutsu).damageMult).toBe(1);
  });

  // Selo e' category NINJUTSU mas escala por `fuinjutsu`. Sem este corte, a
  // trait de 2 PP buffaria a arvore de Fuinjutsu inteira de brinde.
  it("Especialista em Ninjutsu nao pega selo de Fuinjutsu", () => {
    const selo = { id: "z", category: "NINJUTSU", scalingAttribute: "fuinjutsu" } as never;
    expect(passiveMods(["trait_especialista_ninjutsu"], selo).damageMult).toBe(1);
  });
});

describe("Fantasma do Cla (trait_herdeiro_de_sangue)", () => {
  const herdeiro = "trait_herdeiro_de_sangue";

  it("cobra PN a mais em no' que nao e' do cla do personagem", () => {
    const ctx = { clanId: "hyuuga", traitId: herdeiro };
    const penalidade = characterPassiveMods([herdeiro]).offClanNodeCostPenalty;
    expect(penalidade).toBeGreaterThan(0);
    // no' de arvore generica (sem clanId) paga a penalidade
    expect(effectiveNodeCost({ cost: 3 }, ctx)).toBe(3 + penalidade);
    // no' de OUTRO cla tambem paga
    expect(effectiveNodeCost({ cost: 3, clanId: "uchiha" }, ctx)).toBe(3 + penalidade);
    // no' do PROPRIO cla nao paga
    expect(effectiveNodeCost({ cost: 3, clanId: "hyuuga" }, ctx)).toBe(3);
  });

  it("sem trait, o custo do no' e' o custo declarado", () => {
    expect(effectiveNodeCost({ cost: 3 }, { clanId: "hyuuga", traitId: null })).toBe(3);
  });

  it("outra trait nao mexe no custo de no'", () => {
    const outra = "trait_faro_para_negocios";
    expect(effectiveNodeCost({ cost: 3 }, { clanId: "hyuuga", traitId: outra })).toBe(3);
  });

  // O site le NodeView.cost. Se ele viesse do SkillNodeDef cru, o no' diria
  // "3" e sumiriam 4 pontos da bolsa na hora da compra.
  it("a arvore exibida mostra o custo ja' inflado", () => {
    const base = (traitId: string | null) =>
      viewTree(
        {
          charId: "t", name: "T", level: 45,
          spentByPool: {}, pointsByPool: {}, attributes: {},
          elements: ["FOGO"], fightingStyles: new Set(), owned: new Set(),
          clanId: "hyuuga", traitId,
        },
        "FOGO",
      );
    const semTrait = base(null);
    const comTrait = base(herdeiro);
    const penalidade = characterPassiveMods([herdeiro]).offClanNodeCostPenalty;
    expect(semTrait.length).toBeGreaterThan(0);
    for (const [i, node] of comTrait.entries()) {
      // arvore elemental nao e' de cla nenhum: todo no' paga a penalidade
      expect(node.cost, node.id).toBe(semTrait[i]!.cost + penalidade);
    }
  });
});
