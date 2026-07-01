import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { ROTA_COMERCIAL_KONOHA_CHANNEL_ID } from "../src/data/scenarios/index.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("damaged bridge mission", () => {
  it("registers a rank C mission on the commercial route", () => {
    const mission = getMission("ponte_danificada");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("DAMAGED_BRIDGE");
    expect(mission?.channelId).toBe(ROTA_COMERCIAL_KONOHA_CHANNEL_ID);
    expect(mission?.data?.variantId).toBe("KONOHA");
    expect(mission?.data?.gruntTemplate).toBe("bridge_saboteur");
    expect(mission?.data?.leaderTemplate).toBe("bridge_saboteur_leader");
  });

  it("tracks repair, civilian crossing and combat objectives", () => {
    const ids = getMission("ponte_danificada")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("reforcar_corda_norte");
    expect(ids).toContain("trocar_prancha_central");
    expect(ids).toContain("reforcar_ponte");
    expect(ids).toContain("atravessar_criancas_ponte");
    expect(ids).toContain("atravessar_civis_ponte");
    expect(ids).toContain("confrontar_sabotadores");
    expect(ids).toContain("derrotar_sabotadores_ponte");
    expect(ids).toContain("entregar_relatorio_ponte");
  });

  it("registers bridge enemies and personas", () => {
    const grunt = getNpc("bridge_saboteur");
    const leader = getNpc("bridge_saboteur_leader");
    expect(grunt?.hpMax).toBeGreaterThan(70);
    expect(leader?.hpMax).toBeGreaterThan(grunt?.hpMax ?? 0);
    expect(getPersona("damaged_bridge_foreman_konoha")).toBeDefined();
    expect(getPersona("damaged_bridge_saboteur_konoha")).toBeDefined();
  });
});
