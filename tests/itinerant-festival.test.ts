import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { ROTA_COMERCIAL_KONOHA_CHANNEL_ID } from "../src/data/scenarios/index.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("itinerant festival protection mission", () => {
  it("registers a reusable rank C route mission for Konoha", () => {
    const mission = getMission("protecao_festival_itinerante");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("ITINERANT_FESTIVAL_GUARD");
    expect(mission?.channelId).toBe(ROTA_COMERCIAL_KONOHA_CHANNEL_ID);
    expect(mission?.data?.variantId).toBe("KONOHA");
    expect(mission?.data?.raiderTemplate).toBe("festival_route_raider");
    expect(mission?.data?.leaderTemplate).toBe("festival_route_raider_leader");
  });

  it("tracks investigation, accusation, travel and combat objectives", () => {
    const ids = getMission("protecao_festival_itinerante")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("receber_pedido_trupe");
    expect(ids).toContain("ouvir_taro_tamborista");
    expect(ids).toContain("identificar_sabotador");
    expect(ids).toContain("chegar_destino_trupe");
    expect(ids).toContain("confrontar_assaltantes");
    expect(ids).toContain("derrotar_assaltantes");
    expect(ids).toContain("entregar_relatorio_trupe");
  });

  it("registers route enemies and troupe personas", () => {
    const raider = getNpc("festival_route_raider");
    const leader = getNpc("festival_route_raider_leader");
    expect(raider?.hpMax).toBeGreaterThan(70);
    expect(leader?.hpMax).toBeGreaterThan(raider?.hpMax ?? 0);
    expect(getPersona("itinerant_festival_leader_konoha")).toBeDefined();
    expect(getPersona("itinerant_festival_drummer_konoha")).toBeDefined();
    expect(getPersona("itinerant_festival_puppeteer_konoha")).toBeDefined();
    expect(getPersona("itinerant_festival_vendor_konoha")).toBeDefined();
    expect(getPersona("itinerant_festival_raider_konoha")).toBeDefined();
  });
});
