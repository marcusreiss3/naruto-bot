import { describe, expect, it } from "vitest";
import { allNodes } from "../src/data/element-trees/index.js";

// Ícones ficaram no mesmo lugar (pasta yuki/) mesmo depois da migração pra
// kekkei genkai — só o id do nó (yuki_* -> gelo_*) e o gate (clanId ->
// element) mudaram, ver tests/gelo.test.ts.
describe("Gelo: ícones", () => {
  it("atribui uma arte própria a cada nó da árvore", () => {
    const nodes = allNodes().filter((node) => node.element === "GELO");
    expect(nodes).toHaveLength(9);
    for (const node of nodes) {
      expect(node.img, node.id).toMatch(/^\/assets\/icons\/yuki\/[a-z-]+\.png$/);
    }
  });
});
