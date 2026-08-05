import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { lockReason, type CharSnapshot } from "../src/services/characters/skill-tree.js";
import { ATTRIBUTES } from "../src/config/enums.js";
import { empoweredDamageMult, parseEffectData, type EffectState } from "../src/services/combat/effects.js";
import { BALANCE } from "../src/config/balance.js";

// as 6 tecnicas gated por atributo + a Pilula Secreta (skill, nao mais
// passiva) + as 2 da "pilula" propriamente ditas = 9 abilities reais.
const IDS = [
  "akimichi_baika_parcial",
  "akimichi_baika",
  "akimichi_tanque",
  "akimichi_super_baika",
  "akimichi_mergulho",
  "akimichi_bofetada",
  "akimichi_apice",
  "akimichi_modo_borboleta",
  "akimichi_bombardeio",
] as const;

// as tres tecnicas de "crescer" pedem Ninjutsu (a natureza real do jutsu)
const NINJUTSU_GATED = ["akimichi_baika_parcial", "akimichi_baika", "akimichi_super_baika"] as const;
// as tecnicas de "usar o corpo grande pra bater" pedem Taijutsu
const TAIJUTSU_GATED = ["akimichi_tanque", "akimichi_mergulho", "akimichi_bofetada"] as const;
// as duas depois da Pilula Secreta nao pedem atributo — o gate e' o proprio
// nó "Pílula Secreta" (agora um jutsu, não mais passiva)
const PILL_GATED = ["akimichi_modo_borboleta", "akimichi_bombardeio"] as const;

// orcamento folgado em TODOS os atributos: cada no paga com o seu proprio
// pool agora, entao um snapshot de teste precisa de saldo em todos eles.
const RICO = Object.fromEntries(ATTRIBUTES.map((a) => [a, 100]));

const snap = (over: Partial<CharSnapshot> = {}): CharSnapshot => ({
  charId: "c1",
  name: "Teste",
  level: 50,
  spentByPool: {},
  pointsByPool: {},
  elements: [],
  owned: new Set(),
  clanId: "akimichi",
  attributes: RICO,
  ...over,
});

describe("Akimichi: integridade da arvore de cla", () => {
  it("liga as nove tecnicas aos nos da arvore (incluindo a Pílula Secreta, que é jutsu, não passiva)", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "akimichi" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("só a raiz é PASSIVE — a árvore tem só 1 passiva permanente, não 2", () => {
    const passivos = allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "akimichi");
    expect(passivos.map((n) => n.id)).toEqual(["akimichi_raiz"]);
  });

  it("nenhum nó de Akimichi tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.akimichi!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Akimichi e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "akimichi", manualOnly: true });
    }
  });

  it("as tecnicas de 'crescer' e a Pílula Secreta são NINJUTSU; as de 'usar o corpo' são TAIJUTSU", () => {
    for (const id of [...NINJUTSU_GATED, "akimichi_apice", "akimichi_modo_borboleta"]) {
      expect(getAbility(id)!.category, id).toBe("NINJUTSU");
    }
    for (const id of [...TAIJUTSU_GATED, "akimichi_bombardeio"]) {
      expect(getAbility(id)!.category, id).toBe("TAIJUTSU");
    }
  });

  it("a raiz ('Fartura do Clã') tem definição de passiva", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "akimichi")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("escalonamento é uma cadeia linear na ordem exata pedida (sem ramos)", () => {
    const order = [
      "akimichi_raiz",
      "akimichi_baika_parcial",
      "akimichi_baika",
      "akimichi_tanque",
      "akimichi_super_baika",
      "akimichi_mergulho",
      "akimichi_bofetada",
      "akimichi_apice",
      "akimichi_modo_borboleta",
      "akimichi_bombardeio",
    ];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("clã Akimichi existe e referencia as nove habilidades em activeIds", () => {
    const clan = getClan("akimichi");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Akimichi: pool por atributo — 'crescer' paga Ninjutsu, 'bater' paga Taijutsu", () => {
  it("nós de crescer saem do pool de Ninjutsu", () => {
    for (const id of NINJUTSU_GATED) {
      expect(allNodes().find((n) => n.id === id)!.pool, id).toBe("ninjutsu");
    }
  });

  it("nós de bater saem do pool de Taijutsu", () => {
    for (const id of TAIJUTSU_GATED) {
      expect(allNodes().find((n) => n.id === id)!.pool, id).toBe("taijutsu");
    }
  });

  it("Pílula Secreta e Modo Borboleta saem de Ninjutsu; o Bombardeio (golpe físico), de Taijutsu", () => {
    expect(allNodes().find((n) => n.id === "akimichi_apice")!.pool).toBe("ninjutsu");
    expect(allNodes().find((n) => n.id === PILL_GATED[0])!.pool).toBe("ninjutsu");
    expect(allNodes().find((n) => n.id === PILL_GATED[1])!.pool).toBe("taijutsu");
  });

  it("nenhum nó carrega reqAttribute — o gate cruzado virou o próprio reqPool", () => {
    for (const n of CLAN_TREES.akimichi!) expect(n.reqAttribute, n.id).toBeUndefined();
  });

  it("lockReason bloqueia Bofetada por Taijutsu insuficiente mesmo com o resto de sobra", () => {
    const node = allNodes().find((n) => n.id === "akimichi_bofetada")!;
    const owned = new Set([
      "akimichi_raiz",
      "akimichi_baika_parcial",
      "akimichi_baika",
      "akimichi_tanque",
      "akimichi_super_baika",
      "akimichi_mergulho",
    ]);
    expect(lockReason(snap({ owned, attributes: { taijutsu: 5 } }), node)).toMatch(/Taijutsu/);
    expect(lockReason(snap({ owned, attributes: { taijutsu: 18 } }), node)).toBeNull();
  });
});

describe("Akimichi: passiva da raiz — única fonte de dano permanente do clã", () => {
  const parcial = getAbility("akimichi_baika_parcial")!;

  it("CLAN_PASSIVES do Akimichi tem só um registro (a raiz) — o ápice virou skill, não passiva", () => {
    const doAkimichi = CLAN_PASSIVES.filter((p) => p.clanId === "akimichi");
    expect(doAkimichi.map((p) => p.nodeId)).toEqual(["akimichi_raiz"]);
  });

  it("Fartura do Clã dá +30% de dano e +1 casa de empurrão", () => {
    const m = passiveMods(["akimichi_raiz"], parcial);
    expect(m.damageMult).toBeCloseTo(1.6);
    expect(m.pushBonus).toBe(1);
  });

  it("passiva de Akimichi não afeta jutsu de Nara/Hyuuga, e vice-versa", () => {
    const possessao = getAbility("nara_possessao")!;
    const punho = getAbility("hyuuga_punho_suave")!;
    expect(passiveMods(["akimichi_raiz"], possessao).damageMult).toBe(1);
    expect(passiveMods(["akimichi_raiz"], punho).damageMult).toBe(1);
    expect(passiveMods(["nara_raiz"], parcial).damageMult).toBe(1);
    expect(passiveMods(["hyuuga_raiz"], parcial).damageMult).toBe(1);
  });

  it("passiva de Akimichi não afeta jutsu elemental", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["akimichi_raiz"], bola).damageMult).toBe(1);
  });
});

describe("Akimichi: jutsu SELF não precisam do truque de baseDamage 0", () => {
  it("nenhum dos quatro (Baika/Super Baika/Pílula Secreta/Modo Borboleta) tem baseDamage — SELF já aplica sem gate de dano", () => {
    for (const id of ["akimichi_baika", "akimichi_super_baika", "akimichi_apice", "akimichi_modo_borboleta"]) {
      expect(getAbility(id)!.baseDamage, id).toBeUndefined();
      expect(getAbility(id)!.shape, id).toBe("SELF");
    }
  });

  it("Modo Borboleta limpa Queimadura, Veneno, Sangramento e Lentidão", () => {
    expect(getAbility("akimichi_modo_borboleta")!.cleanses).toEqual(["BURN", "POISON", "BLEED", "SLOW"]);
  });
});

describe("Akimichi: Barreira de forma não soma (Baika -> Super Baika), mas outras fontes somam", () => {
  it("Baika e Super Baika usam o mesmo replaceGroup", () => {
    const baika = getAbility("akimichi_baika")!;
    const superBaika = getAbility("akimichi_super_baika")!;
    expect(baika.effects![0]!.replaceGroup).toBe("akimichi_forma");
    expect(superBaika.effects![0]!.replaceGroup).toBe("akimichi_forma");
    expect(baika.effects![0]!.replaceGroup).toBe(superBaika.effects![0]!.replaceGroup);
  });

  it("Modo Borboleta NÃO usa o mesmo grupo (não é a mesma 'forma' — soma normal com outras Barreiras)", () => {
    const borboleta = getAbility("akimichi_modo_borboleta")!;
    expect(borboleta.effects![0]!.replaceGroup).toBeUndefined();
  });
});

describe("Pílula Secreta: skill com duração (EMPOWERED) e debuff ao expirar (onExpire), não mais passiva permanente", () => {
  const pilula = getAbility("akimichi_apice")!;

  it("é ação bônus, categoria NINJUTSU, sem baseDamage — ingerir a pílula é rápido", () => {
    expect(pilula.actionType).toBe("BONUS");
    expect(pilula.category).toBe("NINJUTSU");
  });

  it("aplica EMPOWERED por 3 rodadas e vira Defesa Reduzida por 2 rodadas ao expirar", () => {
    const eff = pilula.effects!.find((e) => e.effectId === "EMPOWERED")!;
    expect(eff).toBeTruthy();
    expect(eff.duration).toBe(3);
    expect(eff.onExpire).toEqual({ effectId: "DEFENSE_DOWN", duration: 2 });
  });

  it("EMPOWERED multiplica o dano em +60% (bônus da Sobrecarga) e some quando expira", () => {
    const fisico = { category: "TAIJUTSU" };
    const ativo: EffectState[] = [{ effectId: "EMPOWERED", stacks: 1, duration: 3 }];
    const expirado: EffectState[] = [{ effectId: "EMPOWERED", stacks: 1, duration: 0 }];
    expect(empoweredDamageMult(ativo, fisico)).toBeCloseTo(1 + BALANCE.effects.EMPOWERED.dmgMultBonus);
    expect(empoweredDamageMult(expirado, fisico)).toBe(1);
    expect(empoweredDamageMult([], fisico)).toBe(1);
  });

  it("a Pílula nasce escopada pra dano FÍSICO — não deveria turbinar um ninjutsu elemental sem nada a ver", () => {
    const eff = pilula.effects!.find((e) => e.effectId === "EMPOWERED")!;
    expect(eff.empoweredScope).toBe("physical");
  });

  it("EMPOWERED escopado como 'physical' só multiplica TAIJUTSU/KENJUTSU (a descrição promete só 'Taijutsu/Kenjutsu')", () => {
    const comEscopo: EffectState[] = [
      { effectId: "EMPOWERED", stacks: 1, duration: 3, dataJson: JSON.stringify({ empoweredScope: { kind: "physical" } }) },
    ];
    expect(empoweredDamageMult(comEscopo, { category: "TAIJUTSU" })).toBeCloseTo(1.6);
    expect(empoweredDamageMult(comEscopo, { category: "KENJUTSU" })).toBeCloseTo(1.6);
    // Bukijutsu (arremesso de kunai/shuriken) fica de fora de propósito —
    // é físico, mas a descrição só promete Taijutsu/Kenjutsu.
    expect(empoweredDamageMult(comEscopo, { category: "BUKIJUTSU" })).toBe(1);
    expect(empoweredDamageMult(comEscopo, { category: "NINJUTSU" })).toBe(1);
    expect(empoweredDamageMult(comEscopo, { category: "GENJUTSU" })).toBe(1);
  });

  it("empilhado com a passiva da raiz, o pico de dano fica mais forte que a antiga passiva permanente (~2,0x) — é o preço de ser temporário", () => {
    const raizMult = passiveMods(["akimichi_raiz"], getAbility("akimichi_baika_parcial")!).damageMult;
    const pico = raizMult * empoweredDamageMult([{ effectId: "EMPOWERED", stacks: 1, duration: 3 }], { category: "TAIJUTSU" });
    expect(pico).toBeGreaterThan(1.6 * 1.55); // mais forte que a curva antiga (raiz*ápice permanentes)
  });
});

describe("parseEffectData: leitura pura do dataJson (formGroup / onExpire)", () => {
  it("dataJson vazio/nulo vira objeto vazio", () => {
    expect(parseEffectData(null)).toEqual({});
    expect(parseEffectData(undefined)).toEqual({});
    expect(parseEffectData("")).toEqual({});
  });

  it("dataJson inválido não quebra — vira objeto vazio", () => {
    expect(parseEffectData("{isso nao e json")).toEqual({});
  });

  it("lê formGroup e onExpire normalmente", () => {
    const raw = JSON.stringify({
      formGroup: { group: "akimichi_forma", amount: 32 },
      onExpire: { effectId: "DEFENSE_DOWN", duration: 2 },
    });
    expect(parseEffectData(raw)).toEqual({
      formGroup: { group: "akimichi_forma", amount: 32 },
      onExpire: { effectId: "DEFENSE_DOWN", duration: 2 },
    });
  });
});
