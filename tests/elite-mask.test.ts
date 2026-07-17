import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("Elite mask rank B mission", () => {
  it("registers the Konoha route", () => {
    const mission = getMission("mascara_de_cinzas");
    expect(mission?.rank).toBe("B");
    expect(mission?.type).toBe("ELITE_MASK");
    expect(mission?.channelId).toBe("1516470677962494084");
    expect(mission?.data).toMatchObject({
      mansionChannelId: "1516470677962494084",
      alleyChannelId: "1516452197976772679",
      marketChannelId: "1516183249712582657",
      hospitalChannelId: "1516825458765987980",
      routeChannelId: "1516425270481915995",
      bossTemplate: "elite_mask_boss",
      cloneTemplate: "elite_mask_clone",
    });
  });

  it("has dialogue, ambush and final report objectives", () => {
    const ids = getMission("mascara_de_cinzas")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("receber_dossie_mascara");
    expect(ids).toContain("ouvir_testemunha_beco");
    expect(ids).toContain("derrotar_silenciador_beco");
    expect(ids).toContain("proteger_enfermeira_hospital");
    expect(ids).toContain("derrotar_executor_rota");
    expect(ids).toContain("capturar_ninja_elite");
    expect(ids).toContain("entregar_relatorio_mascara");
  });

  it("registers NPC templates and personas", () => {
    expect(getNpc("elite_mask_silencer")?.hpMax).toBeGreaterThan(100);
    expect(getNpc("elite_mask_executor")?.hpMax).toBeGreaterThan(200);
    expect(getNpc("elite_mask_boss")?.hpMax).toBeGreaterThan(300);
    expect(getPersona("elite_mask_clerk")).toBeDefined();
    expect(getPersona("elite_mask_alley_witness")).toBeDefined();
    expect(getPersona("elite_mask_market_vendor")).toBeDefined();
    expect(getPersona("elite_mask_hospital_nurse")).toBeDefined();
    expect(getPersona("elite_mask_route_scout")).toBeDefined();
    expect(getPersona("elite_mask_boss")).toBeDefined();
  });
});
