import { describe, expect, it } from "vitest";
import { getMission, MISSIONS } from "../src/data/missions/index.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("new rank D missions", () => {
  it("registers the clone investigation with stable evidence personas", () => {
    const mission = getMission("clone_infiltrado_academia");
    expect(mission?.rank).toBe("D");
    expect(mission?.type).toBe("CLONE_INVESTIGATION");
    expect(mission?.objectives.map((objective) => objective.id)).toContain("identificar_kenta");
    expect(getPersona("clone_kenta_door")?.fallbackLines.join(" ")).toContain("barro");
  });

  it("registers urgent deliveries and all recipients", () => {
    const mission = getMission("entregas_urgentes_folha");
    expect(mission?.rank).toBe("D");
    expect(mission?.type).toBe("URGENT_DELIVERIES");
    expect(mission?.objectives).toHaveLength(5);
    expect(getPersona("courier_emi")).toBeDefined();
    expect(getPersona("delivery_yori")).toBeDefined();
    expect(getPersona("delivery_haru")).toBeDefined();
    expect(getPersona("delivery_sayuri")).toBeDefined();
  });

  it("keeps nineteen rank D missions in the catalog", () => {
    expect(MISSIONS.filter((mission) => mission.rank === "D")).toHaveLength(19);
  });
});
