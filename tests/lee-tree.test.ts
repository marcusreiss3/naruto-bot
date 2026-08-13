import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { getNode } from "../src/data/element-trees/index.js";
import { characterPassiveMods, passiveMods } from "../src/services/combat/passives.js";

describe("clã Lee", () => {
  it("tem nove passivas em duas ramificações, todas pagas com Taijutsu", () => {
    const tree = CLAN_TREES.lee!;
    expect(tree).toHaveLength(9);
    expect(tree.every((node) => node.kind === "PASSIVE" && node.pool === "taijutsu" && node.clanId === "lee")).toBe(true);
    expect(new Set(tree.map((node) => node.branch))).toEqual(new Set(["Fundamento", "Punho Forte", "Corpo"]));
    expect(getClan("lee")?.activeIds).toEqual([]);
  });

  it("usa o símbolo oficial do clã na habilidade inicial da árvore", () => {
    expect(getNode("lee_raiz")?.img).toBe("/assets/icons/footer/Lee_Symbol.png");
  });

  it("separa os buffs gerais do corpo dos aprimoramentos do Punho Forte", () => {
    const body = characterPassiveMods(["lee_raiz", "lee_condicionamento", "lee_recuperacao", "lee_passos", "lee_reflexos"]);
    expect(body.maxHpBonus).toBeCloseTo(0.10);
    expect(body.hpRegenPerTurn).toBe(2);
    expect(body.moveBonus).toBe(1);
    expect(body.dodgeBonus).toBeCloseTo(0.03);

    const strongFist = passiveMods(["lee_raiz", "lee_folha_furacao", "lee_pesos"], getAbility("tai_furacao_folha")!);
    expect(strongFist.damageMult).toBeCloseTo(1.155);
    expect(strongFist.costMult).toBeCloseTo(0.9);
    expect(passiveMods(["lee_folha_furacao"], getAbility("arhat_palmada_colapso")!).damageMult).toBe(1);
  });
});
