import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";

const IDS = [
  "chinoike_chuva_granizo",
  "chinoike_doujutsu",
  "chinoike_bolhas_agua",
  "chinoike_genjutsu_ketsuryuugan",
  "chinoike_dragao_sangue",
] as const;

describe("Chinoike: integridade da arvore de cla", () => {
  it("liga os cinco jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "chinoike" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Chinoike tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.chinoike!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Chinoike e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "chinoike", manualOnly: true });
    }
  });

  it("Ketsuryuugan (doujutsu) pede Dōjutsu; Genjutsu Ketsuryuugan pede Genjutsu — dois gates em sequência", () => {
    const doujutsu = allNodes().find((n) => n.id === "chinoike_doujutsu")!;
    const genjutsu = allNodes().find((n) => n.id === "chinoike_genjutsu_ketsuryuugan")!;
    expect(doujutsu.pool).toBe("dojutsu");
    expect(doujutsu.reqPool).toBe(5);
    expect(genjutsu.pool).toBe("genjutsu");
    expect(genjutsu.reqPool).toBe(11);
  });

  it("Ketsuryuugan é toggle (custo 0, sem efeito próprio) — liga/desliga por /combate ketsuryuugan, mesmo padrão do Byakugan", () => {
    const doujutsu = getAbility("chinoike_doujutsu")!;
    expect(doujutsu.category).toBe("DOJUTSU");
    expect(doujutsu.cost).toBe(0);
    expect(doujutsu.effects ?? []).toEqual([]);
    expect(doujutsu.description).toMatch(/\/combate ketsuryuugan/);
  });

  it("Genjutsu Ketsuryuugan É o próprio doujutsu agindo — exige o Ketsuryuugan ativo; o resto não precisa", () => {
    expect(getAbility("chinoike_genjutsu_ketsuryuugan")!.requiresActiveDoujutsu).toEqual({
      flag: "ketsuryuuganActive",
      label: "Ketsuryuugan",
    });
    for (const id of IDS.filter((i) => i !== "chinoike_genjutsu_ketsuryuugan")) {
      expect(getAbility(id)!.requiresActiveDoujutsu, id).toBeUndefined();
    }
  });

  it("Genjutsu Ketsuryuugan é a exceção: genjutsu que causa dano real (baseDamage), diferente dos genjutsu genéricos de fundamentos", () => {
    const ketsuryuugan = getAbility("chinoike_genjutsu_ketsuryuugan")!;
    expect(ketsuryuugan.category).toBe("GENJUTSU");
    expect(ketsuryuugan.baseDamage).toBeGreaterThan(0);
    expect(ketsuryuugan.scalingAttribute).toBe("genjutsu");

    const generico = getAbility("gen_confusao")!;
    expect(generico.baseDamage ?? 0).toBe(0);
  });

  it("as quatro passivas (raiz, olhos de sangue, sangue fervente, ápice) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "chinoike")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "chinoike").length).toBe(4);
  });

  it("clã Chinoike existe e referencia as cinco habilidades em activeIds", () => {
    const clan = getClan("chinoike");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Chinoike: ramificação Doujutsu/Genjutsu x Bolhas de Água, convergindo no ápice", () => {
  it("tronco reto (col 0) até Chuva de Granizo", () => {
    const chuva = allNodes().find((n) => n.id === "chinoike_chuva_granizo")!;
    expect(chuva.col).toBe(0);
    expect(chuva.requires).toEqual(["chinoike_raiz"]);
  });

  it("ramifica em Doujutsu/Genjutsu (col -1, 3 nós) e Bolhas de Água (col +1, 2 nós) a partir de Chuva de Granizo", () => {
    const doujutsu = allNodes().find((n) => n.id === "chinoike_doujutsu")!;
    const olhos = allNodes().find((n) => n.id === "chinoike_olhos_sangue")!;
    const genjutsu = allNodes().find((n) => n.id === "chinoike_genjutsu_ketsuryuugan")!;
    for (const n of [doujutsu, olhos, genjutsu]) expect(n.col).toBe(-1);
    expect(doujutsu.requires).toEqual(["chinoike_chuva_granizo"]);
    expect(olhos.requires).toEqual(["chinoike_doujutsu"]);
    expect(genjutsu.requires).toEqual(["chinoike_olhos_sangue"]);

    const bolhas = allNodes().find((n) => n.id === "chinoike_bolhas_agua")!;
    const fervente = allNodes().find((n) => n.id === "chinoike_sangue_fervente")!;
    for (const n of [bolhas, fervente]) expect(n.col).toBe(1);
    expect(bolhas.requires).toEqual(["chinoike_chuva_granizo"]);
    expect(fervente.requires).toEqual(["chinoike_bolhas_agua"]);
  });

  it("Sangue Desperto (ápice) converge Genjutsu Ketsuryuugan + Sangue Fervente antes do Dragão de Sangue", () => {
    const apice = allNodes().find((n) => n.id === "chinoike_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["chinoike_genjutsu_ketsuryuugan", "chinoike_sangue_fervente"]));
    expect(apice.col).toBe(0);

    const dragao = allNodes().find((n) => n.id === "chinoike_dragao_sangue")!;
    expect(dragao.requires).toEqual(["chinoike_apice"]);
    expect(dragao.col).toBe(0);
  });
});

describe("Chinoike: Ascensão do Dragão de Sangue — finalizador, dragão de 8 cabeças", () => {
  const dragao = getAbility("chinoike_dragao_sangue")!;

  it("não pode ser esquivado e é o jutsu mais forte do clã", () => {
    expect(dragao.undodgeable).toBe(true);
    for (const id of IDS.filter((i) => i !== "chinoike_dragao_sangue")) {
      expect(dragao.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });
});

describe("Chinoike: passivas — vitalidade de sangue, Genjutsu amplo e Genjutsu Ketsuryuugan estreito", () => {
  const chuva = getAbility("chinoike_chuva_granizo")!;
  const ketsuryuugan = getAbility("chinoike_genjutsu_ketsuryuugan")!;

  it("Sangue Vivo corta 10% do custo e regenera vida no início do turno", () => {
    const m = passiveMods(["chinoike_raiz"], chuva);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(characterPassiveMods(["chinoike_raiz"]).hpRegenPerTurn).toBe(4);
  });

  it("Sangue Fervente soma chance de Queimadura e alcance em jutsu de área", () => {
    const bolhas = getAbility("chinoike_bolhas_agua")!; // RADIUS
    const m = passiveMods(["chinoike_sangue_fervente"], bolhas);
    expect(m.effectChanceBonus.BURN).toBeCloseTo(0.15);
    expect(m.rangeBonus).toBe(1);

    expect(passiveMods(["chinoike_sangue_fervente"], chuva).rangeBonus).toBe(0); // CONE, fora de rangeShapes
  });

  it("Sangue Desperto (ápice) só multiplica dano da própria Genjutsu Ketsuryuugan, não os outros jutsus do clã", () => {
    const mKetsuryuugan = passiveMods(["chinoike_apice"], ketsuryuugan);
    expect(mKetsuryuugan.damageMult).toBeCloseTo(1.15);
    expect(mKetsuryuugan.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.25 });

    const mChuva = passiveMods(["chinoike_apice"], chuva); // escala por ninjutsu, não genjutsu
    expect(mChuva.damageMult).toBe(1);
  });

  it("nenhuma passiva de Chinoike afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["chinoike_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], chuva).costMult).toBe(1);
    expect(passiveMods(["chinoike_raiz"], bola).costMult).toBe(1);
    expect(characterPassiveMods(["nara_raiz"]).hpRegenPerTurn).toBe(0);
  });
});

describe("Chinoike: Chuva de Granizo e Bolhas de Água são Suiton de verdade — Fluxo Constante (Água) empilha com Sangue Vivo", () => {
  const chuva = getAbility("chinoike_chuva_granizo")!;
  const bolhas = getAbility("chinoike_bolhas_agua")!;

  it("as duas têm element: AGUA; o resto do clã (doujutsu/genjutsu/dragão) não tem elemento", () => {
    expect(chuva.element).toBe("AGUA");
    expect(bolhas.element).toBe("AGUA");
    for (const id of ["chinoike_doujutsu", "chinoike_genjutsu_ketsuryuugan", "chinoike_dragao_sangue"] as const) {
      expect(getAbility(id)!.element, id).toBeUndefined();
    }
  });

  it("Fluxo Constante (agua_raiz) sozinha já dá dano/custo à Chuva de Granizo", () => {
    const m = passiveMods(["agua_raiz"], chuva);
    expect(m.damageMult).toBeCloseTo(1.15);
    expect(m.costMult).toBeCloseTo(0.85);
  });

  it("as duas passivas empilham quando o personagem tem as duas árvores (Água + Chinoike)", () => {
    const m = passiveMods(["agua_raiz", "chinoike_raiz"], chuva);
    expect(m.costMult).toBeCloseTo(0.85 * 0.9); // Água multiplica dano E custo, Sangue Vivo só custo
    expect(m.damageMult).toBeCloseTo(1.15);
  });

  it("Fluxo Constante NÃO afeta o Ketsuryuugan nem a Genjutsu Ketsuryuugan (não têm elemento)", () => {
    const doujutsu = getAbility("chinoike_doujutsu")!;
    const ketsuryuugan = getAbility("chinoike_genjutsu_ketsuryuugan")!;
    expect(passiveMods(["agua_raiz"], doujutsu).costMult).toBe(1);
    expect(passiveMods(["agua_raiz"], ketsuryuugan).damageMult).toBe(1);
  });
});

describe("Chinoike: Olhos de Sangue — passiva de Genjutsu ESCOPADA POR CATEGORIA, abrange fora do clã (pedido explícito)", () => {
  it("crossCategory nasce como 'GENJUTSU' no dado da passiva", () => {
    const p = CLAN_PASSIVES.find((p) => p.nodeId === "chinoike_olhos_sangue")!;
    expect(p.crossCategory).toBe("GENJUTSU");
  });

  it("soma chance de Confusão/Atordoamento na PRÓPRIA Genjutsu Ketsuryuugan", () => {
    const ketsuryuugan = getAbility("chinoike_genjutsu_ketsuryuugan")!;
    const m = passiveMods(["chinoike_olhos_sangue"], ketsuryuugan);
    expect(m.effectChanceBonus.CONFUSION).toBeCloseTo(0.1);
    expect(m.effectChanceBonus.STUN).toBeCloseTo(0.1);
  });

  it("TAMBÉM soma nos genjutsu genéricos de fundamentos, que não têm clanId nem element — o ponto do pedido", () => {
    const confusao = getAbility("gen_confusao")!; // CONFUSION, sem clanId/element
    const paralisante = getAbility("gen_perda_acao")!; // STUN, sem clanId/element
    expect(confusao.requirements?.clanId).toBeUndefined();
    expect(confusao.element).toBeUndefined();

    const mConfusao = passiveMods(["chinoike_olhos_sangue"], confusao);
    expect(mConfusao.effectChanceBonus.CONFUSION).toBeCloseTo(0.1);

    const mParalisante = passiveMods(["chinoike_olhos_sangue"], paralisante);
    expect(mParalisante.effectChanceBonus.STUN).toBeCloseTo(0.1);
  });

  it("NÃO soma em jutsu de outra categoria (nem elemental, nem de outro clã), só Genjutsu", () => {
    const bola = getAbility("katon_goukakyuu")!; // NINJUTSU, elemento FOGO
    const possessao = getAbility("nara_possessao")!; // categoria de clã, não Genjutsu

    expect(passiveMods(["chinoike_olhos_sangue"], bola).effectChanceBonus.CONFUSION ?? 0).toBe(0);
    expect(passiveMods(["chinoike_olhos_sangue"], possessao).effectChanceBonus.CONFUSION ?? 0).toBe(0);
  });
});
