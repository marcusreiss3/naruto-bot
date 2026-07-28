import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";

const IDS = [
  "yuki_agulhas",
  "yuki_espelho",
  "yuki_domo",
  "yuki_chuva_agulhas",
  "yuki_agulhas_mil",
] as const;

describe("Yuki: integridade da arvore de cla", () => {
  it("liga os cinco jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "yuki" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Yuki tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.yuki!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Yuki e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "yuki", manualOnly: true });
    }
  });

  it("todos os cinco são categoria NINJUTSU", () => {
    for (const id of IDS) expect(getAbility(id)!.category, id).toBe("NINJUTSU");
  });

  it("as quatro passivas (raiz, presença, reflexos, ápice) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "yuki")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "yuki").length).toBe(4);
  });

  it("tronco principal é reto (col 0), sem exigir nada da ramificação de defesa", () => {
    const order = [
      "yuki_raiz",
      "yuki_agulhas",
      "yuki_espelho",
      "yuki_presenca",
      "yuki_chuva_agulhas",
      "yuki_apice",
      "yuki_agulhas_mil",
    ];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("a ramificação de defesa (Domo + Reflexos) sai das Agulhas de Gelo e termina em beco sem saída", () => {
    const domo = allNodes().find((n) => n.id === "yuki_domo")!;
    const reflexos = allNodes().find((n) => n.id === "yuki_reflexos")!;
    expect(domo.col).toBe(1);
    expect(reflexos.col).toBe(1);
    expect(domo.requires).toEqual(["yuki_agulhas"]);
    expect(reflexos.requires).toEqual(["yuki_domo"]);

    const dependentesDeReflexos = allNodes().filter((n) => n.requires.includes("yuki_reflexos"));
    expect(dependentesDeReflexos).toEqual([]);
  });

  it("todos os nós saem do pool de Ninjutsu, sem reqAttribute cruzado", () => {
    for (const n of CLAN_TREES.yuki!) {
      expect(n.pool, n.id).toBe("ninjutsu");
      expect(n.reqAttribute, n.id).toBeUndefined();
    }
  });

  it("custo total fecha em 34 pontos — igual ao Hoshigaki, dano médio pro preço", () => {
    const total = CLAN_TREES.yuki!.reduce((a, n) => a + n.cost, 0);
    expect(total).toBe(34);
  });

  it("clã Yuki existe e referencia as cinco habilidades em activeIds", () => {
    const clan = getClan("yuki");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Yuki: Mil Agulhas Voadoras de Água da Morte — finalizador indefensável", () => {
  const mil = getAbility("yuki_agulhas_mil")!;

  it("não pode ser esquivada e é o jutsu de maior dano do clã", () => {
    expect(mil.undodgeable).toBe(true);
    for (const id of IDS.filter((i) => i !== "yuki_agulhas_mil")) {
      expect(mil.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });

  it("a descrição usa a frase exata do glossário ('rápido demais pra esquivar')", () => {
    expect(mil.description).toMatch(/rápido demais pra esquivar/i);
  });

  it("exige só o tronco principal (o ápice), não a ramificação de defesa", () => {
    const node = allNodes().find((n) => n.id === "yuki_agulhas_mil")!;
    expect(node.requires).toEqual(["yuki_apice"]);
  });
});

describe("Yuki: Domo de Iceberg — defesa pura, sem dano, prende quem está corpo a corpo", () => {
  const domo = getAbility("yuki_domo")!;

  it("não tem baseDamage e é SELF — dá Barreira", () => {
    expect(domo.baseDamage).toBeUndefined();
    expect(domo.shape).toBe("SELF");
    expect(domo.effects).toEqual([{ effectId: "SHIELD", stacks: 16, duration: 3 }]);
  });

  it("trapField prende inimigos adjacentes (ROOT, raio 1) até a Barreira quebrar", () => {
    expect(domo.trapField).toEqual({ effectId: "ROOT", radius: 1, duration: 3 });
  });
});

describe("Yuki: passivas — dano de graça na raiz, ápice de controle (sem multiplicador extra)", () => {
  const espelho = getAbility("yuki_espelho")!;

  it("Sangue de Gelo dá +15% de dano e corta 10% de custo", () => {
    const m = passiveMods(["yuki_raiz"], espelho);
    expect(m.damageMult).toBeCloseTo(1.15);
    expect(m.costMult).toBeCloseTo(0.9);
  });

  it("Presença Silenciosa soma chance de Defesa Reduzida", () => {
    expect(passiveMods(["yuki_presenca"], espelho).effectChanceBonus.DEFENSE_DOWN).toBeCloseTo(0.15);
  });

  it("Reflexos Gélidos dá esquiva extra contra Ninjutsu (mod de personagem, não por-jutsu)", () => {
    const p = CLAN_PASSIVES.find((x) => x.nodeId === "yuki_reflexos")!;
    expect(p.ninjutsuDodgeBonus).toBeCloseTo(0.08);
  });

  it("Domínio do Espelho de Gelo (ápice) é só controle — sem damageMult", () => {
    const p = CLAN_PASSIVES.find((x) => x.nodeId === "yuki_apice")!;
    expect(p.damageMult).toBeUndefined();
    expect(p.effectChanceBonus?.DEFENSE_DOWN).toBeCloseTo(0.1);
    expect(p.effectDurationBonus).toEqual({ effectId: "SLOW", bonus: 1 });
  });

  it("nenhuma passiva de Yuki afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["yuki_raiz"], possessao).damageMult).toBe(1);
    expect(passiveMods(["nara_raiz"], espelho).damageMult).toBe(1);
    expect(passiveMods(["yuki_raiz"], bola).damageMult).toBe(1);
  });
});

describe("Yuki: são Suiton de verdade — a passiva de Água empilha com a do próprio clã", () => {
  const espelho = getAbility("yuki_espelho")!;

  it("todos os cinco têm element: AGUA, além de requirements.clanId", () => {
    for (const id of IDS) expect(getAbility(id)!.element, id).toBe("AGUA");
  });

  it("as duas passivas empilham quando o personagem tem as duas árvores (Água + Yuki)", () => {
    const m = passiveMods(["agua_raiz", "yuki_raiz"], espelho);
    expect(m.damageMult).toBeCloseTo(1.15 * 1.15);
    expect(m.costMult).toBeCloseTo(0.85 * 0.9);
  });
});
