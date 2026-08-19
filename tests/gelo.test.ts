import { describe, expect, it } from "vitest";
import { ALL_ABILITIES, getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { isKekkeiGenkai } from "../src/config/enums.js";
import { BALANCE } from "../src/config/balance.js";
import { applyFrozenStacks, frozenCostMultiplier, isFrozenSolid } from "../src/services/combat/effects.js";

const IDS = [
  "gelo_agulhas",
  "gelo_espelho",
  "gelo_domo",
  "gelo_chuva_agulhas",
  "gelo_agulhas_mil",
  // adicionados em 09/08/2026 junto com o efeito Congelamento
  "gelo_captura",
  "gelo_neve",
  "gelo_parede",
  "gelo_lancas",
] as const;

describe("Gelo: integridade da arvore (ex-clã Yuki, migrado pra kekkei genkai)", () => {
  it("liga os nove jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "GELO" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Gelo e compra manual (não clanId)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "GELO", manualOnly: true });
      expect(ability!.requirements?.clanId).toBeUndefined();
    }
  });

  it("Gelo é kekkei genkai", () => {
    expect(isKekkeiGenkai("GELO")).toBe(true);
  });

  it("as cinco passivas têm definição em PASSIVES (não mais em CLAN_PASSIVES)", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "GELO")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    // 5 passivas = mesmo numero de Cristal/Vapor/Calor/Lava/Explosao
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.element === "GELO")).toHaveLength(5);
  });

  it("abre em três ramos a partir das Agulhas de Gelo, cada um numa coluna própria", () => {
    const node = (id: string) => allNodes().find((n) => n.id === id)!;
    // as tres pontas saem do MESMO no de entrada, em colunas diferentes
    for (const id of ["gelo_espelho", "gelo_captura", "gelo_domo"]) {
      expect(node(id).requires, id).toEqual(["gelo_agulhas"]);
    }
    expect(node("gelo_espelho").col).toBe(-1);
    expect(node("gelo_captura").col).toBe(0);
    expect(node("gelo_domo").col).toBe(1);

    const ramoDe = (id: string) => node(id).branch;
    expect(["gelo_espelho", "gelo_presenca", "gelo_chuva_agulhas"].map(ramoDe)).toEqual(["Espelho", "Espelho", "Espelho"]);
    expect(["gelo_captura", "gelo_neve", "gelo_cristais", "gelo_lancas"].map(ramoDe)).toEqual(["Campo", "Campo", "Campo", "Campo"]);
    expect(["gelo_domo", "gelo_reflexos", "gelo_parede"].map(ramoDe)).toEqual(["Reflexo", "Reflexo", "Reflexo"]);
  });

  it("o ápice exige as DUAS pontas ofensivas — não dá pra chegar no S subindo um ramo só", () => {
    const apice = allNodes().find((n) => n.id === "gelo_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["gelo_chuva_agulhas", "gelo_lancas"]));
  });

  it("os gates subiram pro padrão dos outros KKG (S-rank no 38, igual Cristal/Lava/Explosão)", () => {
    const node = (id: string) => allNodes().find((n) => n.id === id)!;
    expect(node("gelo_agulhas_mil").reqLevel).toBe(38);
    expect(node("gelo_apice").reqLevel).toBe(30);
    for (const outro of ["cristal_oito_paredes", "lava_erupcao", "explosao_impacto"]) {
      const par = allNodes().find((n) => n.id === outro);
      if (par?.rank === "S") expect(par.reqLevel, outro).toBe(38);
    }
  });
});

describe("Gelo: passiva de dano — balanceado no nível de Vapor/Calor/Lava", () => {
  const agulhas = getAbility("gelo_agulhas")!;

  it("Sangue de Gelo (raiz) sozinha dá +30% — mesmo nível do Vapor/Calor/Lava", () => {
    const gelo = passiveMods(["gelo_raiz"], agulhas).damageMult;
    const vapor = passiveMods(["vapor_raiz"], getAbility("vapor_nevoa_qualificada")!).damageMult;
    expect(gelo).toBeCloseTo(vapor, 5);
    expect(gelo).toBeCloseTo(1.3, 3);
  });

  it("raiz + Domínio do Espelho de Gelo (ápice) fecham em 1.82x", () => {
    const mods = passiveMods(["gelo_raiz", "gelo_apice"], agulhas);
    expect(mods.damageMult).toBeCloseTo(1.82, 3);
  });

  it("ápice é só dano (formato padrão dos outros KKG) — utilidade ficou na Presença", () => {
    const presenca = passiveMods(["gelo_presenca"], agulhas);
    expect(presenca.effectChanceBonus.DEFENSE_DOWN).toBeCloseTo(0.15);
    expect(presenca.effectDurationBonus.SLOW).toBe(1);

    const apice = passiveMods(["gelo_apice"], agulhas);
    expect(apice.effectChanceBonus.DEFENSE_DOWN).toBeUndefined();
  });

  it("Reflexos Gélidos soma esquiva de Ninjutsu e corta custo", () => {
    const reflexos = passiveMods(["gelo_reflexos"], agulhas);
    expect(reflexos.costMult).toBeCloseTo(0.9);
    const p = PASSIVES.find((x) => x.nodeId === "gelo_reflexos")!;
    expect(p.ninjutsuDodgeBonus).toBeCloseTo(0.08);
  });

  it("passiva de Gelo não afeta jutsu de Água nem de Fogo", () => {
    const water = getAbility("suiton_suiryuudan")!;
    const fire = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["gelo_raiz"], water).damageMult).toBe(1);
    expect(passiveMods(["gelo_raiz"], fire).damageMult).toBe(1);
  });
});

describe("Domo de Iceberg: defesa pura, sem dano, prende quem está corpo a corpo", () => {
  const domo = getAbility("gelo_domo")!;

  // flat + %HP (11/08/2026): era so' stacks fixo, o unico SHIELD do jogo
  // assim — todo outro Barreira usa os dois juntos.
  it("não tem baseDamage e é SELF — dá Barreira (flat + % do HP máximo)", () => {
    expect(domo.baseDamage).toBeUndefined();
    expect(domo.shape).toBe("SELF");
    expect(domo.effects).toEqual([{ effectId: "SHIELD", stacks: 9, hpPercentStacks: 0.13, duration: 3 }]);
  });

  it("trapField prende inimigos adjacentes (ROOT, raio 1) até a Barreira quebrar", () => {
    expect(domo.trapField).toEqual({ effectId: "ROOT", radius: 1, duration: 3 });
  });
});

describe("Gelo: Congelamento — o efeito exclusivo que faltava ao único KKG sem um", () => {
  it("os quatro jutsus novos existem e três deles cravam Congelamento", () => {
    for (const id of ["gelo_captura", "gelo_neve", "gelo_parede", "gelo_lancas"]) {
      expect(getAbility(id), id).toBeTruthy();
    }
    const comSelo = ["gelo_captura", "gelo_neve", "gelo_lancas"];
    for (const id of comSelo) {
      expect(getAbility(id)!.effects!.some((e) => e.effectId === "FROZEN"), id).toBe(true);
    }
    // Parede de Cristal e' a excecao: o payoff dela e' Confusao (ilusao dos
    // reflexos), nao a pilha de gelo.
    expect(getAbility("gelo_parede")!.effects!.some((e) => e.effectId === "CONFUSION")).toBe(true);
  });

  it("nenhum elemento fora do Gelo usa Congelamento — é exclusivo, como nos outros KKG", () => {
    const forasteiros = ALL_ABILITIES.filter(
      (a) => a.effects?.some((e) => e.effectId === "FROZEN" || e.effectId === "FROZEN_SOLID")
        && a.element !== "GELO",
    );
    expect(forasteiros.map((a) => a.id)).toEqual([]);
  });

  it("acumula sem dano e, ao encher, congela e zera", () => {
    const F = BALANCE.effects.FROZEN;
    expect(applyFrozenStacks(0, 1)).toEqual({ stacks: 1, frozen: false });
    expect(applyFrozenStacks(F.freezeAtStacks - 1, 1)).toEqual({ stacks: 0, frozen: true });
    // sem dano por turno: o campo nem existe (diferente de Magma/Corrosão)
    expect((F as Record<string, unknown>).dmgPerTurn).toBeUndefined();
  });

  it("cada acúmulo encarece as técnicas de quem está congelando", () => {
    const F = BALANCE.effects.FROZEN;
    expect(frozenCostMultiplier([])).toBe(1);
    expect(frozenCostMultiplier([{ effectId: "FROZEN", stacks: 2, duration: 3 }]))
      .toBeCloseTo(1 + 2 * F.costPenaltyPerStack);
  });

  it("Cristais no Sangue crava 1 acúmulo a mais — congela em 2 golpes em vez de 4", () => {
    const mods = passiveMods(["gelo_cristais"], getAbility("gelo_neve")!);
    expect(mods.effectStacksBonus.FROZEN).toBe(1);
    // Neve aplica 2 + 1 da passiva = 3; dois usos passam de freezeAtStacks (4)
    const porGolpe = getAbility("gelo_neve")!.effects!.find((e) => e.effectId === "FROZEN")!.stacks! + 1;
    expect(porGolpe * 2).toBeGreaterThanOrEqual(BALANCE.effects.FROZEN.freezeAtStacks);
  });

  it("Congelado tira a reação, mas não o turno (diferente do Atordoamento)", () => {
    expect(isFrozenSolid([{ effectId: "FROZEN_SOLID", stacks: 1, duration: 1 }])).toBe(true);
    expect(isFrozenSolid([{ effectId: "FROZEN", stacks: 3, duration: 3 }])).toBe(false);
  });
});

describe("Mil Agulhas Voadoras de Água da Morte: finalizador indefensável", () => {
  const mil = getAbility("gelo_agulhas_mil")!;

  it("não pode ser esquivada e é o jutsu de maior dano da árvore", () => {
    expect(mil.undodgeable).toBe(true);
    for (const id of IDS.filter((i) => i !== "gelo_agulhas_mil")) {
      expect(mil.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });

  it("exige só o tronco principal (o ápice), não a ramificação de defesa", () => {
    const node = allNodes().find((n) => n.id === "gelo_agulhas_mil")!;
    expect(node.requires).toEqual(["gelo_apice"]);
  });
});
