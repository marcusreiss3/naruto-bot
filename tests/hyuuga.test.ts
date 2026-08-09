import { describe, expect, it } from "vitest";
import { ALL_ABILITIES, getAbility, getClan } from "../src/data/index.js";
import { BALANCE } from "../src/config/balance.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";
import { lockReason, type CharSnapshot } from "../src/services/characters/skill-tree.js";
import { ATTRIBUTES } from "../src/config/enums.js";

const IDS = [
  "hyuuga_byakugan",
  "hyuuga_punho_suave",
  "hyuuga_palma_vacuo",
  "hyuuga_64_palmas",
  "hyuuga_palma_rotativa",
  "hyuuga_128_palmas",
  "hyuuga_leoes_gemeos",
] as const;

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
  fightingStyles: new Set(),
  owned: new Set(),
  clanId: "hyuuga",
  attributes: RICO,
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

  it("Byakugan é DOJUTSU; o resto é TAIJUTSU (físico) — nenhum é CLA genérico", () => {
    expect(getAbility("hyuuga_byakugan")!.category).toBe("DOJUTSU");
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

describe("Hyuuga: pool por atributo — o olho paga com Dōjutsu, o punho com Taijutsu", () => {
  it("raiz e Byakugan saem do pool de Dōjutsu", () => {
    for (const id of ["hyuuga_raiz", "hyuuga_byakugan"]) {
      expect(allNodes().find((n) => n.id === id)!.pool, id).toBe("dojutsu");
    }
  });

  it("do Punho Suave em diante a árvore sai do pool de Taijutsu", () => {
    for (const id of IDS.filter((i) => i !== "hyuuga_byakugan")) {
      expect(allNodes().find((n) => n.id === id)!.pool, id).toBe("taijutsu");
    }
  });

  it("nenhum nó carrega reqAttribute — o gate cruzado virou o próprio reqPool", () => {
    for (const n of CLAN_TREES.hyuuga!) expect(n.reqAttribute, n.id).toBeUndefined();
  });

  it("lockReason bloqueia o Byakugan por Dōjutsu insuficiente, mesmo com o resto de sobra", () => {
    const node = allNodes().find((n) => n.id === "hyuuga_byakugan")!;
    const owned = new Set(["hyuuga_raiz"]);
    expect(lockReason(snap({ owned, attributes: { dojutsu: 2 } }), node)).toMatch(/Dōjutsu/);
    expect(lockReason(snap({ owned, attributes: { dojutsu: 3 } }), node)).toBeNull();
  });

  it("lockReason bloqueia Punho Suave por Taijutsu insuficiente", () => {
    const node = allNodes().find((n) => n.id === "hyuuga_punho_suave")!;
    const owned = new Set(["hyuuga_raiz", "hyuuga_byakugan"]);
    expect(lockReason(snap({ owned, attributes: { taijutsu: 3 } }), node)).toMatch(/Taijutsu/);
    expect(lockReason(snap({ owned, attributes: { taijutsu: 4 } }), node)).toBeNull();
  });

  it("a raiz custa 1 de Dōjutsu — passa mesmo com o personagem sem nada investido", () => {
    const raiz = allNodes().find((n) => n.id === "hyuuga_raiz")!;
    expect(raiz.cost).toBe(1);
    expect(lockReason(snap({ attributes: {} }), raiz)).toBeNull();
  });
});

describe("Hyuuga: Selo dos Tenketsu — efeito exclusivo do clã", () => {
  const COM_SELO = [
    ["hyuuga_punho_suave", 1, 0.4],
    ["hyuuga_64_palmas", 1, 0.75],
    ["hyuuga_128_palmas", 1, 0.8],
    ["hyuuga_leoes_gemeos", 2, undefined],
  ] as const;

  it("as quatro técnicas de tenketsu aplicam TENKETSU_SEAL, não o NINJUTSU_BLOCK genérico", () => {
    for (const [id, duration, chance] of COM_SELO) {
      const selo = getAbility(id)!.effects!.find((e) => e.effectId === "TENKETSU_SEAL");
      expect(selo, id).toBeTruthy();
      expect(selo!.duration, id).toBe(duration);
      expect(selo!.chance, id).toBe(chance);
      expect(getAbility(id)!.effects!.some((e) => e.effectId === "NINJUTSU_BLOCK"), id).toBe(false);
    }
  });

  it("nenhuma ability FORA do Hyuuga usa o selo — Fuinjutsu e Genjutsu seguem no NINJUTSU_BLOCK", () => {
    const forasteiras = ALL_ABILITIES.filter(
      (a) => a.effects?.some((e) => e.effectId === "TENKETSU_SEAL") && a.requirements?.clanId !== "hyuuga",
    );
    expect(forasteiras.map((a) => a.id)).toEqual([]);
  });

  it("o selo pesa mais que o Bloqueio de Ninjutsu na régua de custo (fecha 3 categorias, não 1)", () => {
    const F = BALANCE.jutsuCostFormula.effectSeverity;
    expect(F.TENKETSU_SEAL).toBeGreaterThan(F.NINJUTSU_BLOCK!);
  });

  // A Clareza Mental limpava o selo, mas morava no support.ts e foi apagada em
  // 09/08/2026. A contra-jogada passou pros Mosquitos de Agua, na arvore de
  // Iryo real, como REDUCAO de duracao — a tecnica nunca limpa nada, so'
  // encurta, e vem de fora (shape ALLY): selado, voce nao lanca Iryo em si.
  it("Mosquitos de Água (Iryō) é a contra-jogada: encurta o selo dos tenketsu", () => {
    const mosquitos = getAbility("iryo_mosquitos")!;
    expect(mosquitos.shape).toBe("ALLY");
    expect(mosquitos.reduceEffectDuration?.some((r) => r.effectId === "TENKETSU_SEAL")).toBe(true);
    // o dispel de Genjutsu NAO limpa: o selo e' dano fisico na rede de chakra
    expect(getAbility("gen_contra_genjutsu")!.cleanses ?? []).not.toContain("TENKETSU_SEAL");
  });
});

describe("Hyuuga: passivas — atravessa defesa, sela chakra", () => {
  const punho = getAbility("hyuuga_punho_suave")!;

  // O cla continua ganhando por perfurar defesa e selar chakra — mas isso
  // sozinho o deixava em ultimo lugar de dano entre os clas ofensivos, entao
  // a RAIZ tambem multiplica. O apice segue sem multiplicador (e' perfuracao
  // + execucao), pra nao empilhar dois.
  it("só a raiz multiplica dano; o ápice continua sendo perfuração + execução", () => {
    const comDano = CLAN_PASSIVES.filter((p) => p.clanId === "hyuuga" && "damageMult" in p);
    expect(comDano.map((p) => p.nodeId)).toEqual(["hyuuga_raiz", "hyuuga_apice"]);
  });

  it("Olhos Brancos dá +10% de dano, corta 10% do custo e soma 10 pontos de chance de Selo dos Tenketsu", () => {
    const m = passiveMods(["hyuuga_raiz"], punho);
    expect(m.damageMult).toBeCloseTo(1.10);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(m.effectChanceBonus.TENKETSU_SEAL).toBeCloseTo(0.1);
  });

  it("Rede de Tenketsu ignora Barreira, executa abaixo de 30% de vida e estende o Selo dos Tenketsu", () => {
    const m = passiveMods(["hyuuga_apice"], punho);
    expect(m.damageMult).toBeCloseTo(1.2);
    expect(m.ignoresShield).toBe(true);
    expect(m.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.25 });
    expect(m.effectDurationBonus.TENKETSU_SEAL).toBe(1);
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
    expect(rotativa.actionType).toBe("REACAO");
    expect(rotativa.reactionKind).toBe("BLOCK");
    const m = passiveMods(["hyuuga_guarda_perpetua"], rotativa);
    expect(m.effectDurationBonus.SHIELD).toBe(1);
    expect(characterPassiveMods(["hyuuga_guarda_perpetua"]).ninjutsuDodgeBonus).toBeCloseTo(0.08);
  });
});
