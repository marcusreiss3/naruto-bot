import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";

const IDS = [
  "raikage_deslocamento",
  "raikage_armadura",
  "raikage_relampago_reto",
  "raikage_lariat",
  "raikage_guilhotina",
  "raikage_corte_horizontal",
  "raikage_bomba_liger",
] as const;

describe("Raikage: integridade da arvore de cla", () => {
  it("liga os sete jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "raikage" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem o clã Raikage e compra manual (não auto-desbloqueiam por atributo)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "raikage", manualOnly: true });
    }
  });

  it("as duas passivas (raiz, ápice) têm definição", () => {
    const nodesPassivos = allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "raikage");
    const semDef = nodesPassivos.filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id)).map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(nodesPassivos.length).toBe(2);
  });

  it("categoria reflete a natureza real: golpes físicos são TAIJUTSU, chakra puro é NINJUTSU (nada de 'CLA' genérico)", () => {
    const taijutsu = [
      "raikage_relampago_reto",
      "raikage_lariat",
      "raikage_guilhotina",
      "raikage_corte_horizontal",
      "raikage_bomba_liger",
    ];
    for (const id of taijutsu) expect(getAbility(id)!.category, id).toBe("TAIJUTSU");
    for (const id of ["raikage_deslocamento", "raikage_armadura"]) {
      expect(getAbility(id)!.category, id).toBe("NINJUTSU");
    }
  });

  it("só as quatro técnicas claramente elétricas também recebem o elemento Raio", () => {
    const eletricas = [
      "raikage_deslocamento",
      "raikage_armadura",
      "raikage_relampago_reto",
      "raikage_corte_horizontal",
    ];
    const fisicas = ["raikage_lariat", "raikage_guilhotina", "raikage_bomba_liger"];

    for (const id of eletricas) expect(getAbility(id)!.element, id).toBe("RAIO");
    for (const id of fisicas) expect(getAbility(id)!.element, id).toBeUndefined();
  });

  it("passivas elementais de Raio afetam golpes elétricos, mas não os físicos", () => {
    const reto = getAbility("raikage_relampago_reto")!;
    const lariat = getAbility("raikage_lariat")!;
    expect(passiveMods(["raio_raiz"], reto).damageMult).toBeCloseTo(1.15);
    expect(passiveMods(["raio_raiz"], lariat).damageMult).toBe(1);
  });

  it("pool padrão é Taijutsu, com override pra Ninjutsu só no Deslocamento e na Armadura", () => {
    for (const n of CLAN_TREES.raikage!) {
      if (n.id === "raikage_deslocamento" || n.id === "raikage_armadura") {
        expect(n.pool, n.id).toBe("ninjutsu");
      } else {
        expect(n.pool, n.id).toBe("taijutsu");
      }
      expect(n.reqAttribute, n.id).toBeUndefined();
    }
  });

  it("tronco reto (raiz -> Deslocamento -> Armadura -> Relâmpago Reto) até o fork", () => {
    const order = ["raikage_raiz", "raikage_deslocamento", "raikage_armadura", "raikage_relampago_reto"];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("fork saindo de Relâmpago Reto: Golpes (col -1, Lariat -> Corte Horizontal) e Queda (col +1, só Guilhotina)", () => {
    const lariat = allNodes().find((n) => n.id === "raikage_lariat")!;
    const guilhotina = allNodes().find((n) => n.id === "raikage_guilhotina")!;
    expect(lariat.requires).toEqual(["raikage_relampago_reto"]);
    expect(guilhotina.requires).toEqual(["raikage_relampago_reto"]);
    expect(lariat.col).toBe(-1);
    expect(guilhotina.col).toBe(1);

    const corteHorizontal = allNodes().find((n) => n.id === "raikage_corte_horizontal")!;
    expect(corteHorizontal.requires).toEqual(["raikage_lariat"]);

    const dependentesDeGuilhotina = allNodes().filter((n) => n.requires.includes("raikage_guilhotina"));
    expect(dependentesDeGuilhotina.map((n) => n.id)).toEqual(["raikage_apice"]);
  });

  it("os dois ramos convergem no ápice antes da Bomba Liger", () => {
    const apice = allNodes().find((n) => n.id === "raikage_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["raikage_corte_horizontal", "raikage_guilhotina"]));
    expect(apice.col).toBe(0);

    const bomba = allNodes().find((n) => n.id === "raikage_bomba_liger")!;
    expect(bomba.requires).toEqual(["raikage_apice"]);
  });

  it("custo total fecha em 35 pontos — entre o Aburame (33) e o Nara (36)", () => {
    const total = CLAN_TREES.raikage!.reduce((a, n) => a + n.cost, 0);
    expect(total).toBe(35);
  });

  it("clã Raikage existe e referencia os sete jutsus em activeIds", () => {
    const clan = getClan("raikage");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Raikage: Bomba Liger — finalizador de agarrão, impossível de reagir", () => {
  const bomba = getAbility("raikage_bomba_liger")!;

  it("unblockable (bloqueio, aparo E esquiva não adiantam) e é o jutsu de maior dano do clã", () => {
    expect(bomba.unblockable).toBe(true);
    for (const id of IDS.filter((i) => i !== "raikage_bomba_liger")) {
      expect(bomba.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });

  it("tem chance de Atordoar depois do impacto", () => {
    expect(bomba.effects).toEqual([{ effectId: "STUN", duration: 1, chance: 0.5 }]);
  });
});

describe("Raikage: Relâmpago Reto — rápido demais pra esquivar", () => {
  const reto = getAbility("raikage_relampago_reto")!;

  it("undodgeable, mas ainda dá pra bloquear/aparar (diferente da Bomba Liger)", () => {
    expect(reto.undodgeable).toBe(true);
    expect(reto.unblockable).toBeFalsy();
  });
});

describe("Raikage: Deslocamento Instantâneo e Armadura de Raio — buffs de Aceleração", () => {
  it("Deslocamento é a versão curta (2 rodadas), Armadura é a sustentada (4 rodadas)", () => {
    const deslocamento = getAbility("raikage_deslocamento")!;
    const armadura = getAbility("raikage_armadura")!;
    expect(deslocamento.effects).toEqual([{ effectId: "HASTE", duration: 2 }]);
    expect(armadura.effects).toEqual([{ effectId: "HASTE", duration: 4 }]);
    expect(deslocamento.shape).toBe("SELF");
    expect(armadura.shape).toBe("SELF");
  });
});

describe("Raikage: passivas — dano de graça na raiz, ápice de execução (sem multiplicador extra)", () => {
  const lariat = getAbility("raikage_lariat")!;

  it("Sangue de Raikage dá +30% de dano e corta 10% de custo", () => {
    const m = passiveMods(["raikage_raiz"], lariat);
    expect(m.damageMult).toBeCloseTo(1.3);
    expect(m.costMult).toBeCloseTo(0.9);
  });

  it("Fúria do Raikage (ápice) é só execução — sem damageMult extra", () => {
    const p = CLAN_PASSIVES.find((x) => x.nodeId === "raikage_apice")!;
    expect(p.damageMult).toBeUndefined();
    expect(p.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.25 });
  });

  it("nenhuma passiva de Raikage afeta jutsu de outro clã", () => {
    const possessao = getAbility("nara_possessao")!;
    expect(passiveMods(["raikage_raiz"], possessao).damageMult).toBe(1);
    expect(passiveMods(["nara_raiz"], lariat).damageMult).toBe(1);
  });
});
