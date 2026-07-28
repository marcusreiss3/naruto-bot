import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import {
  corrosionShieldDrain,
  corrosionStacks,
  tickEffect,
  type EffectState,
} from "../src/services/combat/effects.js";
import { BALANCE } from "../src/config/balance.js";
import { isKekkeiGenkai } from "../src/config/enums.js";

const IDS = [
  "vapor_nevoa_qualificada",
  "vapor_punho_propulsao",
  "vapor_agulhas",
  "vapor_camara",
  "vapor_chute_propulsao",
  "vapor_nevoa_densa",
  "vapor_manto_vapor",
  "vapor_erupcao_absoluta",
] as const;

const ef = (stacks: number, duration = 3): EffectState =>
  ({ effectId: "CORROSION", stacks, duration }) as EffectState;

describe("Vapor: integridade da arvore", () => {
  it("liga os tres jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "VAPOR" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Vapor e compra manual", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "VAPOR", manualOnly: true });
    }
  });

  it("Chute em Propulsão exige o nó de Câmara de Vapor (versão aprimorada)", () => {
    const chute = allNodes().find((n) => n.id === "vapor_chute")!;
    expect(chute.requires).toEqual(["vapor_camara"]);
  });

  it("Erupção Absoluta (S) exige o ápice comprado antes", () => {
    const erupcao = allNodes().find((n) => n.id === "vapor_erupcao_absoluta")!;
    expect(erupcao.requires).toEqual(["vapor_ebulicao_total"]);
  });

  it("VAPOR e' kekkei genkai", () => {
    expect(isKekkeiGenkai("VAPOR")).toBe(true);
    expect(isKekkeiGenkai("FOGO")).toBe(false);
  });

  it("o no PASSIVE de Vapor tem definicao", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "VAPOR")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });
});

describe("Vapor: passiva de dano", () => {
  const nevoa = getAbility("vapor_nevoa_qualificada")!;

  it("Ponto de Ebulição (raiz) sozinha dá só +35%", () => {
    expect(passiveMods(["vapor_raiz"], nevoa).damageMult).toBeCloseTo(1.35, 3);
  });

  it("raiz + Ebulição Total (ápice) fecham em 2.295x — mesmo nível do Cristal", () => {
    const mods = passiveMods(["vapor_raiz", "vapor_ebulicao_total"], nevoa);
    expect(mods.damageMult).toBeCloseTo(2.295, 3);
    const cristal = passiveMods(
      ["cristal_raiz", "cristal_faceta"],
      getAbility("shouton_shuriken_cristal")!,
    ).damageMult;
    expect(mods.damageMult).toBeCloseTo(cristal, 5);
  });

  it("passiva de Vapor não afeta jutsu de Fogo", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["vapor_raiz"], bola).damageMult).toBe(1);
  });
});

describe("Corrosão", () => {
  const C = BALANCE.effects.CORROSION;

  it("causa dano leve por turno, flat (não escala com acúmulos)", () => {
    expect(tickEffect(ef(1)).damage).toBe(C.dmgPerTurn);
    expect(tickEffect(ef(3)).damage).toBe(C.dmgPerTurn);
  });

  it("NÃO causa explosão nem selamento — só dano leve + corrosão de Barreira", () => {
    expect(C).not.toHaveProperty("explodeAtStacks");
    expect(C).not.toHaveProperty("sealAtStacks");
  });

  it("acúmulos somam", () => {
    expect(corrosionStacks([ef(1), ef(2)])).toBe(3);
    expect(corrosionStacks([])).toBe(0);
  });

  it("acúmulo expirado não conta", () => {
    expect(corrosionStacks([ef(2, 0)])).toBe(0);
  });

  it("derrete Barreira proporcional aos acúmulos", () => {
    expect(corrosionShieldDrain([ef(1)])).toBe(C.shieldCorrodePerStack);
    expect(corrosionShieldDrain([ef(3)])).toBe(C.shieldCorrodePerStack * 3);
    expect(corrosionShieldDrain([])).toBe(0);
  });

  it("Punho em Propulsão tem chance de cravar Corrosão; Chute crava garantido e mais forte", () => {
    const punho = getAbility("vapor_punho_propulsao")!;
    const chute = getAbility("vapor_chute_propulsao")!;
    const efPunho = punho.effects!.find((e) => e.effectId === "CORROSION")!;
    const efChute = chute.effects!.find((e) => e.effectId === "CORROSION")!;
    expect(efPunho.chance).toBeLessThan(1);
    expect(efChute.chance ?? 1).toBe(1);
    expect(efChute.stacks!).toBeGreaterThan(efPunho.stacks!);
  });
});
