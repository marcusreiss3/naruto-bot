import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";
import { computeDamage } from "../src/services/combat/combat-math.js";
import { effectsLanded } from "../src/services/combat/effects.js";

const IDS = ["uzumaki_regeneracao", "uzumaki_correntes"] as const;
const PASSIVE_IDS = ["uzumaki_raiz", "uzumaki_reservas", "uzumaki_apice"] as const;

describe("Uzumaki: integridade da arvore de cla", () => {
  it("liga os dois jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "uzumaki" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Uzumaki tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.uzumaki!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Uzumaki e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "uzumaki", manualOnly: true });
    }
  });

  it("as TRÊS passivas (não as 2 de sempre) têm definição — pedido explícito de 'mais de uma pra evolução'", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "uzumaki")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    const passivos = allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "uzumaki");
    expect(passivos.length).toBe(3);
  });

  it("tronco reto: raiz -> Regeneração -> Reservas -> Correntes -> ápice", () => {
    const order = ["uzumaki_raiz", "uzumaki_regeneracao", "uzumaki_reservas", "uzumaki_correntes", "uzumaki_apice"];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("clã Uzumaki existe e referencia as duas habilidades em activeIds", () => {
    const clan = getClan("uzumaki");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Uzumaki: Regeneração de Vigor — cura E energiza", () => {
  const cura = getAbility("uzumaki_regeneracao")!;

  it("é IRYO_NINJUTSU, cura de verdade, e alvo é aliado/self (shape ALLY)", () => {
    expect(cura.category).toBe("IRYO_NINJUTSU");
    expect(cura.baseHeal).toBeGreaterThan(0);
    expect(cura.shape).toBe("ALLY");
  });

  it("também devolve chakra pro alvo curado (restoreResource) — 'energiza quem cura'", () => {
    expect(cura.restoreResource).toEqual({ resource: "chakra", amount: 15 });
  });
});

describe("Uzumaki: Correntes de Selamento Adamantinas — controle puro, sem dano", () => {
  const correntes = getAbility("uzumaki_correntes")!;

  it("baseDamage 0 DE PROPÓSITO (mesmo marcador do Nara) e não pode ser esquivada", () => {
    expect(correntes.baseDamage).toBe(0);
    expect(correntes.undodgeable).toBe(true);
    expect(computeDamage(correntes, { attrValue: 200 })).toBe(0);
  });

  it("effectsLanded libera os efeitos mesmo com dano 0, contanto que não tenha esquivado", () => {
    expect(effectsLanded(0, correntes.baseDamage, false)).toBe(true);
    expect(effectsLanded(0, correntes.baseDamage, true)).toBe(false);
  });

  it("prende, drena chakra e bloqueia fuga — o combo clássico de prisão em área", () => {
    const ids = correntes.effects!.map((e) => e.effectId);
    expect(new Set(ids)).toEqual(new Set(["ROOT", "CHAKRA_DRAIN", "FLEE_LOCK"]));
  });
});

describe("Uzumaki: passivas de vitalidade e chakra — evolução em 3 estágios", () => {
  const correntes = getAbility("uzumaki_correntes")!;

  it("nenhuma das três multiplica dano bruto — o clã ganha por vitalidade/controle, não por rajada", () => {
    for (const p of CLAN_PASSIVES.filter((p) => p.clanId === "uzumaki")) {
      expect("damageMult" in p).toBe(false);
    }
  });

  it("Vitalidade do Redemoinho (raiz): +8% de vida máxima e -8% de custo", () => {
    const m = passiveMods(["uzumaki_raiz"], correntes);
    expect(m.costMult).toBeCloseTo(0.92);
    const c = characterPassiveMods(["uzumaki_raiz"]);
    expect(c.maxHpBonus).toBeCloseTo(0.08);
    expect(c.hpRegenPerTurn).toBe(0);
    expect(c.chakraRegenPerTurn).toBe(0);
  });

  it("Reservas do Redemoinho (meio): soma mais vida máxima e abre regeneração de vida E de chakra por turno", () => {
    const c = characterPassiveMods(["uzumaki_reservas"]);
    expect(c.maxHpBonus).toBeCloseTo(0.05);
    expect(c.hpRegenPerTurn).toBe(5);
    expect(c.chakraRegenPerTurn).toBe(6);
  });

  it("Selo do Redemoinho (ápice): soma mais vida/regeneração de vida e chakra, e reforça as Correntes", () => {
    const c = characterPassiveMods(["uzumaki_apice"]);
    expect(c.maxHpBonus).toBeCloseTo(0.07);
    expect(c.hpRegenPerTurn).toBe(7);
    expect(c.chakraRegenPerTurn).toBe(4);
    const m = passiveMods(["uzumaki_apice"], correntes);
    expect(m.effectChanceBonus.CHAKRA_DRAIN).toBeCloseTo(0.15);
    expect(m.effectChanceBonus.ROOT).toBeCloseTo(0.15);
  });

  it("as três passivas do MESMO dono somam entre si (evolução cumulativa)", () => {
    const c = characterPassiveMods(PASSIVE_IDS as unknown as string[]);
    expect(c.maxHpBonus).toBeCloseTo(0.08 + 0.05 + 0.07);
    expect(c.hpRegenPerTurn).toBe(5 + 7);
    expect(c.chakraRegenPerTurn).toBe(6 + 4);
  });

  it("passiva de Uzumaki não afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["uzumaki_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], correntes).costMult).toBe(1);
    expect(passiveMods(["uzumaki_raiz"], bola).costMult).toBe(1);
  });

  it("characterPassiveMods de um clã não vaza pra outro personagem sem esses nós", () => {
    expect(characterPassiveMods(["nara_raiz"]).maxHpBonus).toBe(0);
    expect(characterPassiveMods([]).maxHpBonus).toBe(0);
  });
});
