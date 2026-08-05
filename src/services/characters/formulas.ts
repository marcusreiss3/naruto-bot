import { BALANCE } from "../../config/balance.js";
import type { MasteryLevel } from "../../config/enums.js";

export function maxHp(level: number, taijutsu: number): number {
  return Math.round(BALANCE.hpBase + level * BALANCE.hpPerLevel + taijutsu * BALANCE.hpPerTaijutsu);
}

export function moveRange(): number {
  return BALANCE.moveBase;
}

export function costAfterMastery(baseCost: number, mastery: MasteryLevel): number {
  const mult = BALANCE.masteryCostMultiplier[mastery] ?? 1;
  return Math.round(baseCost * mult);
}

export function genjutsuDuration(baseDuration: number, genjutsu: number): number {
  const bonus = Math.floor(genjutsu / BALANCE.genjutsuBaseDurationBonusEvery);
  return Math.min(baseDuration + bonus, BALANCE.genjutsuDurationCap);
}

// quantos pontos de maestria deve ter alguem no nivel N
export function expectedMasteryPoints(level: number): number {
  return Math.floor(level / BALANCE.masteryEveryLevels);
}
