import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance.js";
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
          const displayedAmount = effect.effectId === "EMPOWERED" && effect.stacks > 1
            ? `${Math.round((effect.stacks - 1) * 100)}%`
            : String(effect.stacks);
          expect(summary, `${ability.id}: quantidade de ${effect.effectId}`).toContain(displayedAmount);
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
      if (ability.requiresPet) expect(summary, ability.id).toContain("cão ninja");
      if (ability.requiresActiveDoujutsu) expect(summary, ability.id).toContain(ability.requiresActiveDoujutsu.label);
      if (ability.toggleRules) {
        expect(summary, ability.id).toContain(ability.toggleRules.command);
        expect(summary, ability.id).toContain(`${Math.round(ability.toggleRules.dodgeBonus * 100)}%`);
        expect(summary, ability.id).toContain(`${ability.toggleRules.upkeepPerTurn}%`);
      }
      if (ability.requiresTargetEffect?.length) {
        expect(buildMechanicsSummary(ability), ability.id).toContain("Exige que o alvo esteja sob");
        for (const effectId of ability.requiresTargetEffect) {
          expect(buildMechanicsSummary(ability), ability.id).toContain(EFFECT_NAMES[effectId]);
        }
      }
    }
  });

  it("deixa as regras detalhadas dos efeitos somente para o glossário", () => {
    const drain = ALL_ABILITIES.find((ability) =>
      ability.effects?.some((effect) => effect.effectId === "CHAKRA_DRAIN"),
    )!;
    const haste = ALL_ABILITIES.find((ability) =>
      ability.effects?.some((effect) => effect.effectId === "HASTE"),
    )!;

    const drainSummary = buildMechanicsSummary(drain);
    expect(drainSummary).toContain("Dreno de Chakra");
    expect(drainSummary).not.toContain(`${BALANCE.effects.CHAKRA_DRAIN.chakraPerTurn}% de chakra`);

    const hasteSummary = buildMechanicsSummary(haste);
    expect(hasteSummary).toContain("Aceleração");
    expect(hasteSummary).not.toContain(`+${BALANCE.effects.HASTE.moveBonus} de movimento`);
  });

  it("informa o bônus de Raio ao explicar Encharcado", () => {
    const wet = ALL_ABILITIES.find((ability) =>
      ability.effects?.some((effect) => effect.effectId === "WET"),
    )!;
    const summary = buildMechanicsSummary(wet);
    expect(summary).toContain("Encharcado");
    expect(summary).not.toContain("Nuvens de Tempestade");
    expect(summary).not.toContain("+75% de dano");
  });

  it("explica de forma concreta como o Kirin prepara a tempestade", () => {
    const kirin = ALL_ABILITIES.find((ability) => ability.id === "raiton_kirin")!;
    const summary = buildMechanicsSummary(kirin);
    expect(summary).toContain("área de chamas ainda ativa");
    expect(summary).toContain("Nuvens de Tempestade");
  });

  it("deixa o funcionamento do terreno de Fumaça somente para o glossário", () => {
    const smokeAbilities = ALL_ABILITIES.filter((ability) => ability.terrain?.kind === "SMOKE");
    expect(smokeAbilities.length).toBeGreaterThan(0);
    for (const ability of smokeAbilities) {
      const summary = buildMechanicsSummary(ability);
      expect(summary, ability.id).toContain("terreno de fumaça");
      expect(summary, ability.id).not.toContain("bloqueia a linha de visão");
      expect(summary, ability.id).not.toContain("ataques corpo a corpo");
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

// O texto de uma habilidade so' pode citar "acumulo" de efeito cuja CONTAGEM
// muda alguma coisa no motor. Sangramento e' o contra-exemplo que motivou este
// teste: 9 habilidades declaravam `stacks: 2` e o texto prometia "2 acumulos",
// mas as tres mecanicas dele leem so' "esta ativo?" (ver effects.ts).
describe("acumulos so' aparecem onde a contagem importa", () => {
  it("nenhuma ability declara acúmulos de Sangramento", () => {
    const comStacks = ALL_ABILITIES.filter((ability) =>
      ability.effects?.some((effect) => effect.effectId === "BLEED" && effect.stacks !== undefined),
    );
    expect(comStacks.map((ability) => ability.id)).toEqual([]);
  });

  it("o resumo de uma habilidade com Sangramento não fala em acúmulo", () => {
    const comBleed = ALL_ABILITIES.filter((a) => a.effects?.some((e) => e.effectId === "BLEED"));
    expect(comBleed.length).toBeGreaterThan(0);
    for (const ability of comBleed) {
      expect(buildMechanicsSummary(ability), ability.id).not.toMatch(/acúmulos? de Sangramento/i);
    }
  });
});

// A confusao entre `unguardable` (ignora Bloqueio/Aparo) e `undodgeable`
// (ignora Esquiva) ja' tinha invertido o texto de 6 habilidades: a Palma de
// Vacuo prometia "nao pode ser esquivada" com unguardable no dado, e quatro
// nos de arvore diziam "nao pode ser esquivado" pra habilidades unguardable.
// Sao coisas OPOSTAS — o texto escrito a mao tem que concordar com a flag.
describe("texto escrito à mão concorda com as flags de defesa", () => {
  const SEM_ESQUIVA = /não pode ser esquivad|impossível .{0,12}esquivar|rápido demais pra esquivar/i;
  const SEM_GUARDA = /ignora bloqueio e aparo/i;

  const textos = (ability: { id: string; description?: string }) => {
    const doNo = allNodes().find((node) => node.grantsAbilityId === ability.id)?.desc;
    return [["ability", ability.description ?? ""], ["nó", doNo ?? ""]] as const;
  };

  it("quem promete 'não pode ser esquivado' tem undodgeable ou unblockable", () => {
    const erros: string[] = [];
    for (const ability of ALL_ABILITIES) {
      if (ability.undodgeable || ability.unblockable) continue;
      for (const [onde, texto] of textos(ability)) {
        if (SEM_ESQUIVA.test(texto)) erros.push(`${ability.id} (${onde})`);
      }
    }
    expect(erros).toEqual([]);
  });

  it("quem promete 'ignora Bloqueio e Aparo' tem unguardable ou unblockable", () => {
    const erros: string[] = [];
    for (const ability of ALL_ABILITIES) {
      if (ability.unguardable || ability.unblockable) continue;
      for (const [onde, texto] of textos(ability)) {
        if (SEM_GUARDA.test(texto)) erros.push(`${ability.id} (${onde})`);
      }
    }
    expect(erros).toEqual([]);
  });
});
