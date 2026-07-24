import { BALANCE } from "../../config/balance.js";
import type { Attribute } from "../../config/enums.js";
import type { Ability, ScenarioDef } from "../../data/types.js";
import {
  coneCells,
  lineCells,
  parseCell,
  radiusCells,
  toCell,
  distance,
  type Coord,
} from "../../utils/grid.js";

const SCALE: Record<Attribute, number> = {
  ninjutsu: BALANCE.ninjutsuScaling,
  taijutsu: BALANCE.taijutsuScaling,
  genjutsu: BALANCE.genjutsuScaling,
  bukijutsu: BALANCE.bukijutsuScaling,
  iryoNinjutsu: BALANCE.iryoNinjutsuScaling,
  fuinjutsu: BALANCE.fuinjutsuScaling,
  kugutsu: BALANCE.kugutsuScaling,
  senjutsu: BALANCE.senjutsuScaling,
  dojutsu: BALANCE.dojutsuScaling,
};

// Atributos que ainda nao afetam nada em combate. A UI de distribuicao usa isto
// para avisar o jogador antes de ele gastar ponto.
export const ATTRIBUTES_SEM_EFEITO: readonly Attribute[] = [
  "fuinjutsu",
  "kugutsu",
  "senjutsu",
  "dojutsu",
];

export interface DamageContext {
  attrValue: number;
  // multiplicador de dano por cenario (elemento)
  scenarioDmgMult?: number;
  // reducao de dano de tai/ken por queimadura do atacante (multiplicador 0..1)
  burnTaiMult?: number;
  // reducao de TODO o dano do atacante por desidratacao (Calor), multiplicador 0..1
  weakenMult?: number;
  weaponDamage?: number;
  // bonus de altura (atacante em arvore)
  heightBonus?: boolean;
}

export function computeDamage(ability: Ability, ctx: DamageContext): number {
  if (!ability.baseDamage) return 0;
  const scale = ability.scalingAttribute ? SCALE[ability.scalingAttribute] : 0;
  let dmg = ability.baseDamage + ctx.attrValue * scale;
  if (ability.category === "TAIJUTSU" || ability.category === "BUKIJUTSU") {
    if (ctx.burnTaiMult !== undefined) dmg *= ctx.burnTaiMult;
  }
  if (ctx.weakenMult !== undefined) dmg *= ctx.weakenMult;
  if (ability.category === "BUKIJUTSU") dmg += ctx.weaponDamage ?? 0;
  if (ctx.scenarioDmgMult) dmg *= ctx.scenarioDmgMult;
  if (ctx.heightBonus) dmg *= 1.1;
  return Math.max(0, Math.round(dmg));
}

export function computeHeal(ability: Ability, iryo: number, healMult = 1): number {
  if (!ability.baseHeal) return 0;
  const dmg = ability.baseHeal + iryo * SCALE.iryoNinjutsu;
  return Math.max(0, Math.round(dmg * healMult));
}

export interface DodgeContext {
  ability: Ability; // ataque recebido
  defenseDown?: boolean; // efeito DEFENSE_DOWN ativo
  attackerHeight?: boolean; // atacante em altura reduz esquiva do alvo abaixo
  reactionBonus?: number; // reacao escolhida (Substituicao, jutsu...) + buffs
}

// Chance de esquiva. Base unica (BALANCE.dodgeBase) igual pra todos — NAO
// escala com atributo. A reacao escolhida entra via reactionBonus e o cap
// unico (BALANCE.dodgeCap) trava o total.
export function dodgeChance(ctx: DodgeContext): number {
  if (ctx.ability.undodgeable) return 0;
  let chance = BALANCE.dodgeBase + (ctx.reactionBonus ?? 0);
  if (ctx.defenseDown) chance -= BALANCE.effects.DEFENSE_DOWN.dodgeReduction;
  if (ctx.attackerHeight) chance -= BALANCE.heightTargetDodgePenalty;
  return Math.max(0, Math.min(BALANCE.dodgeCap, chance));
}

// Resolve as celulas atingidas por uma ability dada origem/alvo.
export function resolveAreaCells(
  ability: Ability,
  originCell: string,
  targetCell: string,
  scenario: ScenarioDef,
): string[] {
  const origin = parseCell(originCell);
  const target = parseCell(targetCell);
  if (!origin) return [];
  const { rows, cols } = scenario;
  let coords: Coord[] = [];
  switch (ability.shape) {
    case "SELF":
      coords = [origin];
      break;
    case "MELEE":
    case "SINGLE_TARGET":
    case "ALLY":
      coords = target ? [target] : [];
      break;
    case "LINE":
      if (target) coords = lineCells(origin, target, ability.range, rows, cols);
      break;
    case "CONE":
      if (target) coords = coneCells(origin, target, ability.range, rows, cols);
      break;
    case "RADIUS":
      if (target) coords = radiusCells(target, Math.max(1, Math.floor(ability.range / 2)), rows, cols);
      break;
    case "GLOBAL_OR_SCENARIO":
      coords = [];
      break;
  }
  return coords.map(toCell);
}

// Distancia entre celulas; usada p/ validar alcance.
export function cellDistance(a: string, b: string): number {
  const ca = parseCell(a);
  const cb = parseCell(b);
  if (!ca || !cb) return Infinity;
  return distance(ca, cb);
}
