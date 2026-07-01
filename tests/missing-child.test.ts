import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("missing child mission", () => {
  it("registers the reusable rank C investigation mission with Konoha as a variant", () => {
    const mission = getMission("crianca_importante_fugiu");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("MISSING_CHILD");
    expect(mission?.data?.variantId).toBe("KONOHA");
  });

  it("tracks multiple investigation locations before the final combat", () => {
    const ids = getMission("crianca_importante_fugiu")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("ouvir_vendedor_mercado");
    expect(ids).toContain("ouvir_testemunha_praca");
    expect(ids).toContain("seguir_rastro_beco");
    expect(ids).toContain("derrotar_sequestradores");
    expect(ids).toContain("devolver_ayaka_familia");
  });

  it("registers kidnappers and the regional personas", () => {
    const grunt = getNpc("kidnapper_grunt");
    const leader = getNpc("kidnapper_leader");
    expect(grunt?.hpMax).toBeGreaterThan(60);
    expect(leader?.hpMax).toBeGreaterThan(grunt?.hpMax ?? 0);
    expect(getPersona("missing_child_parent_konoha")).toBeDefined();
    expect(getPersona("missing_child_vendor_konoha")).toBeDefined();
    expect(getPersona("missing_child_witness_konoha")).toBeDefined();
    expect(getPersona("missing_child_kidnapper_konoha")).toBeDefined();
  });
});
