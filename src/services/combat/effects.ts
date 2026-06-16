import { BALANCE } from "../../config/balance.js";
import type { EffectId } from "../../config/enums.js";

export interface EffectState {
  effectId: EffectId;
  stacks: number;
  duration: number;
}

export interface TurnTickResult {
  damage: number;
  // se a queimadura explodiu neste tick
  exploded: boolean;
  // efeito deve ser removido apos o tick (duracao acabou)
  expired: boolean;
}

const E = BALANCE.effects;

// Multiplicador de dano de Taijutsu do alvo conforme stacks de queimadura.
export function burnTaijutsuMultiplier(burnStacks: number): number {
  return Math.max(0, 1 - E.BURN.taijutsuDmgReductionPerStack * burnStacks);
}

// Aplica stacks de queimadura; retorna stacks resultantes + dano explosivo (se atingiu o cap).
export function applyBurnStacks(
  currentStacks: number,
  addStacks: number,
): { stacks: number; explosionDamage: number } {
  let total = currentStacks + addStacks;
  let explosionDamage = 0;
  if (total >= E.BURN.explodeAtStacks) {
    explosionDamage = E.BURN.explodeDmg;
    total = 0; // zera apos explodir
  }
  return { stacks: total, explosionDamage };
}

// Dano por turno do veneno conforme stacks.
export function poisonTickDamage(stacks: number): number {
  return E.POISON.baseDmg + Math.max(0, stacks - 1) * E.POISON.dmgPerStack;
}

// Fator de corte de cura: sangramento ativo corta cura pela metade.
export function healMultiplier(activeEffects: EffectState[]): number {
  const bleeding = activeEffects.some((e) => e.effectId === "BLEED" && e.stacks > 0);
  return bleeding ? E.BLEED.healCutFactor : 1;
}

// Dano extra ao usar Taijutsu/Kenjutsu enquanto sangra.
export function bleedExtraOnPhysical(activeEffects: EffectState[]): number {
  return activeEffects.some((e) => e.effectId === "BLEED") ? E.BLEED.extraOnTaiKen : 0;
}

export function isStunned(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => e.effectId === "STUN" && e.duration > 0);
}

export function isRooted(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => e.effectId === "ROOT" && e.duration > 0);
}

export function isConfused(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => e.effectId === "CONFUSION" && e.duration > 0);
}

export function ninjutsuBlocked(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => e.effectId === "NINJUTSU_BLOCK" && e.duration > 0);
}

// Movimento efetivo considerando Lentidao.
export function applySlowToMove(move: number, activeEffects: EffectState[]): number {
  const slowed = activeEffects.some((e) => e.effectId === "SLOW" && e.duration > 0);
  return slowed ? Math.floor(move * E.SLOW.moveFactor) : move;
}

// Processa o dano-por-turno de UM efeito (chamado no inicio do turno do portador).
export function tickEffect(effect: EffectState): TurnTickResult {
  let damage = 0;
  let exploded = false;
  switch (effect.effectId) {
    case "BURN":
      damage = E.BURN.dmgPerTurn;
      break;
    case "POISON":
      damage = poisonTickDamage(effect.stacks);
      break;
    case "BLEED":
      damage = E.BLEED.dmgPerTurn;
      break;
    default:
      damage = 0;
  }
  const duration = effect.duration - 1;
  return { damage, exploded, expired: duration <= 0 };
}
