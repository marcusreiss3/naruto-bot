import { describe, it, expect } from "vitest";
import { ATTRIBUTES, type Attribute, type Element } from "../src/config/enums.js";
import { computeDamage, resolveAreaCells, dodgeChance } from "../src/services/combat/combat-math.js";
import { BALANCE } from "../src/config/balance.js";
import type { Ability } from "../src/data/types.js";
import { meetsRequirements } from "../src/services/characters/requirements.js";
import { ALL_ABILITIES, getAbility } from "../src/data/index.js";
import { buildMechanicsSummary } from "../src/services/characters/skill-description.js";
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
    const ab = getAbility("tai_furacao_folha")!;
    const cells = resolveAreaCells(ab, "A1", "A2", scenario);
    expect(cells).toEqual(["A2"]);
  });

  // Regressao: o bonus de alcance (Alcance Estendido do Vento, Ascendente da
  // Lua) so' entrava na validacao de distancia do useAbility, nunca aqui.
  // Resultado: a mira alcancava mais longe do que o traco desenhado, o preview
  // mostrava menos celulas do que o certo e quem estava na faixa extra nao era
  // atingido.
  it("LINE estica com o bônus de alcance", () => {
    const scenario = getScenarioById("floresta")!;
    const ab = getAbility("katon_ryuuka")!; // LINE range 6
    expect(resolveAreaCells(ab, "A1", "A8", scenario)).not.toContain("A8");
    expect(resolveAreaCells(ab, "A1", "A8", scenario, 2)).toContain("A8");
  });

  it("CONE estica com o bônus de alcance", () => {
    const scenario = getScenarioById("floresta")!;
    const cone = { ...getAbility("katon_ryuuka")!, shape: "CONE", range: 3 } as Ability;
    expect(resolveAreaCells(cone, "A1", "A5", scenario)).not.toContain("A5");
    expect(resolveAreaCells(cone, "A1", "A5", scenario, 2)).toContain("A5");
  });

  // RADIUS fica de fora de proposito: nele alcance (ate onde da' pra mirar) e
  // tamanho da explosao sao coisas separadas, e a explosao cresce ao quadrado.
  it("RADIUS não infla a explosão com o bônus de alcance", () => {
    const scenario = getScenarioById("floresta")!;
    const radius = { ...getAbility("katon_ryuuka")!, shape: "RADIUS", range: 4 } as Ability;
    const semBonus = resolveAreaCells(radius, "A1", "C3", scenario);
    expect(resolveAreaCells(radius, "A1", "C3", scenario, 2)).toEqual(semBonus);
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

  it("Aparo pode ser aprendido por Bukijutsu ou Kenjutsu", () => {
    const ab = getAbility("ken_aparar")!;
    const context = {
      level: 20,
      elements: [] as Element[],
      clanId: null,
    };
    expect(meetsRequirements(ab, { ...context, attrs: attrs({ bukijutsu: 5 }) })).toBe(true);
    expect(meetsRequirements(ab, { ...context, attrs: attrs({ kenjutsu: 5 }) })).toBe(true);
    expect(meetsRequirements(ab, { ...context, attrs: attrs({ bukijutsu: 4, kenjutsu: 4 }) })).toBe(false);
  });
});

describe("integridade de dados", () => {
  // Era o ken_desarme do support.ts (apagado em 09/08/2026). O Vento
  // Ascendente da Folha e' a unica ability do roster real que aplica DISARM.
  it("desarme: Vento Ascendente da Folha aplica efeito DISARM", () => {
    const ab = getAbility("tai_vento_ascendente_folha")!;
    expect(ab.effects?.some((e) => e.effectId === "DISARM")).toBe(true);
  });
});

describe("escala uniforme de dano", () => {
  it("Genjutsu nao soma atributo ao dano, como as demais disciplinas", () => {
    const ab = getAbility("chinoike_genjutsu_ketsuryuugan")!;
    expect(BALANCE.genjutsuScaling).toBe(0);
    expect(ab.baseDamage).toBe(29);
    expect(computeDamage(ab, { attrValue: 1 })).toBe(29);
    expect(computeDamage(ab, { attrValue: 50 })).toBe(29);
  });

  // A garantia que interessa e' "o jogador LE a palavra Inevitavel", e quem
  // entrega isso hoje e' a linha gerada por buildMechanicsSummary a partir da
  // flag `unblockable` — nao o texto escrito a mao. Os testes checavam
  // `description`/`node.desc` e cobravam que a mecanica fosse duplicada na
  // ambientacao, o contrario do padrao do projeto (buildVisualDescription
  // existe justamente pra TIRAR frase mecanica do texto de sabor).
  it("toda ability sem reacao usa o nome amigavel Inevitavel", () => {
    for (const ab of ALL_ABILITIES.filter((ability) => ability.unblockable)) {
      expect(buildMechanicsSummary(ab), ab.id).toMatch(/Inevitável/i);
    }
  });

  it("todo no de arvore sem reacao usa o nome amigavel Inevitavel", () => {
    const nodes = allNodes().filter((node) => {
      const ability = node.grantsAbilityId ? getAbility(node.grantsAbilityId) : undefined;
      return ability?.unblockable;
    });
    for (const node of nodes) {
      const ability = getAbility(node.grantsAbilityId!)!;
      expect(buildMechanicsSummary(ability), node.id).toMatch(/Inevitável/i);
    }
  });
});
