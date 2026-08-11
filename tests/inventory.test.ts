import { describe, expect, it } from "vitest";
import {
  ITEM_CATEGORIES,
  ITEMS,
  getItem,
} from "../src/data/items.js";
import { groupInventory } from "../src/services/characters/inventory.js";
import { getAbility } from "../src/data/index.js";
import { buildEquipmentCatalog } from "../src/services/characters/equipment-catalog.js";

describe("catálogo de itens", () => {
  it("registra os nove itens básicos e os equipamentos especiais com ids únicos", () => {
    // Equipamento continua sendo 14; materiais e alimentos da coleta entraram
    // depois no mesmo array e são contados no bloco de economia.
    const equipamento = ITEMS.filter(
      (item) => item.category === "WEAPON" || item.category === "NINJA_TOOL",
    );
    expect(equipamento).toHaveLength(14);
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    expect(ITEMS.slice(0, 9).map((item) => item.name)).toEqual([
      "Kunai",
      "Shuriken",
      "Fūma Shuriken",
      "Senbon",
      "Kunai Explosiva",
      "Papel Bomba",
      "Bomba de Fumaça",
      "Fios de Aço Ninja",
      "Katana",
    ]);
    expect(ITEMS.slice(9, 14).map((item) => item.name)).toEqual([
      "Lâmina de Chakra",
      "Pergaminho de Arsenal",
      "Pergaminho de Arsenal (gasto)",
      "Corrente de Ferro",
      "Esfera Explosiva",
    ]);
  });

  it("separa armas de ferramentas ninja", () => {
    expect(getItem("kunai")?.category).toBe("WEAPON");
    expect(getItem("katana")?.category).toBe("WEAPON");
    expect(getItem("papel_bomba")?.category).toBe("NINJA_TOOL");
    expect(getItem("bomba_fumaca")?.category).toBe("NINJA_TOOL");
  });

  it("define as ações disponíveis sem exigir equipamento para armas de arremesso", () => {
    expect(getItem("kunai")?.actions).toEqual(["EQUIP", "THROW"]);
    expect(getItem("katana")?.actions).toEqual(["EQUIP"]);
    expect(getItem("shuriken")?.actions).toEqual(["THROW"]);
    expect(getItem("fuma_shuriken")?.actions).toEqual(["THROW"]);
    expect(getItem("senbon")?.actions).toEqual(["THROW"]);
    expect(getItem("kunai_explosiva")?.actions).toEqual(["THROW"]);
    expect(getItem("papel_bomba")?.actions).toEqual(["USE"]);
    expect(getItem("bomba_fumaca")?.actions).toEqual(["USE"]);
    expect(getItem("fios_aco_ninja")?.actions).toEqual(["USE"]);
  });

  it("liga cada ação funcional à sua habilidade básica", () => {
    for (const item of ITEMS) {
      if (item.throwAbilityId) {
        expect(getAbility(item.throwAbilityId), `${item.name}: arremesso`).toMatchObject({
          category: "BUKIJUTSU",
          actionType: "COMUM",
        });
      }
      if (item.basicAbilityId && item.id !== "papel_bomba") {
        expect(getAbility(item.basicAbilityId), `${item.name}: uso`).toMatchObject({
          category: "BUKIJUTSU",
        });
      }
    }
  });

  it("mantém Katana somente como equipamento por enquanto", () => {
    const katana = getItem("katana")!;
    expect(katana.actions).toEqual(["EQUIP"]);
    expect(katana.basicAbilityId).toBeUndefined();
    expect(katana.throwAbilityId).toBeUndefined();
  });

  it("registra Soco como ataque universal sem arma", () => {
    expect(getAbility("item_soco_basico")).toMatchObject({
      name: "Soco",
      category: "TAIJUTSU",
      scalingAttribute: "taijutsu",
      shape: "MELEE",
      baseDamage: 8,
    });
  });

  it("diferencia o perfil básico de cada projétil", () => {
    const kunai = getAbility("item_kunai_arremessar")!;
    const shuriken = getAbility("item_shuriken_arremessar")!;
    const fuma = getAbility("item_fuma_shuriken_arremessar")!;
    const senbon = getAbility("item_senbon_arremessar")!;
    const explosive = getAbility("item_kunai_explosiva_arremessar")!;

    expect(fuma.baseDamage).toBeGreaterThan(kunai.baseDamage!);
    expect(fuma.cost).toBeGreaterThan(shuriken.cost);
    expect(senbon.effects).toContainEqual({
      effectId: "STUN",
      duration: 1,
      chance: 0.25,
    });
    expect(explosive.shape).toBe("RADIUS");
    expect(explosive.terrain).toEqual({ kind: "FIRE", duration: 1 });
  });

  it("expõe o mesmo catálogo para a página do site", () => {
    const catalog = buildEquipmentCatalog();
    expect(catalog.unarmedAttack?.name).toBe("Soco");
    expect(catalog.items).toHaveLength(14);
    const commands = catalog.commands.map((entry) => entry.command);
    expect(commands).toEqual(expect.arrayContaining([
      "/atributos",
      "/inventario",
      "/mapa",
      "/mover destino",
      "/atacar alvo",
      "/jutsu",
      "/combate fugir",
      "/combate fim-turno",
      "/combate pegar-arma",
      "/equipar item",
      "/desequipar",
      "/arremessar item alvo",
      "/usar item",
      "/missoes ativas",
      "/interagir npc",
    ]));
    expect(catalog.commandGroups.map((group) => group.id)).toEqual([
      "character",
      "combat",
      "equipment",
      "missions",
    ]);
    expect(catalog.quickStart).toHaveLength(4);
    expect(catalog.items.find((item) => item.id === "katana")?.specialRule).toMatch(
      /somente ser equipada/i,
    );
  });
});

describe("organização do inventário", () => {
  it("agrupa na ordem oficial e mantém itens desconhecidos em Outros", () => {
    const groups = groupInventory([
      { itemId: "papel_bomba", name: "Papel Bomba", qty: 3 },
      { itemId: "kunai", name: "Kunai", qty: 5 },
      { itemId: "item_antigo", name: "Lembrança", qty: 1 },
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "WEAPON",
      "NINJA_TOOL",
      "OTHER",
    ]);
    expect(groups[0]?.entries[0]?.item?.name).toBe("Kunai");
    expect(groups[2]?.entries[0]?.item).toBeNull();
    expect(ITEM_CATEGORIES.at(-1)).toBe("OTHER");
  });

  it("não exibe registros sem quantidade", () => {
    expect(groupInventory([{ itemId: "kunai", name: "Kunai", qty: 0 }])).toEqual([]);
  });
});
