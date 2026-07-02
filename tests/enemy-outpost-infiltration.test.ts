import { describe, expect, it } from "vitest";
import { getMission } from "../src/data/missions/index.js";
import { getNpc } from "../src/data/npcs.js";
import {
  CAMPO_ABERTO_CHANNEL_ID,
  getScenarioByChannel,
  getScenarioById,
} from "../src/data/scenarios/index.js";

describe("enemy outpost infiltration mission", () => {
  it("registers a rank B combat-only mission on the open field channel", () => {
    const mission = getMission("infiltracao_posto_inimigo");

    expect(mission?.rank).toBe("B");
    expect(mission?.type).toBe("ENEMY_OUTPOST_INFILTRATION");
    expect(mission?.channelId).toBe(CAMPO_ABERTO_CHANNEL_ID);
    expect(mission?.data?.outpostScenarioId).toBe("posto_inimigo");
    expect(mission?.data?.guardTemplate).toBe("enemy_outpost_guard");
    expect(mission?.data?.commanderTemplate).toBe("enemy_outpost_commander");
  });

  it("keeps the normal open field map separate from the mission outpost map", () => {
    const normal = getScenarioByChannel(CAMPO_ABERTO_CHANNEL_ID);
    const outpost = getScenarioById("posto_inimigo");

    expect(normal?.id).toBe("campo_aberto");
    expect(normal?.image).toBe("open-field.png");
    expect(outpost?.channelId).toBe("mission:posto_inimigo");
    expect(outpost?.image).toBe("enemy-outpost.png");
  });

  it("registers rank B outpost enemies", () => {
    const guard = getNpc("enemy_outpost_guard");
    const commander = getNpc("enemy_outpost_commander");

    expect(guard?.hpMax).toBe(125);
    expect(commander?.hpMax).toBeGreaterThan(guard?.hpMax ?? 0);
    expect(commander?.abilityIds).toContain("katon_goukakyuu");
  });
});
