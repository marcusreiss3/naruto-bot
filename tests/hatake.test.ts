import { describe, expect, it } from "vitest";
import { getAbility, getClan, getNpc } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";

const IDS = ["hatake_caes_ninja", "hatake_cerco_matilha", "hatake_lamina"] as const;

describe("Hatake: integridade da arvore de cla", () => {
  it("liga os três jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "hatake" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Hatake tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.hatake!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Hatake e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "hatake", manualOnly: true });
    }
  });

  it("as três passivas (raiz, meio, ápice) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "hatake")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "hatake").length).toBe(3);
  });

  it("clã Hatake existe e referencia as três habilidades em activeIds", () => {
    const clan = getClan("hatake");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Hatake: ramificação Matilha x Lâmina, convergindo no ápice", () => {
  it("Cães Ninja fica no tronco (col 0), logo após a raiz", () => {
    const node = allNodes().find((n) => n.id === "hatake_caes_ninja")!;
    expect(node.col).toBe(0);
    expect(node.requires).toEqual(["hatake_raiz"]);
  });

  it("Cerco da Matilha (col -1) e Lâmina (col +1) partem os dois de Cães Ninja", () => {
    const cerco = allNodes().find((n) => n.id === "hatake_cerco_matilha")!;
    const lamina = allNodes().find((n) => n.id === "hatake_lamina")!;
    expect(cerco.col).toBe(-1);
    expect(lamina.col).toBe(1);
    expect(cerco.requires).toEqual(["hatake_caes_ninja"]);
    expect(lamina.requires).toEqual(["hatake_caes_ninja"]);
  });

  it("Elo com a Matilha continua o ramo -1; o ápice converge os dois ramos", () => {
    const elo = allNodes().find((n) => n.id === "hatake_elo_matilha")!;
    expect(elo.col).toBe(-1);
    expect(elo.requires).toEqual(["hatake_cerco_matilha"]);

    const apice = allNodes().find((n) => n.id === "hatake_apice")!;
    expect(apice.col).toBe(0);
    expect(new Set(apice.requires)).toEqual(new Set(["hatake_elo_matilha", "hatake_lamina"]));
  });

  it("Corte Perfeito (ápice) também pede Kenjutsu — a passiva multiplica dano de espada, faz sentido exigir espada", () => {
    const apice = allNodes().find((n) => n.id === "hatake_apice")!;
    expect(apice.pool).toBe("kenjutsu");
  });
});

describe("Hatake: Técnica de Invocação — matilha de 3 cães (não 1 só)", () => {
  const caes = getAbility("hatake_caes_ninja")!;

  it("invoca 3 cópias do template de uma vez, uma única vez por combate", () => {
    expect(caes.summon?.templateId).toBe("ninken_hatake");
    expect(caes.summon?.count).toBe(3);
    expect(caes.oncePerCombat).toBe(true);
  });

  it("o template do ninken existe, tem vida e um jutsu real", () => {
    const tpl = getNpc("ninken_hatake")!;
    expect(tpl).toBeTruthy();
    expect(tpl.hpMax).toBeGreaterThan(0);
    expect(tpl.abilityIds.length).toBeGreaterThan(0);
    for (const id of tpl.abilityIds) expect(getAbility(id), id).toBeTruthy();
  });

  it("cada ninken individual é mais fraco que o Cão Ninja sozinho do Inuzuka (vários corpos, não um só)", () => {
    const ninken = getNpc("ninken_hatake")!;
    const caoInuzuka = getNpc("cao_ninja")!;
    expect(ninken.hpMax).toBeLessThan(caoInuzuka.hpMax);
  });
});

describe("Hatake: Cerco da Matilha — precisa de cão vivo, imobiliza e atordoa", () => {
  const cerco = getAbility("hatake_cerco_matilha")!;

  it("requiresPet true — não funciona sem a matilha em campo", () => {
    expect(cerco.requiresPet).toBe(true);
  });

  it("aplica ROOT e STUN", () => {
    const ids = cerco.effects!.map((e) => e.effectId);
    expect(new Set(ids)).toEqual(new Set(["ROOT", "STUN"]));
  });
});

describe("Hatake: Lâmina da Luz Branca — Kenjutsu de verdade, não precisa da matilha", () => {
  const lamina = getAbility("hatake_lamina")!;

  it("categoria KENJUTSU (espada empunhada, não arremesso), escalando por kenjutsu", () => {
    expect(lamina.category).toBe("KENJUTSU");
    expect(lamina.scalingAttribute).toBe("kenjutsu");
  });

  it("não pode ser esquivada e não depende do cão", () => {
    expect(lamina.undodgeable).toBe(true);
    expect(lamina.requiresPet).toBeUndefined();
  });

  it("o nó de árvore é pago com Kenjutsu (pool), sem gate cruzado duplicado", () => {
    const node = allNodes().find((n) => n.id === "hatake_lamina")!;
    expect(node.pool).toBe("kenjutsu");
    expect(node.reqPool).toBe(11);
    expect(node.reqAttribute).toBeUndefined();
  });
});

describe("Hatake: passivas — vínculo com a matilha + domínio da Lâmina", () => {
  const lamina = getAbility("hatake_lamina")!;
  const caes = getAbility("hatake_caes_ninja")!;

  it("Vínculo com a Matilha corta 10% do custo e soma 25% de vida na invocação", () => {
    const m = passiveMods(["hatake_raiz"], caes);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(m.summonHpBonus).toBeCloseTo(0.25);
  });

  it("Elo com a Matilha soma chance de ROOT e STUN", () => {
    const m = passiveMods(["hatake_elo_matilha"], caes);
    expect(m.effectChanceBonus.ROOT).toBeCloseTo(0.15);
    expect(m.effectChanceBonus.STUN).toBeCloseTo(0.15);
  });

  it("Corte Perfeito só multiplica dano de jutsu que escala por Kenjutsu — pedido explícito do usuário", () => {
    const mLamina = passiveMods(["hatake_apice"], lamina);
    expect(mLamina.damageMult).toBeCloseTo(1.15);
    expect(mLamina.executeBonus).toEqual({ hpThreshold: 0.3, mult: 1.25 });

    // Cães Ninja não escala por kenjutsu (é SELF/summon) — não deve ganhar o bônus
    const mCaes = passiveMods(["hatake_apice"], caes);
    expect(mCaes.damageMult).toBe(1);
  });

  it("passiva de Hatake não afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["hatake_raiz"], possessao).costMult).toBe(1);
    expect(passiveMods(["nara_raiz"], caes).costMult).toBe(1);
    expect(passiveMods(["hatake_raiz"], bola).costMult).toBe(1);
  });
});
