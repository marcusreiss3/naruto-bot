import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { HOSPITAL_KONOHA_CHANNEL_ID } from "../src/data/scenarios/index.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("hospital theft mission", () => {
  it("registers a rank C mission on Konoha hospital", () => {
    const mission = getMission("roubo_no_hospital");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("HOSPITAL_THEFT");
    expect(mission?.channelId).toBe(HOSPITAL_KONOHA_CHANNEL_ID);
    expect(mission?.data?.variantId).toBe("KONOHA");
  });

  it("tracks witness, evidence and all moral endings", () => {
    const ids = getMission("roubo_no_hospital")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("ouvir_enfermeira");
    expect(ids).toContain("ouvir_paciente");
    expect(ids).toContain("pista_bandagem_sangue");
    expect(ids).toContain("pista_janela_deposito");
    expect(ids).toContain("pista_registro_remedios");
    expect(ids).toContain("decidir_destino_riku");
    expect(ids).toContain("recuperar_remedios");
  });

  it("registers the hospital personas", () => {
    expect(getPersona("hospital_theft_doctor_konoha")).toBeDefined();
    expect(getPersona("hospital_theft_nurse_konoha")).toBeDefined();
    expect(getPersona("hospital_theft_patient_konoha")).toBeDefined();
    expect(getPersona("hospital_theft_injured_ninja_konoha")).toBeDefined();
  });
});
