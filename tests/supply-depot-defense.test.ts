import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("supply depot defense mission", () => {
  it("registers a reusable rank C defense mission", () => {
    const mission = getMission("ataque_deposito_suprimentos");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("SUPPLY_DEPOT_DEFENSE");
    expect(mission?.data?.variantId).toBe("KONOHA");
    expect(mission?.data?.raiderTemplate).toBe("depot_raider");
    expect(mission?.data?.captainTemplate).toBe("depot_raider_captain");
  });

  it("uses two waves and supply protection objectives", () => {
    const ids = getMission("ataque_deposito_suprimentos")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("derrotar_primeira_onda");
    expect(ids).toContain("proteger_suprimentos");
    expect(ids).toContain("derrotar_segunda_onda");
  });

  it("registers raiders and regional personas", () => {
    const raider = getNpc("depot_raider");
    const captain = getNpc("depot_raider_captain");
    expect(captain?.hpMax).toBeGreaterThan(raider?.hpMax ?? 0);
    expect(getPersona("supply_depot_quartermaster_konoha")).toBeDefined();
    expect(getPersona("supply_depot_worker_tetsu")).toBeDefined();
  });
});
