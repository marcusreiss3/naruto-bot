import { BALANCE } from "../../config/balance.js";

export function maxHp(level: number, taijutsu: number): number {
  return Math.round(BALANCE.hpBase + level * BALANCE.hpPerLevel + taijutsu * BALANCE.hpPerTaijutsu);
}

export function moveRange(): number {
  return BALANCE.moveBase;
}

export function genjutsuDuration(baseDuration: number, genjutsu: number): number {
  const bonus = Math.floor(genjutsu / BALANCE.genjutsuBaseDurationBonusEvery);
  return Math.min(baseDuration + bonus, BALANCE.genjutsuDurationCap);
}

