import { describe, it, expect } from "vitest";
import { ALL_ABILITIES, getAbility, getNpc } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";

const comSummon = ALL_ABILITIES.filter((a) => a.summon);

describe("invocações: integridade", () => {
  it("existe pelo menos uma invocação", () => {
    expect(comSummon.length).toBeGreaterThan(0);
  });

  // Se o templateId nao existir, createSummon sai calado e o jogador gasta
  // chakra sem receber nada. Falha barulhenta aqui e' melhor.
  it("todo summon aponta para um NpcTemplate que existe", () => {
    const quebrados = comSummon
      .filter((a) => !getNpc(a.summon!.templateId))
      .map((a) => `${a.id} -> ${a.summon!.templateId}`);
    expect(quebrados).toEqual([]);
  });

  it("o corpo da invocação tem vida e pelo menos um jutsu", () => {
    for (const a of comSummon) {
      const tpl = getNpc(a.summon!.templateId)!;
      expect(tpl.hpMax, `${tpl.id} sem HP`).toBeGreaterThan(0);
      expect(tpl.abilityIds.length, `${tpl.id} sem jutsu (ficaria parado)`).toBeGreaterThan(0);
    }
  });

  it("os jutsus do corpo da invocação existem", () => {
    for (const a of comSummon) {
      const tpl = getNpc(a.summon!.templateId)!;
      for (const id of tpl.abilityIds) {
        expect(getAbility(id), `${tpl.id} usa jutsu inexistente: ${id}`).toBeTruthy();
      }
    }
  });
});

describe("Clone de Água", () => {
  const clone = getAbility("suiton_clone")!;

  it("é ação bônus e não causa dano direto", () => {
    expect(clone.actionType).toBe("BONUS");
    expect(clone.baseDamage).toBeUndefined();
  });

  it("estoura em Encharcado ao morrer", () => {
    expect(clone.summon?.onDeath?.effectId).toBe("WET");
    expect(clone.summon?.onDeath?.radius).toBeGreaterThan(0);
  });

  it("está ligado ao nó da árvore", () => {
    const no = allNodes().find((n) => n.id === "agua_clone");
    expect(no?.grantsAbilityId).toBe("suiton_clone");
  });
});

describe("Clone de Raio", () => {
  const clone = getAbility("raiton_clone")!;

  it("é ação bônus e Atordoa quem o fere", () => {
    expect(clone.actionType).toBe("BONUS");
    expect(clone.summon?.onHit?.effectId).toBe("STUN");
  });

  it("está ligado ao nó da árvore", () => {
    const no = allNodes().find((n) => n.id === "raio_clone");
    expect(no?.grantsAbilityId).toBe("raiton_clone");
  });
});
