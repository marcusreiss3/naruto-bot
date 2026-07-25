import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { computeDamage } from "../src/services/combat/combat-math.js";
import { effectsLanded, empoweredDamageMult, type EffectState } from "../src/services/combat/effects.js";

const IDS = [
  "aburame_clone_inseto",
  "aburame_casulo",
  "aburame_esfera",
  "aburame_nuvem_veneno",
  "aburame_parede",
  "aburame_jarro_veneno",
  "aburame_mordida",
] as const;

// Ramo Kikaichu (col -1): controle/dreno, sem veneno.
const KIKAICHU_IDS = ["aburame_esfera", "aburame_parede", "aburame_mordida"] as const;
// Ramo Rinkaichu (col +1): a linhagem venenosa (Torune).
const RINKAICHU_IDS = ["aburame_nuvem_veneno", "aburame_jarro_veneno"] as const;
// Sem dano de proposito (controle puro) — igual as tecnicas de imitacao do Nara.
const ZERO_DANO_IDS = ["aburame_esfera", "aburame_nuvem_veneno", "aburame_jarro_veneno"] as const;

describe("Aburame: integridade da arvore de cla", () => {
  it("liga os sete jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "aburame" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Aburame tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.aburame!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Aburame e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "aburame", manualOnly: true });
    }
  });

  it("todas as sete são categoria NINJUTSU, não CLA genérico", () => {
    for (const id of IDS) expect(getAbility(id)!.category).toBe("NINJUTSU");
  });

  it("os dois nós PASSIVE (raiz e ápice) têm definição de passiva", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "aburame")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("clã Aburame existe e referencia as sete habilidades em activeIds", () => {
    const clan = getClan("aburame");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Aburame: ramificação Kikaichu x Rinkaichu (insetos venenosos em ramo separado)", () => {
  it("o tronco (Clones de Inseto, Casulo) fica na coluna central", () => {
    for (const id of ["aburame_clone_inseto", "aburame_casulo"]) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.col, id).toBe(0);
    }
  });

  it("Casulo de Insetos é o ponto de ramificação: os dois ramos exigem ele antes", () => {
    const esfera = allNodes().find((n) => n.id === "aburame_esfera")!;
    const nuvem = allNodes().find((n) => n.id === "aburame_nuvem_veneno")!;
    expect(esfera.requires).toEqual(["aburame_casulo"]);
    expect(nuvem.requires).toEqual(["aburame_casulo"]);
  });

  it("o ramo Kikaichu (Esfera -> Parede -> Mordida) fica todo na coluna -1", () => {
    for (const id of KIKAICHU_IDS) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.col, id).toBe(-1);
    }
  });

  it("o ramo Rinkaichu (Nuvem -> Jarro) fica todo na coluna +1", () => {
    for (const id of RINKAICHU_IDS) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.col, id).toBe(1);
    }
  });

  it("nenhuma habilidade Kikaichu aplica Veneno; as duas Rinkaichu aplicam", () => {
    for (const id of KIKAICHU_IDS) {
      const ab = getAbility(id)!;
      expect(ab.effects?.some((e) => e.effectId === "POISON"), id).toBe(false);
    }
    for (const id of RINKAICHU_IDS) {
      const ab = getAbility(id)!;
      expect(ab.effects?.some((e) => e.effectId === "POISON"), id).toBe(true);
    }
  });

  it("o ápice converge os dois ramos: exige o finalizador de cada um", () => {
    const apice = allNodes().find((n) => n.id === "aburame_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["aburame_mordida", "aburame_jarro_veneno"]));
    expect(apice.col).toBe(0);
  });
});

describe("Aburame: 'desbloqueia upando Ninjutsu' é só o reqNinjutsu (sem reqAttribute duplicado)", () => {
  it("nenhum nó tem reqAttribute — reqAttribute é só pra gate num atributo DIFERENTE do Ninjutsu (ex: Hyuuga/Taijutsu). Aqui o próprio reqNinjutsu já lê o atributo Ninjutsu, então repetir via reqAttribute mostraria 'Ninjutsu' duas vezes no modal.", () => {
    for (const n of CLAN_TREES.aburame!) expect(n.reqAttribute, n.id).toBeUndefined();
  });

  it("reqNinjutsu sobe a cada nó do tronco/ramos, sem regredir", () => {
    for (const id of IDS) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.reqNinjutsu, id).toBeGreaterThan(0);
    }
  });
});

describe("Aburame: sem dano de propósito (Esfera, Nuvem, Jarro) — controle/status puro", () => {
  it("as três têm baseDamage 0", () => {
    for (const id of ZERO_DANO_IDS) {
      expect(getAbility(id)!.baseDamage, id).toBe(0);
    }
  });

  it("computeDamage confirma 0 de dano real mesmo com atributo alto", () => {
    for (const id of ZERO_DANO_IDS) {
      const ab = getAbility(id)!;
      expect(computeDamage(ab, { attrValue: 200 }), id).toBe(0);
    }
  });

  it("effectsLanded libera o efeito mesmo sem dano, contanto que não tenha esquivado", () => {
    for (const id of ZERO_DANO_IDS) {
      const ab = getAbility(id)!;
      expect(effectsLanded(0, ab.baseDamage, false), id).toBe(true);
      expect(effectsLanded(0, ab.baseDamage, true), id).toBe(false); // esquivou, efeito não aplica
    }
  });

  it("Mordida de Inseto (finalizador Kikaichu) causa dano de verdade, diferente do resto do ramo", () => {
    const mordida = getAbility("aburame_mordida")!;
    expect(mordida.baseDamage!).toBeGreaterThan(0);
  });
});

describe("Aburame: Casulo de Insetos — sobrecarga com risco na frente (não depois, ao contrário da Pílula do Akimichi)", () => {
  const casulo = getAbility("aburame_casulo")!;

  it("aplica ROOT + DEFENSE_DOWN (o preço) junto com EMPOWERED (o buff), tudo de uma vez", () => {
    const ids = casulo.effects!.map((e) => e.effectId);
    expect(new Set(ids)).toEqual(new Set(["ROOT", "DEFENSE_DOWN", "EMPOWERED"]));
    // sem onExpire — diferente da Pílula Secreta do Akimichi, aqui o risco é
    // pago ANTES (junto com o cast), não depois que o buff acaba.
    for (const e of casulo.effects!) expect(e.onExpire, e.effectId).toBeUndefined();
  });

  it("é ação COMUM (usa o turno inteiro) — reforça o risco de ficar parado", () => {
    expect(casulo.actionType).toBe("COMUM");
  });

  it("EMPOWERED nasce escopado pro próprio clã — só golpes que exigem clanId aburame, não um ninjutsu elemental qualquer", () => {
    const eff = casulo.effects!.find((e) => e.effectId === "EMPOWERED")!;
    expect(eff.empoweredScope).toBe("clan");
  });

  it("EMPOWERED escopado como 'clan' só multiplica jutsu que exige o MESMO clã — Mordida de Inseto sim, Bola de Fogo não", () => {
    const comEscopo: EffectState[] = [
      {
        effectId: "EMPOWERED",
        stacks: 1,
        duration: 3,
        dataJson: JSON.stringify({ empoweredScope: { kind: "clan", clanId: "aburame" } }),
      },
    ];
    const mordida = getAbility("aburame_mordida")!; // categoria NINJUTSU, mas exige clanId aburame
    expect(empoweredDamageMult(comEscopo, mordida)).toBeCloseTo(1.6);
    const bola = getAbility("katon_goukakyuu")!; // sem clanId nenhum
    expect(empoweredDamageMult(comEscopo, bola)).toBe(1);
  });
});

describe("Aburame: passivas — dreno e veneno, não dano bruto", () => {
  const esfera = getAbility("aburame_esfera")!;

  it("nenhuma passiva de Aburame multiplica dano (clã de controle/status, como Nara e Hyuuga)", () => {
    for (const p of CLAN_PASSIVES.filter((p) => p.clanId === "aburame")) {
      expect("damageMult" in p).toBe(false);
    }
  });

  it("Colônia Ancestral corta 10% do custo e soma 15 pontos de chance de Dreno de Chakra", () => {
    const m = passiveMods(["aburame_raiz"], esfera);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(m.effectChanceBonus.CHAKRA_DRAIN).toBeCloseTo(0.15);
  });

  it("Colmeia Completa estende a duração do Dreno de Chakra e soma chance de Veneno", () => {
    const m = passiveMods(["aburame_apice"], esfera);
    expect(m.effectDurationBonus.CHAKRA_DRAIN).toBe(1);
    expect(m.effectChanceBonus.POISON).toBeCloseTo(0.15);
  });

  it("passiva de Aburame não afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["aburame_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], esfera).costMult).toBe(1);
    expect(passiveMods(["aburame_raiz"], bola).costMult).toBe(1);
  });
});
