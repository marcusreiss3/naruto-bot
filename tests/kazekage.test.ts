import { describe, expect, it } from "vitest";
import { getAbility, getClan } from "../src/data/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { getNode } from "../src/data/element-trees/index.js";
import { passiveMods } from "../src/services/combat/passives.js";
import {
  KAZEKAGE_SAND_VARIANTS,
  kazekageSandVariantFromNodeId,
  kazekageSandVariantNodeId,
  rollKazekageSandVariant,
} from "../src/services/characters/kazekage-sand.js";
import { viewClanTree, type CharSnapshot } from "../src/services/characters/skill-tree.js";

const IDS = [
  "kazekage_chuva_areia", "kazekage_mao_areia", "kazekage_escudo_areia", "kazekage_prisao_areia", "kazekage_caixao_areia", "kazekage_enterro_prisao_areia",
  "kazekage_assalto_areia_ferro", "kazekage_martelo_ferro", "kazekage_pregos_longos", "kazekage_chuva_areia_ferro", "kazekage_ordem_mundial_ferro",
  "kazekage_escudo_po_ouro", "kazekage_enterro_po_ouro", "kazekage_quadrado_perfeito_ouro", "kazekage_funeral_imperial_ouro", "kazekage_esfera_po_ouro",
] as const;

describe("Kazekage: manipulação exclusiva de areia", () => {
  it("sorteia uma das três variantes e a persistência técnica reconstrói o mesmo resultado", () => {
    expect(KAZEKAGE_SAND_VARIANTS).toEqual(["AREIA", "FERRO", "OURO"]);
    expect(rollKazekageSandVariant(() => 0)).toBe("AREIA");
    expect(rollKazekageSandVariant(() => 0.5)).toBe("FERRO");
    expect(rollKazekageSandVariant(() => 0.999)).toBe("OURO");
    for (const variant of KAZEKAGE_SAND_VARIANTS) {
      expect(kazekageSandVariantFromNodeId(kazekageSandVariantNodeId(variant))).toBe(variant);
    }
  });

  it("tem uma raiz e três ramos exclusivos, todos pagos com Ninjutsu", () => {
    const tree = CLAN_TREES.kazekage!;
    expect(tree.filter((node) => node.requires.length === 0).map((node) => node.id)).toEqual(["kazekage_despertar_areia"]);
    expect(tree.every((node) => node.pool === "ninjutsu")).toBe(true);
    for (const id of IDS) expect(getNode(id)?.clanId).toBe("kazekage");
  });

  it("cada árvore exibida contém apenas a raiz e o ramo sorteado", () => {
    const base: Omit<CharSnapshot, "kazekageSandVariant"> = {
      charId: "char", name: "Kazekage", level: 50, spentByPool: {}, pointsByPool: { ninjutsu: 99 }, elements: ["TERRA"], fightingStyles: new Set(),
      owned: new Set(["kazekage_despertar_areia"]), clanId: "kazekage", attributes: { ninjutsu: 99 },
    };
    for (const variant of KAZEKAGE_SAND_VARIANTS) {
      const view = viewClanTree({ ...base, kazekageSandVariant: variant }, "kazekage");
      expect(view[0]!.id).toBe("kazekage_despertar_areia");
      expect(view.slice(1).every((node) => node.requiresKazekageSand === variant)).toBe(true);
    }
  });

  it("registra as técnicas como Ninjutsu de Terra e as vincula ao clã", () => {
    expect(getClan("kazekage")!.activeIds).toEqual(IDS);
    for (const id of IDS) {
      const ability = getAbility(id)!;
      expect(ability.category).toBe("NINJUTSU");
      expect(ability.element).toBe("TERRA");
      expect(ability.requirements).toMatchObject({ clanId: "kazekage", manualOnly: true });
    }
  });

  it("Areia de Ferro fecha em +21% de dano próprio e ainda recebe a árvore de Terra", () => {
    const ability = getAbility("kazekage_ordem_mundial_ferro")!;
    expect(passiveMods(["kazekage_ferro_magnetismo", "kazekage_ferro_polaridade"], ability).damageMult).toBeCloseTo(1.21);
    expect(passiveMods(["terra_raiz"], ability).damageMult).toBeCloseTo(1.3);
  });

  it("finalizadores de Areia e Ouro exigem um alvo previamente Imobilizado", () => {
    expect(getAbility("kazekage_caixao_areia")!.requiresTargetEffect).toEqual(["ROOT"]);
    expect(getAbility("kazekage_funeral_imperial_ouro")!.requiresTargetEffect).toEqual(["ROOT"]);
  });
});
