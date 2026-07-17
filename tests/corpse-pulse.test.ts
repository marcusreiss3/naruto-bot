import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("Corpse pulse rank B mission", () => {
  it("registers the Konoha investigation route", () => {
    const mission = getMission("pulso_do_cadaver");
    expect(mission?.rank).toBe("B");
    expect(mission?.type).toBe("CORPSE_PULSE");
    expect(mission?.channelId).toBe("1516825458765987980");
    expect(mission?.data?.clueChannels).toMatchObject({
      hospital: "1516825458765987980",
      market: "1516183249712582657",
      alley: "1516452197976772679",
    });
    expect(mission?.data?.bossTemplate).toBe("corpse_doctor_metsu");
    expect(mission?.data?.puppetTemplate).toBe("corpse_puppet");
  });

  it("has investigation and combat objectives", () => {
    const ids = getMission("pulso_do_cadaver")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("investigar_corpo_suspenso");
    expect(ids).toContain("investigar_compra_suspeita");
    expect(ids).toContain("investigar_rastro_beco");
    expect(ids).toContain("derrotar_medico_renegado");
    expect(ids).toContain("estabilizar_vitima_cadaver");
  });

  it("registers NPC templates and personas", () => {
    expect(getNpc("corpse_doctor_metsu")?.hpMax).toBeGreaterThan(250);
    expect(getNpc("corpse_puppet")?.hpMax).toBeGreaterThan(100);
    expect(getPersona("corpse_medical_clerk")).toBeDefined();
    expect(getPersona("corpse_market_herbalist")).toBeDefined();
    expect(getPersona("corpse_alley_witness")).toBeDefined();
    expect(getPersona("corpse_doctor_metsu")).toBeDefined();
  });
});
