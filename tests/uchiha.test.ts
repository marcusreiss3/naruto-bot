import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance.js";
import { getAbility, getClan } from "../src/data/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import {
  SHARINGAN_ABILITY_BY_TOMOE,
  abilityIdFromSharinganCopyNode,
  isSharinganCopyable,
  sharinganCopyNodeId,
  sharinganCopyRequirementError,
} from "../src/services/combat/sharingan.js";
import { characterPassiveMods } from "../src/services/combat/passives.js";
import { MANGEKYO_VARIANTS, mangekyoVariantFromNodeId, mangekyoVariantNodeId, rollMangekyoVariant } from "../src/services/characters/mangekyo.js";

const IDS = Object.values(SHARINGAN_ABILITY_BY_TOMOE);
const TREE_IDS = [
  "uchiha_sharingan_1_tomoe",
  "uchiha_controle_ocular",
  "uchiha_sharingan_2_tomoe",
  "uchiha_economia_visual",
  "uchiha_sharingan_3_tomoe",
  "uchiha_mangekyo_sharingan",
];

describe("Uchiha: árvore do Sharingan", () => {
  it("tem somente os três tomoe, em sequência, pagos com Dōjutsu", () => {
    const tree = CLAN_TREES.uchiha!;
    expect(tree.map((node) => node.id)).toEqual(TREE_IDS);
    expect(tree.map((node) => node.requires)).toEqual([
      [],
      ["uchiha_sharingan_1_tomoe"],
      ["uchiha_controle_ocular"],
      ["uchiha_sharingan_2_tomoe"],
      ["uchiha_economia_visual"],
      ["uchiha_sharingan_3_tomoe"],
    ]);
    expect(tree.every((node) => node.pool === "dojutsu")).toBe(true);
    expect(tree.every((node) => node.col === 0)).toBe(true);
    expect(tree.reduce((sum, node) => sum + node.cost, 0)).toBe(27);
    for (const id of IDS) {
      expect(tree.find((node) => node.id === id)?.img).toMatch(/^\/assets\/icons\/uchiha\/sharingan-[123]-tomoe\.png$/);
    }
    expect(tree.find((node) => node.id === "uchiha_controle_ocular")?.img).toBe("/assets/icons/uchiha/controle-ocular.png");
    expect(tree.find((node) => node.id === "uchiha_economia_visual")?.img).toBe("/assets/icons/uchiha/economia-visual.png");
    expect(tree.find((node) => node.id === "uchiha_mangekyo_sharingan")?.img).toBe("/assets/icons/uchiha/mangekyo-sharingan.png");
  });

  it("bloqueia o Mangekyō por Trauma e sorteia uma variação persistível", () => {
    const mangekyo = CLAN_TREES.uchiha!.find((node) => node.id === "uchiha_mangekyo_sharingan")!;
    expect(mangekyo.requiresCondition).toBe("TRAUMA");
    expect(mangekyo.concealUntilOwned).toBe(true);
    expect(mangekyo.reqLevel).toBe(45);
    expect(mangekyo.reqPool).toBe(32);
    for (const variant of MANGEKYO_VARIANTS) {
      expect(mangekyoVariantFromNodeId(mangekyoVariantNodeId(variant))).toBe(variant);
    }
    expect(rollMangekyoVariant(() => 0)).toBe("ITACHI");
    expect(rollMangekyoVariant(() => 0.999)).toBe("MADARA");
  });

  it("as passivas reduzem cumulativamente a manutencao do Sharingan", () => {
    const first = characterPassiveMods(["uchiha_controle_ocular"]);
    const both = characterPassiveMods([
      "uchiha_controle_ocular",
      "uchiha_economia_visual",
    ]);

    expect(first.sharinganUpkeepMult).toBeCloseTo(0.85);
    expect(both.sharinganUpkeepMult).toBeCloseTo(0.85 * 0.85);
    expect(Math.round(BALANCE.sharingan[3].upkeepPerTurn * first.sharinganUpkeepMult)).toBe(8);
    expect(Math.round(BALANCE.sharingan[3].upkeepPerTurn * both.sharinganUpkeepMult)).toBe(7);
  });

  it("registra os três tomoe e o Mangekyō como habilidades ativas do clã", () => {
    const active = [...IDS, "uchiha_mangekyo_sharingan"];
    expect(getClan("uchiha")!.activeIds).toEqual(active);
    for (const id of active) {
      expect(getAbility(id)!.requirements).toMatchObject({
        clanId: "uchiha",
        manualOnly: true,
      });
    }
  });

  it("cada estágio aumenta esquiva e manutenção de chakra", () => {
    for (const tomoe of [1, 2, 3] as const) {
      const ability = getAbility(SHARINGAN_ABILITY_BY_TOMOE[tomoe])!;
      expect(ability.category).toBe("DOJUTSU");
      expect(ability.cost).toBe(0);
      expect(ability.actionType).toBe("BONUS");
      expect(ability.shape).toBe("SELF");
      expect(ability.toggleRules).toMatchObject(BALANCE.sharingan[tomoe]);
    }
  });

  it("explica a cópia no texto exibido do terceiro tomoe", () => {
    const ability = getAbility("uchiha_sharingan_3_tomoe")!;
    expect(ability.visualDescription).toMatch(/grava permanentemente/i);
  });
});

describe("Sharingan de três tomoe: cópia", () => {
  const kirin = getAbility("raiton_kirin")!;
  const kirinNode = allNodes().find((node) => node.grantsAbilityId === kirin.id)!;

  it("pode aprender permanentemente Ninjutsu elemental sem clã", () => {
    expect(isSharinganCopyable(kirin)).toBe(true);
    const marker = sharinganCopyNodeId(kirin.id);
    expect(abilityIdFromSharinganCopyNode(marker)).toBe(kirin.id);
  });

  it("não copia técnica de clã, habilidade sem elemento, gelo ou madeira", () => {
    expect(isSharinganCopyable(getAbility("senju_ondas_cortantes")!)).toBe(false);
    expect(isSharinganCopyable(getAbility("vapor_nevoa_qualificada")!)).toBe(true);
    expect(isSharinganCopyable(getAbility("nara_possessao")!)).toBe(false);
    expect(isSharinganCopyable(getAbility("gelo_agulhas")!)).toBe(false);
    const suitonSenju = getAbility("senju_ondas_cortantes")!;
    expect(isSharinganCopyable(suitonSenju)).toBe(false);
    expect(isSharinganCopyable({ ...suitonSenju, id: "mokuton_teste", tags: ["mokuton", "madeira"] })).toBe(false);
  });

  it("Kirin exige Raio, nível e Ninjutsu definidos pelo nó da árvore", () => {
    const gate = { level: kirinNode.reqLevel, ninjutsu: kirinNode.reqPool };
    expect(
      sharinganCopyRequirementError(kirin, { level: 99, ninjutsu: 99, elements: [] }, gate),
    ).toMatch(/afinidade.*RAIO/i);
    expect(
      sharinganCopyRequirementError(
        kirin,
        { level: kirinNode.reqLevel - 1, ninjutsu: 99, elements: ["RAIO"] },
        gate,
      ),
    ).toMatch(/nível/i);
    expect(
      sharinganCopyRequirementError(
        kirin,
        { level: 99, ninjutsu: kirinNode.reqPool - 1, elements: ["RAIO"] },
        gate,
      ),
    ).toMatch(/Ninjutsu/i);
    expect(
      sharinganCopyRequirementError(
        kirin,
        { level: kirinNode.reqLevel, ninjutsu: kirinNode.reqPool, elements: ["RAIO"] },
        gate,
      ),
    ).toBeNull();
  });
});
