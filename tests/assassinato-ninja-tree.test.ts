import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { ASSASSINATO_NINJA_TREE } from "../src/data/assassinato-ninja-tree.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { lockReason, type CharSnapshot } from "../src/services/characters/skill-tree.js";

describe("árvore de Assassinato Ninja", () => {
  it("mantém a Ocultação da Névoa como a única técnica ativa", () => {
    expect(ASSASSINATO_NINJA_TREE.filter((node) => node.kind === "JUTSU").map((node) => node.id)).toEqual(["tai_ocultacao_nevoa"]);
    expect(getAbility("tai_ocultacao_nevoa")?.resource).toBe("chakra");
    expect(ASSASSINATO_NINJA_TREE.every((node) => node.requiresVillage === "KIRI")).toBe(true);
  });

  it("restringe toda a árvore a Kirigakure", () => {
    const base: CharSnapshot = {
      charId: "c", name: "Teste", level: 50, spentByPool: {}, pointsByPool: { taijutsu: 50, ninjutsu: 50, kenjutsu: 50 },
      elements: [], owned: new Set(), clanId: null, attributes: { taijutsu: 50, ninjutsu: 50, kenjutsu: 50 }, villageId: "KONOHA",
    };
    expect(lockReason(base, ASSASSINATO_NINJA_TREE[0]!)).toContain("Kirigakure");
    expect(lockReason({ ...base, villageId: "KIRI" }, ASSASSINATO_NINJA_TREE[0]!)).toBeNull();
  });

  it("dá um leve reforço condicionado à preparação do assassinato", () => {
    const mods = passiveMods(
      ["tai_pass_raiz", "tai_pass_maestria", "tai_nevoa_primeiro_golpe", "tai_nevoa_ponto_cego", "tai_nevoa_ofuscante", "tai_nevoa_marca", "tai_nevoa_misericordia"],
      getAbility("tai_furacao_folha")!,
      [{ effectId: "DEFENSE_DOWN", stacks: 1, duration: 1 }],
    );
    expect(mods.damageMult).toBeCloseTo(1.08 * 1.10 * 1.12);
    expect(mods.firstHitDamageMult).toBe(1.15);
    expect(mods.mistDamageMult).toBe(1.10);
  });
});
