import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance.js";
import { ALL_ABILITIES, getAbility, getClan } from "../src/data/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { TAIJUTSU_AGITACAO_TREE } from "../src/data/taijutsu-agitacao-tree.js";
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
  "uchiha_coercao_sharingan",
  "uchiha_repressao_estacas",
  "uchiha_genjutsu_sharingan",
  "uchiha_mangekyo_sharingan",
];

describe("Uchiha: árvore do Sharingan", () => {
  it("mantém os três tomoe em sequência e abre técnicas oculares pagas com Dōjutsu", () => {
    const tree = CLAN_TREES.uchiha!;
    expect(tree.map((node) => node.id)).toEqual(TREE_IDS);
    expect(tree.map((node) => node.requires)).toEqual([
      [],
      ["uchiha_sharingan_1_tomoe"],
      ["uchiha_controle_ocular"],
      ["uchiha_sharingan_2_tomoe"],
      ["uchiha_economia_visual"],
      ["uchiha_sharingan_3_tomoe"],
      ["uchiha_sharingan_3_tomoe"],
      ["uchiha_coercao_sharingan", "uchiha_repressao_estacas"],
      ["uchiha_sharingan_3_tomoe"],
    ]);
    expect(tree.every((node) => node.pool === "dojutsu")).toBe(true);
    expect(tree.reduce((sum, node) => sum + node.cost, 0)).toBe(43);
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

  it("registra os três tomoe, os genjutsus oculares e o Mangekyō como habilidades ativas do clã", () => {
    const active = [...IDS, "uchiha_coercao_sharingan", "uchiha_repressao_estacas", "uchiha_genjutsu_sharingan", "uchiha_mangekyo_sharingan"];
    expect(getClan("uchiha")!.activeIds).toEqual(active);
    for (const id of active) {
      expect(getAbility(id)!.requirements).toMatchObject({
        clanId: "uchiha",
        manualOnly: true,
      });
    }
  });

  it("exige Sharingan de três tomoe ativo para os três genjutsus oculares", () => {
    for (const id of ["uchiha_coercao_sharingan", "uchiha_repressao_estacas", "uchiha_genjutsu_sharingan"]) {
      expect(getAbility(id)!.requiresActiveDoujutsu).toEqual({
        flag: "sharinganTomoe",
        value: 3,
        label: "Sharingan de três tomoe",
      });
    }
  });

  it("reduz para 60% as duas aplicações da Repressão com Estacas", () => {
    expect(getAbility("uchiha_repressao_estacas")!.effects).toEqual([
      { effectId: "STUN", duration: 1, chance: 0.6 },
      { effectId: "CHAKRA_DRAIN", duration: 2, chance: 0.6 },
    ]);
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

  it("também copia somente os estilos permitidos de Taijutsu com os pontos exigidos", () => {
    const strongFist = getAbility("tai_furacao_folha")!;
    const strongFistNode = allNodes().find((node) => node.grantsAbilityId === strongFist.id)!;
    expect(isSharinganCopyable(strongFist)).toBe(true);
    expect(isSharinganCopyable(getAbility("arhat_palmada_colapso")!)).toBe(true);
    expect(isSharinganCopyable(getAbility("hyuuga_punho_suave")!)).toBe(false);
    expect(
      sharinganCopyRequirementError(
        strongFist,
        { level: 99, ninjutsu: 99, elements: [], attributes: { taijutsu: strongFistNode.reqPool - 1 } },
        { level: strongFistNode.reqLevel, attribute: { key: "taijutsu", value: strongFistNode.reqPool } },
      ),
    ).toMatch(/Taijutsu/);
    expect(
      sharinganCopyRequirementError(
        strongFist,
        { level: 99, ninjutsu: 99, elements: [], attributes: { taijutsu: strongFistNode.reqPool } },
        { level: strongFistNode.reqLevel, attribute: { key: "taijutsu", value: strongFistNode.reqPool } },
      ),
    ).toBeNull();
    expect(TAIJUTSU_AGITACAO_TREE.every((node) => node.kind === "PASSIVE" || !isSharinganCopyable(getAbility(node.grantsAbilityId!)!))).toBe(true);
  });

  it("não copia transformação: o olho lê os selos, não entrega o corpo condicionado", () => {
    // Portões Internos (Punho Forte): todos os 8, incluindo os dois primeiros
    // que nem sequer têm a tag kinjutsu — o gate em si já é transformação.
    for (const id of ["tai_portao_abertura", "tai_portao_descanso", "tai_portao_morte"]) {
      expect(isSharinganCopyable(getAbility(id)!), id).toBe(false);
    }
    // Cem Forças (Punho Adamantino): modo no próprio corpo, não um golpe.
    expect(isSharinganCopyable(getAbility("adamantino_cem_forcas")!)).toBe(false);
    // toda ability com gateRules está fora, sem exceção
    const gates = ALL_ABILITIES.filter((a) => a.gateRules);
    expect(gates.length).toBeGreaterThan(0);
    expect(gates.filter((a) => isSharinganCopyable(a))).toEqual([]);
  });

  it("não copia Kinjutsu — técnica proibida exige mais que ver o selo", () => {
    const kinjutsu = ALL_ABILITIES.filter((a) => a.tags.includes("kinjutsu"));
    expect(kinjutsu.length).toBeGreaterThan(0);
    expect(kinjutsu.filter((a) => isSharinganCopyable(a)).map((a) => a.id)).toEqual([]);
    // as Lótus e os finalizadores de Portão caem aqui
    for (const id of ["tai_lotus_frontal", "tai_lotus_oculta", "tai_guy_noturno", "tai_elefante_anoitecer"]) {
      expect(isSharinganCopyable(getAbility(id)!), id).toBe(false);
    }
  });

  it("os golpes normais dos três estilos continuam copiáveis", () => {
    for (const id of ["tai_furacao_folha", "tai_luz_rotatoria_folha", "arhat_golpe_rocha", "adamantino_super_peteleco"]) {
      expect(isSharinganCopyable(getAbility(id)!), id).toBe(true);
    }
  });

  it("não copia técnica de clã, habilidade sem elemento ou Kekkei Genkai", () => {
    expect(isSharinganCopyable(getAbility("senju_ondas_cortantes")!)).toBe(false);
    expect(isSharinganCopyable(getAbility("vapor_nevoa_qualificada")!)).toBe(false);
    expect(isSharinganCopyable(getAbility("nara_possessao")!)).toBe(false);
    expect(isSharinganCopyable(getAbility("gelo_agulhas")!)).toBe(false);
    expect(isSharinganCopyable(getAbility("lava_tecnica_balas")!)).toBe(false);
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
