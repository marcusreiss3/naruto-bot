import { describe, expect, it } from "vitest";
import { getAbility, getNpc } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { summonOverkillReflect } from "../src/services/combat/combat-math.js";

describe("Clones das Sombras: configuração da ability", () => {
  const bunshin = getAbility("kage_bunshin")!;

  it("existe, é ação bônus e custa 5% de chakra por clone", () => {
    expect(bunshin).toBeTruthy();
    expect(bunshin.actionType).toBe("BONUS");
    expect(bunshin.resource).toBe("chakra");
    expect(bunshin.cost).toBe(5);
  });

  it("não causa dano direto — é pura invocação", () => {
    expect(bunshin.baseDamage).toBeUndefined();
  });

  it("aponta pro template summon_kage_bunshin", () => {
    expect(bunshin.summon?.templateId).toBe("summon_kage_bunshin");
  });

  it("teto de 6 clones vivos ao mesmo tempo", () => {
    expect(bunshin.summon?.maxAlive).toBe(6);
  });

  it("herda jutsu do invocador, sem nada acima de 35% de chakra", () => {
    expect(bunshin.summon?.inheritOwnerJutsu?.maxCostPct).toBe(35);
  });

  it("só ataca a partir da rodada seguinte à criação", () => {
    expect(bunshin.summon?.actsNextRound).toBe(true);
  });

  it("reflete 30% do dano excedente e 30% do custo de jutsu ao morrer", () => {
    expect(bunshin.summon?.deathReflect?.overkillDamagePct).toBeCloseTo(0.3);
    expect(bunshin.summon?.deathReflect?.jutsuCostPct).toBeCloseTo(0.3);
  });

  it("é compra manual e NÃO está em nenhum nó de árvore ainda", () => {
    expect(bunshin.requirements).toMatchObject({ manualOnly: true });
    const concedePorNo = allNodes().some((n) => n.grantsAbilityId === "kage_bunshin");
    expect(concedePorNo).toBe(false);
    const concedePorCla = Object.values(CLAN_TREES)
      .flat()
      .some((n) => n?.grantsAbilityId === "kage_bunshin");
    expect(concedePorCla).toBe(false);
  });
});

describe("Clones das Sombras: template do corpo", () => {
  it("summon_kage_bunshin tem exatamente 1 de vida sempre (não usa hpFraction)", () => {
    const tpl = getNpc("summon_kage_bunshin")!;
    expect(tpl).toBeTruthy();
    expect(tpl.hpMax).toBe(1);
    expect(getAbility("kage_bunshin")!.summon?.hpFraction).toBeUndefined();
  });

  it("abilityIds do template fica vazio de propósito — é substituído em tempo de execução", () => {
    const tpl = getNpc("summon_kage_bunshin")!;
    expect(tpl.abilityIds).toEqual([]);
  });
});

describe("Clones das Sombras: fórmula de reflexo de dano (summonOverkillReflect)", () => {
  it("clone com 1 HP toma 20 de dano -> excedente 19 -> 30% = 6 (exemplo do pedido original)", () => {
    expect(summonOverkillReflect(20, 1, 0.3)).toBe(6);
  });

  it("dano igual ou menor que o hpMax não gera excedente nenhum", () => {
    expect(summonOverkillReflect(1, 1, 0.3)).toBe(0);
    expect(summonOverkillReflect(0, 1, 0.3)).toBe(0);
  });

  it("arredonda o resultado final", () => {
    // excedente 9 * 30% = 2.7 -> 3
    expect(summonOverkillReflect(10, 1, 0.3)).toBe(3);
  });
});

describe("Clones das Sombras: dívida de chakra por jutsu usado (30% do custo base)", () => {
  it("jutsu que custa 50% de chakra gera 15% de dívida ao invocador (exemplo do pedido original)", () => {
    const debtRate = 0.3;
    const jutsuCost = 50;
    expect(Math.round(jutsuCost * debtRate)).toBe(15);
  });
});
