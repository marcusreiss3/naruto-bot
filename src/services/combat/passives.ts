// Agrega as passivas dos nos comprados num pacote de modificadores para UM jutsu.
// PURO: recebe a lista de nos que o personagem possui e a ability sendo usada.
//
// A engine chama isto uma vez por uso de jutsu e consome o resultado em 4 lugares:
// custo, dano, acumulos de Queimadura e terreno deixado no acerto.
import { BALANCE } from "../../config/balance.js";
import type { EffectId, TerrainKind } from "../../config/enums.js";
import { getPassive, type PassiveDef } from "../../data/element-trees/passives.js";
import { getClanPassive, type ClanPassiveDef } from "../../data/clan-trees/passives.js";
import type { Ability } from "../../data/types.js";
import { hasEffect, type EffectState } from "./effects.js";

export interface PassiveMods {
  damageMult: number;
  healMult: number;
  criticalHealBonus: { hpThreshold: number; mult: number } | null;
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
  effectStacksBonus: Partial<Record<EffectId, number>>;
  executeBonus: { hpThreshold: number; mult: number } | null;
  extraCrystalStacks: number;
  // +N corpos simultaneos alem do mindTransferMax da propria ability — so'
  // relevante pra abilities com mindTransfer (Clones de Transferencia de
  // Mente, Yamanaka). Ver establishControl() em combat-engine.ts.
  mindTransferMaxBonus: number;
}

export const NEUTRAL_MODS: PassiveMods = {
  damageMult: 1,
  healMult: 1,
  criticalHealBonus: null,
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
  effectStacksBonus: {},
  executeBonus: null,
  extraCrystalStacks: 0,
  mindTransferMaxBonus: 0,
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
    effectStacksBonus: {},
  };
  // habilidades de arvore de cla (ex: Nara) nao tem `element` — leem a
  // passiva de clã em vez da passiva elemental. O gate e' `requirements.clanId`,
  // NAO a categoria de combate: o Nara e' categoria NINJUTSU (chakra de
  // verdade, joga com NINJUTSU_BLOCK etc.) mas a passiva ainda vem da arvore
  // do clã, nao de uma natureza elemental. Um jutsu de clã TAMBEM pode ter
  // natureza elemental de verdade (ex: os suiton do Hoshigaki/Hozuki/Chinoike
  // — sao jutsus de Agua de verdade, so' que dentro da arvore do clã) —
  // nesse caso os dois gates (elemento E clã) sao checados INDEPENDENTEMENTE
  // abaixo, entao a passiva certa da arvore de Agua e a passiva certa da
  // arvore do clã aplicam as duas, empilhando. Buff de clã que so' faz
  // sentido pro proprio clã (a maioria) continua isolado do resto porque
  // ele nunca bate no `elementMatch` (a ability nao tem `element`).
  const clanId = ability.requirements?.clanId;

  for (const nodeId of ownedNodeIds) {
    // tenta os dois catalogos (nao so' o "esperado" pelo tipo da ability):
    // uma passiva de clã com crossCategory (ex: Olhos de Sangue do Chinoike)
    // precisa ser encontrada mesmo quando a ability sendo usada não é do
    // clã dono dela (ex: um genjutsu generico de fundamentos).
    const p: (Partial<PassiveDef> & Partial<ClanPassiveDef>) | undefined =
      getClanPassive(nodeId) ?? getPassive(nodeId);
    if (!p) continue;

    // ESCAPE HATCH: passiva com crossCategory ignora os dois gates abaixo e
    // vale pra qualquer ability da categoria declarada.
    const crossMatch = p.crossCategory !== undefined && p.crossCategory === ability.category;
    const crossElementMatch = p.crossElement !== undefined && p.crossElement === ability.element;
    const abilityMatch = p.abilityIds?.includes(ability.id) ?? false;
    // passiva elemental (p.element) bate se a ability tiver ESSE elemento —
    // nao importa se ela tambem tem clanId.
    const elementMatch = p.element !== undefined && ability.element === p.element;
    // passiva de clã (p.clanId) bate se a ability for do MESMO clã — nao
    // importa se ela tambem tem elemento.
    const clanMatch = p.clanId !== undefined && clanId !== undefined && p.clanId === clanId;
    if (!crossMatch && !crossElementMatch && !abilityMatch && !elementMatch && !clanMatch) continue;
    if (p.abilityIds && !abilityMatch) continue;

    // ESCOPO do pacote de dano (damageMult + ignoresShield + executeBonus).
    // Duas travas independentes, as duas opcionais:
    //
    // 1) crossCategory NARROWS alem de abrir. Ele ja' abriu o alcance acima
    //    (crossMatch), mas tambem limita: um no' com crossCategory "KENJUTSU"
    //    NAO solta o pacote nas outras abilities do proprio clã que entraram
    //    por clanMatch — e' o que impede o Corte Perfeito (Hatake) de buffar
    //    a invocacao de caes. Como a trava e' por CATEGORIA, qualquer espada
    //    futura marcada `category: "KENJUTSU"` ja' nasce coberta, mesmo sem
    //    scalingAttribute definido.
    // 2) damageMultScalingAttribute trava por ATRIBUTO de escala — usado
    //    onde nao ha' categoria propria pra discriminar (ex: apice do
    //    Chinoike, so' a Genjutsu Ketsuryuugan entre os genjutsus do clã).
    const categoryScopeOk = p.crossCategory === undefined || ability.category === p.crossCategory;
    const scaleScopeOk = !p.damageMultScalingAttribute || ability.scalingAttribute === p.damageMultScalingAttribute;
    const scopeOk = categoryScopeOk && scaleScopeOk;
    if (p.damageMult && scopeOk) mods.damageMult *= p.damageMult;
    if (p.healMult) mods.healMult *= p.healMult;
    if (p.criticalHealBonus) mods.criticalHealBonus = p.criticalHealBonus;
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
    if (p.ignoresShield && scopeOk) mods.ignoresShield = true;
    if (p.effectChanceBonus) {
      for (const [effectId, bonus] of Object.entries(p.effectChanceBonus) as [EffectId, number][]) {
        mods.effectChanceBonus[effectId] = (mods.effectChanceBonus[effectId] ?? 0) + bonus;
      }
    }
    if (p.effectStacksBonus) {
      for (const [effectId, bonus] of Object.entries(p.effectStacksBonus) as [EffectId, number][]) {
        mods.effectStacksBonus[effectId] = (mods.effectStacksBonus[effectId] ?? 0) + bonus;
      }
    }
    if (p.executeBonus && scopeOk) mods.executeBonus = p.executeBonus;
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
    if (p.mindTransferMaxBonus) mods.mindTransferMaxBonus += p.mindTransferMaxBonus;
  }
  return mods;
}

export interface CharacterPassiveMods {
  ninjutsuDodgeBonus: number;
  initiativePriority: number;
  // soma de todas as passivas do dono — ver ClanPassiveDef.maxHpBonus/hpRegenPerTurn/
  // chakraRegenPerTurn (ex: Uzumaki, vitalidade e chakra). Elemental (PassiveDef)
  // tambem pode usar os mesmos nomes de campo no futuro; o agregador aqui nao
  // distingue a fonte.
  maxHpBonus: number;
  hpRegenPerTurn: number;
  chakraRegenPerTurn: number;
  // dano fixo devolvido em quem acerta o dono com um golpe físico corpo a
  // corpo (ex: Armadura de Espinhos do Kaguya) — mesma ideia do
  // hasteContactDamage (efeito HASTE), so' que permanente/passiva em vez de
  // um efeito temporario. Ver resolveHit() em combat-engine.ts.
  meleeCounterDamage: number;
  // multiplica o upkeep por turno do controle mental (BALANCE.yamanaka.
  // upkeepPerTurn) — 1 = neutro, 0.8 = -20%. Ver processTurnStart em
  // combat-engine.ts.
  mindControlUpkeepMult: number;
  // bonus fixo de Ninjutsu EFETIVO so' pra disputa de controle mental
  // (yamanakaResistChance) — ver processTurnStart em combat-engine.ts.
  mindControlNinjutsuBonus: number;
}

// Modificadores que pertencem ao personagem, e nao a um jutsu especifico.
// Le TANTO passiva elemental quanto de clã — um personagem so possui nos de
// UMA arvore de elemento e UM clã por vez, entao nao ha ambiguidade em olhar
// os dois (mesmo padrao de passiveMods() pra mods por-jutsu).
export function characterPassiveMods(ownedNodeIds: string[]): CharacterPassiveMods {
  const owned = new Set(ownedNodeIds);
  let ninjutsuDodgeBonus = 0;
  let initiativePriority = 0;
  let maxHpBonus = 0;
  let hpRegenPerTurn = 0;
  let chakraRegenPerTurn = 0;
  let meleeCounterDamage = 0;
  let mindControlUpkeepMult = 1;
  let mindControlNinjutsuBonus = 0;
  for (const nodeId of owned) {
    const p: (Partial<PassiveDef> & Partial<ClanPassiveDef>) | undefined =
      getPassive(nodeId) ?? getClanPassive(nodeId);
    if (!p) continue;
    ninjutsuDodgeBonus += p.ninjutsuDodgeBonus ?? 0;
    initiativePriority += p.initiativePriority ?? 0;
    maxHpBonus += p.maxHpBonus ?? 0;
    hpRegenPerTurn += p.hpRegenPerTurn ?? 0;
    chakraRegenPerTurn += p.chakraRegenPerTurn ?? 0;
    meleeCounterDamage += p.meleeCounterDamage ?? 0;
    mindControlUpkeepMult *= p.mindControlUpkeepMult ?? 1;
    mindControlNinjutsuBonus += p.mindControlNinjutsuBonus ?? 0;
  }
  return {
    ninjutsuDodgeBonus,
    initiativePriority,
    maxHpBonus,
    hpRegenPerTurn,
    chakraRegenPerTurn,
    meleeCounterDamage,
    mindControlUpkeepMult,
    mindControlNinjutsuBonus,
  };
}

export function receivedEffectDurationReduction(ownedNodeIds: string[], effectId: EffectId): number {
  let total = 0;
  for (const nodeId of new Set(ownedNodeIds)) {
    const passive = (getPassive(nodeId) ?? getClanPassive(nodeId)) as
      | (Partial<PassiveDef> & Partial<ClanPassiveDef>)
      | undefined;
    total += passive?.receivedEffectDurationReduction?.[effectId] ?? 0;
  }
  return total;
}
