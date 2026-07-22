import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";

const IDS = [
  "raiton_esfera_relampago",
  "raiton_ataque_raio",
  "raiton_prisao_quatro_pilares",
  "raiton_clone",
  "raiton_armadura_ataque_relampago",
  "raiton_assassinato_eletromagnetico",
  "raiton_pararaios",
  "raiton_kirin",
] as const;

describe("arvore de Raio", () => {
  it("liga todos os oito jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "RAIO" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Raio e compra manual", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "RAIO", manualOnly: true });
    }
  });

  it("Ataque de Raio atravessa bloqueadores", () => {
    expect(getAbility("raiton_ataque_raio")?.pierceObstacles).toBe(true);
  });

  it("Armadura aplica Aceleracao e rompe imobilizacao", () => {
    const armor = getAbility("raiton_armadura_ataque_relampago")!;
    expect(armor.effects?.some((e) => e.effectId === "HASTE")).toBe(true);
    expect(armor.cleanses).toEqual(expect.arrayContaining(["ROOT", "FLEE_LOCK"]));
  });

  it("Assassinato usa Encharcado como corrente", () => {
    const assassinato = getAbility("raiton_assassinato_eletromagnetico")!;
    expect(assassinato.chainWetTargets).toBe(true);
    expect(assassinato.effects?.some((e) => e.effectId === "STUN" && e.chance === undefined)).toBe(true);
  });

  it("Kirin exige tempestade, e indefensavel e limitado a um uso", () => {
    const kirin = getAbility("raiton_kirin")!;
    expect(kirin.requiresStorm).toBe(true);
    expect(kirin.oncePerCombat).toBe(true);
    expect(kirin.unblockable).toBe(true);
    expect(kirin.shape).toBe("RADIUS");
  });
});
