import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { getNode } from "../src/data/element-trees/index.js";
import { TAIJUTSU_PASSIVES_TREE } from "../src/data/taijutsu-passives-tree.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";

describe("árvore geral de Taijutsu", () => {
  it("registra todos os estilos como passivas, sem a ramificação de névoa", () => {
    const ids = ["tai_pass_raiz", "tai_forte_ritmo", "tai_arhat_impacto", "tai_adamantino_controle", "tai_agitacao_passos"];
    const nodes = ids.map(getNode);
    expect(nodes.every(Boolean)).toBe(true);
    expect(TAIJUTSU_PASSIVES_TREE.every((node) => node.kind === "PASSIVE")).toBe(true);
    expect(TAIJUTSU_PASSIVES_TREE.some((node) => node.id.startsWith("tai_nevoa_"))).toBe(false);
    expect(TAIJUTSU_PASSIVES_TREE.some((node) => node.id.startsWith("tai_gentil_"))).toBe(false);
  });

  it("limita a reserva máxima de energia a 150%", () => {
    const mods = characterPassiveMods(["tai_pass_reserva", "tai_pass_reserva_profunda", "tai_pass_reserva_profunda"]);
    expect(mods.maxEnergyBonus).toBe(0.5);
  });

  it("deixa os patamares de energia para a progressão avançada", () => {
    const reserva = TAIJUTSU_PASSIVES_TREE.find((node) => node.id === "tai_pass_reserva")!;
    const profunda = TAIJUTSU_PASSIVES_TREE.find((node) => node.id === "tai_pass_reserva_profunda")!;
    expect(reserva).toMatchObject({ reqLevel: 25, reqPool: 25, cost: 3 });
    expect(profunda).toMatchObject({ reqLevel: 42, reqPool: 42, cost: 4 });
  });

  it("concentra a progressão corporal em vida, recuperação e mobilidade", () => {
    const mods = characterPassiveMods(["tai_pass_vigor", "tai_pass_corpo_temperado", "tai_pass_recuperacao", "tai_pass_passada"]);
    expect(mods.maxHpBonus).toBeCloseTo(0.18);
    expect(mods.hpRegenPerTurn).toBe(3);
    expect(mods.moveBonus).toBe(1);
  });

  it("does not contain the Agitacao or Kenjutsu branches anymore", () => {
    const mods = passiveMods(
      ["tai_agitacao_passos", "tai_agitacao_finta", "tai_agitacao_ritmo"],
      getAbility("tai_furacao_folha")!,
    );
    expect(mods.dodgePenalty).toBeCloseTo(0.12);
    expect(TAIJUTSU_PASSIVES_TREE.some((node) => node.id.startsWith("tai_agitacao_"))).toBe(false);
    expect(TAIJUTSU_PASSIVES_TREE.some((node) => node.id.startsWith("tai_ken_"))).toBe(false);
    expect(TAIJUTSU_PASSIVES_TREE.some((node) => node.id === "tai_forte_combo" || node.id === "tai_forte_portoes")).toBe(false);
  });

});
