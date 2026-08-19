import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";

// Valores recalculados por suggestedJutsuCost() (services/characters/
// jutsu-balance.ts) — ver tests/jutsu-balance.test.ts pra formula em si —
// e DEPOIS subidos +12% em 12/08/2026 (ver "AJUSTE DE 12/08/2026 (parte 2)"
// no capitulo 12 do BALANCEAMENTO_FINAL.txt). A formula preca cada ability
// pelo proprio baseDamage/efeitos, sem saber que o multiplicador de passiva
// da arvore (1,82x/1,9575x) some por cima depois — e como as arvores de KKG
// sao curtas (sem golpe fraco de rank baixo pra puxar a media pra baixo,
// diferente do elemental), o custo/dano agregado batia o do Elemental mesmo
// com cada ability individualmente bem precificada. O +12% e' deliberado e
// uniforme nas 7 linhagens, nao debito de formula — este teste so' trava o
// numero ATUAL de cada ability, nao a formula.
const EXPECTED_COSTS: Record<string, number> = {
  shouton_barragem_jade: 46,
  shouton_danca_hexagonal: 75,
  shouton_shuriken_gigante: 76,
  shouton_dragao_cadente: 76,
  vapor_punho_propulsao: 36,
  calor_esfera: 40, // cleanses:WET fora do escopo da formula, mas ainda leva o +12%
  lava_solucao_misteriosa: 40,
  lava_rio_rochas: 62,
  explosao_impacto: 56,
};

describe("custos das técnicas intermediárias de Kekkei Genkai", () => {
  it("cobra proporcionalmente por dano, área, controle e negação de reação", () => {
    for (const [abilityId, expectedCost] of Object.entries(EXPECTED_COSTS)) {
      expect(getAbility(abilityId)?.cost, abilityId).toBe(expectedCost);
    }
  });

  // Vapor e Calor nao tinham golpe canonico pra virar apice (11/08/2026):
  // Chute em Propulsao e Assassinato de Calor Extremo, que eram os
  // "intermediarios" acima, foram promovidos a S-rank/apice — saem da lista
  // de cima e entram aqui, junto com os apices que ja existiam.
  it("mantém os ápices caros", () => {
    expect(getAbility("shouton_oito_paredes")?.cost).toBe(73);
    expect(getAbility("lava_monte_huaguo")?.cost).toBe(67);
    expect(getAbility("explosao_punho_mina")?.cost).toBe(83);
    expect(getAbility("vapor_chute_propulsao")?.cost).toBe(65);
    expect(getAbility("calor_assassinato_extremo")?.cost).toBe(69);
    expect(getAbility("jinton_projeteis")?.cost).toBe(76);
  });
});
