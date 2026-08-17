import { describe, it, expect } from "vitest";
import { ATTRIBUTES, type Attribute } from "../src/config/enums.js";
import {
  addToDraft,
  attrHasNoEffect,
  clearDraft,
  draftTotal,
  pointsLeft,
  roomFor,
  valueOf,
  type AllocState,
} from "../src/services/characters/attribute-allocator.js";

const state = (pool: number, over: Partial<Record<Attribute, number>> = {}): AllocState => {
  const current = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) current[a] = over[a] ?? 1;
  return { current, pool, draft: {} };
};

describe("distribuicao de pontos", () => {
  it("os 10 atributos existem", () => {
    expect(ATTRIBUTES).toHaveLength(10);
    expect(ATTRIBUTES).toContain("bukijutsu");
    expect(ATTRIBUTES).toContain("iryoNinjutsu");
    expect(ATTRIBUTES).toContain("fuinjutsu");
    expect(ATTRIBUTES).toContain("kugutsu");
    expect(ATTRIBUTES).toContain("senjutsu");
    expect(ATTRIBUTES).toContain("dojutsu");
    expect(ATTRIBUTES).toContain("kenjutsu");
  });

  it("kenjutsu é separado de bukijutsu (espadas x armas em geral)", () => {
    expect(ATTRIBUTES).toContain("bukijutsu");
    expect(ATTRIBUTES).toContain("kenjutsu");
  });

  it("aloca no rascunho e desconta do saldo", () => {
    const s = state(5);
    expect(pointsLeft(s)).toBe(5);
    addToDraft(s, "ninjutsu", 2);
    expect(draftTotal(s.draft)).toBe(2);
    expect(pointsLeft(s)).toBe(3);
    expect(valueOf(s, "ninjutsu")).toBe(3); // 1 de base + 2
  });

  it("nao deixa gastar mais do que tem", () => {
    const s = state(3);
    const aplicado = addToDraft(s, "ninjutsu", 10);
    expect(aplicado).toBe(3);
    expect(pointsLeft(s)).toBe(0);
    // segunda tentativa nao entra nada
    expect(addToDraft(s, "taijutsu", 1)).toBe(0);
    expect(draftTotal(s.draft)).toBe(3);
  });

  it("saldo e compartilhado entre atributos", () => {
    const s = state(4);
    addToDraft(s, "ninjutsu", 3);
    expect(roomFor(s, "taijutsu")).toBe(1);
    addToDraft(s, "taijutsu", 5);
    expect(draftTotal(s.draft)).toBe(4);
    expect(pointsLeft(s)).toBe(0);
  });

  it("acumula no mesmo atributo em vez de sobrescrever", () => {
    const s = state(10);
    addToDraft(s, "ninjutsu", 2);
    addToDraft(s, "ninjutsu", 3);
    expect(s.draft.ninjutsu).toBe(5);
    expect(valueOf(s, "ninjutsu")).toBe(6);
  });

  it("limpar devolve tudo ao saldo", () => {
    const s = state(5);
    addToDraft(s, "ninjutsu", 5);
    expect(pointsLeft(s)).toBe(0);
    clearDraft(s);
    expect(pointsLeft(s)).toBe(5);
    expect(draftTotal(s.draft)).toBe(0);
  });

  it("nao aceita valor negativo", () => {
    const s = state(5);
    expect(addToDraft(s, "ninjutsu", -3)).toBe(0);
    expect(pointsLeft(s)).toBe(5);
  });

  it("saldo zero nao aloca nada", () => {
    const s = state(0);
    expect(addToDraft(s, "ninjutsu", 1)).toBe(0);
    expect(roomFor(s, "ninjutsu")).toBe(0);
  });

  it("marca os atributos que ainda nao tem efeito", () => {
    // Senjutsu ainda não tem consumidor; Kugutsu agora banca a árvore e as
    // habilidades de marionete.
    expect(attrHasNoEffect("kugutsu")).toBe(false);
    expect(attrHasNoEffect("senjutsu")).toBe(false);
    expect(attrHasNoEffect("ninjutsu")).toBe(false);
    expect(attrHasNoEffect("taijutsu")).toBe(false);
    // estes viraram `pool` de nos de arvore de cla — gastar ponto neles
    // compra habilidade, entao nao sao mais "sem efeito"
    expect(attrHasNoEffect("kenjutsu")).toBe(false);
    expect(attrHasNoEffect("dojutsu")).toBe(false);
    expect(attrHasNoEffect("fuinjutsu")).toBe(false);
  });
});
