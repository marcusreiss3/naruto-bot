import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { applyMagmaStacks, tickEffect } from "../src/services/combat/effects.js";
import { BALANCE } from "../src/config/balance.js";
import { isKekkeiGenkai } from "../src/config/enums.js";

const IDS = [
  "lava_tecnica_balas",
  "lava_solucao_misteriosa",
  "lava_rio_rochas",
  "lava_monte_huaguo",
] as const;

describe("Lava: integridade da arvore", () => {
  it("liga os quatro jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "LAVA" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Lava e compra manual", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "LAVA", manualOnly: true });
    }
  });

  it("LAVA e' kekkei genkai", () => {
    expect(isKekkeiGenkai("LAVA")).toBe(true);
    expect(isKekkeiGenkai("FOGO")).toBe(false);
  });

  it("os dois nós PASSIVE de Lava (raiz e ápice) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "LAVA")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("Monte Huaguo exige o nó de ápice comprado antes", () => {
    const huaguo = allNodes().find((n) => n.id === "lava_huaguo")!;
    expect(huaguo.requires).toEqual(["lava_apice"]);
  });
});

describe("Lava: passiva de dano — mesmo nível do Cristal", () => {
  const balas = getAbility("lava_tecnica_balas")!;

  it("raiz + ápice fecham em 2.025x", () => {
    const mods = passiveMods(["lava_raiz", "lava_apice"], balas);
    expect(mods.damageMult).toBeCloseTo(2.025, 3);
  });

  it("2.025x é igual ao Vapor/Calor/Explosão e ao Cristal — só o custo total muda", () => {
    const lava = passiveMods(["lava_raiz", "lava_apice"], balas).damageMult;
    const vapor = passiveMods(
      ["vapor_raiz", "vapor_ebulicao_total"],
      getAbility("vapor_nevoa_qualificada")!,
    ).damageMult;
    const cristal = passiveMods(
      ["cristal_raiz", "cristal_faceta"],
      getAbility("shouton_shuriken_cristal")!,
    ).damageMult;
    expect(lava).toBeCloseTo(vapor, 5);
    expect(lava).toBeCloseTo(cristal, 5);
  });

  it("passiva de Lava não afeta jutsu de Fogo", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["lava_raiz", "lava_apice"], bola).damageMult).toBe(1);
  });
});

describe("Magma", () => {
  const M = BALANCE.effects.MAGMA;

  it("causa dano leve por turno, igual à Corrosão em forma", () => {
    expect(tickEffect({ effectId: "MAGMA", stacks: 1, duration: 3 }).damage).toBe(M.dmgPerTurn);
  });

  it("acumula sem endurecer abaixo do gatilho", () => {
    expect(applyMagmaStacks(1, 1)).toEqual({ stacks: 2, hardened: false });
  });

  it("endurece e zera os acúmulos ao bater no gatilho", () => {
    expect(applyMagmaStacks(3, 1)).toEqual({ stacks: 0, hardened: true });
    expect(applyMagmaStacks(0, M.hardenAtStacks)).toEqual({ stacks: 0, hardened: true });
  });

  it("Monte Huaguo crava 3 — endurece sozinho quem já tem 1 acúmulo de Magma", () => {
    const huaguo = getAbility("lava_monte_huaguo")!;
    const stacks = huaguo.effects!.find((e) => e.effectId === "MAGMA")!.stacks!;
    expect(stacks).toBe(3);
    expect(applyMagmaStacks(1, stacks).hardened).toBe(true);
  });

  it("Monte Huaguo deixa terreno FIRE (chão vulcânico)", () => {
    const huaguo = getAbility("lava_monte_huaguo")!;
    expect(huaguo.terrain).toEqual({ kind: "FIRE", duration: 3 });
  });
});
