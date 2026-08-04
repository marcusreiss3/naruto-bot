import { describe, expect, it } from "vitest";
import { PUNHO_GENTIL_TREE } from "../src/data/punho-gentil-tree.js";
import { TAIJUTSU_AGITACAO_TREE } from "../src/data/taijutsu-agitacao-tree.js";
import { getAbility } from "../src/data/index.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { lockReason, type CharSnapshot } from "../src/services/characters/skill-tree.js";

describe("árvores próprias de Punho Gentil e Taijutsu de Agitação", () => {
  it("mantém Punho Gentil exclusivo do clã Hyuuga", () => {
    expect(PUNHO_GENTIL_TREE.every((node) => node.clanId === "hyuuga" && node.pool === "taijutsu")).toBe(true);
    const snap: CharSnapshot = {
      charId: "c", name: "Teste", level: 40, spentByPool: {}, pointsByPool: { taijutsu: 40 },
      elements: [], owned: new Set(), clanId: "nara", attributes: { taijutsu: 40 },
    };
    expect(lockReason(snap, PUNHO_GENTIL_TREE[0]!)).toContain("Hyuuga");
    expect(lockReason({ ...snap, clanId: "hyuuga" }, PUNHO_GENTIL_TREE[0]!)).toBeNull();
  });

  it("oferece seis passivas voltadas apenas às técnicas Hyuuga", () => {
    expect(PUNHO_GENTIL_TREE).toHaveLength(6);
    expect(PUNHO_GENTIL_TREE.find((node) => node.id === "tai_gentil_leoes")?.requires)
      .toEqual(["tai_gentil_vacuo", "tai_gentil_tenketsu"]);
  });

  it("mantém Agitação e Kenjutsu como ramificações independentes", () => {
    expect(TAIJUTSU_AGITACAO_TREE.filter((node) => node.id.startsWith("tai_agitacao_")).every((node) => node.pool === "taijutsu")).toBe(true);
    expect(TAIJUTSU_AGITACAO_TREE.filter((node) => node.id.startsWith("tai_ken_")).every((node) => node.pool === "kenjutsu")).toBe(true);
    expect(TAIJUTSU_AGITACAO_TREE[0]?.requires).toEqual([]);
    expect(TAIJUTSU_AGITACAO_TREE.find((node) => node.id === "tai_agitacao_ritmo")?.requires).toEqual(["tai_agitacao_finta"]);
    expect(TAIJUTSU_AGITACAO_TREE.find((node) => node.id === "tai_ken_geometria")?.requires).toEqual(["tai_ken_fio"]);
  });

  it("reduz a esquiva em no máximo doze pontos percentuais", () => {
    const mods = passiveMods(
      ["tai_agitacao_passos", "tai_agitacao_finta", "tai_agitacao_ritmo"],
      getAbility("tai_furacao_folha")!,
    );
    expect(mods.dodgePenalty).toBeCloseTo(0.12);
  });
});
