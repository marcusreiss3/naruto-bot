import { describe, expect, it } from "vitest";
import { allNodes } from "../src/data/element-trees/index.js";

// A arte ficou na pasta gelo/ depois da migração pra kekkei genkai — a pasta
// yuki/ passou a guardar os ícones do clã Yuki reconstruído, que é outra
// árvore (ver clan-trees/index.ts). Ver tests/gelo.test.ts pro resto.
describe("Gelo: ícones", () => {
  it("atribui uma arte própria a cada nó da árvore", () => {
    const nodes = allNodes().filter((node) => node.element === "GELO");
    expect(nodes).toHaveLength(14);
    for (const node of nodes) {
      expect(node.img, node.id).toMatch(/^\/assets\/icons\/gelo\/[a-z-]+\.png$/);
    }
  });

  it("nenhum nó reaproveita a arte de outro", () => {
    const arts = allNodes().filter((node) => node.element === "GELO").map((node) => node.img);
    expect(new Set(arts).size).toBe(arts.length);
  });
});
