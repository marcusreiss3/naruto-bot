import { describe, expect, it } from "vitest";
import { MessageFlags } from "discord.js";
import { missionNotice, missionNoticePayload } from "../src/ui/mission-notice-v2.js";

describe("avisos de missão em Components V2", () => {
  const input = {
    kind: "investigacao" as const,
    title: "Quatro cenas foram identificadas",
    description: "Analise cada local antes de formular uma tese.",
    itemsTitle: "Locais da investigação",
    items: ["<#1> — vidro", "<#2> — mensagem", "<#3> — fonte", "<#4> — carga"],
    footer: "Use /mapa para abrir a pista.",
  };

  it("gera somente um container, sem embed ou content", () => {
    const payload = missionNoticePayload(input);
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("embeds");
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]?.toJSON().type).toBe(17);
  });

  it("mantém destinos em linhas separadas e dentro do limite do Discord", () => {
    const [container] = missionNotice(input).map((component) => component.toJSON());
    const serialized = JSON.stringify(container);
    expect(serialized).toContain("Locais da investigação");
    expect(serialized).toContain("<#1> — vidro");
    expect(container && "components" in container ? container.components.length : 0).toBeLessThanOrEqual(10);
  });
});
