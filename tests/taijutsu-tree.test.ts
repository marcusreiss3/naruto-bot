import { describe, expect, it } from "vitest";
import { TAIJUTSU_TREE } from "../src/data/taijutsu-tree.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";

const IDS = [
  "tai_furacao_folha",
  "tai_entrada_dinamica",
  "tai_vendaval_folha",
  "tai_acao_dinamica",
  "tai_grande_furacao_folha",
  "tai_metodo_intersecao",
  "tai_vento_ascendente_folha",
  "tai_sombra_folha_dancante",
  "tai_luz_rotatoria_folha",
  "tai_portao_abertura",
  "tai_rajada_leoes",
  "tai_lotus_frontal",
  "tai_portao_descanso",
  "tai_portao_vida",
  "tai_lotus_oculta",
  "tai_portao_dor",
  "tai_portao_fechamento",
  "tai_portao_alegria",
  "tai_pavao_amanhecer",
  "tai_portao_tristeza",
  "tai_tigre_diurno",
  "tai_portao_morte",
  "tai_elefante_anoitecer",
  "tai_guy_noturno",
] as const;

describe("árvore de Taijutsu", () => {
  it("é indexada e só contém jutsus ativos", () => {
    const indexed = new Set(allNodes().map((node) => node.id));
    expect(TAIJUTSU_TREE).toHaveLength(24);
    for (const node of TAIJUTSU_TREE) {
      expect(indexed.has(node.id)).toBe(true);
      expect(node.kind).toBe("JUTSU");
      expect(node.pool).toBe("taijutsu");
      expect(node.grantsAbilityId).toBe(node.id);
    }
    expect(TAIJUTSU_TREE.every((node) => node.kind !== "PASSIVE")).toBe(true);
  });

  it("concede todas as técnicas ativas com ranks definidos", () => {
    expect(TAIJUTSU_TREE.map((node) => node.id)).toEqual(IDS);
    expect(TAIJUTSU_TREE.map((node) => node.rank)).toEqual(["D", "D", "D", "D", "C", "C", "C", "C", "B", "B", "C", "B", "B", "A", "A", "A", "A", "A", "S", "S", "S", "S", "S", "S"]);
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.category).toBe("TAIJUTSU");
      expect(ability!.resource).toBe("energia");
    }
  });

  it("mantém as duas progressões de Punho Forte", () => {
    expect(TAIJUTSU_TREE[0]!.requires).toEqual([]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_entrada_dinamica")!.requires).toEqual(["tai_furacao_folha"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_acao_dinamica")!.requires).toEqual(["tai_entrada_dinamica"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_vento_ascendente_folha")!.requires).toEqual(["tai_acao_dinamica"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_luz_rotatoria_folha")!.requires).toEqual(["tai_vento_ascendente_folha"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_vendaval_folha")!.requires).toEqual(["tai_furacao_folha"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_abertura")!.requires).toEqual(["tai_sombra_folha_dancante"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_descanso")!.requires).toEqual(["tai_portao_abertura"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_vida")!.requires).toEqual(["tai_portao_descanso"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_lotus_oculta")!.requires).toEqual(["tai_portao_vida"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_dor")!.requires).toEqual(["tai_portao_vida", "tai_lotus_oculta"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_fechamento")!.requires).toEqual(["tai_portao_dor"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_alegria")!.requires).toEqual(["tai_portao_fechamento"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_pavao_amanhecer")!.requires).toEqual(["tai_portao_alegria"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_tristeza")!.requires).toEqual(["tai_portao_alegria"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_tigre_diurno")!.requires).toEqual(["tai_portao_tristeza"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_portao_morte")!.requires).toEqual(["tai_portao_tristeza"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_elefante_anoitecer")!.requires).toEqual(["tai_portao_morte"]);
    expect(TAIJUTSU_TREE.find((node) => node.id === "tai_guy_noturno")!.requires).toEqual(["tai_portao_morte"]);
  });

  it("Sombra da Folha Dançante consome ação bônus e movimento", () => {
    const ability = getAbility("tai_sombra_folha_dancante")!;
    expect(ability.actionType).toBe("BONUS");
    expect(ability.additionalActionType).toBe("MOVIMENTO");
  });

  it("Portão da Abertura é o toggle que sustenta a progressão da Lótus", () => {
    const gate = getAbility("tai_portao_abertura")!;
    const lotus = getAbility("tai_lotus_frontal")!;
    expect(gate.gateRules).toMatchObject({ gate: 1, taijutsuDamageMult: 1.45, selfDamagePerTurn: 5 });
    expect(lotus.requirements?.requiresAbilityId).toBe("tai_portao_abertura");
    expect(lotus.oncePerCombat).toBe(true);
  });

  it("Vento Ascendente usa o efeito de desarme já existente", () => {
    const ability = getAbility("tai_vento_ascendente_folha")!;
    expect(ability.effects).toContainEqual({ effectId: "DISARM", duration: 1 });
  });

  it("Método de Interseção é uma reação com contra-ataque", () => {
    const ability = getAbility("tai_metodo_intersecao")!;
    expect(ability.actionType).toBe("REACAO");
    expect(ability.reactionKind).toBe("PARRY");
    expect(ability.counterDamage).toEqual({ baseDamage: 12, scalingAttribute: "taijutsu" });
  });

  it("Lótus Oculta exige o terceiro Portão ativo", () => {
    const ability = getAbility("tai_lotus_oculta")!;
    expect(ability.requiresActiveGate).toBe(3);
    expect(ability.oncePerCombat).toBe(true);
  });

  it("Pavão e Tigre exigem os portões correspondentes e são uso único", () => {
    const pavao = getAbility("tai_pavao_amanhecer")!;
    const tigre = getAbility("tai_tigre_diurno")!;
    expect(pavao.requiresActiveGate).toBe(6);
    expect(pavao.oncePerCombat).toBe(true);
    expect(tigre.requiresActiveGate).toBe(7);
    expect(tigre.oncePerCombat).toBe(true);
  });

  it("Elefante e Guy Noturno exigem o oitavo Portão", () => {
    const elefante = getAbility("tai_elefante_anoitecer")!;
    const guy = getAbility("tai_guy_noturno")!;
    expect(elefante.requiresActiveGate).toBe(8);
    expect(elefante.oncePerCombat).toBe(true);
    expect(guy.requiresActiveGate).toBe(8);
    expect(guy.unblockable).toBe(true);
    expect(guy.oncePerCombat).toBe(true);
  });
});
