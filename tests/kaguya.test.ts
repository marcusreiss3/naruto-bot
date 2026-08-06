import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";

const IDS = [
  "kaguya_dez_dedos",
  "kaguya_salgueiro",
  "kaguya_larico",
  "kaguya_camelias",
  "kaguya_impulso_flor",
  "kaguya_danca_flor",
] as const;

describe("Kaguya: integridade da arvore de cla", () => {
  it("liga os seis jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "kaguya" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Kaguya tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.kaguya!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Kaguya e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "kaguya", manualOnly: true });
    }
  });

  it("cinco são TAIJUTSU; a Dança das Camélias é KENJUTSU (espada de osso de verdade)", () => {
    for (const id of IDS.filter((i) => i !== "kaguya_camelias")) {
      expect(getAbility(id)!.category, id).toBe("TAIJUTSU");
    }
    expect(getAbility("kaguya_camelias")!.category).toBe("KENJUTSU");
    expect(getAbility("kaguya_camelias")!.scalingAttribute).toBe("kenjutsu");
  });

  it("os cinco de osso saem do pool de Taijutsu, como no escalonamento pedido", () => {
    for (const id of IDS.filter((i) => i !== "kaguya_camelias")) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.pool, id).toBe("taijutsu");
    }
  });

  it("a Dança das Camélias sai do pool de Kenjutsu, não de Taijutsu — ela CRIA a espada, mesmo padrão da Lâmina do Hatake", () => {
    const node = allNodes().find((n) => n.id === "kaguya_camelias")!;
    expect(node.pool).toBe("kenjutsu");
    expect(node.reqPool).toBe(11);
  });

  it("as quatro passivas (raiz, armadura, fio de osso, ápice) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "kaguya")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "kaguya").length).toBe(4);
  });

  it("clã Kaguya existe e referencia as seis habilidades em activeIds", () => {
    const clan = getClan("kaguya");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Kaguya: ramificação Ossos x Kenjutsu, convergindo no ápice", () => {
  it("tronco reto (col 0) até Dança do Salgueiro", () => {
    const order = ["kaguya_raiz", "kaguya_dez_dedos", "kaguya_salgueiro"];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("ramifica em Ossos (col -1, 3 nós) e Kenjutsu (col +1, 2 nós) a partir do Salgueiro", () => {
    const larico = allNodes().find((n) => n.id === "kaguya_larico")!;
    const armadura = allNodes().find((n) => n.id === "kaguya_armadura_espinhos")!;
    const impulso = allNodes().find((n) => n.id === "kaguya_impulso_flor")!;
    for (const n of [larico, armadura, impulso]) expect(n.col).toBe(-1);
    expect(larico.requires).toEqual(["kaguya_salgueiro"]);
    expect(armadura.requires).toEqual(["kaguya_larico"]);
    expect(impulso.requires).toEqual(["kaguya_armadura_espinhos"]);

    const camelias = allNodes().find((n) => n.id === "kaguya_camelias")!;
    const fioOsso = allNodes().find((n) => n.id === "kaguya_fio_osso")!;
    for (const n of [camelias, fioOsso]) expect(n.col).toBe(1);
    expect(camelias.requires).toEqual(["kaguya_salgueiro"]);
    expect(fioOsso.requires).toEqual(["kaguya_camelias"]);
  });

  it("Fio de Osso também pede Kenjutsu — multiplica dano de espada, faz sentido exigir espada", () => {
    const fioOsso = allNodes().find((n) => n.id === "kaguya_fio_osso")!;
    expect(fioOsso.pool).toBe("kenjutsu");
  });

  it("Ossos Perfeitos (ápice) converge Impulso da Flor + Fio de Osso antes da Dança da Flor", () => {
    const apice = allNodes().find((n) => n.id === "kaguya_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["kaguya_impulso_flor", "kaguya_fio_osso"]));
    expect(apice.col).toBe(0);

    const flor = allNodes().find((n) => n.id === "kaguya_danca_flor")!;
    expect(flor.requires).toEqual(["kaguya_apice"]);
    expect(flor.col).toBe(0);
  });
});

describe("Kaguya: Dança da Flor — finalizador, arma de osso incrivelmente destrutiva", () => {
  const flor = getAbility("kaguya_danca_flor")!;

  it("ignora Bloqueio e Aparo, mas pode ser esquivada e é o jutsu mais forte do clã", () => {
    expect(flor.unguardable).toBe(true);
    expect(flor.undodgeable).toBeFalsy();
    for (const id of IDS.filter((i) => i !== "kaguya_danca_flor")) {
      expect(flor.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });
});

describe("Kaguya: passivas — regeneração óssea, armadura de espinhos e Kenjutsu", () => {
  const dezDedos = getAbility("kaguya_dez_dedos")!;
  const camelias = getAbility("kaguya_camelias")!;

  it("Esqueleto Vivo corta 10% do custo e regenera vida no início do turno (ossos novos e fortes)", () => {
    const m = passiveMods(["kaguya_raiz"], dezDedos);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(characterPassiveMods(["kaguya_raiz"]).hpRegenPerTurn).toBe(5);
  });

  it("Armadura de Espinhos devolve dano fixo em quem acerta com golpe físico corpo a corpo", () => {
    expect(characterPassiveMods(["kaguya_armadura_espinhos"]).meleeCounterDamage).toBe(10);
  });

  it("Fio de Osso só multiplica dano de Kenjutsu (a Dança das Camélias), não os jutsus de osso comuns", () => {
    const mKen = passiveMods(["kaguya_fio_osso"], camelias);
    expect(mKen.damageMult).toBe(1);
    expect(mKen.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.25 });

    const mOsso = passiveMods(["kaguya_fio_osso"], dezDedos); // escala por taijutsu, não kenjutsu
    expect(mOsso.damageMult).toBe(1);
  });

  it("Ossos Perfeitos (ápice) soma chance de Sangramento e alcance à distância", () => {
    const m = passiveMods(["kaguya_apice"], dezDedos); // SINGLE_TARGET, dentro de rangeShapes
    expect(m.damageMult).toBeCloseTo(1.15);
    expect(m.effectChanceBonus.BLEED).toBeCloseTo(0.15);
    expect(m.rangeBonus).toBe(1);

    const larico = getAbility("kaguya_larico")!; // RADIUS, fora de rangeShapes
    expect(passiveMods(["kaguya_apice"], larico).rangeBonus).toBe(0);
  });

  it("nenhuma passiva de Kaguya afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["kaguya_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], dezDedos).costMult).toBe(1);
    expect(passiveMods(["kaguya_raiz"], bola).costMult).toBe(1);
    expect(characterPassiveMods(["nara_raiz"]).meleeCounterDamage).toBe(0);
  });
});
