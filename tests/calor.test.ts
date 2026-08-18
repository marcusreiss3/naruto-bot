import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { dehydrationMultiplier } from "../src/services/combat/effects.js";
import { computeDamage } from "../src/services/combat/combat-math.js";
import { BALANCE } from "../src/config/balance.js";
import { isKekkeiGenkai } from "../src/config/enums.js";

const IDS = [
  "calor_disparo_bolas",
  "calor_esfera",
  "calor_assassinato_extremo",
] as const;

describe("Calor: integridade da arvore", () => {
  it("liga os tres jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "CALOR" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Calor e compra manual", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "CALOR", manualOnly: true });
    }
  });

  it("VAPOR e CALOR são kekkei genkai", () => {
    expect(isKekkeiGenkai("CALOR")).toBe(true);
    expect(isKekkeiGenkai("FOGO")).toBe(false);
  });

  it("o nó PASSIVE de Calor tem definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "CALOR")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });
});

describe("Calor: passiva de dano", () => {
  const disparo = getAbility("calor_disparo_bolas")!;

  it("Ebulição Corporal (raiz) sozinha dá só +35% — mesmo nível do Vapor", () => {
    const calor = passiveMods(["calor_raiz"], disparo).damageMult;
    const vapor = passiveMods(["vapor_raiz"], getAbility("vapor_nevoa_qualificada")!).damageMult;
    expect(calor).toBeCloseTo(vapor, 5);
    expect(calor).toBeCloseTo(1.35, 3);
  });

  it("raiz + Combustão Interna (ápice) fecham em 2.025x — mesmo nível do Cristal", () => {
    const mods = passiveMods(["calor_raiz", "calor_combustao_interna"], disparo);
    expect(mods.damageMult).toBeCloseTo(2.025, 3);
  });

  it("passiva de Calor não afeta jutsu de Fogo", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["calor_raiz"], bola).damageMult).toBe(1);
  });
});

describe("Esfera de Calor: evapora o Encharcado", () => {
  it("tem cleanses de WET", () => {
    const esfera = getAbility("calor_esfera")!;
    expect(esfera.cleanses).toEqual(["WET"]);
  });

  it("crava mais Desidratação que o Disparo (single-target vs área)", () => {
    const disparo = getAbility("calor_disparo_bolas")!;
    const esfera = getAbility("calor_esfera")!;
    const efDisparo = disparo.effects!.find((e) => e.effectId === "DEHYDRATION")!;
    const efEsfera = esfera.effects!.find((e) => e.effectId === "DEHYDRATION")!;
    expect(efEsfera.stacks!).toBeGreaterThan(efDisparo.stacks!);
  });
});

// Virou o S-rank/apice (11/08/2026): passou a aplicar Desidratacao (a
// identidade propria do Calor) em vez de Queimadura generica — o golpe mais
// forte da arvore precisa mostrar a cara do proprio elemento.
describe("Assassinato de Calor Extremo: S-rank/ápice, aplica Desidratação no teto", () => {
  it("aplica DEHYDRATION no teto de 3 acúmulos, não BURN", () => {
    const ab = getAbility("calor_assassinato_extremo")!;
    expect(ab.effects).toEqual([{ effectId: "DEHYDRATION", stacks: 3, duration: 4 }]);
  });
});

describe("Desidratação", () => {
  const D = BALANCE.effects.DEHYDRATION;

  it("corta uma fração do dano por acúmulo", () => {
    expect(dehydrationMultiplier(0)).toBe(1);
    expect(dehydrationMultiplier(1)).toBeCloseTo(1 - D.dmgReductionPerStack, 5);
    expect(dehydrationMultiplier(2)).toBeCloseTo(1 - D.dmgReductionPerStack * 2, 5);
  });

  it("respeita o teto de acúmulos — não dá pra zerar o dano do alvo", () => {
    const piso = 1 - D.dmgReductionPerStack * D.maxStacks;
    expect(dehydrationMultiplier(D.maxStacks)).toBeCloseTo(piso, 5);
    // acima do teto nao muda mais nada, nem fica negativo
    expect(dehydrationMultiplier(100)).toBeCloseTo(piso, 5);
    expect(dehydrationMultiplier(100)).toBeGreaterThan(0);
  });

  it("corta o dano de QUALQUER categoria, diferente da Queimadura (só TAI/BUKI)", () => {
    const genjutsuAb = {
      id: "x",
      name: "x",
      category: "GENJUTSU" as const,
      tier: 1,
      resource: "chakra" as const,
      cost: 10,
      actionType: "COMUM" as const,
      baseDamage: 100,
      scalingAttribute: "genjutsu" as const,
      range: 1,
      shape: "SINGLE_TARGET" as const,
      tags: [],
      description: "",
    };
    const dmg = computeDamage(genjutsuAb, { attrValue: 0, weakenMult: 0.7 });
    expect(dmg).toBe(70);
  });

  it("Queimadura não afeta GENJUTSU (burnTaiMult só corta TAI/BUKI)", () => {
    const genjutsuAb = {
      id: "x",
      name: "x",
      category: "GENJUTSU" as const,
      tier: 1,
      resource: "chakra" as const,
      cost: 10,
      actionType: "COMUM" as const,
      baseDamage: 100,
      scalingAttribute: "genjutsu" as const,
      range: 1,
      shape: "SINGLE_TARGET" as const,
      tags: [],
      description: "",
    };
    const dmg = computeDamage(genjutsuAb, { attrValue: 0, burnTaiMult: 0.5 });
    expect(dmg).toBe(100);
  });
});
