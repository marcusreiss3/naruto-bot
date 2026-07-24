import { describe, it, expect } from "vitest";
import { ATTRIBUTES, type Attribute } from "../src/config/enums.js";
import { resolveAreaCells, dodgeChance } from "../src/services/combat/combat-math.js";
import { BALANCE } from "../src/config/balance.js";
import type { Ability } from "../src/data/types.js";
import { meetsRequirements } from "../src/services/characters/requirements.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { getScenarioById } from "../src/data/scenarios/index.js";

describe("seleção de alvos / área", () => {
  it("LINE seleciona células em linha reta", () => {
    const scenario = getScenarioById("floresta")!;
    const ab = getAbility("katon_ryuuka")!; // LINE range 6
    const cells = resolveAreaCells(ab, "A1", "A6", scenario);
    expect(cells).toContain("A2");
    expect(cells).toContain("A6");
    expect(cells).not.toContain("B2");
  });

  it("MELEE/SINGLE atinge só o alvo", () => {
    const scenario = getScenarioById("floresta")!;
    const ab = getAbility("tai_soco_forte")!;
    const cells = resolveAreaCells(ab, "A1", "A2", scenario);
    expect(cells).toEqual(["A2"]);
  });
});

describe("dodgeChance: base única + cap único", () => {
  // dodgeChance so le ability.undodgeable; monta o minimo.
  const atk = (over: Partial<Ability> = {}): Ability => ({ undodgeable: false, ...over } as unknown as Ability);

  it("base é dodgeBase (15%) sem reação", () => {
    expect(dodgeChance({ ability: atk() })).toBeCloseTo(BALANCE.dodgeBase);
  });

  it("não escala com atributo — só o reactionBonus soma", () => {
    expect(dodgeChance({ ability: atk(), reactionBonus: 0.2 })).toBeCloseTo(BALANCE.dodgeBase + 0.2);
  });

  it("cap único trava em dodgeCap (50%)", () => {
    expect(dodgeChance({ ability: atk(), reactionBonus: 0.9 })).toBeCloseTo(BALANCE.dodgeCap);
  });

  it("undodgeable zera", () => {
    expect(dodgeChance({ ability: atk({ undodgeable: true }), reactionBonus: 0.9 })).toBe(0);
  });

  it("DEFENSE_DOWN e altura do atacante reduzem", () => {
    expect(dodgeChance({ ability: atk(), defenseDown: true })).toBeCloseTo(
      BALANCE.dodgeBase - BALANCE.effects.DEFENSE_DOWN.dodgeReduction,
    );
    expect(dodgeChance({ ability: atk(), attackerHeight: true })).toBeCloseTo(
      BALANCE.dodgeBase - BALANCE.heightTargetDodgePenalty,
    );
  });
});

// Monta os 9 atributos com 1 de base; so o que interessa ao teste vai no override.
// Evita quebrar este arquivo toda vez que um atributo novo entra no enum.
const attrs = (over: Partial<Record<Attribute, number>> = {}): Record<Attribute, number> => {
  const base = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) base[a] = 1;
  return { ...base, ...over };
};

describe("desbloqueio de jutsu", () => {
  // Todo jutsu concedido pela arvore precisa ser manualOnly: o auto-unlock
  // (character-service) pula esses, entao quem libera e' a compra do no. Se um
  // deles perder a flag, o jogador ganha o jutsu de graca e a arvore vira enfeite.
  it("todo jutsu concedido pela árvore é manualOnly", () => {
    const semFlag = allNodes()
      .filter((n) => n.kind === "JUTSU" && n.grantsAbilityId)
      .map((n) => getAbility(n.grantsAbilityId!))
      .filter((ab): ab is NonNullable<typeof ab> => !!ab)
      .filter((ab) => !ab.requirements?.manualOnly)
      .map((ab) => ab.id);
    expect(semFlag).toEqual([]);
  });

  it("requisito de elemento continua valendo para jutsu de desbloqueio automático", () => {
    const ab = getAbility("suiton_trombeta")!;
    const semElemento = meetsRequirements(ab, {
      level: 20,
      attrs: attrs({ ninjutsu: 20 }),
      elements: ["FOGO"],
      clanId: null,
    });
    expect(semElemento).toBe(false);
  });
});

describe("integridade de dados", () => {
  it("desarme: ken_desarme aplica efeito DISARM", () => {
    const ab = getAbility("ken_desarme")!;
    expect(ab.effects?.some((e) => e.effectId === "DISARM")).toBe(true);
  });
});
