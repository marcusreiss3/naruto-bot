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
    expect(reserva).toMatchObject({ reqLevel: 20, reqPool: 20, cost: 3 });
    expect(profunda).toMatchObject({ reqLevel: 30, reqPool: 30, cost: 4 });
  });

  it("concentra a progressão corporal em vida, recuperação e mobilidade", () => {
    const mods = characterPassiveMods(["tai_pass_vigor", "tai_pass_corpo_temperado", "tai_pass_recuperacao", "tai_pass_passada"]);
    expect(mods.maxHpBonus).toBeCloseTo(0.18);
    expect(mods.hpRegenPerTurn).toBe(3);
    expect(mods.moveBonus).toBe(1);
  });

  it("as 3 ramificações terminam num topo próprio, e Maestria Marcial exige os três", () => {
    const maestria = TAIJUTSU_PASSIVES_TREE.find((node) => node.id === "tai_pass_maestria")!;
    expect(maestria.requires).toEqual(["tai_pass_reflexo_evasivo", "tai_pass_resistencia_fisica", "tai_pass_reserva_profunda"]);
    expect(maestria.reqLevel).toBe(40);
  });

  it("Passo Silencioso soma mais 1 casa de movimento em cima de Passada Leve", () => {
    const mods = characterPassiveMods(["tai_pass_passada", "tai_pass_passo_silencioso"]);
    expect(mods.moveBonus).toBe(2);
  });

  it("Resistência Física soma vida e regen em cima do resto do ramo do meio", () => {
    const mods = characterPassiveMods(["tai_pass_vigor", "tai_pass_corpo_temperado", "tai_pass_recuperacao", "tai_pass_resistencia_fisica"]);
    expect(mods.maxHpBonus).toBeCloseTo(0.23);
    expect(mods.hpRegenPerTurn).toBe(5);
  });

  it("Reflexo Evasivo dá esquiva geral, mesmo sem reação nenhuma escolhida", () => {
    const mods = characterPassiveMods(["tai_pass_reflexo_evasivo"]);
    expect(mods.dodgeBonus).toBeCloseTo(0.03);
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
