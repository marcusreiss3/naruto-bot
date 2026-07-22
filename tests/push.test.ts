import { describe, it, expect } from "vitest";
import { resolvePush, impactDamage } from "../src/services/combat/push.js";
import { BALANCE } from "../src/config/balance.js";

const base = {
  rows: 8,
  cols: 8,
  blocked: new Set<string>(),
  occupied: new Set<string>(),
};

describe("empurrão", () => {
  it("empurra na direção origem → alvo", () => {
    const r = resolvePush({ ...base, originCell: "D4", targetCell: "D5", cells: 2 });
    expect(r.destination).toBe("D7");
    expect(r.moved).toBe(2);
    expect(r.hitWall).toBe(false);
  });

  it("para na borda do mapa e marca impacto", () => {
    const r = resolvePush({ ...base, originCell: "D6", targetCell: "D7", cells: 3 });
    expect(r.destination).toBe("D8");
    expect(r.moved).toBe(1);
    expect(r.hitWall).toBe(true);
  });

  it("para antes de obstáculo", () => {
    const r = resolvePush({
      ...base,
      originCell: "D4",
      targetCell: "D5",
      cells: 3,
      blocked: new Set(["D7"]),
    });
    expect(r.destination).toBe("D6");
    expect(r.hitWall).toBe(true);
  });

  it("não atravessa quem está no caminho", () => {
    const r = resolvePush({
      ...base,
      originCell: "D4",
      targetCell: "D5",
      cells: 3,
      occupied: new Set(["D6"]),
    });
    expect(r.moved).toBe(0);
    expect(r.hitWall).toBe(true);
  });

  it("funciona na diagonal", () => {
    const r = resolvePush({ ...base, originCell: "C3", targetCell: "D4", cells: 2 });
    expect(r.destination).toBe("F6");
  });

  it("respeita o teto de casas do balance", () => {
    const r = resolvePush({ ...base, originCell: "A1", targetCell: "A2", cells: 99 });
    expect(r.moved).toBeLessThanOrEqual(BALANCE.push.maxCells);
  });
});

describe("puxão", () => {
  it("puxa o alvo na direção do atacante", () => {
    const r = resolvePush({ ...base, originCell: "D4", targetCell: "D7", cells: -2 });
    expect(r.destination).toBe("D5");
    expect(r.moved).toBe(2);
  });

  it("não passa por cima de quem puxou", () => {
    const r = resolvePush({ ...base, originCell: "D4", targetCell: "D5", cells: -3 });
    expect(r.moved).toBe(0);
    expect(r.hitWall).toBe(true);
  });
});

describe("casos de borda", () => {
  it("deslocamento 0 não move", () => {
    const r = resolvePush({ ...base, originCell: "D4", targetCell: "D5", cells: 0 });
    expect(r.moved).toBe(0);
    expect(r.destination).toBe("D5");
  });

  it("alvo na mesma célula da origem não tem direção", () => {
    const r = resolvePush({ ...base, originCell: "D4", targetCell: "D4", cells: 2 });
    expect(r.moved).toBe(0);
  });
});

describe("dano de impacto", () => {
  it("só sai quando bate em algo", () => {
    const bateu = resolvePush({ ...base, originCell: "D6", targetCell: "D7", cells: 3 });
    expect(impactDamage(bateu, true)).toBe(BALANCE.push.impactDamage);

    const livre = resolvePush({ ...base, originCell: "D4", targetCell: "D5", cells: 1 });
    expect(impactDamage(livre, true)).toBe(0);
  });

  it("sem a passiva, não há dano de impacto", () => {
    const bateu = resolvePush({ ...base, originCell: "D6", targetCell: "D7", cells: 3 });
    expect(impactDamage(bateu, false)).toBe(0);
  });
});
