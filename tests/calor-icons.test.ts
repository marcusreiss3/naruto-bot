import { describe, expect, it } from "vitest";
import { allNodes } from "../src/data/element-trees/index.js";

describe("Calor: ícones", () => {
  it("atribui uma arte própria a cada nó da árvore", () => {
    const nodes = allNodes().filter((node) => node.element === "CALOR");
    expect(nodes).toHaveLength(8);
    for (const node of nodes) {
      expect(node.img, node.id).toMatch(/^\/assets\/icons\/calor\/[a-z-]+\.png$/);
    }
  });
});
