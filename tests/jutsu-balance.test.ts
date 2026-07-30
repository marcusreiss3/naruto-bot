import { describe, expect, it } from "vitest";
import { suggestedJutsuCost } from "../src/services/characters/jutsu-balance.js";
import { getAbility } from "../src/data/index.js";

// Calibração: 3 jutsu elementais já tunados a mão (nunca escritos pensando
// nesta fórmula) batem dentro de 2 pontos do valor sugerido. Isso não prova
// que a fórmula é "a verdade", só que ela não está desconectada do feeling
// que o jogo já tem hoje.
describe("suggestedJutsuCost: calibração contra jutsu existentes", () => {
  it("Grande Bola de Fogo (COMUM, CONE, BURN 60%/3t) bate ~exato", () => {
    const ab = getAbility("katon_goukakyuu")!;
    const cost = suggestedJutsuCost({
      actionType: ab.actionType,
      shape: ab.shape,
      baseDamage: ab.baseDamage,
      effects: ab.effects,
    });
    expect(Math.abs(cost - ab.cost)).toBeLessThanOrEqual(2);
  });

  it("Esfera de Relâmpago (COMUM, RADIUS, STUN 25%/1t) bate ~exato", () => {
    const ab = getAbility("raiton_esfera_relampago")!;
    const cost = suggestedJutsuCost({
      actionType: ab.actionType,
      shape: ab.shape,
      baseDamage: ab.baseDamage,
      effects: ab.effects,
    });
    expect(Math.abs(cost - ab.cost)).toBeLessThanOrEqual(2);
  });

  it("Ataque de Raio (COMUM, LINE, STUN 15%/1t) fica perto", () => {
    const ab = getAbility("raiton_ataque_raio")!;
    const cost = suggestedJutsuCost({
      actionType: ab.actionType,
      shape: ab.shape,
      baseDamage: ab.baseDamage,
      effects: ab.effects,
    });
    expect(Math.abs(cost - ab.cost)).toBeLessThanOrEqual(3);
  });
});

describe("suggestedJutsuCost: sensibilidade aos fatores", () => {
  const base = { actionType: "COMUM" as const, shape: "SINGLE_TARGET" as const, baseDamage: 20 };

  it("mais dano custa mais", () => {
    const barato = suggestedJutsuCost(base);
    const caro = suggestedJutsuCost({ ...base, baseDamage: 40 });
    expect(caro).toBeGreaterThan(barato);
  });

  it("BONUS custa mais que COMUM pro mesmo jutsu (ação extra no mesmo turno)", () => {
    const comum = suggestedJutsuCost(base);
    const bonus = suggestedJutsuCost({ ...base, actionType: "BONUS" });
    expect(bonus).toBeGreaterThan(comum);
  });

  it("MOVIMENTO custa menos que COMUM", () => {
    const comum = suggestedJutsuCost(base);
    const movimento = suggestedJutsuCost({ ...base, actionType: "MOVIMENTO" });
    expect(movimento).toBeLessThan(comum);
  });

  it("unblockable > undodgeable > nenhum, no mesmo jutsu", () => {
    const nenhum = suggestedJutsuCost(base);
    const undodgeable = suggestedJutsuCost({ ...base, undodgeable: true });
    const unblockable = suggestedJutsuCost({ ...base, unblockable: true });
    expect(undodgeable).toBeGreaterThan(nenhum);
    expect(unblockable).toBeGreaterThan(undodgeable);
  });

  it("STUN custa mais que ROOT pra mesma duração (trava ação inteira vs só movimento)", () => {
    const comRoot = suggestedJutsuCost({ ...base, effects: [{ effectId: "ROOT", duration: 2 }] });
    const comStun = suggestedJutsuCost({ ...base, effects: [{ effectId: "STUN", duration: 2 }] });
    expect(comStun).toBeGreaterThan(comRoot);
  });

  it("área (RADIUS) custa mais que single-target com os mesmos números", () => {
    const single = suggestedJutsuCost(base);
    const area = suggestedJutsuCost({ ...base, shape: "RADIUS" });
    expect(area).toBeGreaterThan(single);
  });

  it("chance menor que 100% custa menos", () => {
    const garantido = suggestedJutsuCost({ ...base, effects: [{ effectId: "STUN", duration: 1 }] });
    const chance = suggestedJutsuCost({ ...base, effects: [{ effectId: "STUN", duration: 1, chance: 0.3 }] });
    expect(chance).toBeLessThan(garantido);
  });
});
