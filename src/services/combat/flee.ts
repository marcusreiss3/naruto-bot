// Fuga do combate. PURO: so calcula: a engine decide o que fazer com o resultado.
//
// Ideia: fugir e' sempre possivel tentar, mas inimigo colado dificulta. Taijutsu
// (agilidade) ajuda. FLEE_LOCK trava por completo. Buffs podem melhorar a
// chance, mas continuam respeitando o teto e nunca ignoram o bloqueio.
import { BALANCE } from "../../config/balance.js";
import { distanceCells } from "../../utils/grid.js";

export interface FleeContext {
  fleeingCell: string;
  enemyCells: string[]; // celulas dos inimigos vivos
  taijutsu: number;
  fleeLocked?: boolean; // efeito FLEE_LOCK ativo
  guaranteed?: boolean; // buff de fuga garantida
  chanceBonus?: number; // bonus aditivo (0.25 = +25 pontos percentuais)
  energia: number;
}

export interface FleeCheck {
  allowed: boolean; // pode ao menos tentar
  reason?: string; // porque nao pode
  chance: number; // 0..1
}

// Inimigos adjacentes (distancia 1, Chebyshev) sao os que seguram a fuga.
export function adjacentEnemyCount(fleeingCell: string, enemyCells: string[]): number {
  return enemyCells.filter((c) => distanceCells(fleeingCell, c) === 1).length;
}

export function fleeCheck(ctx: FleeContext): FleeCheck {
  if (ctx.fleeLocked) {
    return { allowed: false, reason: "Voce esta impedido de fugir.", chance: 0 };
  }
  if (ctx.energia < BALANCE.flee.energiaCost) {
    return { allowed: false, reason: "Energia insuficiente para fugir.", chance: 0 };
  }
  if (ctx.guaranteed) return { allowed: true, chance: 1 };

  const adjacent = adjacentEnemyCount(ctx.fleeingCell, ctx.enemyCells);
  let chance =
    BALANCE.flee.baseChance +
    adjacent * BALANCE.flee.perAdjacentEnemy +
    ctx.taijutsu * BALANCE.flee.perTaijutsuPoint +
    (ctx.chanceBonus ?? 0);
  chance = Math.min(BALANCE.flee.maxChance, Math.max(BALANCE.flee.minChance, chance));
  return { allowed: true, chance };
}
