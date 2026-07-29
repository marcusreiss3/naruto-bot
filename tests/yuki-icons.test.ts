import { describe, expect, it } from "vitest";
import { allNodes } from "../src/data/element-trees/index.js";

describe("Yuki: ícones", () => {
  it("atribui uma arte própria a cada nó da árvore", () => {
    const nodes = allNodes().filter((node) => node.clanId === "yuki");
    expect(nodes).toHaveLength(9);
    for (const node of nodes) {
      expect(node.img, node.id).toMatch(/^\/assets\/icons\/yuki\/[a-z-]+\.png$/);
    }
  });
});
