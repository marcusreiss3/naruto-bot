import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";
import { empoweredDamageMult, type EffectState } from "../src/services/combat/effects.js";

const IDS = ["hozuki_hidratacao", "hozuki_braco_agua", "hozuki_revolver_agua", "hozuki_tate_eboshi"] as const;

describe("Hozuki: integridade da arvore de cla", () => {
  it("liga os quatro jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "hozuki" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Hozuki tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.hozuki!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Hozuki e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "hozuki", manualOnly: true });
    }
  });

  it("todos os quatro são categoria NINJUTSU — o clã não nasce com espada, sem jutsu de Kenjutsu aqui", () => {
    for (const id of IDS) expect(getAbility(id)!.category, id).toBe("NINJUTSU");
  });

  it("as quatro passivas (raiz, meio de água, 2 de Kenjutsu) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "hozuki")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "hozuki").length).toBe(4);
  });

  it("tronco de água reto (col 0/-1), sem exigir nada da ramificação de Kenjutsu", () => {
    const order = [
      { id: "hozuki_raiz", col: 0 },
      { id: "hozuki_hidratacao", col: 0 },
      { id: "hozuki_braco_agua", col: 0 },
      { id: "hozuki_revolver_agua", col: -1 },
      { id: "hozuki_fluidez", col: -1 },
      { id: "hozuki_tate_eboshi", col: 0 },
    ];
    for (let i = 1; i < order.length; i++) {
      const cur = order[i]!;
      const prev = order[i - 1]!;
      const node = allNodes().find((n) => n.id === cur.id)!;
      expect(node.requires, cur.id).toEqual([prev.id]);
      expect(node.col, cur.id).toBe(cur.col);
    }
  });

  it("a ramificação de Kenjutsu sai de Grande Braço de Água (col +1) e termina em beco sem saída", () => {
    const lamina = allNodes().find((n) => n.id === "hozuki_lamina_liquida")!;
    const corte = allNodes().find((n) => n.id === "hozuki_corte_sem_peso")!;
    expect(lamina.col).toBe(1);
    expect(corte.col).toBe(1);
    expect(lamina.requires).toEqual(["hozuki_braco_agua"]);
    expect(corte.requires).toEqual(["hozuki_lamina_liquida"]);

    const dependentesDeLamina = allNodes().filter((n) => n.requires.includes("hozuki_lamina_liquida"));
    expect(dependentesDeLamina.map((n) => n.id)).toEqual(["hozuki_corte_sem_peso"]);
    const dependentesDeCorte = allNodes().filter((n) => n.requires.includes("hozuki_corte_sem_peso"));
    expect(dependentesDeCorte).toEqual([]);
  });

  it("Lâmina Líquida e Corte Sem Peso também pedem Kenjutsu — multiplicam dano de espada, fazem sentido exigir espada", () => {
    const lamina = allNodes().find((n) => n.id === "hozuki_lamina_liquida")!;
    const corte = allNodes().find((n) => n.id === "hozuki_corte_sem_peso")!;
    expect(lamina.reqAttribute?.attribute).toBe("kenjutsu");
    expect(corte.reqAttribute?.attribute).toBe("kenjutsu");
  });

  it("clã Hozuki existe e referencia as quatro habilidades em activeIds", () => {
    const clan = getClan("hozuki");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Hozuki: Hidratação — reação que anula golpe físico", () => {
  const hidratacao = getAbility("hozuki_hidratacao")!;

  it("é reação de esquiva, sem custo de dano — o golpe atravessa ileso", () => {
    expect(hidratacao.actionType).toBe("REACAO");
    expect(hidratacao.reactionKind).toBe("DODGE");
    expect(hidratacao.reactionDodgeBonus).toBeGreaterThan(0);
  });
});

describe("Hozuki: Tate Eboshi — finalizador, onda gigante em área", () => {
  const eboshi = getAbility("hozuki_tate_eboshi")!;

  it("não pode ser esquivada e é o jutsu mais forte do clã", () => {
    expect(eboshi.undodgeable).toBe(true);
    for (const id of IDS.filter((i) => i !== "hozuki_tate_eboshi")) {
      expect(eboshi.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });

  it("exige só o tronco de água (Fluidez), não a ramificação de Kenjutsu", () => {
    const node = allNodes().find((n) => n.id === "hozuki_tate_eboshi")!;
    expect(node.requires).toEqual(["hozuki_fluidez"]);
  });
});

describe("Hozuki: passivas — regeneração/fluidez + Kenjutsu em ramo separado", () => {
  const revolver = getAbility("hozuki_revolver_agua")!;

  it("nenhuma passiva de Hozuki multiplica dano bruto no tronco (clã sobrevive por fluidez/regen, não força)", () => {
    const troncoEKenjutsu = CLAN_PASSIVES.filter((p) => p.clanId === "hozuki");
    const raiz = troncoEKenjutsu.find((p) => p.nodeId === "hozuki_raiz")!;
    const fluidez = troncoEKenjutsu.find((p) => p.nodeId === "hozuki_fluidez")!;
    expect("damageMult" in raiz).toBe(false);
    expect("damageMult" in fluidez).toBe(false);
  });

  it("Corpo Líquido corta 10% do custo e regenera vida no início do turno", () => {
    const m = passiveMods(["hozuki_raiz"], revolver);
    expect(m.costMult).toBeCloseTo(0.9);
    const c = characterPassiveMods(["hozuki_raiz"]);
    expect(c.hpRegenPerTurn).toBe(4);
  });

  it("Fluidez soma chance de Encharcar e alcance em jutsu à distância", () => {
    const m = passiveMods(["hozuki_fluidez"], revolver); // Revólver é SINGLE_TARGET
    expect(m.effectChanceBonus.WET).toBeCloseTo(0.2);
    expect(m.rangeBonus).toBe(1);

    const bracoSelf = getAbility("hozuki_braco_agua")!; // SELF, fora de rangeShapes
    expect(passiveMods(["hozuki_fluidez"], bracoSelf).rangeBonus).toBe(0);
  });

  it("Lâmina Líquida e Corte Sem Peso (separadas) não afetam os jutsus de água do próprio clã", () => {
    const lamina = CLAN_PASSIVES.find((p) => p.nodeId === "hozuki_lamina_liquida")!;
    const corte = CLAN_PASSIVES.find((p) => p.nodeId === "hozuki_corte_sem_peso")!;
    expect(lamina.damageMult).toBeCloseTo(1.15);
    expect(lamina.damageMultScalingAttribute).toBe("kenjutsu");
    expect(corte.ignoresShield).toBe(true);
    expect(corte.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.15 });

    for (const id of IDS) expect(getAbility(id)!.scalingAttribute).not.toBe("kenjutsu");
    expect(passiveMods(["hozuki_lamina_liquida", "hozuki_corte_sem_peso"], revolver).damageMult).toBe(1);
  });

  it("nenhuma passiva de Hozuki afeta jutsu de outro clã, nem jutsu de outro elemento", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["hozuki_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], revolver).costMult).toBe(1);
    expect(passiveMods(["hozuki_raiz"], bola).costMult).toBe(1);
  });
});

describe("Hozuki: são Suiton de verdade — a passiva de Água (Fluxo Constante) empilha com a do próprio clã", () => {
  const revolver = getAbility("hozuki_revolver_agua")!;

  it("todos os quatro têm element: AGUA, além de requirements.clanId", () => {
    for (const id of IDS) expect(getAbility(id)!.element, id).toBe("AGUA");
  });

  it("Fluxo Constante (agua_raiz) sozinha já dá dano/custo aos jutsus de água do clã", () => {
    const m = passiveMods(["agua_raiz"], revolver);
    expect(m.damageMult).toBeCloseTo(1.15);
    expect(m.costMult).toBeCloseTo(0.85);
  });

  it("as duas passivas empilham quando o personagem tem as duas árvores (Água + Hozuki) — custo, não dano (Hozuki não dá dano de graça)", () => {
    const m = passiveMods(["agua_raiz", "hozuki_raiz"], revolver);
    expect(m.damageMult).toBeCloseTo(1.15); // só a de Água multiplica dano
    expect(m.costMult).toBeCloseTo(0.85 * 0.9);
  });

  it("outra passiva elemental (ex: Fogo) continua sem efeito nos jutsus do clã", () => {
    expect(passiveMods(["fogo_raiz"], revolver).damageMult).toBe(1);
  });
});

describe("Hozuki: EMPOWERED de Grande Braço de Água é FÍSICO só — engrossar o braço não deveria turbinar ninjutsu elemental", () => {
  it("nasce escopado como 'physical'", () => {
    const braco = getAbility("hozuki_braco_agua")!;
    expect(braco.effects!.find((e) => e.effectId === "EMPOWERED")!.empoweredScope).toBe("physical");
  });

  it("EMPOWERED escopado como 'physical' só multiplica TAIJUTSU/BUKIJUTSU, não NINJUTSU/GENJUTSU", () => {
    const comEscopo: EffectState[] = [
      { effectId: "EMPOWERED", stacks: 1, duration: 3, dataJson: JSON.stringify({ empoweredScope: { kind: "physical" } }) },
    ];
    expect(empoweredDamageMult(comEscopo, { category: "TAIJUTSU" })).toBeGreaterThan(1);
    expect(empoweredDamageMult(comEscopo, { category: "NINJUTSU" })).toBe(1);
  });
});
