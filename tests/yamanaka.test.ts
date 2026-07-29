import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { canYamanakaInvade, yamanakaResistChance, resolveActingParticipantId } from "../src/services/combat/combat-math.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods, characterPassiveMods } from "../src/services/combat/passives.js";
import { buildMechanicsSummary } from "../src/services/characters/skill-description.js";

const TREE_ABILITY_IDS = [
  "yamanaka_destruicao_mente",
  "yamanaka_shintenshin",
  "yamanaka_transmissao_mentes",
  "yamanaka_clones_shintenshin",
] as const;

describe("Yamanaka: Técnica de Transferência de Mente — dados da habilidade", () => {
  const ab = getAbility("yamanaka_shintenshin")!;

  it("existe, categoria NINJUTSU (natureza real: chakra, não 'CLA' genérico), dano 0 de propósito (captura, não machuca)", () => {
    expect(ab).toBeTruthy();
    expect(ab.category).toBe("NINJUTSU");
    expect(ab.baseDamage).toBe(0);
  });

  it("custo alto (MUITO chakra) — pelo menos 35%", () => {
    expect(ab.cost).toBeGreaterThanOrEqual(35);
  });

  it("unguardable (bloqueio/aparo não adiantam) e mindTransfer, mas NÃO undodgeable/unblockable — esquiva continua valendo", () => {
    expect(ab.unguardable).toBe(true);
    expect(ab.mindTransfer).toBe(true);
    expect(ab.unblockable).toBeFalsy();
    expect(ab.undodgeable).toBeFalsy();
  });

  it("exige o clã Yamanaka e Ninjutsu mínimo", () => {
    expect(ab.requirements).toMatchObject({ clanId: "yamanaka", attributes: { ninjutsu: 10 } });
    expect(ab.scalingAttribute).toBe("ninjutsu");
  });

  it("clã Yamanaka referencia a habilidade em activeIds", () => {
    const clan = getClan("yamanaka");
    expect(clan).toBeTruthy();
    expect(clan!.activeIds).toContain("yamanaka_shintenshin");
  });
});

describe("Yamanaka: Técnica de Destruição de Mente — dados da habilidade", () => {
  const ab = getAbility("yamanaka_destruicao_mente")!;

  it("existe, categoria NINJUTSU, dano 0 de propósito (só efeito, não machuca)", () => {
    expect(ab).toBeTruthy();
    expect(ab.category).toBe("NINJUTSU");
    expect(ab.baseDamage).toBe(0);
  });

  it("NÃO tem unguardable/undodgeable — dá pra esquivar normalmente (diferente da Transferência de Mente)", () => {
    expect(ab.unguardable).toBeFalsy();
    expect(ab.undodgeable).toBeFalsy();
    expect(ab.unblockable).toBeFalsy();
  });

  it("aplica CONFUSION (mira alvo aleatório, aliado ou inimigo) por 1 turno", () => {
    expect(ab.effects).toEqual([{ effectId: "CONFUSION", duration: 1 }]);
  });

  it("exige o clã Yamanaka", () => {
    expect(ab.requirements).toMatchObject({ clanId: "yamanaka" });
  });

  it("clã Yamanaka referencia a habilidade em activeIds", () => {
    const clan = getClan("yamanaka");
    expect(clan!.activeIds).toContain("yamanaka_destruicao_mente");
  });
});

describe("Yamanaka: Técnica de Transmissão de Mentes — dados da habilidade", () => {
  const ab = getAbility("yamanaka_transmissao_mentes")!;

  it("existe, categoria NINJUTSU, shape SELF (buff)", () => {
    expect(ab).toBeTruthy();
    expect(ab.category).toBe("NINJUTSU");
    expect(ab.shape).toBe("SELF");
  });

  it("teamBuff com teto de 3 (contando o usuário), aplicando Aceleração (HASTE)", () => {
    expect(ab.teamBuff).toBe(true);
    expect(ab.teamBuffMax).toBe(3);
    expect(ab.effects).toEqual([{ effectId: "HASTE", duration: 3 }]);
  });

  it("exige o clã Yamanaka", () => {
    expect(ab.requirements).toMatchObject({ clanId: "yamanaka" });
  });

  it("clã Yamanaka referencia a habilidade em activeIds", () => {
    const clan = getClan("yamanaka");
    expect(clan!.activeIds).toContain("yamanaka_transmissao_mentes");
  });
});

describe("Yamanaka: Técnicas dos Clones de Transferência de Mente — dados da habilidade", () => {
  const ab = getAbility("yamanaka_clones_shintenshin")!;

  it("existe, categoria NINJUTSU, dano 0 de propósito (captura, não machuca)", () => {
    expect(ab).toBeTruthy();
    expect(ab.category).toBe("NINJUTSU");
    expect(ab.baseDamage).toBe(0);
  });

  it("é Inevitável — nenhuma reação impede (diferente da Transferência de Mente, que só ignora Bloqueio e Aparo)", () => {
    expect(ab.unblockable).toBe(true);
    expect(ab.oncePerCombat).toBe(true);
    expect(ab.unguardable).toBeFalsy();
    expect(ab.undodgeable).toBeFalsy();
    expect(ab.mindTransfer).toBe(true);
  });

  it("controla até 3 corpos ao mesmo tempo, e cada um dura só 1 turno (sem disputa)", () => {
    expect(ab.mindTransferMax).toBe(3);
    expect(ab.mindTransferTurns).toBe(1);
  });

  it("é mais cara e exige mais Ninjutsu que a Técnica de Transferência de Mente clássica", () => {
    const transferencia = getAbility("yamanaka_shintenshin")!;
    expect(ab.cost).toBeGreaterThan(transferencia.cost);
    expect(ab.requirements?.attributes?.ninjutsu ?? 0).toBeGreaterThan(
      transferencia.requirements?.attributes?.ninjutsu ?? 0,
    );
  });

  it("clã Yamanaka referencia a habilidade em activeIds", () => {
    const clan = getClan("yamanaka");
    expect(clan!.activeIds).toContain("yamanaka_clones_shintenshin");
  });
});

describe("yamanakaResistChance (fórmula pura da disputa por recuperação)", () => {
  it("50% quando o Ninjutsu dos dois é igual", () => {
    expect(yamanakaResistChance(10, 10)).toBeCloseTo(0.5);
  });

  it("cada ponto de Ninjutsu da vítima acima do controlador soma 3 pontos percentuais", () => {
    expect(yamanakaResistChance(15, 10)).toBeCloseTo(0.65);
  });

  it("cada ponto de Ninjutsu do controlador acima da vítima subtrai 3 pontos percentuais", () => {
    expect(yamanakaResistChance(10, 15)).toBeCloseTo(0.35);
  });

  it("nunca sai da faixa [10%, 90%], mesmo com diferença enorme", () => {
    expect(yamanakaResistChance(100, 0)).toBe(0.9);
    expect(yamanakaResistChance(0, 100)).toBe(0.1);
  });
});

describe("limite de nível da invasão mental Yamanaka", () => {
  it("impede somente alvos 10 ou mais níveis acima", () => {
    expect(canYamanakaInvade(10, 19)).toBe(true);
    expect(canYamanakaInvade(10, 20)).toBe(false);
  });

  it("não impede controlar alvos do mesmo nível ou mais fracos", () => {
    expect(canYamanakaInvade(20, 20)).toBe(true);
    expect(canYamanakaInvade(20, 1)).toBe(true);
  });
});

describe("resolveActingParticipantId (resolução de por qual corpo o jogador age)", () => {
  const alive = (id: string) => ({ id, hpCurrent: 10 });
  const dead = (id: string) => ({ id, hpCurrent: 0 });

  it("age pelo próprio corpo por padrão (sem controle nenhum envolvido)", () => {
    const own = { id: "a", controlledById: null, flags: {} };
    expect(resolveActingParticipantId(own, [alive("a")])).toBe("a");
  });

  it("age pelo corpo controlado quando flags.controllingIds aponta pra alguém vivo", () => {
    const own = { id: "a", controlledById: null, flags: { controllingIds: ["b"] } };
    expect(resolveActingParticipantId(own, [alive("a"), alive("b")])).toBe("b");
  });

  it("não pode agir (null) se o PRÓPRIO corpo estiver sob controle mental de outro", () => {
    const own = { id: "a", controlledById: "x", flags: {} };
    expect(resolveActingParticipantId(own, [alive("a")])).toBeNull();
  });

  it("cai de volta pro próprio corpo se o corpo controlado já morreu", () => {
    const own = { id: "a", controlledById: null, flags: { controllingIds: ["b"] } };
    expect(resolveActingParticipantId(own, [alive("a"), dead("b")])).toBe("a");
  });

  it("Clones de Transferência de Mente: controla vários corpos — sem activeId cai no 1o vivo", () => {
    const own = { id: "a", controlledById: null, flags: { controllingIds: ["b", "c", "d"] } };
    expect(resolveActingParticipantId(own, [alive("a"), alive("b"), alive("c"), alive("d")])).toBe("b");
  });

  it("com activeId, age por QUALQUER um dos corpos controlados cuja vez chegou", () => {
    const own = { id: "a", controlledById: null, flags: { controllingIds: ["b", "c", "d"] } };
    const all = [alive("a"), alive("b"), alive("c"), alive("d")];
    expect(resolveActingParticipantId(own, all, "c")).toBe("c");
    expect(resolveActingParticipantId(own, all, "d")).toBe("d");
  });

  it("com activeId igual ao próprio corpo, age pelo próprio (mesmo controlando outros)", () => {
    const own = { id: "a", controlledById: null, flags: { controllingIds: ["b"] } };
    expect(resolveActingParticipantId(own, [alive("a"), alive("b")], "a")).toBe("a");
  });

  it("com activeId que não é nem o próprio nem nenhum controlado, cai no fallback (não é a vez de ninguém seu)", () => {
    const own = { id: "a", controlledById: null, flags: { controllingIds: ["b"] } };
    expect(resolveActingParticipantId(own, [alive("a"), alive("b"), alive("x")], "x")).toBe("b");
  });
});

describe("Yamanaka: integridade da arvore de cla", () => {
  it("liga os quatro jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "yamanaka" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(TREE_ABILITY_IDS));
  });

  it("todos exigem o clã Yamanaka e compra manual (não auto-desbloqueiam por atributo)", () => {
    for (const id of TREE_ABILITY_IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "yamanaka", manualOnly: true });
    }
  });

  it("as quatro passivas (raiz, domínio mental, elo telepático, ápice) têm definição", () => {
    const nodesPassivos = allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "yamanaka");
    const semDef = nodesPassivos.filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id)).map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(nodesPassivos.length).toBe(4);
  });

  it("todos os nós saem do pool de Ninjutsu, sem reqAttribute cruzado", () => {
    for (const n of CLAN_TREES.yamanaka!) {
      expect(n.pool, n.id).toBe("ninjutsu");
      expect(n.reqAttribute, n.id).toBeUndefined();
    }
  });

  it("fork saindo de Destruição de Mente: Controle (col -1) e Rede (col +1), convergindo no ápice", () => {
    const shintenshin = allNodes().find((n) => n.id === "yamanaka_shintenshin")!;
    const transmissao = allNodes().find((n) => n.id === "yamanaka_transmissao_mentes")!;
    expect(shintenshin.requires).toEqual(["yamanaka_destruicao_mente"]);
    expect(transmissao.requires).toEqual(["yamanaka_destruicao_mente"]);
    expect(shintenshin.col).toBe(-1);
    expect(transmissao.col).toBe(1);

    const dominioMental = allNodes().find((n) => n.id === "yamanaka_dominio_mental")!;
    const eloTelepatico = allNodes().find((n) => n.id === "yamanaka_elo_telepatico")!;
    expect(dominioMental.requires).toEqual(["yamanaka_shintenshin"]);
    expect(eloTelepatico.requires).toEqual(["yamanaka_transmissao_mentes"]);

    const apice = allNodes().find((n) => n.id === "yamanaka_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["yamanaka_dominio_mental", "yamanaka_elo_telepatico"]));
    expect(apice.col).toBe(0);

    const clones = allNodes().find((n) => n.id === "yamanaka_clones_shintenshin")!;
    expect(clones.requires).toEqual(["yamanaka_apice"]);
  });

  it("custo total fecha em 27 pontos — clã sem dano de graça, perto do Hozuki (27)", () => {
    const total = CLAN_TREES.yamanaka!.reduce((a, n) => a + n.cost, 0);
    expect(total).toBe(27);
  });

  it("clã Yamanaka existe e referencia os quatro jutsus da árvore em activeIds", () => {
    const clan = getClan("yamanaka");
    expect(clan).toBeTruthy();
    for (const id of TREE_ABILITY_IDS) expect(clan!.activeIds).toContain(id);
  });
});

describe("Yamanaka: passivas — nenhum damageMult (clã de controle puro, não dano)", () => {
  it("Sintonia Mental (raiz) corta 10% de custo e estende Confusão em 1 rodada", () => {
    const destruicaoMente = getAbility("yamanaka_destruicao_mente")!;
    const m = passiveMods(["yamanaka_raiz"], destruicaoMente);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(m.damageMult).toBe(1);
    expect(m.effectDurationBonus.CONFUSION).toBe(1);
  });

  it("nenhuma passiva de Yamanaka tem damageMult definido", () => {
    for (const p of CLAN_PASSIVES.filter((x) => x.clanId === "yamanaka")) {
      expect(p.damageMult, p.nodeId).toBeUndefined();
    }
  });

  it("Domínio Mental reduz o upkeep do controle mental (mod de personagem, não por-jutsu)", () => {
    expect(characterPassiveMods(["yamanaka_dominio_mental"]).mindControlUpkeepMult).toBeCloseTo(0.8);
    expect(characterPassiveMods([]).mindControlUpkeepMult).toBe(1);
  });

  it("Elo Telepático estende a Aceleração da Transmissão de Mentes em 1 rodada", () => {
    const transmissao = getAbility("yamanaka_transmissao_mentes")!;
    expect(passiveMods(["yamanaka_elo_telepatico"], transmissao).effectDurationBonus.HASTE).toBe(1);
  });

  it("Domínio da Mente (ápice) soma +6 de Ninjutsu efetivo na disputa e +1 corpo simultâneo nos Clones", () => {
    expect(characterPassiveMods(["yamanaka_apice"]).mindControlNinjutsuBonus).toBe(6);
    const clones = getAbility("yamanaka_clones_shintenshin")!;
    expect(passiveMods(["yamanaka_apice"], clones).mindTransferMaxBonus).toBe(1);
  });

  it("Efeitos e regras explica manutenção, teste de Ninjutsu e limite de nível", () => {
    const rules = buildMechanicsSummary(getAbility("yamanaka_shintenshin")!);
    expect(rules).toContain("10% de chakra por rodada");
    expect(rules).toContain("3 pontos percentuais");
    expect(rules).toContain("entre 10% e 90%");
    expect(rules).toContain("10 ou mais níveis acima");
  });

  it("nenhuma passiva de Yamanaka afeta jutsu de outro clã", () => {
    const possessao = getAbility("nara_possessao")!;
    expect(passiveMods(["yamanaka_raiz"], possessao).costMult).toBe(1);
  });
});
