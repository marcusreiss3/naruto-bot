import { describe, it, expect } from "vitest";
import {
  characterPassiveMods,
  passiveMods,
  NEUTRAL_MODS,
} from "../src/services/combat/passives.js";
import {
  applyBurnStacks,
  absorbWithShield,
  shieldPoints,
  type EffectState,
} from "../src/services/combat/effects.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { BALANCE } from "../src/config/balance.js";
import { isKekkeiGenkai, type Element } from "../src/config/enums.js";

const bola = getAbility("katon_goukakyuu")!; // CONE, FOGO
const dragao = getAbility("katon_gouryuuka")!; // LINE, FOGO
const agua = getAbility("suiton_trombeta")!; // AGUA

describe("passivas: integridade do registro", () => {
  it("todo nó PASSIVE da árvore de Fogo tem definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "FOGO")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("toda passiva aponta para um nó que existe", () => {
    const ids = new Set(allNodes().map((n) => n.id));
    expect(PASSIVES.filter((p) => !ids.has(p.nodeId)).map((p) => p.nodeId)).toEqual([]);
  });

  // REGRA DE BALANCEAMENTO: com as escalas por atributo em 0, as passivas de
  // dano sao a unica fonte de crescimento de dano. O produto delas por elemento
  // precisa ficar perto de 2.0 — foi assim que a curva de golpes-por-morte ficou
  // estavel (~3 a 4) do nivel 10 ao 50. Muito abaixo: luta arrasta no fim de
  // jogo. Muito acima: tudo morre em 2 golpes e a reacao de 20s vira enfeite.
  // Conta o dano CONDICIONAL junto: Agua tem so 1.15x fixo, mas chega a 2.01x
  // contra alvo Encharcado. Isso e' de proposito — ela ganha por montar a jogada.
  // O teto medido e' o do elemento com o setup feito.
  it("o dano total das passivas de cada elemento fica perto de 2x", () => {
    const porElemento = new Map<string, number>();
    for (const p of PASSIVES) {
      const mult = (p.damageMult ?? 1) * (p.damageMultVsEffect?.mult ?? 1);
      if (mult === 1) continue;
      porElemento.set(p.element, (porElemento.get(p.element) ?? 1) * mult);
    }
    for (const [element, mult] of porElemento) {
      // Kekkei genkai fecha perto de 2.025x. O teto bruto fica controlado;
      // sua vantagem adicional vem dos efeitos e utilidades exclusivos.
      const [min, max] = isKekkeiGenkai(element as Element) ? [2, 2.1] : [1.8, 2.2];
      expect(mult, `${element} está em ${mult.toFixed(2)}x`).toBeGreaterThanOrEqual(min);
      expect(mult, `${element} está em ${mult.toFixed(2)}x`).toBeLessThanOrEqual(max);
    }
  });
});

describe("passivas: sem nós comprados", () => {
  it("não altera nada", () => {
    expect(passiveMods([], bola)).toEqual(NEUTRAL_MODS);
  });

  it("nó desconhecido é ignorado", () => {
    expect(passiveMods(["nao_existe"], bola).damageMult).toBe(1);
  });
});

describe("passivas: dano", () => {
  it("Chama Interior dá +30%", () => {
    expect(passiveMods(["fogo_raiz"], bola).damageMult).toBeCloseTo(1.3);
  });

  it("Fôlego do Dragão acumula com a raiz (multiplicativo)", () => {
    const m = passiveMods(["fogo_raiz", "fogo_folego"], bola).damageMult;
    expect(m).toBeCloseTo(1.3 * 1.55);
  });

  it("passiva de Fogo não afeta jutsu de Água", () => {
    expect(passiveMods(["fogo_raiz", "fogo_folego"], agua).damageMult).toBe(1);
  });
});

describe("passivas: custo", () => {
  it("Sopro Eficiente corta 20% em CONE", () => {
    expect(passiveMods(["fogo_sopro"], bola).costMult).toBeCloseTo(0.8);
  });

  it("Sopro Eficiente não afeta jutsu em LINHA", () => {
    expect(passiveMods(["fogo_sopro"], dragao).costMult).toBe(1);
  });
});

describe("passivas: queimadura", () => {
  it("Brasas Persistentes soma 1 acúmulo", () => {
    expect(passiveMods(["fogo_brasas"], bola).extraBurnStacks).toBe(1);
  });

  it("Combustão baixa o gatilho e sobe o dano da explosão", () => {
    const m = passiveMods(["fogo_combustao"], bola);
    expect(m.burnExplodeAtStacks).toBe(4);
    expect(m.burnExplodeDamage).toBe(60);
  });

  it("sem Combustão vale o padrão do balance", () => {
    const m = passiveMods(["fogo_raiz"], bola);
    expect(m.burnExplodeAtStacks).toBe(BALANCE.effects.BURN.explodeAtStacks);
    expect(m.burnExplodeDamage).toBe(BALANCE.effects.BURN.explodeDmg);
  });

  it("explosão respeita o gatilho da Combustão (4 em vez de 5)", () => {
    const semPassiva = applyBurnStacks(3, 1);
    expect(semPassiva.explosionDamage).toBe(0);
    expect(semPassiva.stacks).toBe(4);

    const comCombustao = applyBurnStacks(3, 1, { explodeAtStacks: 4, explodeDamage: 60 });
    expect(comCombustao.explosionDamage).toBe(60);
    expect(comCombustao.stacks).toBe(0); // zera apos explodir
  });
});

describe("passivas: terreno", () => {
  it("Pavio deixa chamas no acerto", () => {
    const t = passiveMods(["fogo_pavio"], bola).terrainOnHit;
    expect(t).toHaveLength(1);
    expect(t[0]!.kind).toBe("FIRE");
  });

  it("sem Pavio não deixa terreno", () => {
    expect(passiveMods(["fogo_raiz"], bola).terrainOnHit).toEqual([]);
  });
});

describe("passivas: Água (dano condicional)", () => {
  const seco: EffectState[] = [];
  const encharcado: EffectState[] = [{ effectId: "WET", stacks: 1, duration: 2 }];

  it("Fio d'Água não faz nada contra alvo seco", () => {
    expect(passiveMods(["agua_fio"], agua, seco).damageMult).toBe(1);
  });

  it("Fio d'Água multiplica contra alvo Encharcado", () => {
    expect(passiveMods(["agua_fio"], agua, encharcado).damageMult).toBeCloseTo(1.75);
  });

  it("sem informação do alvo, o condicional não conta (cálculo de custo)", () => {
    expect(passiveMods(["agua_fio"], agua).damageMult).toBe(1);
  });

  it("build de Água: fraca no seco, forte no encharcado", () => {
    const todas = ["agua_raiz", "agua_correnteza", "agua_condutora", "agua_fio"];
    const contraSeco = passiveMods(todas, agua, seco).damageMult;
    const contraWet = passiveMods(todas, agua, encharcado).damageMult;
    expect(contraSeco).toBeCloseTo(1.15);
    expect(contraWet).toBeCloseTo(2.0125); // mesma faixa do Fogo, mas exige setup
    expect(contraWet / contraSeco).toBeCloseTo(1.75);
  });

  it("Correnteza dá 1 casa a mais de empurrão", () => {
    expect(passiveMods(["agua_correnteza"], agua).pushBonus).toBe(1);
  });

  it("Maré Condutora estende o Encharcado em 1 rodada", () => {
    expect(passiveMods(["agua_condutora"], agua).effectDurationBonus.WET).toBe(1);
  });

  it("Fluxo Constante corta o custo em 15%", () => {
    expect(passiveMods(["agua_raiz"], agua).costMult).toBeCloseTo(0.85);
  });

  it("passiva de Água não afeta jutsu de Fogo", () => {
    expect(passiveMods(["agua_fio"], bola, encharcado).damageMult).toBe(1);
  });
});

describe("passivas: Vento", () => {
  const lamina = getAbility("fuuton_lamina")!; // LINE
  const danca = getAbility("fuuton_danca_flor")!; // RADIUS

  it("Fio de Navalha dá dano e perfura bloqueio", () => {
    const m = passiveMods(["vento_raiz"], lamina);
    expect(m.damageMult).toBeCloseTo(1.3);
    expect(m.armorPierce).toBeCloseTo(0.2);
  });

  it("Corte Profundo fecha os 2x e estende o Sangramento", () => {
    const m = passiveMods(["vento_raiz", "vento_corte"], lamina);
    expect(m.damageMult).toBeCloseTo(2.015);
    expect(m.effectDurationBonus.BLEED).toBe(1);
  });

  it("Alcance Estendido só vale em linha reta", () => {
    expect(passiveMods(["vento_alcance"], lamina).rangeBonus).toBe(2);
    expect(passiveMods(["vento_alcance"], danca).rangeBonus).toBe(0);
  });

  it("Vento em Brasa liga a propagação de fogo", () => {
    expect(passiveMods(["vento_brasa"], lamina).spreadsBurn).toBe(true);
    expect(passiveMods(["vento_raiz"], lamina).spreadsBurn).toBe(false);
  });

  it("perfuração nunca passa de 100%", () => {
    const m = passiveMods(["vento_raiz", "vento_raiz", "vento_raiz", "vento_raiz", "vento_raiz", "vento_raiz"], lamina);
    expect(m.armorPierce).toBeLessThanOrEqual(1);
  });

  it("passiva de Vento não afeta jutsu de Fogo", () => {
    expect(passiveMods(["vento_raiz"], bola).armorPierce).toBe(0);
  });
});

describe("passivas: Terra", () => {
  const parede = getAbility("doton_parede")!;

  it("Pele de Pedra dá dano; Peso da Montanha fecha os 2x", () => {
    expect(passiveMods(["terra_raiz"], parede).damageMult).toBeCloseTo(1.3);
    expect(passiveMods(["terra_raiz", "terra_peso"], parede).damageMult).toBeCloseTo(2.015);
  });

  it("Terreno Firme estende o terreno criado", () => {
    expect(passiveMods(["terra_firme"], parede).terrainDurationBonus).toBe(1);
  });

  it("Vínculo de Barro engorda a invocação", () => {
    expect(passiveMods(["terra_barro"], parede).summonHpBonus).toBeCloseTo(0.25);
  });

  it("Peso da Montanha estende o preso ao chão", () => {
    expect(passiveMods(["terra_peso"], parede).effectDurationBonus.ROOT).toBe(1);
  });
});

describe("passivas: Raio", () => {
  const raio = getAbility("raiton_esfera_relampago")!;
  const seco: EffectState[] = [];
  const encharcado: EffectState[] = [{ effectId: "WET", stacks: 1, duration: 2 }];

  it("Sinapse e Nuvens fecham a curva de dano contra Encharcado", () => {
    expect(passiveMods(["raio_raiz", "raio_nuvens"], raio, seco).damageMult).toBeCloseTo(1.15);
    expect(passiveMods(["raio_raiz", "raio_nuvens"], raio, encharcado).damageMult).toBeCloseTo(2.0125);
  });

  it("Sobrecarga soma 20 pontos na chance de Atordoar", () => {
    expect(passiveMods(["raio_sobrecarga"], raio).effectChanceBonus.STUN).toBeCloseTo(0.2);
  });

  it("Ponta Perfurante ignora Barreira e executa abaixo de 30%", () => {
    const m = passiveMods(["raio_perfurante"], raio);
    expect(m.ignoresShield).toBe(true);
    expect(m.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.25 });
  });

  it("Sinapse melhora esquiva de Ninjutsu e prioridade", () => {
    expect(characterPassiveMods(["raio_raiz"])).toEqual({
      ninjutsuDodgeBonus: 0.08,
      initiativePriority: 1,
      maxHpBonus: 0,
      hpRegenPerTurn: 0,
      chakraRegenPerTurn: 0,
      meleeCounterDamage: 0,
      mindControlUpkeepMult: 1,
      mindControlNinjutsuBonus: 0,
    });
  });
});

describe("Barreira (SHIELD)", () => {
  it("absorve todo o dano quando é maior que o golpe", () => {
    const r = absorbWithShield(10, 25);
    expect(r.damageToHp).toBe(0);
    expect(r.absorbed).toBe(10);
    expect(r.shieldLeft).toBe(15);
  });

  it("quebra e deixa o resto passar", () => {
    const r = absorbWithShield(30, 12);
    expect(r.damageToHp).toBe(18);
    expect(r.shieldLeft).toBe(0);
  });

  it("sem barreira, o dano passa inteiro", () => {
    expect(absorbWithShield(20, 0).damageToHp).toBe(20);
  });

  it("soma os pontos de várias barreiras", () => {
    const efeitos: EffectState[] = [
      { effectId: "SHIELD", stacks: 8, duration: 2 },
      { effectId: "SHIELD", stacks: 12, duration: 3 },
      { effectId: "BURN", stacks: 2, duration: 3 },
    ];
    expect(shieldPoints(efeitos)).toBe(20);
  });

  it("barreira expirada não conta", () => {
    expect(shieldPoints([{ effectId: "SHIELD", stacks: 9, duration: 0 }])).toBe(0);
  });
});

describe("passivas: build completa de Fogo", () => {
  it("todas juntas somam corretamente", () => {
    const todas = ["fogo_raiz", "fogo_brasas", "fogo_combustao", "fogo_pavio", "fogo_folego", "fogo_sopro"];
    const m = passiveMods(todas, bola);
    expect(m.damageMult).toBeCloseTo(2.015); // 1.30 * 1.55: fonte unica de crescimento de dano
    expect(m.costMult).toBeCloseTo(0.8);
    expect(m.extraBurnStacks).toBe(1);
    expect(m.burnExplodeAtStacks).toBe(4);
    expect(m.burnExplodeDamage).toBe(60);
    expect(m.terrainOnHit).toHaveLength(1);
  });
});
