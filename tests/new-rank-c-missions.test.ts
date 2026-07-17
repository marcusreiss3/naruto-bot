import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("new rank C missions", () => {
  it("registers the market fire mission with emergency and combat objectives", () => {
    const mission = getMission("incendio_barracas");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("MARKET_FIRE");
    expect(mission?.data?.thugTemplate).toBe("market_fire_thug");
    expect(mission?.data?.bossTemplate).toBe("market_arsonist");
    const ids = mission?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("evacuar_barracas");
    expect(ids).toContain("identificar_selo_explosivo");
    expect(ids).toContain("derrotar_incendiario");
  });

  it("registers the nukenin hunt mission across investigation, tracking and capture", () => {
    const mission = getMission("cacada_nukenin_menor");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("NUKENIN_HUNT");
    expect(mission?.data?.scoutTemplate).toBe("nukenin_scout");
    expect(mission?.data?.bossTemplate).toBe("minor_nukenin");
    const ids = mission?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("interrogar_informante");
    expect(ids).toContain("desarmar_armadilha_nukenin");
    expect(ids).toContain("derrotar_nukenin");
  });

  it("registers NPC templates and personas for both missions", () => {
    expect(getNpc("market_fire_thug")?.hpMax).toBe(68);
    expect(getNpc("market_arsonist")?.hpMax).toBeGreaterThan(150);
    expect(getNpc("nukenin_scout")?.hpMax).toBe(74);
    expect(getNpc("minor_nukenin")?.hpMax).toBeGreaterThan(180);
    expect(getPersona("market_fire_sayuri")).toBeDefined();
    expect(getPersona("market_arsonist")).toBeDefined();
    expect(getPersona("nukenin_clerk_konoha")).toBeDefined();
    expect(getPersona("nukenin_informant")).toBeDefined();
    expect(getPersona("minor_nukenin")).toBeDefined();
  });

  it("registers the river smuggling mission with river investigation and combat", () => {
    const mission = getMission("contrabando_no_rio");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("RIVER_SMUGGLING");
    expect(mission?.data?.smugglerTemplate).toBe("river_smuggler");
    expect(mission?.data?.captainTemplate).toBe("river_smuggler_captain");
    const ids = mission?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("identificar_barco_falso");
    expect(ids).toContain("atravessar_sem_armadilha");
    expect(ids).toContain("derrotar_contrabandistas");
  });

  it("registers river smuggling NPC templates and personas", () => {
    expect(getNpc("river_smuggler")?.hpMax).toBe(76);
    expect(getNpc("river_smuggler_captain")?.hpMax).toBeGreaterThan(180);
    expect(getPersona("river_smuggling_clerk")).toBeDefined();
    expect(getPersona("river_boatman")).toBeDefined();
    expect(getPersona("river_smuggler_captain")).toBeDefined();
  });

  it("registers the desert ambush mission with route choices and combat", () => {
    const mission = getMission("emboscada_no_deserto");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("DESERT_AMBUSH");
    expect(mission?.data?.raiderTemplate).toBe("desert_raider");
    expect(mission?.data?.captainTemplate).toBe("desert_raider_captain");
    const ids = mission?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("evitar_miragem_deserto");
    expect(ids).toContain("proteger_caravana_dunas");
    expect(ids).toContain("derrotar_saqueadores_deserto");
  });

  it("registers desert ambush NPC templates and personas", () => {
    expect(getNpc("desert_raider")?.hpMax).toBe(78);
    expect(getNpc("desert_raider_captain")?.hpMax).toBeGreaterThan(190);
    expect(getPersona("desert_caravan_master")).toBeDefined();
    expect(getPersona("desert_raider_captain")).toBeDefined();
  });

  it("registers the bandana collector mission with investigation and combat", () => {
    const mission = getMission("colecionador_bandanas");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("BANDANA_COLLECTOR");
    expect(mission?.data?.mercTemplate).toBe("bandana_collector_merc");
    expect(mission?.data?.bossTemplate).toBe("bandana_collector_boss");
    const ids = mission?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("identificar_vendedor_clandestino");
    expect(ids).toContain("seguir_rastro_beco_bandanas");
    expect(ids).toContain("derrotar_colecionador");
  });

  it("registers bandana collector NPC templates and personas", () => {
    expect(getNpc("bandana_collector_merc")?.hpMax).toBe(74);
    expect(getNpc("bandana_collector_boss")?.hpMax).toBeGreaterThan(180);
    expect(getPersona("bandana_collector_clerk")).toBeDefined();
    expect(getPersona("bandana_black_market_vendor")).toBeDefined();
    expect(getPersona("bandana_collector_boss")).toBeDefined();
  });
});
