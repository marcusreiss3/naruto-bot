import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { passiveMods } from "../src/services/combat/passives.js";

describe("sinergias entre árvores e técnicas de clã", () => {
  it("passivas genéricas de Taijutsu afetam golpes físicos dos clãs", () => {
    for (const id of ["raikage_lariat", "hyuuga_punho_suave", "kaguya_salgueiro", "inuzuka_presa_sobre_presa"] as const) {
      const ability = getAbility(id)!;
      expect(ability.category, id).toBe("TAIJUTSU");
      expect(passiveMods(["tai_pass_raiz", "tai_pass_maestria"], ability).damageMult, id).toBeCloseTo(1.08 * 1.2);
    }
  });

  it("Taijutsu não afeta transformações e técnicas de clã classificadas como Ninjutsu", () => {
    for (const id of ["raikage_armadura", "akimichi_baika_parcial", "inuzuka_lobo_duas_cabecas"] as const) {
      const ability = getAbility(id)!;
      expect(ability.category, id).toBe("NINJUTSU");
      expect(passiveMods(["tai_pass_raiz", "tai_pass_maestria"], ability).damageMult, id).toBe(1);
    }
  });

  it("um golpe Raikage que é Taijutsu e Raio recebe as duas árvores", () => {
    const reto = getAbility("raikage_relampago_reto")!;
    expect(reto.category).toBe("TAIJUTSU");
    expect(reto.element).toBe("RAIO");
    expect(passiveMods(["tai_pass_raiz", "tai_pass_maestria", "raio_raiz"], reto).damageMult).toBeCloseTo(1.08 * 1.2 * 1.15);
  });

  it("Hoshigaki e os ataques Hozuki recebem Água junto com suas duas passivas de clã", () => {
    const cases = [
      ["hoshigaki_cinco_tubaroes", ["hoshigaki_raiz", "hoshigaki_fome_voraz"], 1.15 * 1.2],
      ["hozuki_revolver_agua", ["hozuki_raiz", "hozuki_fluidez"], 1.1 * 1.1],
      ["hozuki_tate_eboshi", ["hozuki_raiz", "hozuki_fluidez"], 1.1 * 1.1],
    ] as const;
    for (const [id, clanNodes, clanMult] of cases) {
      const ability = getAbility(id)!;
      expect(ability.element, id).toBe("AGUA");
      expect(passiveMods(["agua_raiz", ...clanNodes], ability).damageMult, id).toBeCloseTo(1.15 * clanMult);
    }
  });
});
