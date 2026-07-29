import { describe, expect, it } from "vitest";
import { allNodes } from "../src/data/element-trees/index.js";

describe("Explosão: ícones", () => {
  it("atribui uma arte própria a cada nó da árvore", () => {
    const nodes = allNodes().filter((node) => node.element === "EXPLOSAO");
    expect(nodes).toHaveLength(9);
    for (const node of nodes) {
      expect(node.img, node.id).toMatch(/^\/assets\/icons\/explosao\/[a-z-]+\.png$/);
    }
  });
});
