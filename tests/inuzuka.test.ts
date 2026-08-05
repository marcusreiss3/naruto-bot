import { describe, expect, it } from "vitest";
import { getAbility, getClan, getNpc } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { empoweredDamageMult, type EffectState } from "../src/services/combat/effects.js";

const IDS = [
  "inuzuka_cao_ninja",
  "inuzuka_quatro_patas",
  "inuzuka_clone_besta",
  "inuzuka_sobre_presa",
  "inuzuka_presa_sobre_presa",
  "inuzuka_lobo_duas_cabecas",
  "inuzuka_presa_de_lobo",
  "inuzuka_lobo_tres_cabecas",
  "inuzuka_cauda_perseguidora",
] as const;

// So funcionam com o cao ninja vivo em campo.
const REQUIRES_PET_IDS = [
  "inuzuka_clone_besta",
  "inuzuka_presa_sobre_presa",
  "inuzuka_lobo_duas_cabecas",
  "inuzuka_presa_de_lobo",
  "inuzuka_lobo_tres_cabecas",
  "inuzuka_cauda_perseguidora",
] as const;
// Funcionam sozinho, sem o cao.
const SOLO_IDS = ["inuzuka_cao_ninja", "inuzuka_quatro_patas", "inuzuka_sobre_presa"] as const;

describe("Inuzuka: integridade da arvore de cla", () => {
  it("liga os nove jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "inuzuka" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Inuzuka tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.inuzuka!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Inuzuka e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "inuzuka", manualOnly: true });
    }
  });

  it("os dois nós PASSIVE (raiz e ápice) têm definição de passiva", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "inuzuka")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("do ápice em diante (Fusão) é tronco reto, sem ramos", () => {
    const order = [
      "inuzuka_presa_sobre_presa",
      "inuzuka_lobo_duas_cabecas",
      "inuzuka_presa_de_lobo",
      "inuzuka_lobo_tres_cabecas",
      "inuzuka_apice",
      "inuzuka_cauda_perseguidora",
    ];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("saindo da raiz a árvore se ramifica: Quatro Patas/Sobre Presa (col -1) e Clone da Besta (col +1)", () => {
    const quatroPatas = allNodes().find((n) => n.id === "inuzuka_quatro_patas")!;
    const sobrePresa = allNodes().find((n) => n.id === "inuzuka_sobre_presa")!;
    const cloneBesta = allNodes().find((n) => n.id === "inuzuka_clone_besta")!;
    expect(quatroPatas.col).toBe(-1);
    expect(sobrePresa.col).toBe(-1);
    expect(cloneBesta.col).toBe(1);
    expect(quatroPatas.requires).toEqual(["inuzuka_raiz"]);
    expect(cloneBesta.requires).toEqual(["inuzuka_raiz"]);
    expect(sobrePresa.requires).toEqual(["inuzuka_quatro_patas"]);
  });

  it("Presa Sobre Presa CONVERGE os dois ramos: exige Sobre Presa E Clone da Besta, de volta à coluna central", () => {
    const merge = allNodes().find((n) => n.id === "inuzuka_presa_sobre_presa")!;
    expect(new Set(merge.requires)).toEqual(new Set(["inuzuka_sobre_presa", "inuzuka_clone_besta"]));
    expect(merge.col).toBe(0);
  });

  it("Cão Ninja fica ISOLADO na árvore: sem pré-requisito, e nada mais o exige (nasce com o personagem)", () => {
    const cao = allNodes().find((n) => n.id === "inuzuka_cao_ninja")!;
    expect(cao.requires).toEqual([]);
    expect(cao.reqLevel).toBe(1);
    expect(cao.reqPool).toBe(1);
    const dependentes = allNodes().filter((n) => n.requires.includes("inuzuka_cao_ninja"));
    expect(dependentes).toEqual([]);
  });

  it("clã Inuzuka concede o Cão Ninja automaticamente ao escolher o clã (autoGrantedNodeIds)", () => {
    const clan = getClan("inuzuka")!;
    expect(clan.autoGrantedNodeIds).toEqual(["inuzuka_cao_ninja"]);
  });

  it("clã Inuzuka existe e referencia as nove habilidades em activeIds", () => {
    const clan = getClan("inuzuka");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Inuzuka: pool por atributo — invocar/fundir paga Ninjutsu, girar/morder paga Taijutsu", () => {
  it("invocação e transformações saem do pool de Ninjutsu", () => {
    const ninjutsuIds = [
      "inuzuka_cao_ninja",
      "inuzuka_clone_besta",
      "inuzuka_lobo_duas_cabecas",
      "inuzuka_lobo_tres_cabecas",
    ] as const;
    for (const id of ninjutsuIds) {
      expect(allNodes().find((n) => n.id === id)!.pool, id).toBe("ninjutsu");
    }
  });

  it("as brocas e a postura animal saem do pool de Taijutsu", () => {
    const taijutsuIds = [
      "inuzuka_quatro_patas",
      "inuzuka_sobre_presa",
      "inuzuka_presa_sobre_presa",
      "inuzuka_presa_de_lobo",
      "inuzuka_cauda_perseguidora",
    ] as const;
    for (const id of taijutsuIds) {
      expect(allNodes().find((n) => n.id === id)!.pool, id).toBe("taijutsu");
    }
  });

  it("nenhum nó carrega reqAttribute — o gate cruzado virou o próprio reqPool", () => {
    for (const n of CLAN_TREES.inuzuka!) expect(n.reqAttribute, n.id).toBeUndefined();
  });
});

describe("Inuzuka: Cão Ninja — invocação com 1/3 da vida do dono", () => {
  const cao = getAbility("inuzuka_cao_ninja")!;

  it("é ação bônus, usável uma vez por combate, e invoca o template certo", () => {
    expect(cao.actionType).toBe("BONUS");
    expect(cao.oncePerCombat).toBe(true);
    expect(cao.summon?.templateId).toBe("cao_ninja");
  });

  it("hpFraction é 1/3 — a vida real vem do dono, não de um hpMax fixo", () => {
    expect(cao.summon?.hpFraction).toBeCloseTo(1 / 3);
  });

  it("o template do cão existe, tem vida e pelo menos um jutsu real", () => {
    const tpl = getNpc("cao_ninja")!;
    expect(tpl).toBeTruthy();
    expect(tpl.hpMax).toBeGreaterThan(0);
    expect(tpl.abilityIds.length).toBeGreaterThan(0);
    for (const id of tpl.abilityIds) expect(getAbility(id), id).toBeTruthy();
  });

  it("a mordida do cão é conteúdo de NPC de verdade: custo 0 e sem requirements de desbloqueio", () => {
    const mordida = getAbility("cao_ninja_mordida")!;
    expect(mordida.cost).toBe(0);
    expect(mordida.requirements).toBeUndefined();
  });
});

describe("Inuzuka: técnicas que precisam do cão vivo em campo (requiresPet)", () => {
  it("as seis técnicas de combo exigem o cão vivo", () => {
    for (const id of REQUIRES_PET_IDS) {
      expect(getAbility(id)!.requiresPet, id).toBe(true);
    }
  });

  it("Cão Ninja, Quatro Patas e Sobre Presa funcionam sozinhos (sem requiresPet)", () => {
    for (const id of SOLO_IDS) {
      expect(getAbility(id)!.requiresPet, id).toBeUndefined();
    }
  });
});

describe("Inuzuka: passivas — vínculo com a matilha, que agora também dá dano", () => {
  const cao = getAbility("inuzuka_cao_ninja")!;

  // O dano bruto entrou na RAIZ (era 1.00x) porque a arvore custa 46 PN — a
  // segunda mais cara — com 5 jutsus de dano, e entregava menos que arvores
  // de metade do preco. Isso furava a regra "arvore cara entrega dano" que o
  // resto de clan-trees/passives.ts segue. O apice continua sem multiplicador:
  // ele e' execucao + Atordoar, pra nao empilhar dois multiplicadores.
  it("só a raiz multiplica dano bruto; o ápice continua sendo execução", () => {
    const comDano = CLAN_PASSIVES.filter((p) => p.clanId === "inuzuka" && "damageMult" in p);
    expect(comDano.map((p) => p.nodeId)).toEqual(["inuzuka_raiz"]);
  });

  it("Vínculo de Matilha dá +50% de dano, corta 10% do custo e soma 30% de vida na invocação do cão", () => {
    const m = passiveMods(["inuzuka_raiz"], cao);
    expect(m.damageMult).toBeCloseTo(1.5);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(m.summonHpBonus).toBeCloseTo(0.3);
  });

  it("Instinto de Caçador executa alvos machucados e soma chance de Atordoar", () => {
    const m = passiveMods(["inuzuka_apice"], cao);
    expect(m.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.3 });
    expect(m.effectChanceBonus.STUN).toBeCloseTo(0.15);
  });

  it("passiva de Inuzuka não afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["inuzuka_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], cao).costMult).toBe(1);
    expect(passiveMods(["inuzuka_raiz"], bola).costMult).toBe(1);
  });
});

describe("Inuzuka: EMPOWERED das fusões de lobo é FÍSICO só — virar fera não deveria turbinar ninjutsu elemental", () => {
  it("Lobo de Duas Cabeças e Lobo de Três Cabeças nascem escopados como 'physical'", () => {
    const duasCabecas = getAbility("inuzuka_lobo_duas_cabecas")!;
    const tresCabecas = getAbility("inuzuka_lobo_tres_cabecas")!;
    expect(duasCabecas.effects!.find((e) => e.effectId === "EMPOWERED")!.empoweredScope).toBe("physical");
    expect(tresCabecas.effects!.find((e) => e.effectId === "EMPOWERED")!.empoweredScope).toBe("physical");
  });

  it("EMPOWERED escopado como 'physical' só multiplica TAIJUTSU/KENJUTSU, não Bukijutsu (arremesso) nem Ninjutsu", () => {
    const comEscopo: EffectState[] = [
      { effectId: "EMPOWERED", stacks: 1, duration: 3, dataJson: JSON.stringify({ empoweredScope: { kind: "physical" } }) },
    ];
    expect(empoweredDamageMult(comEscopo, { category: "TAIJUTSU" })).toBeGreaterThan(1);
    expect(empoweredDamageMult(comEscopo, { category: "KENJUTSU" })).toBeGreaterThan(1);
    expect(empoweredDamageMult(comEscopo, { category: "BUKIJUTSU" })).toBe(1);
    expect(empoweredDamageMult(comEscopo, { category: "NINJUTSU" })).toBe(1);
  });
});
