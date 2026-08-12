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
  kenjutsu: BALANCE.kenjutsuScaling,
};

// Atributos que ainda nao afetam nada em combate. A UI de distribuicao usa isto
// para avisar o jogador antes de ele gastar ponto.
// kenjutsu/dojutsu/fuinjutsu SAIRAM daqui: viraram `pool` de nos de arvore de
// cla (ver skill-tree.ts), entao gastar ponto neles compra habilidade.
// kugutsu/senjutsu continuam sem nenhum consumidor.
export const ATTRIBUTES_SEM_EFEITO: readonly Attribute[] = ["kugutsu", "senjutsu"];

// UNICA fonte de verdade do que conta como golpe FISICO. Usada em ~7 lugares
// (queimadura corta dano fisico, esquiva gasta energia em vez de chakra,
// Prisma NAO refrata fisico, Armadura de Espinhos so' pune fisico, sangramento
// reabre em esforco fisico...). Centralizada de proposito: se um dia entrar
// uma categoria fisica nova, ela passa a valer em todas as regras de uma vez,
// em vez de depender de lembrar de 7 `||` espalhados.
// NAO cobre "e' projetil?" — isso e' so' BUKIJUTSU e e' checado direto onde
// importa (reflectsProjectiles da Explosao Defensiva).
export function isPhysicalCategory(category: string): boolean {
  return category === "TAIJUTSU" || category === "BUKIJUTSU" || category === "KENJUTSU";
}

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
  if (isPhysicalCategory(ability.category)) {
    if (ctx.burnTaiMult !== undefined) dmg *= ctx.burnTaiMult;
  }
  if (ctx.weakenMult !== undefined) dmg *= ctx.weakenMult;
  // arma equipada soma em quem empunha arma: arremesso (BUKIJUTSU) e espada
  // (KENJUTSU). Taijutsu e' o corpo, nao usa arma.
  if (ability.category === "BUKIJUTSU" || ability.category === "KENJUTSU") {
    dmg += ctx.weaponDamage ?? 0;
  }
  if (ctx.scenarioDmgMult) dmg *= ctx.scenarioDmgMult;
  if (ctx.heightBonus) dmg *= 1.1;
  return Math.max(0, Math.round(dmg));
}

export function computeHeal(ability: Ability, iryo: number, healMult = 1): number {
  if (!ability.baseHeal) return 0;
  const dmg = ability.baseHeal + iryo * SCALE.iryoNinjutsu;
  return Math.max(0, Math.round(dmg * healMult));
}

// Clones das Sombras (e futuras invocacoes frageis com deathReflect): quando
// a invocacao morre, o invocador so' sente o dano que SOBROU alem do hpMax
// dela (overkill), nao o golpe inteiro — ex: clone com 1 de vida toma 20,
// overkill e' 19. `pct` e' Ability.summon.deathReflect.overkillDamagePct.
export function summonOverkillReflect(incomingDamage: number, cloneHpMax: number, pct: number): number {
  const overkill = Math.max(0, incomingDamage - cloneHpMax);
  return Math.round(overkill * pct);
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
//
// `rangeBonus` e' o alcance extra vindo de passiva/trait (Alcance Estendido do
// Vento, Ascendente da Lua). Tem que entrar AQUI e nao so' na validacao de
// distancia do useAbility: pra LINE e CONE o alcance E' a extensao da area, e
// sem isso a mira chega mais longe do que o traco desenhado — o preview mostra
// menos celulas do que o certo e quem esta na faixa alem do alcance declarado
// nao e' atingido.
//
// RADIUS fica de fora de proposito: nele alcance e tamanho da explosao sao
// coisas separadas (raio = range/2 em volta do ALVO). Esticar o alcance deixa
// mirar mais longe — o que ja' e' resolvido pela validacao de distancia — mas
// nao deve inflar a explosao, que cresce ao quadrado.
export function resolveAreaCells(
  ability: Ability,
  originCell: string,
  targetCell: string,
  scenario: ScenarioDef,
  rangeBonus = 0,
): string[] {
  const origin = parseCell(originCell);
  const target = parseCell(targetCell);
  if (!origin) return [];
  const { rows, cols } = scenario;
  const alcance = ability.range + rangeBonus;
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
      if (target) coords = lineCells(origin, target, alcance, rows, cols);
      break;
    case "CONE":
      if (target) coords = coneCells(origin, target, alcance, rows, cols);
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

// ---------------- Yamanaka (Shintenshin) ----------------

// Chance do dono do corpo RESISTIR e expulsar a mente intrusa, avaliada uma
// vez por rodada no proprio turno do corpo controlado (ver processTurnStart
// em combat-engine.ts). Simetrica em torno de 50%: Ninjutsu da vitima maior
// que o do controlador ajuda a vitima; menor, atrapalha. Clampada em
// [10%, 90%] pra nunca ser garantida nem impossivel.
export function yamanakaResistChance(victimNinjutsu: number, casterNinjutsu: number): number {
  const raw = 0.5 + (victimNinjutsu - casterNinjutsu) * BALANCE.yamanaka.resistBasePerNinjutsuDiff;
  return Math.max(BALANCE.yamanaka.resistMinChance, Math.min(BALANCE.yamanaka.resistMaxChance, raw));
}

export function canYamanakaInvade(casterLevel: number, targetLevel: number): boolean {
  return targetLevel - casterLevel <= BALANCE.yamanaka.maxUpwardLevelGap;
}

// Por qual CombatParticipant o dono do personagem age agora: o proprio
// corpo, ou um dos corpos que estiver pilotando (flags.controllingIds — array,
// pode ter mais de um com os Clones de Transferencia de Mente), ou null se o
// PROPRIO corpo estiver sob controle de outra mente (nao pode agir — a
// consciencia esta em outro lugar). Pura de proposito: sem Prisma, sem import
// de combat-engine.ts (evita ciclo), facil de testar.
//
// `activeId`, se passado, e' o id de quem esta na vez (turnOrder) agora —
// usado pra escolher QUAL dos corpos pilotados e' o certo quando ha mais de
// um (ensureMyTurn em combate.ts compara o retorno com o participante ativo).
// Sem activeId, cai no 1o corpo pilotado vivo (ou o proprio), pra usos fora
// de turno (autocomplete de jutsu.ts).
export function resolveActingParticipantId(
  own: { id: string; controlledById: string | null; flags: Record<string, unknown> },
  allParticipants: { id: string; hpCurrent: number }[],
  activeId?: string,
): string | null {
  if (own.controlledById) return null;
  const controllingIds = (own.flags.controllingIds as string[] | undefined) ?? [];
  const aliveControlled = controllingIds.filter((id) =>
    allParticipants.some((p) => p.id === id && p.hpCurrent > 0),
  );
  if (activeId !== undefined) {
    if (activeId === own.id) return own.id;
    if (aliveControlled.includes(activeId)) return activeId;
  }
  return aliveControlled[0] ?? own.id;
}
