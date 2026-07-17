import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("Forbidden bell rank B mission", () => {
  it("registers the Konoha and crypt route", () => {
    const mission = getMission("sino_que_nao_deve_tocar");
    expect(mission?.rank).toBe("B");
    expect(mission?.type).toBe("FORBIDDEN_BELL");
    expect(mission?.channelId).toBe("1516470677962494084");
    expect(mission?.data).toMatchObject({
      mansionChannelId: "1516470677962494084",
      marketChannelId: "1516183249712582657",
      hospitalChannelId: "1516825458765987980",
      routeChannelId: "1516425270481915995",
      finalChannelId: "1521879431168131132",
      bossTemplate: "forbidden_bell_reika",
      weakenedBossTemplate: "forbidden_bell_reika_weakened",
    });
  });

  it("has memory fragment and final combat objectives", () => {
    const ids = getMission("sino_que_nao_deve_tocar")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("receber_dossie_sino");
    expect(ids).toContain("ouvir_sacristao");
    expect(ids).toContain("derrotar_agente_sino");
    expect(ids).toContain("ouvir_escriva_memoria");
    expect(ids).toContain("ouvir_guarda_ferido");
    expect(ids).toContain("reunir_fragmentos_memoria");
    expect(ids).toContain("derrotar_reika");
    expect(ids).toContain("entregar_relatorio_sino");
  });

  it("registers NPC templates and personas", () => {
    expect(getNpc("forbidden_bell_echo")?.hpMax).toBeGreaterThan(90);
    expect(getNpc("forbidden_bell_memory_wiper")?.attributes.genjutsu).toBeGreaterThan(14);
    expect(getNpc("forbidden_bell_reika")?.hpMax).toBeGreaterThan(300);
    expect(getNpc("forbidden_bell_reika_weakened")?.hpMax).toBeLessThan(getNpc("forbidden_bell_reika")?.hpMax ?? 0);
    expect(getPersona("forbidden_bell_clerk")).toBeDefined();
    expect(getPersona("forbidden_bell_sacristan")).toBeDefined();
    expect(getPersona("forbidden_bell_scribe")).toBeDefined();
    expect(getPersona("forbidden_bell_guard")).toBeDefined();
    expect(getPersona("forbidden_bell_reika")).toBeDefined();
  });
});
