// Agrega as passivas dos nos comprados num pacote de modificadores para UM jutsu.
// PURO: recebe a lista de nos que o personagem possui e a ability sendo usada.
//
// A engine chama isto uma vez por uso de jutsu e consome o resultado em 4 lugares:
// custo, dano, acumulos de Queimadura e terreno deixado no acerto.
import { BALANCE } from "../../config/balance.js";
import type { EffectId, TerrainKind } from "../../config/enums.js";
import { getPassive } from "../../data/element-trees/passives.js";
import type { Ability } from "../../data/types.js";
import { hasEffect, type EffectState } from "./effects.js";

export interface PassiveMods {
  damageMult: number;
  costMult: number;
  pushBonus: number;
  extraBurnStacks: number;
  burnExplodeAtStacks: number;
  burnExplodeDamage: number;
  terrainOnHit: { kind: TerrainKind; duration: number }[];
  effectDurationBonus: Partial<Record<EffectId, number>>;
  armorPierce: number;
  rangeBonus: number;
  spreadsBurn: boolean;
  summonHpBonus: number;
  terrainDurationBonus: number;
  ignoresShield: boolean;
  effectChanceBonus: Partial<Record<EffectId, number>>;
  executeBonus: { hpThreshold: number; mult: number } | null;
  extraCrystalStacks: number;
}

export const NEUTRAL_MODS: PassiveMods = {
  damageMult: 1,
  costMult: 1,
  pushBonus: 0,
  extraBurnStacks: 0,
  burnExplodeAtStacks: BALANCE.effects.BURN.explodeAtStacks,
  burnExplodeDamage: BALANCE.effects.BURN.explodeDmg,
  terrainOnHit: [],
  effectDurationBonus: {},
  armorPierce: 0,
  rangeBonus: 0,
  spreadsBurn: false,
  summonHpBonus: 0,
  terrainDurationBonus: 0,
  ignoresShield: false,
  effectChanceBonus: {},
  executeBonus: null,
  extraCrystalStacks: 0,
};

// targetEffects e' opcional porque na hora de calcular custo ainda nao ha alvo.
// O dano condicional (ex: Fio d'Agua vs Encharcado) so entra quando ele vem.
export function passiveMods(
  ownedNodeIds: string[],
  ability: Ability,
  targetEffects?: EffectState[],
): PassiveMods {
  const mods: PassiveMods = {
    ...NEUTRAL_MODS,
    terrainOnHit: [],
    effectDurationBonus: {},
    effectChanceBonus: {},
  };
  if (!ability.element) return mods;

  for (const nodeId of ownedNodeIds) {
    const p = getPassive(nodeId);
    // passiva so vale para jutsus do proprio elemento
    if (!p || p.element !== ability.element) continue;

    if (p.damageMult) mods.damageMult *= p.damageMult;
    if (p.costMult) {
      const shapeOk = !p.costShapes || p.costShapes.includes(ability.shape);
      if (shapeOk) mods.costMult *= p.costMult;
    }
    // dano condicional: so conta se o alvo realmente tem o efeito agora
    if (p.damageMultVsEffect && targetEffects) {
      if (hasEffect(targetEffects, p.damageMultVsEffect.effectId)) {
        mods.damageMult *= p.damageMultVsEffect.mult;
      }
    }
    if (p.pushBonus) mods.pushBonus += p.pushBonus;
    if (p.armorPierce) mods.armorPierce = Math.min(1, mods.armorPierce + p.armorPierce);
    if (p.spreadsBurn) mods.spreadsBurn = true;
    if (p.ignoresShield) mods.ignoresShield = true;
    if (p.effectChanceBonus) {
      for (const [effectId, bonus] of Object.entries(p.effectChanceBonus) as [EffectId, number][]) {
        mods.effectChanceBonus[effectId] = (mods.effectChanceBonus[effectId] ?? 0) + bonus;
      }
    }
    if (p.executeBonus) mods.executeBonus = p.executeBonus;
    if (p.summonHpBonus) mods.summonHpBonus += p.summonHpBonus;
    if (p.terrainDurationBonus) mods.terrainDurationBonus += p.terrainDurationBonus;
    if (p.rangeBonus) {
      const shapeOk = !p.rangeShapes || p.rangeShapes.includes(ability.shape);
      if (shapeOk) mods.rangeBonus += p.rangeBonus;
    }
    if (p.effectDurationBonus) {
      const { effectId, bonus } = p.effectDurationBonus;
      mods.effectDurationBonus[effectId] = (mods.effectDurationBonus[effectId] ?? 0) + bonus;
    }
    if (p.extraBurnStacks) mods.extraBurnStacks += p.extraBurnStacks;
    if (p.extraCrystalStacks) mods.extraCrystalStacks += p.extraCrystalStacks;
    // explosao: o gatilho mais baixo e o dano mais alto vencem
    if (p.burnExplodeAtStacks !== undefined) {
      mods.burnExplodeAtStacks = Math.min(mods.burnExplodeAtStacks, p.burnExplodeAtStacks);
    }
    if (p.burnExplodeDamage !== undefined) {
      mods.burnExplodeDamage = Math.max(mods.burnExplodeDamage, p.burnExplodeDamage);
    }
    if (p.terrainOnHit) mods.terrainOnHit.push(p.terrainOnHit);
  }
  return mods;
}

export interface CharacterPassiveMods {
  ninjutsuDodgeBonus: number;
  initiativePriority: number;
}

// Modificadores que pertencem ao personagem, e nao a um jutsu especifico.
export function characterPassiveMods(ownedNodeIds: string[]): CharacterPassiveMods {
  const owned = new Set(ownedNodeIds);
  let ninjutsuDodgeBonus = 0;
  let initiativePriority = 0;
  for (const nodeId of owned) {
    const p = getPassive(nodeId);
    if (!p) continue;
    ninjutsuDodgeBonus += p.ninjutsuDodgeBonus ?? 0;
    initiativePriority += p.initiativePriority ?? 0;
  }
  return { ninjutsuDodgeBonus, initiativePriority };
}
