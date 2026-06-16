import { describe, it, expect } from "vitest";
import { NpcAiService } from "../src/services/npc-ai/npc-ai-service.js";

describe("NPC AI (fallback sem Groq)", () => {
  it("usa fallback local quando não há GROQ_API_KEY", async () => {
    const r = await NpcAiService.respond({ personaKey: "bandit_leader", playerMessage: "oi", turn: 0 });
    expect(r.source).toBe("fallback");
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.forceCombat).toBe(false);
  });

  it("força combate após 3 trocas (interação curta antes do combate)", async () => {
    const r = await NpcAiService.respond({ personaKey: "bandit_leader", playerMessage: "blá", turn: 2 });
    expect(r.forceCombat).toBe(true);
  });
});
