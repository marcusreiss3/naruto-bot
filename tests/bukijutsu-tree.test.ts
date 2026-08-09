import { describe, expect, it } from "vitest";
import { BUKIJUTSU_TREE } from "../src/data/bukijutsu-tree.js";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { buildMechanicsSummary } from "../src/services/characters/skill-description.js";

describe("árvore de Bukijutsu", () => {
  it("entra no índice global e concede todas as oito técnicas ativas", () => {
    const indexed = new Set(allNodes().map((node) => node.id));
    for (const node of BUKIJUTSU_TREE) expect(indexed.has(node.id)).toBe(true);
    expect(BUKIJUTSU_TREE.filter((node) => node.kind === "JUTSU")).toHaveLength(8);
    for (const node of BUKIJUTSU_TREE.filter((entry) => entry.kind === "JUTSU")) {
      expect(getAbility(node.grantsAbilityId!)).toBeDefined();
    }
  });

  it("usa Energia nas barragens físicas e Chakra nas técnicas de chakra explícito", () => {
    expect(getAbility("buki_moinho")?.resource).toBe("energia");
    expect(getAbility("buki_dragoes_gemeos")?.resource).toBe("energia");
    expect(getAbility("buki_esfera_explosiva")?.resource).toBe("energia");
    expect(getAbility("buki_meteoro_anexado")?.resource).toBe("energia");
    expect(getAbility("buki_cadeia_desastre")?.resource).toBe("energia");
    expect(getAbility("buki_voo_andorinha")?.resource).toBe("chakra");
    expect(getAbility("buki_camara_tortura")?.resource).toBe("chakra");
  });

  it("mantém a Lâmina de Chakra e o Voo da Andorinha no patamar reforçado", () => {
    const basic = getAbility("item_lamina_chakra_cortar")!;
    expect(basic.baseDamage).toBe(16);
    expect(basic.cost).toBe(15);
    expect(getAbility("buki_voo_andorinha")?.baseDamage).toBe(26);
  });

  it("explica a progressão da Afinidade na Lâmina por elemento", () => {
    const affinity = BUKIJUTSU_TREE.find((node) => node.id === "buki_afinidade_lamina")!;
    expect(affinity.desc).toContain("10% o dano");
    expect(affinity.desc).toContain("10% o custo original");
    expect(affinity.desc).toContain("natureza básica");
    expect(affinity.desc).not.toContain("Energia ou Chakra");
  });

  it("usa os ícones próprios em todos os nós", () => {
    for (const node of BUKIJUTSU_TREE) {
      expect(node.img, node.id).toMatch(/^\/assets\/icons\/bukijutsu\/.+\.png$/);
    }
  });

  it("mantém Fios e Arsenal como progressões independentes", () => {
    const byId = new Map(BUKIJUTSU_TREE.map((node) => [node.id, node]));
    expect(byId.get("buki_dragoes_gemeos")?.requires).toEqual(["buki_arsenal_selado"]);
    expect(byId.get("buki_meteoro_anexado")?.requires).toEqual(["buki_moinho"]);
    expect(byId.get("buki_camara_tortura")?.requires).toEqual(["buki_meteoro_anexado"]);
    expect(byId.get("buki_cadeia_desastre")?.requires).toEqual(["buki_esfera_explosiva"]);
  });

  it("coloca Maestria de Arremesso e Clone depois da Esfera Explosiva", () => {
    const byId = new Map(BUKIJUTSU_TREE.map((node) => [node.id, node]));
    expect(byId.get("buki_maestria_arremesso")?.requires).toEqual(["buki_esfera_explosiva"]);
    expect(byId.get("buki_clone_shuriken")?.requires).toEqual(["buki_maestria_arremesso"]);
  });

  it("Clone da Sombra de Shuriken só pode ser USADO com Clones das Sombras já conhecido", () => {
    expect(getAbility("buki_clone_shuriken")?.requirements?.requiresAbilityId).toBe("kage_bunshin");
  });

  it("mantém o dano-base abaixo do teto dos Ninjutsus elementais", () => {
    const bukiDamage = BUKIJUTSU_TREE
      .flatMap((node) => node.grantsAbilityId ? [getAbility(node.grantsAbilityId)?.baseDamage ?? 0] : []);
    expect(Math.max(...bukiDamage)).toBe(38);
  });

  it("possui ramificações e exige a convergência delas no ápice", () => {
    expect(new Set(BUKIJUTSU_TREE.map((node) => node.branch)).size).toBeGreaterThan(3);
    const apex = BUKIJUTSU_TREE.find((node) => node.id === "buki_cadeia_desastre")!;
    expect(apex.requires).toEqual(["buki_esfera_explosiva"]);
    expect(apex.cost).toBe(8);
    expect(apex.reqLevel).toBe(24);
  });

  it("expõe equipamentos e consumo no bloco Efeitos e regras", () => {
    const dragons = getAbility("buki_dragoes_gemeos")!;
    const text = buildMechanicsSummary(dragons);
    expect(text).toMatch(/Gasta 1x Pergaminho de Arsenal/);
    // técnica de pergaminho: consumo alto de propósito (o pergaminho existe
    // pra despejar muita ferramenta de uma vez).
    expect(text).toMatch(/Consome 10x Kunai e 10x Shuriken/);

    const swallow = getAbility("buki_voo_andorinha")!;
    expect(buildMechanicsSummary(swallow)).toMatch(/Lâmina de Chakra equipada/);
  });
});
