import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("district night patrol mission", () => {
  it("keeps the alley patrol as rank D and registers a separate rank C mission", () => {
    const rankD = getMission("patrulha_noturna_beco");
    const rankC = getMission("patrulha_noturna_distrito");

    expect(rankD?.rank).toBe("D");
    expect(rankD?.type).toBe("NIGHT_PATROL");
    expect(rankC?.rank).toBe("C");
    expect(rankC?.type).toBe("DISTRICT_NIGHT_PATROL");
    expect(rankC?.data?.weakTemplate).toBe("district_rooftop_thief");
    expect(rankC?.data?.leaderTemplate).toBe("district_rooftop_leader");
  });

  it("registers rooftop criminals and the scout persona", () => {
    const weak = getNpc("district_rooftop_thief");
    const leader = getNpc("district_rooftop_leader");

    expect(weak?.hpMax).toBe(78);
    expect(leader?.hpMax).toBeGreaterThan(weak?.hpMax ?? 0);
    expect(getPersona("district_patrol_scout_konoha")).toBeDefined();
  });
});
