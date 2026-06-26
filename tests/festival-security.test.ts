import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("festival security mission", () => {
  it("registers a rank C mission with two combat waves", () => {
    const mission = getMission("seguranca_festival");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("FESTIVAL_SECURITY");
    expect(mission?.data?.weakTemplate).toBe("festival_bandit");
    expect(mission?.data?.leaderTemplate).toBe("festival_rogue_ninja");
    expect(mission?.objectives.map((objective) => objective.id)).toContain("derrotar_bandidos");
    expect(mission?.objectives.map((objective) => objective.id)).toContain("derrotar_mandante");
  });

  it("registers weak bandits and a stronger ninja", () => {
    const weak = getNpc("festival_bandit");
    const leader = getNpc("festival_rogue_ninja");
    expect(weak?.hpMax).toBe(60);
    expect(leader?.hpMax).toBeGreaterThan(weak?.hpMax ?? 0);
    expect(getPersona("festival_fake_vendor")).toBeDefined();
    expect(getPersona("festival_rogue_ninja")).toBeDefined();
  });
});
