import { describe, expect, it } from "vitest";
import {
  canUncoverClue,
  createMemorySequence,
  evaluateMemoryChoice,
  investigationClueQuota,
  MEMORY_MAX_ATTEMPTS,
  MEMORY_PREPARE_SECONDS,
  MEMORY_WORD_DISPLAY_MS,
  rankBInvestigationMembers,
} from "../src/services/missions/investigation-party.js";

describe("distribuição de pistas nas investigações Rank B", () => {
  it("limita a equipe da missão a quatro ninjas sem duplicatas", () => {
    expect(rankBInvestigationMembers(["a", "b", "a", "c", "d", "e"])).toEqual(["a", "b", "c", "d"]);
  });

  it("calcula quantas das quatro pistas cada tamanho de party pode assumir", () => {
    expect(investigationClueQuota(4, 1)).toBe(4);
    expect(investigationClueQuota(4, 2)).toBe(2);
    expect(investigationClueQuota(4, 3)).toBe(2);
    expect(investigationClueQuota(4, 4)).toBe(1);
  });

  it("deixa o ninja solo desvendar as quatro pistas", () => {
    expect(canUncoverClue("a", ["a"], { p1: "a", p2: "a", p3: "a" }, 4)).toEqual({ ok: true });
    expect(canUncoverClue("a", ["a"], { p1: "a", p2: "a", p3: "a", p4: "a" }, 4).ok).toBe(false);
  });

  it("com dois ninjas, exige a vez do parceiro antes da segunda pista", () => {
    const members = ["a", "b"];
    expect(canUncoverClue("a", members, { p1: "a" }, 4).ok).toBe(false);
    expect(canUncoverClue("b", members, { p1: "a" }, 4)).toEqual({ ok: true });
    expect(canUncoverClue("a", members, { p1: "a", p2: "b" }, 4)).toEqual({ ok: true });
  });

  it("com três ninjas, libera a quarta pista para qualquer um após todos participarem", () => {
    const members = ["a", "b", "c"];
    const firstRound = { p1: "a", p2: "b", p3: "c" };
    expect(canUncoverClue("a", members, firstRound, 4)).toEqual({ ok: true });
    expect(canUncoverClue("b", members, firstRound, 4)).toEqual({ ok: true });
    expect(canUncoverClue("c", members, firstRound, 4)).toEqual({ ok: true });
  });

  it("recusa quem não pertence à party da missão", () => {
    expect(canUncoverClue("intruso", ["a", "b"], {}, 4).ok).toBe(false);
  });

  it("cria uma sequência com os cinco termos, sem repetir nenhum", () => {
    const sequence = createMemorySequence(5, () => 0);
    expect(sequence).toHaveLength(5);
    expect([...sequence].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("diferencia erro, acerto intermediário e sequência completa", () => {
    const sequence = [2, 0, 1];
    expect(evaluateMemoryChoice(sequence, 0, 1)).toBe("wrong");
    expect(evaluateMemoryChoice(sequence, 0, 2)).toBe("next");
    expect(evaluateMemoryChoice(sequence, 2, 1)).toBe("complete");
  });

  it("mantém o ritmo configurado do minigame", () => {
    expect(MEMORY_MAX_ATTEMPTS).toBe(2);
    expect(MEMORY_PREPARE_SECONDS).toBe(3);
    expect(MEMORY_WORD_DISPLAY_MS).toBe(1_500);
  });
});
