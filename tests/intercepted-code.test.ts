import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("intercepted code mission", () => {
  it("registers a reusable rank C cryptography mission with Konoha as a variant", () => {
    const mission = getMission("mensagem_criptografada_interceptada");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("INTERCEPTED_CODE");
    expect(mission?.data?.variantId).toBe("KONOHA");
    expect(mission?.data?.gruntTemplate).toBe("cipher_criminal");
    expect(mission?.data?.leaderTemplate).toBe("cipher_criminal_leader");
  });

  it("tracks deciphering, investigation and final combat objectives", () => {
    const ids = getMission("mensagem_criptografada_interceptada")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("decifrar_mensagem");
    expect(ids).toContain("encontrar_contato_beco");
    expect(ids).toContain("descobrir_local_encontro");
    expect(ids).toContain("derrotar_criminosos_codigo");
    expect(ids).toContain("entregar_relatorio_codigo");
  });

  it("registers criminals and cryptography personas", () => {
    const grunt = getNpc("cipher_criminal");
    const leader = getNpc("cipher_criminal_leader");
    expect(grunt?.hpMax).toBeGreaterThan(60);
    expect(leader?.hpMax).toBeGreaterThan(grunt?.hpMax ?? 0);
    expect(getPersona("intercepted_code_cryptanalyst_konoha")).toBeDefined();
    expect(getPersona("intercepted_code_contact_konoha")).toBeDefined();
    expect(getPersona("intercepted_code_leader_konoha")).toBeDefined();
  });
});
