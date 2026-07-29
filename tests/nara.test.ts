import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { computeDamage } from "../src/services/combat/combat-math.js";
import { effectsLanded, isShadowBound, type EffectState } from "../src/services/combat/effects.js";

const IDS = [
  "nara_possessao",
  "nara_enforcamento",
  "nara_costura",
  "nara_shuriken",
  "nara_rede",
  "nara_lirio",
] as const;

// As 4 técnicas de "imitação": sem dano de propósito, usam SHADOW_BOUND.
const IMITACAO_IDS = ["nara_possessao", "nara_shuriken", "nara_rede", "nara_lirio"] as const;
// Enforcamento e Costura continuam causando dano de verdade, com ROOT normal.
const DANO_IDS = ["nara_enforcamento", "nara_costura"] as const;

describe("Nara: integridade da arvore de cla", () => {
  it("liga os seis jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "nara" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Nara tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.nara!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Nara e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "nara", manualOnly: true });
    }
  });

  it("todas as seis são categoria NINJUTSU, não CLA (chakra de verdade: joga com NINJUTSU_BLOCK etc.)", () => {
    for (const id of IDS) expect(getAbility(id)!.category).toBe("NINJUTSU");
  });

  it("os dois nós PASSIVE (raiz e ápice) têm definição de passiva", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "nara")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("Enforcamento e Costura exigem a Possessão da Sombra antes (combo de captura)", () => {
    const enforcamento = allNodes().find((n) => n.id === "nara_enforcamento")!;
    const costura = allNodes().find((n) => n.id === "nara_costura")!;
    expect(enforcamento.requires).toEqual(["nara_possessao"]);
    expect(costura.requires).toEqual(["nara_possessao"]);
  });

  it("Lírio da Aranha Negra exige a Rede de Imitação (via ápice) antes", () => {
    const rede = allNodes().find((n) => n.id === "nara_rede")!;
    const apice = allNodes().find((n) => n.id === "nara_apice")!;
    const lirio = allNodes().find((n) => n.id === "nara_lirio")!;
    expect(apice.requires).toEqual(["nara_rede"]);
    expect(lirio.requires).toEqual(["nara_apice"]);
    expect(rede.requires).toEqual(["nara_shuriken"]);
  });

  it("clã Nara existe e referencia as seis habilidades em activeIds", () => {
    const clan = getClan("nara");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Nara: família de imitação — sem dano, usa SHADOW_BOUND", () => {
  it("Possessão, Shuriken, Rede e Lírio têm baseDamage 0 e aplicam SHADOW_BOUND", () => {
    for (const id of IMITACAO_IDS) {
      const ab = getAbility(id)!;
      expect(ab.baseDamage, id).toBe(0);
      expect(ab.scalingAttribute, id).toBeUndefined();
      expect(ab.effects!.some((e) => e.effectId === "SHADOW_BOUND"), id).toBe(true);
      expect(ab.effects!.some((e) => e.effectId === "ROOT"), id).toBe(false);
    }
  });

  it("Enforcamento e Costura continuam causando dano de verdade, com ROOT (não SHADOW_BOUND)", () => {
    for (const id of DANO_IDS) {
      const ab = getAbility(id)!;
      expect(ab.baseDamage!, id).toBeGreaterThan(0);
      expect(ab.effects!.some((e) => e.effectId === "ROOT"), id).toBe(true);
      expect(ab.effects!.some((e) => e.effectId === "SHADOW_BOUND"), id).toBe(false);
    }
  });

  it("computeDamage confirma 0 de dano real pras quatro técnicas de imitação", () => {
    for (const id of IMITACAO_IDS) {
      const ab = getAbility(id)!;
      expect(computeDamage(ab, { attrValue: 200 }), id).toBe(0); // nem atributo alto gera dano
    }
  });

  it("Possessão e Rede sempre ativam o Vínculo ao acertar e não podem ser bloqueadas ou aparadas", () => {
    for (const id of ["nara_possessao", "nara_rede"] as const) {
      const ability = getAbility(id)!;
      const shadow = ability.effects!.find((effect) => effect.effectId === "SHADOW_BOUND")!;
      expect(shadow.chance, id).toBeUndefined();
      expect(ability.unguardable, id).toBe(true);
      expect(ability.undodgeable, id).not.toBe(true);
      expect(ability.unblockable, id).not.toBe(true);
    }
  });
});

describe("Nara: passivas — controle, não dano", () => {
  const possessao = getAbility("nara_possessao")!;

  it("passivas do Nara não multiplicam dano (o clã ganha por controle, não rajada — diferente do Akimichi)", () => {
    for (const p of CLAN_PASSIVES.filter((p) => p.clanId === "nara")) {
      expect("damageMult" in p).toBe(false);
    }
  });

  it("Conluio das Sombras corta 15% do custo e soma 15 pontos de chance pros dois efeitos de prisão", () => {
    const m = passiveMods(["nara_raiz"], possessao);
    expect(m.costMult).toBeCloseTo(0.85);
    expect(m.effectChanceBonus.ROOT).toBeCloseTo(0.15);
    expect(m.effectChanceBonus.SHADOW_BOUND).toBeCloseTo(0.15);
  });

  it("Sombra Absoluta estende alcance (linha/alvo único) e a duração do Vínculo de Sombra — não do ROOT", () => {
    const linha = passiveMods(["nara_apice"], possessao); // nara_possessao é LINE
    expect(linha.rangeBonus).toBe(2);
    expect(linha.effectDurationBonus.SHADOW_BOUND).toBe(1);
    expect(linha.effectDurationBonus.ROOT).toBeUndefined();

    const rede = getAbility("nara_rede")!; // RADIUS — fora das rangeShapes do ápice
    expect(passiveMods(["nara_apice"], rede).rangeBonus).toBe(0);
  });

  it("passiva de Nara não afeta jutsu elemental, e passiva elemental não afeta jutsu de clã", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["nara_raiz"], bola).costMult).toBe(1);
    expect(passiveMods(["fogo_raiz"], possessao).costMult).toBe(1);
  });

  it("passiva de outro clã (sem def) não faz nada num jutsu de clã", () => {
    // nós de outros clãs (ex: Uchiha) nao tem entrada em CLAN_PASSIVES —
    // devem ser ignorados silenciosamente, nao quebrar o calculo.
    expect(passiveMods(["uchiha_sharingan_1_tomoe"], possessao)).toEqual(passiveMods([], possessao));
  });
});

describe("Vínculo de Sombra: mecânica exclusiva (isShadowBound / effectsLanded)", () => {
  it("isShadowBound só conta o efeito certo, ativo (duration > 0)", () => {
    const preso: EffectState[] = [{ effectId: "SHADOW_BOUND", stacks: 1, duration: 2 }];
    const expirado: EffectState[] = [{ effectId: "SHADOW_BOUND", stacks: 1, duration: 0 }];
    const outroEfeito: EffectState[] = [{ effectId: "ROOT", stacks: 1, duration: 2 }];
    expect(isShadowBound(preso)).toBe(true);
    expect(isShadowBound(expirado)).toBe(false);
    expect(isShadowBound(outroEfeito)).toBe(false);
    expect(isShadowBound([])).toBe(false);
  });

  it("effectsLanded: dano real sempre libera o efeito, dodged sempre barra", () => {
    expect(effectsLanded(10, 12, false)).toBe(true); // dano real, não esquivou
    expect(effectsLanded(0, 12, true)).toBe(false); // esquivou um golpe com dano
  });

  it("effectsLanded: jutsu 0-dano DE PROPÓSITO (baseDamage === 0) libera o efeito mesmo com damage === 0", () => {
    expect(effectsLanded(0, 0, false)).toBe(true); // não esquivou — a sombra prendeu
    expect(effectsLanded(0, 0, true)).toBe(false); // esquivou — evitou o vínculo
  });

  it("effectsLanded: dano reduzido a 0 por Bloqueio/Barreira (baseDamage > 0) NÃO libera o efeito", () => {
    // distingue "nasceu sem dano" de "foi mitigado a 0" — só o primeiro caso
    // é um golpe de controle puro; o segundo é um golpe normal que falhou.
    expect(effectsLanded(0, 12, false)).toBe(false);
  });

  it("effectsLanded: baseDamage undefined (jutsu comum, sem dano definido) não libera nada sozinho", () => {
    expect(effectsLanded(0, undefined, false)).toBe(false);
  });
});
