import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("false ninjas mission", () => {
  it("registers the reusable rank C mission with Konoha as a variant", () => {
    const mission = getMission("falsos_ninjas_vila");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("FALSE_NINJAS");
    expect(mission?.data?.variantId).toBe("KONOHA");
  });

  it("registers two weak templates and a stronger captain template", () => {
    const grunt = getNpc("false_ninja_grunt");
    const captain = getNpc("false_ninja_captain");
    expect(grunt?.hpMax).toBe(72);
    expect(captain?.hpMax).toBeGreaterThan(grunt?.hpMax ?? 0);
    expect(getPersona("false_ninjas_captain_konoha")).toBeDefined();
    expect(getPersona("false_ninjas_clerk_konoha")).toBeDefined();
  });

  it("tracks investigation, ambush, combat and restitution objectives", () => {
    const ids = getMission("falsos_ninjas_vila")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("identificar_ordem_falsa");
    expect(ids).toContain("preparar_emboscada_falsos_ninjas");
    expect(ids).toContain("derrotar_falsos_ninjas");
    expect(ids).toContain("devolver_ryo_comerciantes");
  });
});
