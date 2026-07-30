// Calculadora de custo "justo" pra autoria de jutsu — ver BALANCE.jutsuCostFormula
// pros pesos. PURO, sem I/O: pega os campos relevantes de uma Ability (ainda
// nao escrita) e devolve quanto ela DEVERIA custar de recurso, dado o que ela
// entrega (dano/cura/efeitos) e como ela e' usada (acao, area, indefensavel).
//
// O que NAO cobre: summon, mindTransfer, trapField, cleanses, reduceEffectDuration,
// restoreResource, requiredItems. Jutsu que dependem principalmente desses
// campos continuam avaliados a olho, como antes — a formula so' e' autoridade
// pra dano/cura/efeitos/economia-de-acao.
import { BALANCE } from "../../config/balance.js";
import type { ActionType, EffectId, Shape } from "../../config/enums.js";

export interface JutsuCostFactors {
  actionType: ActionType;
  shape: Shape;
  baseDamage?: number;
  baseHeal?: number;
  effects?: { effectId: EffectId; duration?: number; chance?: number }[];
  unblockable?: boolean;
  undodgeable?: boolean;
  unguardable?: boolean;
}

const AREA_SHAPES: readonly Shape[] = ["LINE", "CONE", "RADIUS"];

// Taxa PROGRESSIVA (tipo faixa de IR): os primeiros pontos de saida (dano OU
// cura) custam pouco, o excedente custa cada vez mais — ver nota em
// BALANCE.jutsuCostFormula sobre por que uma taxa linear unica furava nos
// jutsus de apice.
function bracketedOutputCost(output: number): number {
  let remaining = output;
  let cost = 0;
  let floor = 0;
  for (const bracket of BALANCE.jutsuCostFormula.damageBrackets) {
    if (remaining <= 0) break;
    const span = Math.min(remaining, bracket.upTo - floor);
    cost += span * bracket.rate;
    remaining -= span;
    floor = bracket.upTo;
  }
  return cost;
}

export function suggestedJutsuCost(factors: JutsuCostFactors): number {
  const F = BALANCE.jutsuCostFormula;

  const outputCost = bracketedOutputCost((factors.baseDamage ?? 0) + (factors.baseHeal ?? 0));

  const effectsCost = (factors.effects ?? []).reduce((sum, e) => {
    const severity = F.effectSeverity[e.effectId] ?? 2;
    // sem duration explicita, assume 1 rodada (piso conservador: nao
    // recompensa deixar o campo em branco com custo mais baixo).
    const duration = e.duration ?? 1;
    const chance = e.chance ?? 1;
    return sum + severity * duration * chance;
  }, 0);

  let subtotal = outputCost + effectsCost;
  if (AREA_SHAPES.includes(factors.shape)) subtotal *= F.areaMult;
  if (factors.unblockable) subtotal *= F.unblockableMult;
  else if (factors.undodgeable) subtotal *= F.undodgeableMult;
  else if (factors.unguardable) subtotal *= F.unguardableMult;

  const total = (subtotal + F.base) * F.actionTypeMult[factors.actionType];
  return Math.round(total);
}
