import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes, getNode } from "../src/data/element-trees/index.js";
import { FUNDAMENTOS } from "../src/data/element-trees/fundamentals.js";
import {
  effectiveReqPool,
  lockReason,
  remainingBasicElements,
  type CharSnapshot,
} from "../src/services/characters/skill-tree.js";
import { clanStartingElement } from "../src/data/clans/starting-element.js";
import { ATTRIBUTES } from "../src/config/enums.js";

const ACADEMY_IDS = ["tecnica_clonagem", "tecnica_substituicao", "tecnica_caminhada_aquatica"] as const;

// orcamento folgado em TODOS os atributos: cada no paga com o seu proprio
// pool agora, entao um snapshot de teste precisa de saldo em todos eles.
const RICO = Object.fromEntries(ATTRIBUTES.map((a) => [a, 100]));

const snap = (over: Partial<CharSnapshot> = {}): CharSnapshot => ({
  charId: "c1",
  name: "Teste",
  level: 1,
  spentByPool: {},
  pointsByPool: {},
  elements: [],
  fightingStyles: new Set(),
  owned: new Set(),
  clanId: null,
  attributes: RICO,
  ...over,
});

describe("Fundamentos: integridade da arvore", () => {
  it("os 3 jutsus de Academia existem e concedem ability manualOnly", () => {
    for (const id of ACADEMY_IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ manualOnly: true });
    }
  });

  it("os 3 nós de Academia estão no índice global (sem depender de ELEMENT_TREES)", () => {
    for (const nodeId of ["funda_clonagem", "funda_substituicao", "funda_caminhada"]) {
      expect(getNode(nodeId), nodeId).toBeTruthy();
    }
    expect(allNodes().some((n) => n.id === "funda_elemento_5")).toBe(true);
  });

  it("nenhum nó de Fundamentos tem `element` — não pertencem a nenhuma natureza de chakra", () => {
    for (const n of FUNDAMENTOS) expect(n.element).toBeUndefined();
  });

  it("os 5 nós ELEMENT formam uma cadeia linear (cada um exige o anterior)", () => {
    const rolls = FUNDAMENTOS.filter((n) => n.kind === "ELEMENT");
    expect(rolls.map((n) => n.id)).toEqual([
      "funda_elemento_1",
      "funda_elemento_2",
      "funda_elemento_3",
      "funda_elemento_4",
      "funda_elemento_5",
    ]);
    expect(rolls[0]!.requires).toEqual(["funda_substituicao"]);
    for (let i = 1; i < rolls.length; i++) {
      expect(rolls[i]!.requires).toEqual([rolls[i - 1]!.id]);
    }
  });

  it("custo: 2 pontos cada técnica de Academia, 2 no primeiro elemento, 10 nos demais", () => {
    for (const id of ["funda_clonagem", "funda_substituicao", "funda_caminhada"]) {
      expect(getNode(id)!.cost, id).toBe(2);
    }
    expect(getNode("funda_elemento_1")!.cost).toBe(2);
    for (const id of ["funda_elemento_2", "funda_elemento_3", "funda_elemento_4", "funda_elemento_5"]) {
      expect(getNode(id)!.cost, id).toBe(10);
    }
  });
});

describe("Fundamentos: requisito efetivo", () => {
  it("inclui todo o custo obrigatorio do caminho no mesmo pool", () => {
    expect(effectiveReqPool(getNode("funda_clonagem")!)).toBe(2);
    expect(effectiveReqPool(getNode("funda_elemento_1")!)).toBe(6);
    expect(effectiveReqPool(getNode("funda_elemento_5")!)).toBe(46);
  });

  it("lockReason informa o requisito efetivo, nao o reqPool editorial menor", () => {
    const node = getNode("funda_elemento_5")!;
    const pobre = snap({
      owned: new Set(node.requires),
      attributes: { ...RICO, ninjutsu: 45 },
      pointsByPool: { ninjutsu: 10 },
    });
    expect(lockReason(pobre, node)).toMatch(/Ninjutsu 46/);
  });
});

describe("Fundamentos: lockReason não exige elemento", () => {
  it("um personagem sem elemento nenhum já pode comprar as técnicas de Academia", () => {
    const node = getNode("funda_clonagem")!;
    expect(lockReason(snap(), node)).toBeNull();
  });

  it("o roll de elemento exige a Substituição (espinha Clonagem → Substituição → Elemento)", () => {
    const node = getNode("funda_elemento_1")!;
    expect(lockReason(snap(), node)).toMatch(/Requer antes/);
    const comEspinha = snap({
      owned: new Set(["funda_clonagem", "funda_substituicao"]),
    });
    expect(lockReason(comEspinha, node)).toBeNull();
  });

  it("uma árvore elemental normal (ex: Fogo) continua exigindo o elemento", () => {
    const node = getNode("fogo_raiz")!;
    expect(lockReason(snap(), node)).toMatch(/Requer o elemento FOGO/);
  });
});

describe("remainingBasicElements", () => {
  it("começa com os 5 básicos, sem kekkei genkai", () => {
    const pool = remainingBasicElements([]);
    expect(pool.sort()).toEqual(["AGUA", "FOGO", "RAIO", "TERRA", "VENTO"].sort());
    expect(pool).not.toContain("CRISTAL");
  });

  it("encolhe conforme elementos são concedidos", () => {
    expect(remainingBasicElements(["FOGO", "AGUA"]).sort()).toEqual(["RAIO", "TERRA", "VENTO"].sort());
  });

  it("fica vazio depois dos 5", () => {
    expect(remainingBasicElements(["FOGO", "AGUA", "VENTO", "TERRA", "RAIO"])).toEqual([]);
  });
});

describe("clanStartingElement: primeiro elemento vem do cla", () => {
  it("cla mapeado devolve seu elemento canonico", () => {
    expect(clanStartingElement("uchiha", [])).toBe("FOGO");
    expect(clanStartingElement("hatake", [])).toBe("RAIO");
    expect(clanStartingElement("onoki", [])).toBe("TERRA");
  });

  it("cla sem natureza canonica sorteia (null = chamador sorteia)", () => {
    for (const c of ["nara", "hyuuga", "lee", "inuzuka"]) {
      expect(clanStartingElement(c, []), c).toBeNull();
    }
  });

  it("sem cla sorteia", () => {
    expect(clanStartingElement(null, [])).toBeNull();
  });

  it("se o personagem ja tem o elemento do cla, cai no sorteio", () => {
    expect(clanStartingElement("uchiha", ["FOGO"])).toBeNull();
  });
});

describe("Técnica de Substituição: reação DODGE com bônus próprio", () => {
  it("tem reactionKind DODGE e reactionDodgeBonus alto", () => {
    const ab = getAbility("tecnica_substituicao")!;
    expect(ab.actionType).toBe("REACAO");
    expect(ab.reactionKind).toBe("DODGE");
    expect(ab.reactionDodgeBonus).toBeCloseTo(0.2);
  });
});

describe("Técnica de Clonagem: buff de esquiva via tag", () => {
  it("é SELF, sem dano, com a tag 'buff' que a engine lê", () => {
    const ab = getAbility("tecnica_clonagem")!;
    expect(ab.shape).toBe("SELF");
    expect(ab.baseDamage).toBeUndefined();
    expect(ab.tags).toContain("buff");
  });
});

describe("Técnica da Caminhada Aquática", () => {
  it("não tem custo de cast — o gasto real é o upkeep por turno", () => {
    const ab = getAbility("tecnica_caminhada_aquatica")!;
    expect(ab.cost).toBe(0);
  });
});
