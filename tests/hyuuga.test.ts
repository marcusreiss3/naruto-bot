import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";
import { lockReason, type CharSnapshot } from "../src/services/characters/skill-tree.js";

const IDS = [
  "hyuuga_byakugan",
  "hyuuga_punho_suave",
  "hyuuga_palma_vacuo",
  "hyuuga_64_palmas",
  "hyuuga_palma_rotativa",
  "hyuuga_128_palmas",
  "hyuuga_leoes_gemeos",
] as const;

const snap = (over: Partial<CharSnapshot> = {}): CharSnapshot => ({
  charId: "c1",
  name: "Teste",
  level: 50,
  ninjutsu: 100,
  spent: 0,
  points: 100,
  elements: [],
  owned: new Set(),
  clanId: "hyuuga",
  attributes: {},
  ...over,
});

describe("Hyuuga: integridade da arvore de cla", () => {
  it("liga os sete jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "hyuuga" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Hyuuga tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.hyuuga!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Hyuuga e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "hyuuga", manualOnly: true });
    }
  });

  it("Byakugan é NINJUTSU (chakra/visão); o resto é TAIJUTSU (físico) — nenhum é CLA genérico", () => {
    expect(getAbility("hyuuga_byakugan")!.category).toBe("NINJUTSU");
    for (const id of IDS.filter((i) => i !== "hyuuga_byakugan")) {
      expect(getAbility(id)!.category, id).toBe("TAIJUTSU");
    }
  });

  it("todas as técnicas miram tenketsu só visíveis com o Byakugan ativo — exceto o próprio toggle", () => {
    for (const id of IDS.filter((i) => i !== "hyuuga_byakugan")) {
      expect(getAbility(id)!.requiresActiveDoujutsu, id).toEqual({
        flag: "byakuganActive",
        label: "Byakugan",
      });
    }
    expect(getAbility("hyuuga_byakugan")!.requiresActiveDoujutsu).toBeUndefined();
  });

  it("os três nós PASSIVE (raiz, Guarda Perpétua e ápice) têm definição de passiva", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "hyuuga")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "hyuuga").length).toBe(3);
  });

  it("tronco reto (col 0) até Punho Suave", () => {
    const order = ["hyuuga_raiz", "hyuuga_byakugan", "hyuuga_punho_suave"];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("ramifica em ofensivo (col -1, 3 nós) e defensivo (col +1, 2 nós) a partir de Punho Suave", () => {
    const ofensivos = ["hyuuga_palma_vacuo", "hyuuga_64_palmas", "hyuuga_128_palmas"];
    for (const id of ofensivos) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.col, id).toBe(-1);
    }
    expect(allNodes().find((n) => n.id === "hyuuga_palma_vacuo")!.requires).toEqual(["hyuuga_punho_suave"]);
    expect(allNodes().find((n) => n.id === "hyuuga_64_palmas")!.requires).toEqual(["hyuuga_palma_vacuo"]);
    expect(allNodes().find((n) => n.id === "hyuuga_128_palmas")!.requires).toEqual(["hyuuga_64_palmas"]);

    const rotativa = allNodes().find((n) => n.id === "hyuuga_palma_rotativa")!;
    expect(rotativa.col).toBe(1);
    expect(rotativa.requires).toEqual(["hyuuga_punho_suave"]);

    // Guarda Perpétua fecha o ramo defensivo, abaixo da Palma Rotativa
    const guarda = allNodes().find((n) => n.id === "hyuuga_guarda_perpetua")!;
    expect(guarda.col).toBe(1);
    expect(guarda.kind).toBe("PASSIVE");
    expect(guarda.requires).toEqual(["hyuuga_palma_rotativa"]);

    const dependentesDaRotativa = allNodes().filter((n) => n.requires.includes("hyuuga_palma_rotativa"));
    expect(dependentesDaRotativa.map((n) => n.id)).toEqual(["hyuuga_guarda_perpetua"]);
  });

  it("Rede de Tenketsu converge os dois ramos (128 Palmas ofensivo + Guarda Perpétua defensivo) antes dos Leões Gêmeos", () => {
    const apice = allNodes().find((n) => n.id === "hyuuga_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["hyuuga_128_palmas", "hyuuga_guarda_perpetua"]));
    expect(apice.col).toBe(0);

    const leoes = allNodes().find((n) => n.id === "hyuuga_leoes_gemeos")!;
    expect(leoes.requires).toEqual(["hyuuga_apice"]);
    expect(leoes.col).toBe(0);
  });

  it("clã Hyuuga existe e referencia as sete habilidades em activeIds", () => {
    const clan = getClan("hyuuga");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Hyuuga: reqAttribute — 'desbloqueia upando X' (Dojutsu/Taijutsu)", () => {
  it("Byakugan pede Dojutsu; o resto pede Taijutsu", () => {
    const byakugan = allNodes().find((n) => n.id === "hyuuga_byakugan")!;
    expect(byakugan.reqAttribute).toEqual({ attribute: "dojutsu", value: 3 });

    for (const id of IDS.filter((i) => i !== "hyuuga_byakugan")) {
      const node = allNodes().find((n) => n.id === id)!;
      expect(node.reqAttribute?.attribute, id).toBe("taijutsu");
    }
  });

  it("lockReason bloqueia por Dojutsu insuficiente mesmo com nível/ninjutsu/pontos de sobra", () => {
    const node = allNodes().find((n) => n.id === "hyuuga_byakugan")!;
    const semDojutsu = snap({ owned: new Set(["hyuuga_raiz"]), attributes: { dojutsu: 2 } });
    expect(lockReason(semDojutsu, node)).toMatch(/Dōjutsu/);

    const comDojutsu = snap({ owned: new Set(["hyuuga_raiz"]), attributes: { dojutsu: 3 } });
    expect(lockReason(comDojutsu, node)).toBeNull();
  });

  it("lockReason bloqueia por Taijutsu insuficiente", () => {
    const node = allNodes().find((n) => n.id === "hyuuga_punho_suave")!;
    const owned = new Set(["hyuuga_raiz", "hyuuga_byakugan"]);
    expect(lockReason(snap({ owned, attributes: { taijutsu: 2 } }), node)).toMatch(/Taijutsu/);
    expect(lockReason(snap({ owned, attributes: { taijutsu: 3 } }), node)).toBeNull();
  });

  it("nó sem reqAttribute (ex: raiz) não é afetado pelo gate", () => {
    const raiz = allNodes().find((n) => n.id === "hyuuga_raiz")!;
    expect(raiz.reqAttribute).toBeUndefined();
    expect(lockReason(snap({ attributes: {} }), raiz)).toBeNull();
  });
});

describe("Hyuuga: passivas — atravessa defesa, sela chakra", () => {
  const punho = getAbility("hyuuga_punho_suave")!;

  it("nenhuma passiva de Hyuuga multiplica dano (o clã ganha por perfurar defesa, não por rajada)", () => {
    for (const p of CLAN_PASSIVES.filter((p) => p.clanId === "hyuuga")) {
      expect("damageMult" in p).toBe(false);
    }
  });

  it("Olhos Brancos corta 10% do custo e soma 10 pontos de chance de Bloqueio de Ninjutsu", () => {
    const m = passiveMods(["hyuuga_raiz"], punho);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(m.effectChanceBonus.NINJUTSU_BLOCK).toBeCloseTo(0.1);
  });

  it("Rede de Tenketsu ignora Barreira, executa abaixo de 30% de vida e estende o Bloqueio de Ninjutsu", () => {
    const m = passiveMods(["hyuuga_apice"], punho);
    expect(m.ignoresShield).toBe(true);
    expect(m.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.25 });
    expect(m.effectDurationBonus.NINJUTSU_BLOCK).toBe(1);
  });

  it("passiva de Hyuuga não afeta jutsu de Nara, e vice-versa (clãs isolados entre si)", () => {
    const possessao = getAbility("nara_possessao")!;
    expect(passiveMods(["hyuuga_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], punho).costMult).toBe(1);
  });

  it("passiva de Hyuuga não afeta jutsu elemental", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["hyuuga_raiz"], bola).costMult).toBe(1);
  });

  it("Guarda Perpétua estende a Barreira da Palma Rotativa e soma esquiva permanente contra Ninjutsu", () => {
    const rotativa = getAbility("hyuuga_palma_rotativa")!;
    const m = passiveMods(["hyuuga_guarda_perpetua"], rotativa);
    expect(m.effectDurationBonus.SHIELD).toBe(1);
    expect(characterPassiveMods(["hyuuga_guarda_perpetua"]).ninjutsuDodgeBonus).toBeCloseTo(0.08);
  });
});
