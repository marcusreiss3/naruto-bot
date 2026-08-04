import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { empoweredDamageMult, type EffectState } from "../src/services/combat/effects.js";

describe("Iryō Ninjutsu", () => {
  it("expõe as sete técnicas na árvore usando a bolsa de Iryō", () => {
    const nodes = allNodes().filter((node) => node.id.startsWith("iryo_") && node.id !== "iryo_cura_basica" && node.id !== "iryo_remover_veneno" && node.id !== "iryo_estancar_sangramento" && node.id !== "iryo_clareza" && node.id !== "iryo_cura_avancada");
    expect(nodes).toHaveLength(20);
    expect(nodes.every((node) => node.pool === "iryoNinjutsu")).toBe(true);
    expect(nodes.filter((node) => node.kind === "JUTSU").every((node) => getAbility(node.grantsAbilityId!))).toBe(true);
  });

  it("separa cura, purificação e combate médico após a Palma Mística", () => {
    const nodes = allNodes();
    expect(nodes.filter((node) => node.branch === "Cura" && node.kind === "PASSIVE")).toHaveLength(4);
    expect(nodes.filter((node) => node.branch === "Purificação" && node.kind === "PASSIVE")).toHaveLength(3);
    expect(nodes.filter((node) => node.branch === "Combate Médico" && node.kind === "PASSIVE")).toHaveLength(3);
  });

  it("reduz condições intermediárias sem removê-las por completo", () => {
    expect(getAbility("iryo_mosquitos")!.reduceEffectDuration).toEqual([
      { effectId: "BURN", turns: 2 },
      { effectId: "POISON", turns: 2 },
    ]);
    expect(getAbility("iryo_yin")!.reduceEffectDuration).toEqual([
      { effectId: "BURN", turns: 2 },
      { effectId: "BLEED", turns: 2 },
    ]);
    expect(getAbility("iryo_desintoxicacao")!.cleanses).toEqual(["POISON"]);
    expect(getAbility("iryo_hemostatica")!.reduceEffectDuration).toEqual([{ effectId: "BLEED", turns: 2 }]);
  });

  it("mantém as técnicas canônicas avançadas no Rank A", () => {
    expect(allNodes().find((node) => node.id === "iryo_choque_desorientacao")!.rank).toBe("A");
    expect(allNodes().find((node) => node.id === "iryo_cura_regenerativa")!.rank).toBe("A");
  });

  it("faz a cura escalar de forma perceptível entre os ranks", () => {
    expect(getAbility("iryo_yin")!.baseHeal).toBeGreaterThan(getAbility("iryo_medusa")!.baseHeal!);
    expect(getAbility("iryo_cura_regenerativa")!.baseHeal).toBeGreaterThan(getAbility("iryo_yin")!.baseHeal!);
    expect(getAbility("iryo_regeneracao")!.baseHeal).toBeGreaterThan(getAbility("iryo_cura_regenerativa")!.baseHeal!);
  });

  it("mantém a Regeneração da Criação como o ápice e aplica sua passiva exclusiva", () => {
    const apex = getAbility("iryo_regeneracao")!;
    expect(apex.baseHeal).toBe(62);
    expect(apex.cleanses).toEqual(["BLEED", "BURN"]);
    expect(passiveMods(["iryo_mitose_acelerada"], apex).costMult).toBe(0.85);
  });

  it("Bisturi de Chakra concede +20% somente a Taijutsu", () => {
    const bisturi = getAbility("iryo_bisturi")!;
    const effect = bisturi.effects!.find((candidate) => candidate.effectId === "EMPOWERED")!;
    expect(effect.stacks).toBe(1.2);
    expect(effect.empoweredScope).toBe("taijutsu");
    const active: EffectState[] = [{
      effectId: "EMPOWERED",
      stacks: 1.2,
      duration: 2,
      dataJson: JSON.stringify({ empoweredScope: { kind: "taijutsu" } }),
    }];
    expect(empoweredDamageMult(active, { category: "TAIJUTSU" })).toBeCloseTo(1.2);
    expect(empoweredDamageMult(active, { category: "KENJUTSU" })).toBe(1);
    expect(empoweredDamageMult(active, { category: "BUKIJUTSU" })).toBe(1);
    expect(empoweredDamageMult(active, { category: "NINJUTSU" })).toBe(1);
  });
});
