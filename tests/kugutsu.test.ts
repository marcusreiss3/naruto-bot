import { describe, expect, it } from "vitest";
import { KUGUTSU_ABILITIES } from "../src/data/jutsus/kugutsu.js";

const ability = (id: string) => KUGUTSU_ABILITIES.find((entry) => entry.id === id)!;

describe("Kugutsu", () => {
  it("usa Bukijutsu como régua e deixa o bônus de dano para a carapaça", () => {
    expect(ability("kugutsu_tiro_mecanismo_destrutivo").baseDamage).toBe(16);
    expect(ability("kugutsu_ataque_super_arma").baseDamage).toBe(22);
    expect(ability("kugutsu_multiplos_bracos").baseDamage).toBe(30);
    expect(ability("kugutsu_lanca_chamas").baseDamage).toBe(26);
    expect(ability("kugutsu_cauda_escorpiao").baseDamage).toBe(30);
    expect(ability("kugutsu_dama_ferro").baseDamage).toBe(38);
    expect(ability("kugutsu_atacando_ambos_lados").baseDamage).toBe(39);
  });

  it("cobra Chakra por ataque e limita os combos máximos", () => {
    for (const entry of KUGUTSU_ABILITIES.filter((entry) => entry.tags.includes("puppet-attack"))) {
      expect(entry.resource).toBe("chakra");
      expect(entry.cost).toBeGreaterThan(0);
    }
    expect(ability("kugutsu_dama_ferro").oncePerCombat).toBe(true);
    expect(ability("kugutsu_atacando_ambos_lados").oncePerCombat).toBe(true);
  });

  it("faz a Carapaça Resistente renovar sua própria Barreira moderada", () => {
    const shield = ability("kugutsu_carapaca_resistente").selfEffects?.find((effect) => effect.effectId === "SHIELD");
    expect(shield).toMatchObject({ stacks: 7, hpPercentStacks: 0.10, duration: 2, replaceGroup: "kugutsu_carapaca_resistente" });
    expect(ability("kugutsu_carapaca_resistente").selfEffects?.find((effect) => effect.effectId === "ROOT")).toMatchObject({ duration: 2 });
  });
});
