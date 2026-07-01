import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import { CAVERNA_CHANNEL_ID, getScenarioByChannel } from "../src/data/scenarios/index.js";
import { getPersona } from "../src/services/npc-ai/personas.js";

describe("cave rescue mission", () => {
  it("registers the cave scenario and reusable rank C mission", () => {
    const scenario = getScenarioByChannel(CAVERNA_CHANNEL_ID);
    const mission = getMission("resgate_mina_caverna");
    expect(scenario?.id).toBe("caverna");
    expect(scenario?.image).toBe("cave.png");
    expect(mission?.rank).toBe("C");
    expect(mission?.type).toBe("CAVE_RESCUE");
    expect(mission?.data?.variantId).toBe("KONOHA");
  });

  it("tracks cooperative opening, survivor talk and combat objectives", () => {
    const ids = getMission("resgate_mina_caverna")?.objectives.map((objective) => objective.id) ?? [];
    expect(ids).toContain("escorar_entrada_esquerda");
    expect(ids).toContain("fixar_corda_tracao");
    expect(ids).toContain("abrir_entrada_caverna");
    expect(ids).toContain("falar_sobrevivente");
    expect(ids).toContain("derrotar_bandidos_caverna");
  });

  it("registers cave enemies and personas", () => {
    const bandit = getNpc("cave_bandit");
    const leader = getNpc("cave_bandit_leader");
    expect(bandit?.hpMax).toBeGreaterThan(70);
    expect(leader?.hpMax).toBeGreaterThan(bandit?.hpMax ?? 0);
    expect(getPersona("cave_rescue_clerk_konoha")).toBeDefined();
    expect(getPersona("cave_rescue_survivor_konoha")).toBeDefined();
    expect(getPersona("cave_rescue_leader_konoha")).toBeDefined();
  });
});
