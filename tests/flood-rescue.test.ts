import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { RIO_CHANNEL_ID } from "../src/data/scenarios/index.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("flood rescue mission", () => {
  it("registers a rank C mission on the river scenario", () => {
    const mission = getMission("resgate_rio_enchente");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("FLOOD_RESCUE");
    expect(mission?.channelId).toBe(RIO_CHANNEL_ID);
    expect(mission?.data?.variantId).toBe("KONOHA");
    expect(mission?.data?.gruntTemplate).toBe("river_bandit");
    expect(mission?.data?.leaderTemplate).toBe("river_bandit_leader");
  });

  it("tracks rope setup, rescue priority and combat objectives", () => {
    const ids = getMission("resgate_rio_enchente")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("ancorar_linha_resgate");
    expect(ids).toContain("preparar_boias");
    expect(ids).toContain("montar_linha_resgate");
    expect(ids).toContain("resgatar_crianca_tronco");
    expect(ids).toContain("resgatar_civis_enchente");
    expect(ids).toContain("confrontar_bandidos_rio");
    expect(ids).toContain("derrotar_bandidos_rio");
    expect(ids).toContain("entregar_relatorio_enchente");
  });

  it("registers river enemies and personas", () => {
    const grunt = getNpc("river_bandit");
    const leader = getNpc("river_bandit_leader");
    expect(grunt?.hpMax).toBeGreaterThan(70);
    expect(leader?.hpMax).toBeGreaterThan(grunt?.hpMax ?? 0);
    expect(getPersona("flood_rescue_rescuer_konoha")).toBeDefined();
    expect(getPersona("flood_rescue_bandit_konoha")).toBeDefined();
  });
});
