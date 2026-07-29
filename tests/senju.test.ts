import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { getNode } from "../src/data/element-trees/index.js";
import { passiveMods, receivedEffectDurationReduction } from "../src/services/combat/passives.js";

describe("Senju", () => {
  it("possui tronco, dois ramos e um único jutsu próprio", () => {
    const tree = CLAN_TREES.senju!;
    expect(tree).toHaveLength(14);
    expect(tree.filter((node) => node.kind === "JUTSU").map((node) => node.grantsAbilityId))
      .toEqual(["senju_ondas_cortantes"]);
    expect(getClan("senju")?.activeIds).toEqual(["senju_ondas_cortantes"]);
  });

  it("todos os nós usam os ícones próprios da pasta Senju", () => {
    for (const node of CLAN_TREES.senju!) {
      expect(getNode(node.id)?.img, node.id).toMatch(/^\/assets\/icons\/senju\/.+\.png$/);
    }
  });

  it("exige Taijutsu e Ninjutsu Médico na Vitalidade", () => {
    const root = CLAN_TREES.senju!.find((node) => node.id === "senju_vitalidade")!;
    expect(root.pool).toBe("taijutsu");
    expect(root.reqAttribute).toEqual({ attribute: "iryoNinjutsu", value: 1 });
  });

  it("aprimoramentos de Água exigem as técnicas originais", () => {
    expect(CLAN_TREES.senju!.find((node) => node.id === "senju_dragao_mare")!.requires)
      .toContain("agua_dragao");
    expect(CLAN_TREES.senju!.find((node) => node.id === "senju_muralha")!.requires)
      .toContain("agua_muralha");
    expect(CLAN_TREES.senju!.find((node) => node.id === "senju_cachoeira")!.requires)
      .toContain("agua_cachoeira");
    expect(CLAN_TREES.senju!.find((node) => node.id === "senju_chuva")!.requires)
      .toContain("agua_choro");
  });

  it("Domínio Suiton afeta Água, mas não outros elementos", () => {
    const water = getAbility("suiton_suiryuudan")!;
    const fire = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["senju_dominio_suiton"], water).damageMult).toBeCloseTo(1.1);
    expect(passiveMods(["senju_dominio_suiton"], water).costMult).toBe(1);
    expect(passiveMods(["senju_dominio_suiton"], fire).damageMult).toBe(1);
  });

  it("aprimoramentos individuais dão vantagem relevante sem bônus universal", () => {
    const dragon = getAbility("suiton_suiryuudan")!;
    const waterfall = getAbility("suiton_cachoeira")!;
    const dragonMods = passiveMods(["senju_dragao_mare"], dragon);
    const waterfallMods = passiveMods(["senju_cachoeira"], waterfall);
    expect(dragonMods.damageMult).toBeCloseTo(1.15);
    expect(dragonMods.rangeBonus).toBe(1);
    expect(dragonMods.pushBonus).toBe(0);
    expect(waterfallMods.damageMult).toBeCloseTo(1.15);
    expect(waterfallMods.pushBonus).toBe(1);
  });

  it("Muralha Inabalável fortalece somente a Muralha de Água", () => {
    const wall = getAbility("suiton_suijinheki")!;
    const dragon = getAbility("suiton_suiryuudan")!;
    expect(passiveMods(["senju_muralha"], wall).effectStacksBonus.SHIELD).toBe(12);
    expect(passiveMods(["senju_muralha"], dragon).effectStacksBonus.SHIELD).toBeUndefined();
  });

  it("ramo médico fortalece cura e reduz Veneno/Atordoamento recebidos", () => {
    const heal = getAbility("iryo_cura_avancada")!;
    const mods = passiveMods(["senju_regenerativo", "senju_especialista"], heal);
    expect(mods.healMult).toBeCloseTo(1.15 * 1.15);
    expect(mods.costMult).toBeCloseTo(0.9);
    expect(receivedEffectDurationReduction(["senju_imunidade"], "POISON")).toBe(1);
    expect(receivedEffectDurationReduction(["senju_imunidade"], "STUN")).toBe(1);
  });
});
