import { describe, expect, it } from "vitest";
import { investigationPanel, type InvestigationPanelInput } from "../src/ui/mission-investigation-v2.js";

function input(overrides: Partial<InvestigationPanelInput> = {}): InvestigationPanelInput {
  return {
    prefix: "invest",
    instanceId: "instance",
    clueId: "scene",
    title: "Cena de teste",
    intro: "Introdução da cena.",
    actions: [1, 2, 3, 4].map((number) => ({ id: `p${number}`, label: `Pista ${number}`, detail: `Detalhe ${number}` })),
    deductions: [1, 2, 3, 4].map((number) => ({ id: `t${number}`, label: `Tese ${number}` })),
    question: "Qual é a tese?",
    evidence: [],
    lostEvidence: [],
    evidenceUsers: {},
    attemptUsers: {},
    failedAttempts: {},
    contributors: {},
    votes: {},
    voters: {},
    members: ["a", "b", "c"],
    completedCases: 0,
    totalCases: 4,
    mistakes: 0,
    maxMistakes: 3,
    ready: false,
    consensus: null,
    page: 0,
    ...overrides,
  };
}

describe("painel paginado das investigações Rank B", () => {
  it.each([
    input(),
    input({ page: 4 }),
    input({ page: 4, evidence: ["p1", "p2", "p3", "p4"], ready: true, result: "Tese atualizada." }),
  ])("respeita o limite de dez componentes internos do container", (panelInput) => {
    const [container] = investigationPanel(panelInput).map((component) => component.toJSON());
    expect(container?.type).toBe(17);
    expect(container && "components" in container ? container.components.length : 0).toBeLessThanOrEqual(10);
  });

  it("gera uma página para cada pista e outra para a tese", () => {
    const [container] = investigationPanel(input()).map((component) => component.toJSON());
    const rows = container && "components" in container
      ? container.components.filter((component) => component.type === 1)
      : [];
    const navigation = rows[0];
    expect(navigation && "components" in navigation ? navigation.components : []).toHaveLength(5);
  });

  it.each(["prepare", "memorize", "repeat"] as const)("renderiza a fase %s do minigame dentro dos limites do Discord", (phase) => {
    const memory = {
      ownerId: "a",
      actionId: "p1",
      phase,
      words: ["Selo", "Sangue", "Chakra", "Pulso", "Veia"],
      sequence: [3, 0, 4, 2, 1],
      position: phase === "repeat" ? 2 : 0,
      countdown: 3,
      displayPosition: 0,
    };
    const [container] = investigationPanel(input({ memory })).map((component) => component.toJSON());
    expect(container && "components" in container ? container.components.length : 0).toBeLessThanOrEqual(10);
    const rows = container && "components" in container
      ? container.components.filter((component) => component.type === 1)
      : [];
    if (phase === "repeat") {
      const wordButtons = rows.at(-1);
      expect(wordButtons && "components" in wordButtons ? wordButtons.components : []).toHaveLength(5);
    }
  });

  it("mostra somente a palavra atual durante a memorização", () => {
    const memory = {
      ownerId: "a",
      actionId: "p1",
      phase: "memorize" as const,
      words: ["Selo", "Sangue", "Chakra", "Pulso", "Veia"],
      sequence: [3, 0, 4, 2, 1],
      position: 0,
      displayPosition: 0,
    };
    const serialized = JSON.stringify(investigationPanel(input({ memory })).map((component) => component.toJSON()));
    expect(serialized).toContain("Pulso");
    expect(serialized).not.toContain("Selo");
    expect(serialized).not.toContain("Sangue");
    expect(serialized).not.toContain("Chakra");
    expect(serialized).not.toContain("Veia");
  });

  it("marca uma pista perdida sem revelar seus detalhes", () => {
    const serialized = JSON.stringify(investigationPanel(input({ lostEvidence: ["p1"], attemptUsers: { p1: "a" } })).map((component) => component.toJSON()));
    expect(serialized).toContain("Pista perdida");
    expect(serialized).not.toContain("Detalhe 1");
  });

  it("avisa quando resta somente a segunda tentativa", () => {
    const serialized = JSON.stringify(investigationPanel(input({ failedAttempts: { p1: 1 } })).map((component) => component.toJSON()));
    expect(serialized).toContain("Resta uma última tentativa");
    expect(serialized).toContain("Tentar novamente");
  });
});
