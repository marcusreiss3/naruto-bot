import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";

// Valores recalculados por suggestedJutsuCost() (services/characters/
// jutsu-balance.ts) — ver tests/jutsu-balance.test.ts pra formula em si.
//
// 12/08/2026: um +12% uniforme nas 7 linhagens tirou a dominancia de
// custo/dano de KKG contra a media da coluna Elemental — mas era injusto:
// Cristal/Poeira/Explosao ja' tinham custo/dano (0.96/0.91/0.89) igual ou
// acima da propria media do grupo, e nao eram a causa do problema. Voltaram
// pro custo ORIGINAL calibrado pela formula (linha "revert" abaixo). So'
// Vapor/Calor/Lava/Gelo (0.62-0.73, os 4 que realmente puxavam a media pra
// baixo) levam o aumento — agora +24,7%, nao +12% — pra fechar a MESMA
// media de grupo (~0.87, ver capitulo 12 do BALANCEAMENTO_FINAL.txt)
// taxando so' quem causou o problema. Este teste so' trava o numero ATUAL
// de cada ability, nao a formula.
const EXPECTED_COSTS: Record<string, number> = {
  // revertidos ao original (nao causavam o problema de custo/dano)
  shouton_barragem_jade: 41,
  shouton_danca_hexagonal: 67,
  shouton_shuriken_gigante: 68,
  shouton_dragao_cadente: 68,
  explosao_impacto: 50,
  // +24,7% (causavam o problema)
  vapor_punho_propulsao: 40,
  calor_esfera: 45, // cleanses:WET fora do escopo da formula, mas ainda leva o +24,7%
  lava_solucao_misteriosa: 45,
  lava_rio_rochas: 69,
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
    expect(getAbility("shouton_oito_paredes")?.cost).toBe(65); // revertido
    expect(getAbility("lava_monte_huaguo")?.cost).toBe(75); // +24,7%
    expect(getAbility("explosao_punho_mina")?.cost).toBe(74); // revertido
    expect(getAbility("vapor_chute_propulsao")?.cost).toBe(72); // +24,7%
    expect(getAbility("calor_assassinato_extremo")?.cost).toBe(77); // +24,7%
    expect(getAbility("jinton_projeteis")?.cost).toBe(68); // revertido
  });
});
