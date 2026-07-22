import { BALANCE } from "../../config/balance.js";
import type { EffectId } from "../../config/enums.js";

export interface EffectState {
  effectId: EffectId;
  stacks: number;
  duration: number;
}

export interface TurnTickResult {
  damage: number;
  // efeito deve ser removido apos o tick (duracao acabou)
  expired: boolean;
}

const E = BALANCE.effects;

// Um efeito so conta enquanto tem duracao restante.
function isActive(e: EffectState, effectId: EffectId): boolean {
  return e.effectId === effectId && e.duration > 0;
}

// Duracao padrao quando o jutsu nao especifica uma.
const DEFAULT_DURATIONS: Partial<Record<EffectId, number>> = {
  STUN: E.STUN.defaultDuration,
  CONFUSION: E.CONFUSION.defaultDuration,
  ROOT: E.ROOT.defaultDuration,
  NINJUTSU_BLOCK: E.NINJUTSU_BLOCK.defaultDuration,
  FLEE_LOCK: E.FLEE_LOCK.defaultDuration,
  WET: E.WET.defaultDuration,
  SHIELD: E.SHIELD.defaultDuration,
  CHAKRA_DRAIN: E.CHAKRA_DRAIN.defaultDuration,
  HASTE: E.HASTE.defaultDuration,
  CRYSTALLIZED: E.CRYSTALLIZED.defaultDuration,
  PRISM: E.PRISM.defaultDuration,
};

export function defaultDurationFor(effectId: EffectId): number {
  return DEFAULT_DURATIONS[effectId] ?? 1;
}

// Teto de duracao por efeito (veneno nao acumula duracao infinita).
export function clampDuration(effectId: EffectId, duration: number): number {
  if (effectId === "POISON") return Math.min(duration, E.POISON.maxDuration);
  return duration;
}

// Multiplicador de dano de Taijutsu do alvo conforme stacks de queimadura.
export function burnTaijutsuMultiplier(burnStacks: number): number {
  return Math.max(0, 1 - E.BURN.taijutsuDmgReductionPerStack * burnStacks);
}

// Aplica stacks de queimadura; retorna stacks resultantes + dano explosivo (se atingiu o cap).
// opts vem das passivas do atacante (ex: Combustao explode em 4 e por 60).
export function applyBurnStacks(
  currentStacks: number,
  addStacks: number,
  opts?: { explodeAtStacks?: number; explodeDamage?: number },
): { stacks: number; explosionDamage: number } {
  const explodeAt = opts?.explodeAtStacks ?? E.BURN.explodeAtStacks;
  const explodeDmg = opts?.explodeDamage ?? E.BURN.explodeDmg;
  let total = currentStacks + addStacks;
  let explosionDamage = 0;
  if (total >= explodeAt) {
    explosionDamage = explodeDmg;
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
  const bleeding = activeEffects.some((e) => isActive(e, "BLEED"));
  return bleeding ? E.BLEED.healCutFactor : 1;
}

// Dano extra ao usar Taijutsu/Kenjutsu enquanto sangra.
export function bleedExtraOnPhysical(activeEffects: EffectState[]): number {
  return activeEffects.some((e) => isActive(e, "BLEED")) ? E.BLEED.extraOnTaiKen : 0;
}

export function isStunned(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => isActive(e, "STUN"));
}

export function isRooted(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => isActive(e, "ROOT"));
}

export function isConfused(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => isActive(e, "CONFUSION"));
}

export function ninjutsuBlocked(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => isActive(e, "NINJUTSU_BLOCK"));
}

// Impedido de fugir do combate (anel de fogo, prisao, raizes...).
export function isFleeLocked(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => isActive(e, "FLEE_LOCK"));
}

// Encharcado: nao faz nada sozinho, mas Agua bate mais e Raio conduz nele.
export function isWet(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => isActive(e, "WET"));
}

export function hasEffect(activeEffects: EffectState[], effectId: EffectId): boolean {
  return activeEffects.some((e) => isActive(e, effectId));
}

// Barreira: os stacks sao os pontos de dano que ainda da' para absorver.
export function shieldPoints(activeEffects: EffectState[]): number {
  return activeEffects
    .filter((e) => isActive(e, "SHIELD"))
    .reduce((total, e) => total + e.stacks, 0);
}

// Desconta o dano da Barreira antes do HP. Devolve o que sobrou para cada lado.
export function absorbWithShield(
  damage: number,
  shield: number,
): { damageToHp: number; shieldLeft: number; absorbed: number } {
  const absorbed = Math.min(damage, Math.max(0, shield));
  return {
    damageToHp: Math.max(0, damage - absorbed),
    shieldLeft: Math.max(0, shield - absorbed),
    absorbed,
  };
}

// Dreno de chakra por turno (cupula de terra).
export function chakraDrainPerTurn(activeEffects: EffectState[]): number {
  return activeEffects.some((e) => isActive(e, "CHAKRA_DRAIN"))
    ? E.CHAKRA_DRAIN.chakraPerTurn
    : 0;
}

// Movimento efetivo considerando Lentidao.
export function applySlowToMove(move: number, activeEffects: EffectState[]): number {
  const slowed = activeEffects.some((e) => isActive(e, "SLOW"));
  return slowed ? Math.floor(move * E.SLOW.moveFactor) : move;
}

export function applyHasteToMove(move: number, activeEffects: EffectState[]): number {
  return activeEffects.some((e) => isActive(e, "HASTE")) ? move + E.HASTE.moveBonus : move;
}

export function hasteDodgeBonus(activeEffects: EffectState[]): number {
  return activeEffects.some((e) => isActive(e, "HASTE")) ? E.HASTE.dodgeBonus : 0;
}

export function hasteFleeChanceBonus(activeEffects: EffectState[]): number {
  return activeEffects.some((e) => isActive(e, "HASTE")) ? E.HASTE.fleeChanceBonus : 0;
}

export function hasteContactDamage(activeEffects: EffectState[]): number {
  return activeEffects.some((e) => isActive(e, "HASTE")) ? E.HASTE.contactDamage : 0;
}

// ---------------------------------------------------------------- CRISTAL (KG)
// Cristalizado e' o espelho invertido da Queimadura: a Queimadura acumula ate
// EXPLODIR em dano; o Cristal acumula ate SELAR em controle. Nao tica dano.

// Acumulos de cristal ativos no alvo.
export function crystalStacks(activeEffects: EffectState[]): number {
  return activeEffects
    .filter((e) => isActive(e, "CRYSTALLIZED"))
    .reduce((total, e) => total + e.stacks, 0);
}

// Esquiva perdida por estar coberto de cristal (valor positivo = penalidade).
export function crystalDodgePenalty(activeEffects: EffectState[]): number {
  return crystalStacks(activeEffects) * E.CRYSTALLIZED.dodgePenaltyPerStack;
}

// Movimento efetivo considerando o peso do cristal (nunca abaixo de 0).
export function applyCrystalToMove(move: number, activeEffects: EffectState[]): number {
  const penalty = crystalStacks(activeEffects) * E.CRYSTALLIZED.movePenaltyPerStack;
  return Math.max(0, move - penalty);
}

// Aplica acumulos de cristal; se encher, o casulo fecha (sela) e os acumulos zeram.
// Mesmo contrato de applyBurnStacks, mas o retorno e' controle em vez de dano.
export function applyCrystalStacks(
  currentStacks: number,
  addStacks: number,
  opts?: { sealAtStacks?: number },
): { stacks: number; sealed: boolean } {
  const sealAt = opts?.sealAtStacks ?? E.CRYSTALLIZED.sealAtStacks;
  const total = currentStacks + addStacks;
  if (total >= sealAt) return { stacks: 0, sealed: true };
  return { stacks: total, sealed: false };
}

// Prisma: enquanto ativo, o ninjutsu recebido e' cortado e parte volta no
// atacante. Taijutsu/Bukijutsu passam inteiros — e' o preco de ficar imovel.
export function isPrismed(activeEffects: EffectState[]): boolean {
  return activeEffects.some((e) => isActive(e, "PRISM"));
}

// Devolve quanto dano o alvo realmente toma e quanto e' refletido no atacante.
export function refractDamage(
  damage: number,
  isNinjutsu: boolean,
  activeEffects: EffectState[],
): { damageTaken: number; reflected: number } {
  if (!isNinjutsu || !isPrismed(activeEffects)) return { damageTaken: damage, reflected: 0 };
  const barred = Math.round(damage * E.PRISM.ninjutsuDamageReduction);
  return {
    damageTaken: Math.max(0, damage - barred),
    reflected: Math.round(barred * E.PRISM.reflectFraction),
  };
}

// Processa o dano-por-turno de UM efeito (chamado no inicio do turno do portador).
export function tickEffect(effect: EffectState): TurnTickResult {
  let damage = 0;
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
  return { damage, expired: effect.duration - 1 <= 0 };
}
