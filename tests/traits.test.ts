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

describe("nenhuma trait mexe na economia de progressao", () => {
  // Regra 2 do TRAITS.txt. A Fantasma do Cla cobrava +1 PN em todo no' fora do
  // cla; medindo, eram 267 nos com custo medio 3,69 PN virando 4,69, ou seja
  // 27% menos arvore comprada pelo resto do jogo — contra um ganho de ~+10% de
  // dano num escopo estreito. Como 1 PP = 1 ponto de no', efeito de +-1 PN
  // sobre centenas de nos vale dezenas de PP, e a regua so' olha numeros de
  // combate: nao ha' como precificar isso direito. A mecanica continua no
  // motor, mas trait nenhuma pode usar.
  it("nenhuma trait declara offClanNodeCostPenalty", () => {
    for (const t of TRAITS) {
      expect(
        characterPassiveMods([t.id]).offClanNodeCostPenalty,
        `${t.id} (${t.name}) mexe no custo de no' — ver regra 2 do TRAITS.txt`,
      ).toBe(0);
    }
  });

  it("o custo do no' e' sempre o declarado, com ou sem trait", () => {
    const ctx = (traitId: string | null) => ({ clanId: "hyuuga", traitId });
    expect(effectiveNodeCost({ cost: 3 }, ctx(null))).toBe(3);
    for (const t of TRAITS) {
      expect(effectiveNodeCost({ cost: 3 }, ctx(t.id)), t.id).toBe(3);
      expect(effectiveNodeCost({ cost: 3, clanId: "uchiha" }, ctx(t.id)), t.id).toBe(3);
    }
  });

  // O site le NodeView.cost, que e' o custo EFETIVO e nao o do SkillNodeDef.
  // Hoje os dois coincidem; o teste trava a coincidencia pra que reintroduzir
  // um custo por personagem quebre aqui em vez de sumir pontos da bolsa do
  // jogador em silencio.
  it("a arvore exibida mostra o mesmo custo com qualquer trait", () => {
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
    const comTrait = base("trait_herdeiro_de_sangue");
    expect(semTrait.length).toBeGreaterThan(0);
    for (const [i, node] of comTrait.entries()) {
      expect(node.cost, node.id).toBe(semTrait[i]!.cost);
    }
  });
});

describe("Fantasma do Cla (trait_herdeiro_de_sangue)", () => {
  const herdeiro = getTrait("trait_herdeiro_de_sangue")!;

  it("amplifica o BONUS da passiva de cla, nao o multiplicador inteiro", () => {
    const amp = characterPassiveMods([herdeiro.id]).clanPassiveAmplifier;
    expect(amp).toBe(0.30);
    // uma passiva de cla que dava +20% passa a dar +26%, nao +52%
    expect(1 + (1.20 - 1) * (1 + amp)).toBeCloseTo(1.26, 5);
  });

  // Regra 1 do TRAITS.txt: toda trait de faixa alta carrega dano ou vida. Sem
  // isso o jogador nao sente a trait, por mais correta que a conta esteja.
  it("carrega dano e vida proprios", () => {
    expect(herdeiro.mods.damageMult).toBe(1.15);
    expect(herdeiro.mods.maxHpBonus).toBe(0.15);
  });
});

describe("faixa alta carrega dano ou vida (regra 1)", () => {
  it("toda lendaria e mitica tem damageMult ou maxHpBonus", () => {
    for (const t of TRAITS) {
      if (t.rarity !== "LENDARIA" && t.rarity !== "MITICA") continue;
      const m = characterPassiveMods([t.id]);
      const temDano = t.mods.damageMult !== undefined || t.mods.rampDamageCap !== undefined;
      expect(
        temDano || m.maxHpBonus !== 0,
        `${t.id} (${t.name}) e' ${t.rarity} sem dano nem vida — ver regra 1 do TRAITS.txt`,
      ).toBe(true);
    }
  });
});
