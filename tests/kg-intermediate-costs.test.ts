import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";

const EXPECTED_COSTS: Record<string, number> = {
  shouton_barragem_jade: 40,
  shouton_danca_hexagonal: 50,
  shouton_shuriken_gigante: 58,
  shouton_dragao_cadente: 56,
  vapor_punho_propulsao: 36,
  vapor_chute_propulsao: 52,
  calor_esfera: 36,
  calor_assassinato_extremo: 52,
  lava_solucao_misteriosa: 36,
  lava_rio_rochas: 52,
  explosao_impacto: 52,
};

describe("custos das técnicas intermediárias de Kekkei Genkai", () => {
  it("cobra proporcionalmente por dano, área, controle e negação de reação", () => {
    for (const [abilityId, expectedCost] of Object.entries(EXPECTED_COSTS)) {
      expect(getAbility(abilityId)?.cost, abilityId).toBe(expectedCost);
    }
  });

  it("mantém os ápices caros", () => {
    expect(getAbility("shouton_oito_paredes")?.cost).toBe(72);
    expect(getAbility("lava_monte_huaguo")?.cost).toBe(74);
    expect(getAbility("explosao_punho_mina")?.cost).toBe(74);
  });
});
