import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ficha } from "../src/commands/ficha.js";
import { CLANS } from "../src/data/clans/index.js";
import {
  CLANS_BY_VILLAGE,
  TRAIT_RARITY_WEIGHTS,
  clanOptionFromRoll,
  clanIconPath,
  rollClanVillageOptions,
  traitIconPath,
  traitRarityFromRoll,
} from "../src/data/sheet-creation.js";
import { TRAITS } from "../src/data/traits.js";
import { sheetMessagePolicy } from "../src/services/sheet/sheet-service.js";

describe("criação de ficha", () => {
  it("registra o comando /ficha", () => {
    expect(ficha.data.toJSON().name).toBe("ficha");
  });

  it("distribui cada clã existente em exatamente uma vila", () => {
    const configured = Object.values(CLANS_BY_VILLAGE).flat();
    expect(new Set(configured).size).toBe(configured.length);
    expect([...configured].sort()).toEqual(CLANS.map((clan) => clan.id).sort());
  });

  it("gera três opções válidas e sem repetição", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const options = rollClanVillageOptions(3);
      expect(options).toHaveLength(3);
      expect(new Set(options.map((option) => `${option.villageId}:${option.clanId}`)).size).toBe(3);
      for (const option of options) {
        expect(CLANS_BY_VILLAGE[option.villageId]).toContain(option.clanId);
      }
    }
  });

  it("mantém as opções salvas endereçáveis até o jogador escolher", () => {
    const options = [
      { villageId: "KONOHA", clanId: "uzumaki" },
      { villageId: "SUNA", clanId: "kazekage" },
      { villageId: "KIRI", clanId: "yuki" },
    ] as const;
    expect(clanOptionFromRoll(options, 0)).toBe(options[0]);
    expect(clanOptionFromRoll(options, 2)).toBe(options[2]);
    expect(() => clanOptionFromRoll(options, 3)).toThrow(RangeError);
  });

  it("usa pesos que somam exatamente 100%", () => {
    expect(TRAIT_RARITY_WEIGHTS.reduce((sum, item) => sum + item.weight, 0)).toBe(10_000);
    expect(TRAIT_RARITY_WEIGHTS).toEqual([
      { rarity: "COMUM", weight: 4_750 },
      { rarity: "RARA", weight: 3_000 },
      { rarity: "EPICA", weight: 1_500 },
      { rarity: "LENDARIA", weight: 700 },
      { rarity: "MITICA", weight: 50 },
    ]);
  });

  it("respeita todos os limites das faixas", () => {
    expect(traitRarityFromRoll(0)).toBe("COMUM");
    expect(traitRarityFromRoll(4_749)).toBe("COMUM");
    expect(traitRarityFromRoll(4_750)).toBe("RARA");
    expect(traitRarityFromRoll(7_749)).toBe("RARA");
    expect(traitRarityFromRoll(7_750)).toBe("EPICA");
    expect(traitRarityFromRoll(9_249)).toBe("EPICA");
    expect(traitRarityFromRoll(9_250)).toBe("LENDARIA");
    expect(traitRarityFromRoll(9_949)).toBe("LENDARIA");
    expect(traitRarityFromRoll(9_950)).toBe("MITICA");
    expect(traitRarityFromRoll(9_999)).toBe("MITICA");
  });

  it("possui uma imagem local para todo clã e todo traço", () => {
    for (const clan of CLANS) expect(existsSync(clanIconPath(clan.id)), clan.id).toBe(true);
    for (const trait of TRAITS) expect(existsSync(traitIconPath(trait)), trait.id).toBe(true);
  });

  it("processa a resposta do dono mesmo quando ele é administrador", () => {
    expect(sheetMessagePolicy("owner", "owner", true)).toBe("PROCESS");
    expect(sheetMessagePolicy("admin", "owner", true)).toBe("IGNORE");
    expect(sheetMessagePolicy("visitor", "owner", false)).toBe("DELETE");
  });
});
