import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";
import { VILLAGE_MANSIONS, VILLAGE_ROLES } from "../src/services/village-service.js";

describe("Yuki heir rank B mission", () => {
  it("registers the mission with multi-village investigation data", () => {
    const mission = getMission("herdeiro_cla_yuki");
    expect(mission?.rank).toBe("B");
    expect(mission?.type).toBe("YUKI_HEIR");
    expect(mission?.data?.bossTemplate).toBe("yuki_heir_hakuo");
    expect(mission?.data?.cloneTemplate).toBe("yuki_ice_clone");
    expect(mission?.data?.finalScenarioId).toBe("yuki_mirror_field");
    expect(mission?.data?.clueChannels).toMatchObject({
      sunaMarket: "1523372488292302958",
      kiriMarket: "1523372437398487151",
      sunaPlaza: "1523370437919244309",
      konohaMarket: "1516183249712582657",
    });
  });

  it("keeps village role to mansion routing for this mission", () => {
    expect(VILLAGE_ROLES.KONOHA).toBe("1523372974965522582");
    expect(VILLAGE_ROLES.SUNA).toBe("1523373008767684740");
    expect(VILLAGE_ROLES.IWA).toBe("1523373069354143905");
    expect(VILLAGE_ROLES.KUMO).toBe("1523373105102192711");
    expect(VILLAGE_ROLES.KIRI).toBe("1523373127957090444");

    expect(VILLAGE_MANSIONS.KONOHA).toBe("1516470677962494084");
    expect(VILLAGE_MANSIONS.SUNA).toBe("1523371643102167234");
    expect(VILLAGE_MANSIONS.IWA).toBe("1523371687721177270");
    expect(VILLAGE_MANSIONS.KUMO).toBe("1523371661074763850");
    expect(VILLAGE_MANSIONS.KIRI).toBe("1523374733448577024");
  });

  it("registers combat NPC templates and AI personas", () => {
    expect(getNpc("yuki_heir_hakuo")?.hpMax).toBeGreaterThan(230);
    expect(getNpc("yuki_ice_clone")?.hpMax).toBeGreaterThan(80);
    expect(getNpc("yuki_mirror_hostage")?.image).toBe("npcs/mirror-hostage.png");
    expect(getNpc("yuki_mirror_hostage")?.abilityIds).toEqual([]);

    expect(getPersona("yuki_mission_clerk")).toBeDefined();
    expect(getPersona("yuki_suna_glass_vendor")).toBeDefined();
    expect(getPersona("yuki_kiri_mirror_seller")).toBeDefined();
    expect(getPersona("yuki_suna_plaza_guard")).toBeDefined();
    expect(getPersona("yuki_konoha_courier")).toBeDefined();
    expect(getPersona("yuki_heir_hakuo")).toBeDefined();
  });
});
