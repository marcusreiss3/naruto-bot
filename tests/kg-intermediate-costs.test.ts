import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";

// Valores recalculados por suggestedJutsuCost() (services/characters/
// jutsu-balance.ts) — ver tests/jutsu-balance.test.ts pra formula em si.
// Este teste so' trava o numero ATUAL de cada ability, nao a formula.
const EXPECTED_COSTS: Record<string, number> = {
  shouton_barragem_jade: 41,
  shouton_danca_hexagonal: 67,
  shouton_shuriken_gigante: 68,
  shouton_dragao_cadente: 68,
  vapor_punho_propulsao: 32,
  vapor_chute_propulsao: 48,
  calor_esfera: 36, // fora do escopo da formula (SELF/buff puro) — nao muda
  calor_assassinato_extremo: 48,
  lava_solucao_misteriosa: 36,
  lava_rio_rochas: 55,
  explosao_impacto: 50,
};

describe("custos das técnicas intermediárias de Kekkei Genkai", () => {
  it("cobra proporcionalmente por dano, área, controle e negação de reação", () => {
    for (const [abilityId, expectedCost] of Object.entries(EXPECTED_COSTS)) {
      expect(getAbility(abilityId)?.cost, abilityId).toBe(expectedCost);
    }
  });

  it("mantém os ápices caros", () => {
    expect(getAbility("shouton_oito_paredes")?.cost).toBe(65);
    expect(getAbility("lava_monte_huaguo")?.cost).toBe(60);
    expect(getAbility("explosao_punho_mina")?.cost).toBe(74);
  });
});
