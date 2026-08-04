import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";

// Clã reconstruido: o antigo kit de jutsu virou o kekkei genkai Gelo (ver
// tests/gelo.test.ts) — o Yuki agora é puramente passivo, mesmo padrão do
// Onoki/Bakurei/Yotsuki: dual crossElement (Água + Gelo) + tecnicas
// especificas de Água.
describe("Yuki: clã reconstruido (só passiva, sem jutsu próprio)", () => {
  it("não concede jutsu nenhum", () => {
    expect(getClan("yuki")?.activeIds).toEqual([]);
    expect(CLAN_TREES.yuki!.every((node) => node.kind === "PASSIVE")).toBe(true);
  });

  it("todos os nós saem do pool de Ninjutsu", () => {
    for (const node of CLAN_TREES.yuki!) expect(node.pool, node.id).toBe("ninjutsu");
  });

  it("Domínio Suiton afeta Água; Domínio Hyoton afeta Gelo — nada mais", () => {
    const water = getAbility("suiton_suiryuudan")!;
    const ice = getAbility("gelo_agulhas")!;
    const fire = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["yuki_agua"], water).damageMult).toBeCloseTo(1.1);
    expect(passiveMods(["yuki_agua"], fire).damageMult).toBe(1);
    expect(passiveMods(["yuki_hyoton"], ice).damageMult).toBeCloseTo(1.1);
    expect(passiveMods(["yuki_hyoton"], water).damageMult).toBe(1);
  });

  it("2 passivas de água específica + 2 de gelo específica, ramos simetricos (pedido: +2 gelo, -1 água)", () => {
    const prisao = getAbility("suiton_prisao")!;
    const dragao = getAbility("suiton_suiryuudan")!;
    const espelho = getAbility("gelo_espelho")!;
    const chuva = getAbility("gelo_chuva_agulhas")!;

    const prisaoMods = passiveMods(["yuki_prisao"], prisao);
    expect(prisaoMods.costMult).toBeCloseTo(0.9);
    expect(prisaoMods.effectDurationBonus.WET).toBe(1);

    const dragaoMods = passiveMods(["yuki_dragao"], dragao);
    expect(dragaoMods.damageMult).toBeCloseTo(1.15);
    expect(dragaoMods.rangeBonus).toBe(1);

    const espelhoMods = passiveMods(["yuki_espelho_amplificado"], espelho);
    expect(espelhoMods.damageMult).toBeCloseTo(1.15);
    expect(espelhoMods.effectChanceBonus.DEFENSE_DOWN).toBeCloseTo(0.1);
    expect(passiveMods(["yuki_espelho_amplificado"], dragao).damageMult).toBe(1);

    const chuvaMods = passiveMods(["yuki_chuva_amplificada"], chuva);
    expect(chuvaMods.damageMult).toBeCloseTo(1.15);
    expect(chuvaMods.effectDurationBonus.SLOW).toBe(1);

    // 2 e 2 — nao sobrou nenhuma terceira passiva de agua (Ondas Furiosas saiu)
    const specific = CLAN_PASSIVES.filter((p) => p.clanId === "yuki" && p.abilityIds);
    const water = specific.filter((p) => p.abilityIds!.some((id) => id.startsWith("suiton_")));
    const ice = specific.filter((p) => p.abilityIds!.some((id) => id.startsWith("gelo_")));
    expect(water).toHaveLength(2);
    expect(ice).toHaveLength(2);
  });

  it("raiz reduz o custo de todo Ninjutsu", () => {
    const node = CLAN_TREES.yuki!.find((n) => n.id === "yuki_raiz")!;
    expect(node.requires).toEqual([]);
    expect(node.name).toBe("Controle de Chakra Yuki");
    const water = getAbility("suiton_suiryuudan")!;
    expect(passiveMods(["yuki_raiz"], water).costMult).toBeCloseTo(0.92);
  });
});
