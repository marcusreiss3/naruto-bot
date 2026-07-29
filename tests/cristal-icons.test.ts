import { describe, expect, it } from "vitest";
import { allNodes } from "../src/data/element-trees/index.js";

describe("Cristal: ícones", () => {
  it("atribui uma arte própria a cada nó da árvore", () => {
    const nodes = allNodes().filter((node) => node.element === "CRISTAL");
    expect(nodes).toHaveLength(15);
    for (const node of nodes) {
      expect(node.img, node.id).toMatch(/^\/assets\/icons\/cristal\/[a-z-]+\.png$/);
    }
  });
});
