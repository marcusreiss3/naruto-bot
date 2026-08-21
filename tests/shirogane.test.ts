import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { characterPassiveMods, passiveMods } from "../src/services/combat/passives.js";

describe("passivas do clã Shirogane (buff de Kugutsu)", () => {
  it("dano/custo/alcance/efeitos combinam via crossCategory KUGUTSU", () => {
    const ability = getAbility("kugutsu_lamina_agulha")!;
    expect(ability.category).toBe("KUGUTSU");

    const mods = passiveMods(
      ["shirogane_raiz", "shirogane_engenharia_letal", "shirogane_fios_precisos", "shirogane_venenos_calibrados", "shirogane_apice"],
      ability,
    );
    expect(mods.costMult).toBeCloseTo(0.9);
    expect(mods.damageMult).toBeCloseTo(1.1);
    expect(mods.rangeBonus).toBe(1);
    expect(mods.ignoresShield).toBe(true);
    expect(mods.effectDurationBonus.POISON).toBe(1);
    expect(mods.effectDurationBonus.BLEED).toBe(1);
  });

  it("não vaza pra técnicas de outra categoria (crossCategory é escopado)", () => {
    const taijutsu = getAbility("hyuuga_punho_suave")!;
    expect(taijutsu.category).toBe("TAIJUTSU");
    const mods = passiveMods(
      ["shirogane_raiz", "shirogane_engenharia_letal", "shirogane_fios_precisos", "shirogane_venenos_calibrados", "shirogane_apice"],
      taijutsu,
    );
    expect(mods.damageMult).toBe(1);
    expect(mods.costMult).toBe(1);
    expect(mods.rangeBonus).toBe(0);
    expect(mods.ignoresShield).toBe(false);
  });

  it("desconto de criação/reforma pertence somente à Oficina Mestra", () => {
    expect(characterPassiveMods(["shirogane_raiz"]).puppetCraftCostMult).toBe(1);
    expect(characterPassiveMods(["shirogane_raiz", "shirogane_oficina_mestra"]).puppetCraftCostMult).toBeCloseTo(0.85);
    expect(characterPassiveMods([]).puppetCraftCostMult).toBe(1);
  });
});
