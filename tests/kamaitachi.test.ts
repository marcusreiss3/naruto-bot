import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";

const IDS = [
  "kamaitachi_foice",
  "kamaitachi_grande_foice",
  "kamaitachi_rede",
  "kamaitachi_decapitacao",
] as const;

describe("Kamaitachi: integridade da arvore de cla", () => {
  it("liga os quatro jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "kamaitachi" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("nenhum nó de Kamaitachi tem `element` (gate é clanId, não elemento)", () => {
    for (const n of CLAN_TREES.kamaitachi!) expect(n.element).toBeUndefined();
  });

  it("todos exigem o clã Kamaitachi e compra manual (não auto-desbloqueiam fora da árvore)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "kamaitachi", manualOnly: true });
    }
  });

  it("todos os quatro são categoria NINJUTSU", () => {
    for (const id of IDS) expect(getAbility(id)!.category, id).toBe("NINJUTSU");
  });

  it("as quatro passivas (raiz, corte profundo, lâmina viva, ápice) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.clanId === "kamaitachi")
      .filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "kamaitachi").length).toBe(4);
  });

  it("árvore é reta (col 0), sem ramificação — só 4 técnicas foram pedidas", () => {
    const order = [
      "kamaitachi_raiz",
      "kamaitachi_foice",
      "kamaitachi_grande_foice",
      "kamaitachi_corte_profundo",
      "kamaitachi_rede",
      "kamaitachi_lamina_viva",
      "kamaitachi_apice",
      "kamaitachi_decapitacao",
    ];
    for (let i = 1; i < order.length; i++) {
      const node = allNodes().find((n) => n.id === order[i])!;
      expect(node.requires, order[i]).toEqual([order[i - 1]]);
      expect(node.col, order[i]).toBe(0);
    }
  });

  it("todos os nós saem do pool de Ninjutsu, sem reqAttribute cruzado", () => {
    for (const n of CLAN_TREES.kamaitachi!) {
      expect(n.pool, n.id).toBe("ninjutsu");
      expect(n.reqAttribute, n.id).toBeUndefined();
    }
  });

  it("custo total fecha em 30 pontos — entre o Chinoike (29) e o Hoshigaki/Yuki (34)", () => {
    const total = CLAN_TREES.kamaitachi!.reduce((a, n) => a + n.cost, 0);
    expect(total).toBe(30);
  });

  it("clã Kamaitachi existe e referencia as quatro habilidades em activeIds", () => {
    const clan = getClan("kamaitachi");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Kamaitachi: Dança da Decapitação Rápida — finalizador que ignora bloqueio, aparo e esquiva", () => {
  const decap = getAbility("kamaitachi_decapitacao")!;

  it("é unblockable (ignora BLOCK, PARRY e DODGE) e o jutsu de maior dano do clã", () => {
    expect(decap.unblockable).toBe(true);
    for (const id of IDS.filter((i) => i !== "kamaitachi_decapitacao")) {
      expect(decap.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });

  it("exige só o tronco principal (o ápice)", () => {
    const node = allNodes().find((n) => n.id === "kamaitachi_decapitacao")!;
    expect(node.requires).toEqual(["kamaitachi_apice"]);
  });
});

describe("Kamaitachi: Lançamento da Rede — indefensável (esquiva), não unblockable", () => {
  const rede = getAbility("kamaitachi_rede")!;

  it("é undodgeable mas não unblockable — diferença real dos dois finalizadores", () => {
    expect(rede.undodgeable).toBe(true);
    expect(rede.unblockable).toBeUndefined();
  });
});

describe("Kamaitachi: passivas — dano de graça na raiz, ápice de controle (sem multiplicador extra)", () => {
  const grandeFoice = getAbility("kamaitachi_grande_foice")!;

  it("Fio do Leque dá +15% de dano e corta 10% de custo", () => {
    const m = passiveMods(["kamaitachi_raiz"], grandeFoice);
    expect(m.damageMult).toBeCloseTo(1.15);
    expect(m.costMult).toBeCloseTo(0.9);
  });

  it("Corte Profundo estende a duração do Sangramento", () => {
    expect(passiveMods(["kamaitachi_corte_profundo"], grandeFoice).effectDurationBonus.BLEED).toBe(1);
  });

  it("Lâmina Viva perfura 20% da redução de bloqueio/aparo", () => {
    expect(passiveMods(["kamaitachi_lamina_viva"], grandeFoice).armorPierce).toBeCloseTo(0.2);
  });

  it("Domínio da Foice (ápice) é só controle — sem damageMult", () => {
    const p = CLAN_PASSIVES.find((x) => x.nodeId === "kamaitachi_apice")!;
    expect(p.damageMult).toBeUndefined();
    expect(p.effectChanceBonus?.BLEED).toBeCloseTo(0.1);
    expect(p.rangeBonus).toBe(1);
    expect(p.rangeShapes).toEqual(["LINE"]);
  });

  it("Domínio da Foice só dá alcance em jutsu de linha reta", () => {
    const decap = getAbility("kamaitachi_decapitacao")!; // LINE
    expect(passiveMods(["kamaitachi_apice"], decap).rangeBonus).toBe(1);
    expect(passiveMods(["kamaitachi_apice"], grandeFoice).rangeBonus).toBe(0); // RADIUS, fora de rangeShapes
  });

  it("nenhuma passiva de Kamaitachi afeta jutsu de outro clã, nem jutsu elemental", () => {
    const possessao = getAbility("nara_possessao")!;
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["kamaitachi_raiz"], possessao).damageMult).toBe(1);
    expect(passiveMods(["nara_raiz"], grandeFoice).damageMult).toBe(1);
    expect(passiveMods(["kamaitachi_raiz"], bola).damageMult).toBe(1);
  });
});

describe("Kamaitachi: é Fuuton de verdade — a passiva de Vento empilha com a do próprio clã", () => {
  const grandeFoice = getAbility("kamaitachi_grande_foice")!;

  it("todos os quatro têm element: VENTO, além de requirements.clanId", () => {
    for (const id of IDS) expect(getAbility(id)!.element, id).toBe("VENTO");
  });

  it("as duas passivas empilham quando o personagem tem as duas árvores (Vento + Kamaitachi)", () => {
    const m = passiveMods(["vento_raiz", "kamaitachi_raiz"], grandeFoice);
    expect(m.damageMult).toBeCloseTo(1.3 * 1.15);
    expect(m.armorPierce).toBeCloseTo(0.2); // vento_raiz já dá 0.2; kamaitachi_lamina_viva não comprada aqui
  });
});
