import { describe, expect, it } from "vitest";
import { LEVEL_CARD_COORDINATES, renderLevelCard } from "../src/ui/level-card.js";

describe("card de nível", () => {
  it("mantém as coordenadas de texto e preenchimento dentro da arte", () => {
    const { canvas, name, xpText, xpTrack, xpFill } = LEVEL_CARD_COORDINATES;
    expect(name.x).toBeGreaterThanOrEqual(0);
    expect(xpText.x).toBeLessThanOrEqual(canvas.width);
    expect(xpTrack.x + xpTrack.width).toBeLessThanOrEqual(canvas.width);
    expect(xpFill.x + xpFill.width).toBeLessThanOrEqual(canvas.width);
    expect(xpFill.y + xpFill.height).toBeLessThanOrEqual(canvas.height);
  });

  it("renderiza XP e nível como PNG", async () => {
    const image = await renderLevelCard({ name: "Naruto Uzumaki", level: 12, xp: 345, xpRequired: 1_040 });
    expect(image.subarray(1, 4).toString()).toBe("PNG");
  });
});
