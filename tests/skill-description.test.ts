import { describe, expect, it } from "vitest";
import { ALL_ABILITIES } from "../src/data/index.js";
import { allNodes, getNode } from "../src/data/element-trees/index.js";
import {
  buildMechanicsSummary,
  buildVisualDescription,
  EFFECT_NAMES,
} from "../src/services/characters/skill-description.js";

describe("resumo uniforme de efeitos e regras", () => {
  it("mostra nome, chance, duracao e acumulos vindos da ability", () => {
    for (const ability of ALL_ABILITIES) {
      const summary = buildMechanicsSummary(ability);
      for (const effect of ability.effects ?? []) {
        expect(summary, `${ability.id}: nome de ${effect.effectId}`).toContain(EFFECT_NAMES[effect.effectId]);
        if ((effect.chance ?? 1) < 1) {
          expect(summary, `${ability.id}: chance de ${effect.effectId}`).toContain(
            `${Math.round(effect.chance! * 100)}%`,
          );
        }
        expect(summary, `${ability.id}: duracao de ${effect.effectId}`).toMatch(
          new RegExp(`${EFFECT_NAMES[effect.effectId]}.* por \\d+ rodada`),
        );
        if (effect.stacks !== undefined) {
          expect(summary, `${ability.id}: quantidade de ${effect.effectId}`).toContain(String(effect.stacks));
        }
      }
    }
  });

  it("mostra as limitacoes especiais importantes", () => {
    for (const ability of ALL_ABILITIES) {
      const summary = buildMechanicsSummary(ability);
      if (ability.unblockable) expect(summary, ability.id).toContain("Inevitável");
      if (ability.undodgeable && !ability.unblockable) expect(summary, ability.id).toContain("Não pode ser esquivado");
      if (ability.unguardable && !ability.unblockable) expect(summary, ability.id).toContain("Bloqueio e Aparo");
      if (ability.oncePerCombat) expect(summary, ability.id).toContain("uma vez por combate");
      if (ability.requiresStorm) expect(summary, ability.id).toContain("tempestade");
      if (ability.requiresPet) expect(summary, ability.id).toContain("invocação");
      if (ability.requiresActiveDoujutsu) expect(summary, ability.id).toContain(ability.requiresActiveDoujutsu.label);
      if (ability.toggleRules) {
        expect(summary, ability.id).toContain(ability.toggleRules.command);
        expect(summary, ability.id).toContain(`${Math.round(ability.toggleRules.dodgeBonus * 100)}%`);
        expect(summary, ability.id).toContain(`${ability.toggleRules.upkeepPerTurn}%`);
      }
    }
  });

  it("nao expoe nomes de campos internos ao jogador", () => {
    const internalTerms =
      /\b(?:unblockable|undodgeable|unguardable|baseDamage|reqPool|manualOnly|damageMult|costMult|stacks|shape|range)\b/i;
    for (const ability of ALL_ABILITIES) {
      expect(buildMechanicsSummary(ability), ability.id).not.toMatch(internalTerms);
    }
  });

  it("separa a narrativa visual das regras mecanicas", () => {
    const mechanicalTerms =
      /(?:\d+\s*%|\d+\s*(?:rodada|turno|casa|acúmulo|ponto)|chance de|aplica |concede |empurra |é inevitável|dano|barreira|alcance|custo)/i;
    for (const node of allNodes().filter((candidate) => candidate.kind === "JUTSU")) {
      const visual = buildVisualDescription(node.desc);
      expect(visual, node.id).not.toMatch(mechanicalTerms);
      expect(visual.trim().length, node.id).toBeGreaterThan(0);
    }
  });
});

describe("progressao monotona da arvore", () => {
  it("filhos nunca declaram nivel ou requisito menor que o pai do mesmo pool", () => {
    const regressions: string[] = [];
    for (const node of allNodes()) {
      for (const requiredId of node.requires) {
        const parent = getNode(requiredId);
        if (!parent) continue;
        if (node.reqLevel < parent.reqLevel) regressions.push(`${node.id}: nivel`);
        if (node.pool === parent.pool && node.reqPool < parent.reqPool) regressions.push(`${node.id}: pool`);
      }
    }
    expect(regressions).toEqual([]);
  });
});
