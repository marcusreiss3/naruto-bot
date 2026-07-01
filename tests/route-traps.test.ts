import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { ROTA_COMERCIAL_KONOHA_CHANNEL_ID } from "../src/data/scenarios/index.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("route traps mission", () => {
  it("registers a rank C mission on Konoha commercial route", () => {
    const mission = getMission("armadilha_rota_comercial");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("ROUTE_TRAPS");
    expect(mission?.channelId).toBe(ROTA_COMERCIAL_KONOHA_CHANNEL_ID);
    expect(mission?.data?.variantId).toBe("KONOHA");
    expect(mission?.data?.maxMistakes).toBe(3);
  });

  it("tracks trap disarm and civilian escort objectives", () => {
    const ids = getMission("armadilha_rota_comercial")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("desarmar_fio_disparo");
    expect(ids).toContain("desarmar_selo_explosivo");
    expect(ids).toContain("marcar_fosso_coberto");
    expect(ids).toContain("atravessar_criancas");
    expect(ids).toContain("atravessar_carroca");
    expect(ids).toContain("atravessar_idosos");
    expect(ids).toContain("entregar_relatorio_rota");
  });

  it("registers the route patrol persona", () => {
    expect(getPersona("route_traps_captain_konoha")).toBeDefined();
  });
});
