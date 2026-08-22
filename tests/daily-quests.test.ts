import { describe, expect, it } from "vitest";
import {
  DAILY_QUESTS,
  DAILY_QUEST_PER_DAY,
  getDailyQuestDay,
  selectDailyQuests,
} from "../src/services/daily-quests/daily-quest-service.js";

describe("missões diárias de atividade", () => {
  it("usa a virada de dia do horário de Brasília", () => {
    expect(getDailyQuestDay(new Date("2026-08-22T02:59:59.999Z"))).toBe("2026-08-21");
    expect(getDailyQuestDay(new Date("2026-08-22T03:00:00.000Z"))).toBe("2026-08-22");
  });

  it("sorteia exatamente três missões sem repetir", () => {
    const rotation = selectDailyQuests(() => 0.42);
    expect(rotation).toHaveLength(DAILY_QUEST_PER_DAY);
    expect(new Set(rotation.map((quest) => quest.id)).size).toBe(DAILY_QUEST_PER_DAY);
    expect(rotation.every((quest) => DAILY_QUESTS.includes(quest))).toBe(true);
  });

  it("tem variantes reais para craft, coleta e compra", () => {
    expect(DAILY_QUESTS.filter((quest) => quest.kind === "CRAFT")).toHaveLength(4);
    expect(DAILY_QUESTS.filter((quest) => quest.kind === "GATHER")).toHaveLength(5);
    expect(DAILY_QUESTS.filter((quest) => quest.kind === "SHOP")).toHaveLength(4);
  });
});
