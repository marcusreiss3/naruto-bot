import { describe, expect, it } from "vitest";
import { getAbility, getClan, getNpc } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { CLAN_PASSIVES } from "../src/data/clan-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";

const IDS = [
  "kamizuru_abelha_gigante",
  "kamizuru_abelha_mel",
  "kamizuru_bomba_abelha",
  "kamizuru_mil_ferroes",
  "kamizuru_colmeia_rocha",
] as const;

describe("Kamizuru: integridade da arvore de cla", () => {
  it("liga as cinco tecnicas aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.clanId === "kamizuru" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem o clã Kamizuru e compra manual (não auto-desbloqueiam por atributo)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ clanId: "kamizuru", manualOnly: true });
    }
  });

  it("todas categoria NINJUTSU (chakra do proprio enxame, mesmo padrao do Aburame)", () => {
    for (const id of IDS) expect(getAbility(id)!.category, id).toBe("NINJUTSU");
  });

  it("as duas passivas (raiz, ápice) têm definição", () => {
    const nodesPassivos = allNodes().filter((n) => n.kind === "PASSIVE" && n.clanId === "kamizuru");
    const semDef = nodesPassivos.filter((n) => !CLAN_PASSIVES.some((p) => p.nodeId === n.id)).map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(nodesPassivos.length).toBe(2);
  });

  it("todos os nós saem do pool de Ninjutsu, sem reqAttribute cruzado", () => {
    for (const n of CLAN_TREES.kamizuru!) {
      expect(n.pool, n.id).toBe("ninjutsu");
      expect(n.reqAttribute, n.id).toBeUndefined();
    }
  });

  it("tronco reto (raiz -> Abelha Gigante) até o fork", () => {
    const gigante = allNodes().find((n) => n.id === "kamizuru_abelha_gigante")!;
    expect(gigante.requires).toEqual(["kamizuru_raiz"]);
    expect(gigante.col).toBe(0);
  });

  it("fork saindo da Abelha Gigante: Enxame (col -1, Mel -> Colmeia) e Ataque (col +1, Bomba -> Mil Ferrões)", () => {
    const mel = allNodes().find((n) => n.id === "kamizuru_abelha_mel")!;
    const bomba = allNodes().find((n) => n.id === "kamizuru_bomba_abelha")!;
    expect(mel.requires).toEqual(["kamizuru_abelha_gigante"]);
    expect(bomba.requires).toEqual(["kamizuru_abelha_gigante"]);
    expect(mel.col).toBe(-1);
    expect(bomba.col).toBe(1);

    const colmeia = allNodes().find((n) => n.id === "kamizuru_colmeia_rocha")!;
    const milFerroes = allNodes().find((n) => n.id === "kamizuru_mil_ferroes")!;
    expect(colmeia.requires).toEqual(["kamizuru_abelha_mel"]);
    expect(milFerroes.requires).toEqual(["kamizuru_bomba_abelha"]);
  });

  it("os dois ramos convergem no ápice, sem finalizador S separado (igual o Aburame)", () => {
    const apice = allNodes().find((n) => n.id === "kamizuru_apice")!;
    expect(new Set(apice.requires)).toEqual(new Set(["kamizuru_colmeia_rocha", "kamizuru_mil_ferroes"]));
    expect(apice.col).toBe(0);
    expect(allNodes().filter((n) => n.requires.includes("kamizuru_apice"))).toEqual([]);
  });

  it("custo total fecha em 24 pontos — clã enxuto (5 técnicas, não 7 como o Aburame)", () => {
    const total = CLAN_TREES.kamizuru!.reduce((a, n) => a + n.cost, 0);
    expect(total).toBe(24);
  });

  it("clã Kamizuru existe e referencia as cinco técnicas em activeIds", () => {
    const clan = getClan("kamizuru");
    expect(clan).toBeTruthy();
    expect(new Set(clan!.activeIds)).toEqual(new Set(IDS));
  });
});

describe("Kamizuru: quase nenhum dano de graça — só a Bomba de Abelha causa dano de verdade", () => {
  it("Abelha do Mel, Mil Ferrões e Colmeia de Rocha têm baseDamage 0 (controle puro)", () => {
    for (const id of ["kamizuru_abelha_mel", "kamizuru_mil_ferroes", "kamizuru_colmeia_rocha"]) {
      expect(getAbility(id)!.baseDamage, id).toBe(0);
    }
  });

  it("Bomba de Abelha é a única com dano real", () => {
    const bomba = getAbility("kamizuru_bomba_abelha")!;
    expect(bomba.baseDamage).toBeGreaterThan(0);
  });
});

describe("Kamizuru: Colmeia de Rocha — imobiliza e drena chakra, deixa terreno", () => {
  const colmeia = getAbility("kamizuru_colmeia_rocha")!;

  it("aplica ROOT e CHAKRA_DRAIN", () => {
    expect(colmeia.effects).toEqual([
      { effectId: "ROOT", duration: 3, chance: 0.85 },
      { effectId: "CHAKRA_DRAIN", duration: 3, chance: 0.85 },
    ]);
  });

  it("deixa terreno de obstáculo (a caverna de rocha)", () => {
    expect(colmeia.terrain).toEqual({ kind: "OBSTACLE", duration: 2 });
  });
});

describe("Kamizuru: Técnica de Invocação: Abelha Gigante", () => {
  const gigante = getAbility("kamizuru_abelha_gigante")!;

  it("é invocação (uma vez por combate) apontando pra um NpcTemplate válido", () => {
    expect(gigante.oncePerCombat).toBe(true);
    expect(gigante.summon?.templateId).toBe("kamizuru_abelha_gigante");
    const tpl = getNpc(gigante.summon!.templateId);
    expect(tpl).toBeTruthy();
    expect(tpl!.hpMax).toBeGreaterThan(0);
    expect(tpl!.abilityIds.length).toBeGreaterThan(0);
  });

  it("os jutsus da abelha gigante existem (ferroada física + cuspe de mel controlador)", () => {
    const tpl = getNpc(gigante.summon!.templateId)!;
    expect(tpl.abilityIds).toEqual(["abelha_gigante_ferroada", "abelha_gigante_mel"]);
    const ferroada = getAbility("abelha_gigante_ferroada")!;
    const mel = getAbility("abelha_gigante_mel")!;
    expect(ferroada.baseDamage).toBeGreaterThan(0);
    expect(mel.baseDamage).toBe(0);
    expect(mel.effects).toEqual([{ effectId: "ROOT", duration: 2, chance: 0.5 }]);
  });
});

describe("Kamizuru: passivas — mesma raiz do Aburame, ápice temático (Imobilizar em vez de Veneno)", () => {
  const mel = getAbility("kamizuru_abelha_mel")!;

  it("Colônia de Iwa corta 10% de custo e soma chance de Dreno de Chakra (igual o Aburame)", () => {
    const m = passiveMods(["kamizuru_raiz"], mel);
    expect(m.costMult).toBeCloseTo(0.9);
    expect(m.effectChanceBonus.CHAKRA_DRAIN).toBeCloseTo(0.15);
    expect(m.damageMult).toBe(1);
  });

  it("Enxame Completo (ápice) soma chance de Imobilizar e estende Veneno", () => {
    const p = CLAN_PASSIVES.find((x) => x.nodeId === "kamizuru_apice")!;
    expect(p.effectChanceBonus?.ROOT).toBeCloseTo(0.15);
    expect(p.effectDurationBonus).toEqual({ effectId: "POISON", bonus: 1 });
    expect(p.damageMult).toBeUndefined();
  });

  it("nenhuma passiva de Kamizuru afeta jutsu de outro clã (nem o próprio Aburame, que inspirou o clã)", () => {
    const clonesInseto = getAbility("aburame_clone_inseto")!;
    expect(passiveMods(["kamizuru_raiz"], clonesInseto).costMult).toBe(1);
    expect(passiveMods(["aburame_raiz"], mel).costMult).toBe(1);
  });
});
