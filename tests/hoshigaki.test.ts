import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";

const IDS = [
  "hoshigaki_bomba_tubarao",
  "hoshigaki_cinco_tubaroes",
  "hoshigaki_esfera_selvagem",
  "hoshigaki_mil_tubaroes",
  "hoshigaki_grande_bomba",
] as const;

describe("Hoshigaki: integridade da arvore de cla", () => {
  it("liga os cinco jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "hoshigaki" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Hoshigaki tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.hoshigaki!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Hoshigaki e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "hoshigaki", manualOnly: true });
    }
  });

  it("todos os cinco são categoria NINJUTSU — o clã não nasce com espada, sem jutsu de Kenjutsu aqui", () => {
    for (const id of IDS) expect(getAbility(id)!.category, id).toBe("NINJUTSU");
  });

  it("as quatro passivas (raiz, meio de tubarão, 2 de Kenjutsu) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "hoshigaki")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "hoshigaki").length).toBe(4);
  });

  it("tronco de tubarão é reto (col 0), sem exigir nada da ramificação de Kenjutsu", () => {
    const order = [
      "hoshigaki_raiz",
      "hoshigaki_bomba_tubarao",
      "hoshigaki_cinco_tubaroes",
      "hoshigaki_fome_voraz",
      "hoshigaki_esfera_selvagem",
      "hoshigaki_mil_tubaroes",
      "hoshigaki_grande_bomba",
    ];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("a ramificação de Kenjutsu sai de Cinco Tubarões (col +1) e termina em beco sem saída", () => {
    const fio = allNodes().find((n) => n.id === "hoshigaki_fio_afiado")!;
    const golpe = allNodes().find((n) => n.id === "hoshigaki_golpe_certeiro")!;
    expect(fio.col).toBe(1);
    expect(golpe.col).toBe(1);
    expect(fio.requires).toEqual(["hoshigaki_cinco_tubaroes"]);
    expect(golpe.requires).toEqual(["hoshigaki_fio_afiado"]);

    // nada FORA da própria ramificação exige a ramificação de Kenjutsu —
    // só golpe_certeiro (o próximo elo da própria corrente) exige fio_afiado.
    const dependentesDeFio = allNodes().filter((n) => n.requires.includes("hoshigaki_fio_afiado"));
    expect(dependentesDeFio.map((n) => n.id)).toEqual(["hoshigaki_golpe_certeiro"]);
    const dependentesDeGolpe = allNodes().filter((n) => n.requires.includes("hoshigaki_golpe_certeiro"));
    expect(dependentesDeGolpe).toEqual([]);
  });

  it("Fio Afiado e Golpe Certeiro saem do pool de Kenjutsu — multiplicam dano de espada, então são pagos com espada", () => {
    const fio = allNodes().find((n) => n.id === "hoshigaki_fio_afiado")!;
    const golpe = allNodes().find((n) => n.id === "hoshigaki_golpe_certeiro")!;
    expect(fio.pool).toBe("kenjutsu");
    expect(golpe.pool).toBe("kenjutsu");
  });

  it("os jutsus de suiton saem do pool de Ninjutsu, sem reqAttribute cruzado", () => {
    for (const id of IDS) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.pool, id).toBe("ninjutsu");
      expect(node.reqAttribute, id).toBeUndefined();
    }
  });

  it("clã Hoshigaki existe e referencia as cinco habilidades em activeIds", () => {
    const clan = getClan("hoshigaki");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Hoshigaki: Grande Bomba do Tubarão de Água — absorve chakra, finalizador", () => {
  const bomba = getAbility("hoshigaki_grande_bomba")!;

  it("ignora Bloqueio e Aparo, mas pode ser esquivada e drena chakra do alvo", () => {
    expect(bomba.unguardable).toBe(true);
    expect(bomba.undodgeable).toBeFalsy();
    expect(bomba.effects!.some((e) => e.effectId === "CHAKRA_DRAIN")).toBe(true);
  });

  it("a descrição usa a frase do glossário para ignorar defesa", () => {
    expect(bomba.description).toMatch(/ignora bloqueio e aparo/i);
  });

  it("é o jutsu mais forte do clã (maior baseDamage)", () => {
    for (const id of IDS.filter((i) => i !== "hoshigaki_grande_bomba")) {
      expect(bomba.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });

  it("exige só o tronco de tubarão (Mil Tubarões), não a ramificação de Kenjutsu", () => {
    const node = allNodes().find((n) => n.id === "hoshigaki_grande_bomba")!;
    expect(node.requires).toEqual(["hoshigaki_mil_tubaroes"]);
  });
});

describe("Hoshigaki: passivas — dano de graça + Kenjutsu em ramo separado, mais fraco quando dividido", () => {
  const cinco = getAbility("hoshigaki_cinco_tubaroes")!;

  it("Sangue de Tubarão dá dano de graça (diferente de Nara/Hyuuga/Aburame) e corta custo", () => {
    const m = passiveMods(["hoshigaki_raiz"], cinco);
    expect(m.damageMult).toBeCloseTo(1.10);
    expect(m.costMult).toBeCloseTo(0.9);
  });

  it("Fome Voraz soma chance de Sangramento e alcance em jutsu de área", () => {
    const m = passiveMods(["hoshigaki_fome_voraz"], cinco); // Cinco Tubarões é CONE
    expect(m.damageMult).toBeCloseTo(1.2);
    expect(m.effectChanceBonus.BLEED).toBeCloseTo(0.15);
    expect(m.rangeBonus).toBe(1);

    const bombaLinha = getAbility("hoshigaki_bomba_tubarao")!; // LINE, fora de rangeShapes
    expect(passiveMods(["hoshigaki_fome_voraz"], bombaLinha).rangeBonus).toBe(0);
  });

  it("Fio Afiado e Golpe Certeiro (separadas) são mais fracas que a antiga passiva única, mesmo somadas", () => {
    const fio = CLAN_PASSIVES.find((p) => p.nodeId === "hoshigaki_fio_afiado")!;
    const golpe = CLAN_PASSIVES.find((p) => p.nodeId === "hoshigaki_golpe_certeiro")!;
    expect(fio.damageMult).toBeCloseTo(1.15); // era 1.3
    // escopo por CATEGORIA (não por scalingAttribute): espada nova nasce coberta
    expect(fio.crossCategory).toBe("KENJUTSU");
    expect(fio.damageMultScalingAttribute).toBeUndefined();
    expect(golpe.ignoresShield).toBe(true);
    expect(golpe.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.15 }); // era 1.25
    // não há stacking multiplicativo de damageMult: só Fio Afiado tem o campo
    expect(golpe.damageMult).toBeUndefined();
  });

  it("as duas de Kenjutsu não afetam os jutsus de tubarão do próprio clã (escalam por ninjutsu, não kenjutsu)", () => {
    for (const id of IDS) expect(getAbility(id)!.scalingAttribute).not.toBe("kenjutsu");
    expect(passiveMods(["hoshigaki_fio_afiado", "hoshigaki_golpe_certeiro"], cinco).damageMult).toBe(1);
  });

  it("nenhuma passiva de Hoshigaki afeta jutsu de outro clã, nem jutsu de outro elemento", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["hoshigaki_raiz"], possessao).damageMult).toBe(1);
    expect(passiveMods(["nara_raiz"], cinco).damageMult).toBe(1);
    expect(passiveMods(["hoshigaki_raiz"], bola).damageMult).toBe(1);
  });
});

describe("Hoshigaki: são Suiton de verdade — a passiva de Água (Fluxo Constante) empilha com a do próprio clã", () => {
  const cinco = getAbility("hoshigaki_cinco_tubaroes")!;

  it("todos os cinco têm element: AGUA, além de requirements.clanId", () => {
    for (const id of IDS) expect(getAbility(id)!.element, id).toBe("AGUA");
  });

  it("Fluxo Constante (agua_raiz) sozinha já dá dano/custo aos jutsus de tubarão", () => {
    const m = passiveMods(["agua_raiz"], cinco);
    expect(m.damageMult).toBeCloseTo(1.15);
    expect(m.costMult).toBeCloseTo(0.85);
  });

  it("as duas passivas empilham quando o personagem tem as duas árvores (Água + Hoshigaki)", () => {
    const m = passiveMods(["agua_raiz", "hoshigaki_raiz"], cinco);
    expect(m.damageMult).toBeCloseTo(1.15 * 1.10);
    expect(m.costMult).toBeCloseTo(0.85 * 0.9);
  });

  it("outra passiva elemental (ex: Fogo) continua sem efeito nos jutsus do clã", () => {
    expect(passiveMods(["fogo_raiz"], cinco).damageMult).toBe(1);
  });
});
