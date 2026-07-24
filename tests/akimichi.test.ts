import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { lockReason, type CharSnapshot } from "../src/services/characters/skill-tree.js";
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

const snap = (over: Partial<CharSnapshot> = {}): CharSnapshot => ({
  charId: "c1",
  name: "Teste",
  level: 50,
  ninjutsu: 100,
  spent: 0,
  points: 100,
  elements: [],
  owned: new Set(),
  clanId: "akimichi",
  attributes: {},
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

describe("Akimichi: reqAttribute — 'crescer' pede Ninjutsu, 'bater' pede Taijutsu, depois da pílula não pede nada", () => {
  it("nós de crescer pedem Ninjutsu", () => {
    for (const id of NINJUTSU_GATED) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.reqAttribute?.attribute, id).toBe("ninjutsu");
    }
  });

  it("nós de bater pedem Taijutsu", () => {
    for (const id of TAIJUTSU_GATED) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.reqAttribute?.attribute, id).toBe("taijutsu");
    }
  });

  it("Pílula Secreta e o que vem depois dela não têm reqAttribute — o gate é a própria árvore (prereq)", () => {
    for (const id of [...PILL_GATED, "akimichi_apice"]) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.reqAttribute, id).toBeUndefined();
    }
  });

  it("lockReason bloqueia Bofetada por Taijutsu insuficiente mesmo com nível/ninjutsu de sobra", () => {
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
    expect(m.damageMult).toBeCloseTo(1.3);
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
    const ativo: EffectState[] = [{ effectId: "EMPOWERED", stacks: 1, duration: 3 }];
    const expirado: EffectState[] = [{ effectId: "EMPOWERED", stacks: 1, duration: 0 }];
    expect(empoweredDamageMult(ativo)).toBeCloseTo(1 + BALANCE.effects.EMPOWERED.dmgMultBonus);
    expect(empoweredDamageMult(expirado)).toBe(1);
    expect(empoweredDamageMult([])).toBe(1);
  });

  it("empilhado com a passiva da raiz, o pico de dano fica mais forte que a antiga passiva permanente (~2,0x) — é o preço de ser temporário", () => {
    const raizMult = passiveMods(["akimichi_raiz"], getAbility("akimichi_baika_parcial")!).damageMult;
    const pico = raizMult * empoweredDamageMult([{ effectId: "EMPOWERED", stacks: 1, duration: 3 }]);
    expect(pico).toBeGreaterThan(1.3 * 1.55); // mais forte que a curva antiga (raiz*ápice permanentes)
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
