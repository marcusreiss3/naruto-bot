import { describe, expect, it } from "vitest";
import { GENJUTSU_TREE } from "../src/data/genjutsu-tree.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";
import { genjutsuDuration } from "../src/services/characters/formulas.js";
import { suggestedJutsuCost } from "../src/services/characters/jutsu-balance.js";

const IDS = [
  "gen_raizes_obscuras",
  "gen_arvore_assassina",
  "gen_interrogatorio",
  "gen_contra_genjutsu",
  "gen_substituicao_ilusoria",
  "gen_penas_caidas",
  "gen_alicerce_relampago_ilusorio",
  "gen_dominio_mundo_obscuro",
  "gen_visao_inferno",
] as const;

describe("árvore de Genjutsu: integridade", () => {
  it("entra no índice global e concede as nove técnicas ativas", () => {
    const indexed = new Set(allNodes().map((n) => n.id));
    for (const node of GENJUTSU_TREE) expect(indexed.has(node.id)).toBe(true);
    const jutsuNodes = GENJUTSU_TREE.filter((n) => n.kind === "JUTSU");
    expect(jutsuNodes).toHaveLength(9);
    expect(new Set(jutsuNodes.map((n) => n.grantsAbilityId))).toEqual(new Set(IDS));
  });

  it("nenhum nó tem `element` (gate é o atributo genjutsu, não natureza de chakra)", () => {
    for (const n of GENJUTSU_TREE) expect(n.element).toBeUndefined();
  });

  it("todos os nós pagam do pool genjutsu", () => {
    for (const n of GENJUTSU_TREE) expect(n.pool).toBe("genjutsu");
  });

  it("todas as nove técnicas existem, são compra manual e não têm clanId/element", () => {
    for (const id of IDS) {
      const ab = getAbility(id);
      expect(ab, id).toBeTruthy();
      expect(ab!.category).toBe("GENJUTSU");
      expect(ab!.requirements?.manualOnly).toBe(true);
      expect(ab!.requirements?.clanId).toBeUndefined();
      expect(ab!.element).toBeUndefined();
    }
  });

  it("toda ability com effects declara baseDamage (zero também dispara efeitos de controle puro)", () => {
    for (const id of IDS) {
      const ab = getAbility(id)!;
      if (ab.effects?.length) expect(ab.baseDamage, id).toBeDefined();
    }
  });
});

describe("árvore de Genjutsu: forma — raiz com 3 ramos, cada um com identidade própria", () => {
  it("Véu da Mente é a raiz, isolada", () => {
    const raiz = GENJUTSU_TREE.find((n) => n.id === "gen_raiz")!;
    expect(raiz.kind).toBe("PASSIVE");
    expect(raiz.requires).toEqual([]);
  });

  it("Raízes Obscuras, Contra-Genjutsu e Penas Caídas (o 1º nó de cada ramo) saem direto da raiz", () => {
    for (const id of ["gen_raizes_obscuras", "gen_contra_genjutsu", "gen_penas_caidas"]) {
      expect(GENJUTSU_TREE.find((n) => n.id === id)!.requires).toEqual(["gen_raiz"]);
    }
  });

  it("Aprisionamento encadeia em ordem crescente de força: Raízes -> Ecos -> Árvore Assassina -> Interrogatório", () => {
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_ecos_cativeiro")!.requires).toEqual(["gen_raizes_obscuras"]);
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_arvore_assassina")!.requires).toEqual(["gen_ecos_cativeiro"]);
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_interrogatorio")!.requires).toEqual(["gen_arvore_assassina"]);
  });

  it("Ilusão/Fuga encadeia Contra-Genjutsu -> Substituição Ilusória -> Fluência da Ilusão, e não converge no ápice", () => {
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_substituicao_ilusoria")!.requires).toEqual(["gen_contra_genjutsu"]);
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_fluencia_ilusao")!.requires).toEqual(["gen_substituicao_ilusoria"]);
    const apice = GENJUTSU_TREE.find((n) => n.id === "gen_visao_inferno")!;
    for (const id of ["gen_contra_genjutsu", "gen_substituicao_ilusoria", "gen_fluencia_ilusao"]) {
      expect(apice.requires, id).not.toContain(id);
    }
  });

  it("Pesadelo encadeia Penas Caídas -> Alicerce -> Domínio do Medo -> Domínio do Mundo Obscuro", () => {
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_alicerce_relampago_ilusorio")!.requires).toEqual(["gen_penas_caidas"]);
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_dominio_do_medo")!.requires).toEqual(["gen_alicerce_relampago_ilusorio"]);
    expect(GENJUTSU_TREE.find((n) => n.id === "gen_dominio_mundo_obscuro")!.requires).toEqual(["gen_dominio_do_medo"]);
  });

  it("Visão do Inferno (ápice) converge Interrogatório + Domínio do Mundo Obscuro", () => {
    const apice = GENJUTSU_TREE.find((n) => n.id === "gen_visao_inferno")!;
    expect(new Set(apice.requires)).toEqual(new Set(["gen_interrogatorio", "gen_dominio_mundo_obscuro"]));
    expect(apice.rank).toBe("S");
  });
});

describe("Alicerce de Relâmpago Ilusório: luz de área para abrir a guarda", () => {
  const ab = getAbility("gen_alicerce_relampago_ilusorio")!;
  it("atinge uma área e pode confundir, além de reduzir a defesa", () => {
    expect(ab.shape).toBe("RADIUS");
    expect(ab.effects).toEqual([
      { effectId: "CONFUSION", duration: 2, chance: 0.75 },
      { effectId: "DEFENSE_DOWN", duration: 1, chance: 0.75 },
    ]);
  });

  it("exibe a arte própria do Alicerce de Relâmpago Ilusório", () => {
    expect(allNodes().find((node) => node.id === "gen_alicerce_relampago_ilusorio")?.img)
      .toBe("/assets/icons/genjutsu/alicerce-de-relampago-ilusorio.png");
  });
});

describe("árvore de Genjutsu: identidade de controle (sem damageMult de dano bruto)", () => {
  it("nenhuma passiva de Genjutsu multiplica dano bruto", () => {
    const genjutsuPassives = PASSIVES.filter(
      (p) => p.crossCategory === "GENJUTSU" || p.nodeId === "gen_raiz" || p.nodeId === "gen_fluencia_ilusao",
    );
    expect(genjutsuPassives.length).toBeGreaterThan(0);
    for (const p of genjutsuPassives) expect(p.damageMult).toBeUndefined();
  });

  it("Véu da Mente NÃO reduz custo (não faz sentido a raiz abrir com desconto) — dá esquiva + iniciativa", () => {
    const arvore = getAbility("gen_arvore_assassina")!;
    const m = passiveMods(["gen_raiz"], arvore);
    expect(m.costMult).toBe(1);
    const cm = characterPassiveMods(["gen_raiz"]);
    expect(cm.ninjutsuDodgeBonus).toBeCloseTo(0.03);
    expect(cm.initiativePriority).toBe(1);
  });

  it("Ecos do Cativeiro estende ROOT, Domínio do Medo soma chance de STUN", () => {
    const arvore = getAbility("gen_arvore_assassina")!;
    const penas = getAbility("gen_penas_caidas")!;
    const nonGenjutsuRoot = getAbility("abelha_gigante_mel")!;
    expect(passiveMods(["gen_ecos_cativeiro"], arvore).effectDurationBonus.ROOT).toBe(1);
    expect(passiveMods(["gen_ecos_cativeiro"], nonGenjutsuRoot).effectDurationBonus.ROOT ?? 0).toBe(0);
    expect(passiveMods(["gen_dominio_do_medo"], penas).effectChanceBonus.STUN).toBeCloseTo(0.2);
  });

  it("Fluência da Ilusão só desconta Contra-Genjutsu e Substituição Ilusória (abilityIds), não o resto da árvore", () => {
    const contra = getAbility("gen_contra_genjutsu")!;
    const substituicao = getAbility("gen_substituicao_ilusoria")!;
    const arvore = getAbility("gen_arvore_assassina")!;
    expect(passiveMods(["gen_fluencia_ilusao"], contra).costMult).toBeCloseTo(0.8);
    expect(passiveMods(["gen_fluencia_ilusao"], substituicao).costMult).toBeCloseTo(0.8);
    expect(passiveMods(["gen_fluencia_ilusao"], arvore).costMult).toBe(1);
  });

  it("passivas de Genjutsu não afetam jutsu elemental nem de clã", () => {
    const bola = getAbility("katon_goukakyuu")!;
    const possessao = getAbility("nara_possessao")!;
    expect(passiveMods(["gen_raiz"], bola).costMult).toBe(1);
    expect(passiveMods(["gen_raiz"], possessao).costMult).toBe(1);
  });
});

describe("Raízes Obscuras: versão básica — só Imobiliza, pode ser esquivada", () => {
  const ab = getAbility("gen_raizes_obscuras")!;
  it("aplica só ROOT e não tem undodgeable/unblockable (diferencia da versão avançada)", () => {
    expect(ab.effects).toEqual([{ effectId: "ROOT", duration: 2 }]);
    expect(ab.undodgeable).toBeUndefined();
    expect(ab.unblockable).toBeUndefined();
  });
});

describe("Aprisionamento da Árvore Assassina: prende com contrajogo", () => {
  const ab = getAbility("gen_arvore_assassina")!;
  it("pode ser esquivada; se acertar, imobiliza e pode Atordoar brevemente", () => {
    expect(ab.undodgeable).toBeUndefined();
    expect(ab.effects).toEqual([
      { effectId: "STUN", duration: 1, chance: 0.6 },
      { effectId: "ROOT", duration: 2 },
    ]);
  });

  it("o custo bate com o sugerido pela fórmula de balanceamento (dentro de 1 ponto)", () => {
    const suggested = suggestedJutsuCost({
      actionType: ab.actionType,
      shape: ab.shape,
      baseDamage: ab.baseDamage,
      effects: ab.effects,
      undodgeable: ab.undodgeable,
    });
    expect(Math.abs(suggested - ab.cost)).toBeLessThanOrEqual(1);
  });
});

describe("Contra-Genjutsu: libera si mesmo ou aliado", () => {
  const ab = getAbility("gen_contra_genjutsu")!;
  it("é ação comum, sem dano, e limpa efeitos de ilusão", () => {
    expect(ab.actionType).toBe("COMUM");
    expect(ab.baseDamage).toBeUndefined();
    expect(ab.shape).toBe("ALLY");
    expect(ab.cleanses).toEqual(["CONFUSION", "NINJUTSU_BLOCK", "DEFENSE_DOWN"]);
  });
});

describe("Substituição Ilusória: reação de esquiva com logro visual", () => {
  const ab = getAbility("gen_substituicao_ilusoria")!;
  it("é reação de esquiva, marcada como isCloneTrick (Byakugan enxerga através)", () => {
    expect(ab.actionType).toBe("REACAO");
    expect(ab.reactionKind).toBe("DODGE");
    expect(ab.reactionDodgeBonus).toBeCloseTo(0.2);
    expect(ab.isCloneTrick).toBe(true);
    expect(ab.baseDamage).toBeUndefined();
  });
});

describe("Penas Caídas: área que pode Atordoar vários alvos", () => {
  const ab = getAbility("gen_penas_caidas")!;
  it("é RADIUS com range par (raio > 0) e pode Atordoar", () => {
    expect(ab.shape).toBe("RADIUS");
    expect(ab.range % 2).toBe(0);
    expect(ab.effects?.[0]).toMatchObject({ effectId: "STUN" });
  });
});

describe("Domínio do Mundo Obscuro: isola a dupla — bloqueia fuga, indefensável", () => {
  const ab = getAbility("gen_dominio_mundo_obscuro")!;
  it("aplica FLEE_LOCK + DEFENSE_DOWN e não pode ser esquivado/bloqueado/aparado", () => {
    expect(ab.unblockable).toBe(true);
    expect(ab.effects).toEqual([
      { effectId: "FLEE_LOCK", duration: 3 },
      { effectId: "DEFENSE_DOWN", duration: 3 },
    ]);
  });
});

describe("Genjutsu: Interrogatório — só funciona em vítima já capturada", () => {
  const ab = getAbility("gen_interrogatorio")!;
  it("exige ROOT ou STUN no alvo e drena chakra", () => {
    expect(ab.requiresTargetEffect).toEqual(["ROOT", "STUN"]);
    expect(ab.effects?.[0]).toMatchObject({ effectId: "CHAKRA_DRAIN" });
  });
});

describe("Ilusão Demoníaca: Visão do Inferno — ápice, inevitável", () => {
  const ab = getAbility("gen_visao_inferno")!;
  it("é Inevitável (unblockable) e combina Atordoamento com Defesa Reduzida", () => {
    expect(ab.unblockable).toBe(true);
    expect(ab.tier).toBe(3);
    const ids = ab.effects!.map((e) => e.effectId);
    expect(ids).toEqual(["STUN", "DEFENSE_DOWN"]);
  });
});

describe("custos da árvore batem com suggestedJutsuCost (exceto técnicas de suporte condicionais, fora do escopo da fórmula)", () => {
  it.each([
    "gen_raizes_obscuras",
    "gen_penas_caidas",
    "gen_dominio_mundo_obscuro",
    "gen_visao_inferno",
  ] as const)("%s", (id) => {
    const ab = getAbility(id)!;
    const suggested = suggestedJutsuCost({
      actionType: ab.actionType,
      shape: ab.shape,
      baseDamage: ab.baseDamage,
      baseHeal: ab.baseHeal,
      effects: ab.effects,
      unblockable: ab.unblockable,
      undodgeable: ab.undodgeable,
      unguardable: ab.unguardable,
    });
    expect(Math.abs(suggested - ab.cost), `${id}: sugerido ${suggested}, autor colocou ${ab.cost}`).toBeLessThanOrEqual(3);
  });
});

describe("genjutsuDuration: o atributo genjutsu vira duração, não dano (ligado em resolveHit)", () => {
  it("cada 10 pontos de genjutsu soma 1 rodada, até o teto", () => {
    expect(genjutsuDuration(2, 0)).toBe(2);
    expect(genjutsuDuration(2, 10)).toBe(3);
    expect(genjutsuDuration(2, 25)).toBe(4);
  });

  it("respeita o teto (BALANCE.genjutsuDurationCap = 6)", () => {
    expect(genjutsuDuration(2, 1000)).toBe(6);
  });
});
