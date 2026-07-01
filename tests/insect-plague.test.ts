import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("chakra insect plague mission", () => {
  it("registers a reusable rank C mission with Konoha as a variant", () => {
    const mission = getMission("praga_insetos_chakra");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("CHAKRA_INSECT_PLAGUE");
    expect(mission?.data?.variantId).toBe("KONOHA");
    expect(mission?.data?.swarmTemplate).toBe("chakra_insect_swarm");
    expect(mission?.data?.handlerTemplate).toBe("aburame_bug_handler");
  });

  it("tracks stock investigation, nest analysis and final combat objectives", () => {
    const ids = getMission("praga_insetos_chakra")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("examinar_estoque");
    expect(ids).toContain("analisar_graos_roidos");
    expect(ids).toContain("identificar_chakra_ninhos");
    expect(ids).toContain("seguir_sentinelas_floresta");
    expect(ids).toContain("derrotar_invocador_aburame");
  });

  it("registers the Aburame handler, swarms and regional personas", () => {
    const swarm = getNpc("chakra_insect_swarm");
    const handler = getNpc("aburame_bug_handler");
    expect(swarm?.hpMax).toBeGreaterThan(40);
    expect(handler?.hpMax).toBeGreaterThan(swarm?.hpMax ?? 0);
    expect(getPersona("insect_plague_clerk_konoha")).toBeDefined();
    expect(getPersona("insect_plague_stockmaster_konoha")).toBeDefined();
    expect(getPersona("insect_plague_aburame_konoha")).toBeDefined();
  });
});
