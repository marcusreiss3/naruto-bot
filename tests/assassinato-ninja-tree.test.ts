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

  it("restringe toda a árvore a Kirigakure, a afinidade com Água e o estilo de luta ensinado", () => {
    const base: CharSnapshot = {
      charId: "c", name: "Teste", level: 50, spentByPool: {}, pointsByPool: { taijutsu: 50, ninjutsu: 50, kenjutsu: 50 },
      elements: ["AGUA"], fightingStyles: new Set(["ASSASSINATO_SILENCIOSO"]), owned: new Set(), clanId: null,
      attributes: { taijutsu: 50, ninjutsu: 50, kenjutsu: 50 }, villageId: "KONOHA",
    };
    // elemento e estilo ok, vila errada -> trava pela vila
    expect(lockReason(base, ASSASSINATO_NINJA_TREE[0]!)).toContain("Kirigakure");
    // vila ok, sem o elemento -> trava pelo elemento (checado antes da vila em lockReason)
    expect(lockReason({ ...base, villageId: "KIRI", elements: [] }, ASSASSINATO_NINJA_TREE[0]!)).toContain("AGUA");
    // vila e elemento ok, sem o estilo ensinado (NPC/admin) -> trava pelo estilo
    expect(lockReason({ ...base, villageId: "KIRI", fightingStyles: new Set() }, ASSASSINATO_NINJA_TREE[0]!)).toContain("estilo de luta Assassinato Silencioso");
    // os três satisfeitos -> livre
    expect(lockReason({ ...base, villageId: "KIRI" }, ASSASSINATO_NINJA_TREE[0]!)).toBeNull();
  });

  it("dá dano incondicional real, mais um reforço condicionado à preparação do assassinato", () => {
    const mods = passiveMods(
      ["tai_pass_raiz", "tai_pass_maestria", "tai_nevoa_primeiro_golpe", "tai_nevoa_ponto_cego", "tai_nevoa_ofuscante", "tai_nevoa_marca", "tai_nevoa_misericordia"],
      getAbility("tai_furacao_folha")!,
      [{ effectId: "DEFENSE_DOWN", stacks: 1, duration: 1 }],
    );
    // 1.08(raiz) x 1.10(maestria) x 1.08(primeiro golpe, incondicional) x
    // 1.07(ponto cego, incondicional) x 1.12(ponto cego vs Defesa Reduzida,
    // condicional — dispara pq o alvo tem o efeito) x 1.06(misericordia, incondicional)
    expect(mods.damageMult).toBeCloseTo(1.08 * 1.20 * 1.08 * 1.07 * 1.12 * 1.06);
    expect(mods.firstHitDamageMult).toBe(1.15);
    expect(mods.mistDamageMult).toBe(1.10);
  });

  // A perfuracao do Corte Decisivo tem que ficar FORA do armorPierce comum: o
  // texto promete "apos passar uma rodada sem atacar", e o armorPierce e'
  // somado em passiveMods, que nao conhece rodada. Se voltar pra la', os 18%
  // passam a valer em todo golpe de Kenjutsu e a descricao vira mentira.
  it("Corte Decisivo separa a perfuração condicional da incondicional", () => {
    const mods = passiveMods(
      ["tai_nevoa_ponto_cego", "tai_nevoa_corte"],
      getAbility("hatake_lamina")!,
    );
    // Ponto Cego e' incondicional; Corte Decisivo nao entra no total comum.
    expect(mods.armorPierce).toBeCloseTo(0.12);
    expect(mods.decisiveArmorPierce).toBeCloseTo(0.18);
    // e o dano decisivo continua no campo proprio, com a mesma condicao
    expect(mods.decisiveKenjutsuDamageMult).toBeCloseTo(1.18);
  });

  it("Corte Decisivo não vale fora de Kenjutsu", () => {
    const mods = passiveMods(["tai_nevoa_corte"], getAbility("tai_furacao_folha")!);
    expect(mods.decisiveArmorPierce).toBe(0);
    expect(mods.armorPierce).toBe(0);
  });
});
