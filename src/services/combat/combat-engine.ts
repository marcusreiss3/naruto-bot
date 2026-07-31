import { prisma } from "../../db/client.js";
import { BALANCE } from "../../config/balance.js";
import { effectLabel, type Attribute, type EffectId, type Element } from "../../config/enums.js";
import { getAbility, getScenarioById, getNpc } from "../../data/index.js";
import { allNodes } from "../../data/element-trees/index.js";
import type { Ability, AppliedEffect, ScenarioDef } from "../../data/types.js";
import { allCells, neighbors, parseCell, radiusCells, toCell } from "../../utils/grid.js";
import { pick, randInt, chance } from "../../utils/random.js";
import { costAfterMastery, moveRange, genjutsuDuration } from "../characters/formulas.js";
import {
  computeDamage,
  computeHeal,
  dodgeChance,
  resolveAreaCells,
  cellDistance,
  isPhysicalCategory,
  canYamanakaInvade,
  yamanakaResistChance,
  summonOverkillReflect,
} from "./combat-math.js";
import {
  applyBurnStacks,
  applyCrystalStacks,
  applyMagmaStacks,
  applyDisintegrationStacks,
  applyCrystalToMove,
  applyHasteToMove,
  applySlowToMove,
  crystalDodgePenalty,
  isPrismed,
  refractDamage,
  corrosionShieldDrain,
  disintegrationShieldDrain,
  dehydrationMultiplier,
  bleedExtraOnPhysical,
  burnTaijutsuMultiplier,
  clampDuration,
  defaultDurationFor,
  healMultiplier,
  hasteContactDamage,
  hasteDodgeBonus,
  hasteFleeChanceBonus,
  effectsLanded,
  isConfused,
  isRooted,
  isShadowBound,
  isStunned,
  isFleeLocked,
  isWet,
  hasEffect,
  shieldPoints,
  absorbWithShield,
  chakraDrainPerTurn,
  ninjutsuBlocked,
  tickEffect,
  empoweredDamageMult,
  parseEffectData,
  type EffectState,
} from "./effects.js";
import {
  effectiveLineBlockers,
  effectiveObstacles,
  effectiveWater,
  hasActiveKind,
  hasKindAt,
  lineIsClear,
  makePatches,
  mergePatches,
  clearKindAt,
  parseTerrain,
  serializeTerrain,
  terrainMoveFactor,
  terrainTickDamage,
  type TerrainPatch,
} from "./terrain.js";
import { fleeCheck } from "./flee.js";
import { characterPassiveMods, passiveMods, receivedEffectDurationReduction } from "./passives.js";
import { validateAndConsumeAbilityItems } from "../characters/inventory.js";
import { resolvePush, impactDamage } from "./push.js";
import { clampInfiniteHp } from "./training-dummy.js";
import {
  isSharinganCopyable,
  sharinganCopyRequirementError,
  sharinganCopyNodeId,
  type SharinganTomoe,
} from "./sharingan.js";

type ParticipantRow = Awaited<ReturnType<typeof prisma.combatParticipant.findFirstOrThrow>>;

export interface SessionFull {
  id: string;
  channelId: string;
  guildId: string;
  scenarioId: string;
  status: string;
  round: number;
  activeIndex: number;
  turnOrder: string[];
  terrain: TerrainPatch[]; // manchas temporarias (chamas, agua, muro, fumaca, pantano)
  missionInstanceId: string | null;
  participants: (ParticipantRow & { effects: EffectState[]; flags: Record<string, unknown> })[];
  drops: { id: string; cell: string; name: string; itemId: string }[];
}

function parseFlags(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function getActiveSession(channelId: string): Promise<SessionFull | null> {
  const s = await prisma.combatSession.findFirst({
    where: { channelId, status: "ACTIVE" },
    include: { participants: { include: { effects: true } }, drops: true },
    orderBy: { createdAt: "desc" },
  });
  if (!s) return null;
  return mapSession(s);
}

export async function getSessionById(id: string): Promise<SessionFull | null> {
  const s = await prisma.combatSession.findUnique({
    where: { id },
    include: { participants: { include: { effects: true } }, drops: true },
  });
  return s ? mapSession(s) : null;
}

function mapSession(s: any): SessionFull {
  return {
    id: s.id,
    channelId: s.channelId,
    guildId: s.guildId,
    scenarioId: s.scenarioId,
    status: s.status,
    round: s.round,
    activeIndex: s.activeIndex,
    turnOrder: JSON.parse(s.turnOrderJson) as string[],
    terrain: parseTerrain(s.terrainJson ?? "[]"),
    missionInstanceId: s.missionInstanceId ?? null,
    participants: s.participants.map((p: any) => ({
      ...p,
      effects: p.effects.map((e: any) => ({
        effectId: e.effectId,
        stacks: e.stacks,
        duration: e.duration,
        dataJson: e.dataJson,
      })),
      flags: parseFlags(p.flagsJson),
    })),
    drops: s.drops,
  };
}

export interface StartPlayer {
  charId: string;
  name: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  chakra: number;
  energia: number;
  jutsuIds: string[];
  attrs?: Record<string, number>;
  nodes?: string[];
  elements?: Element[];
}

export interface StartNpc {
  templateId: string;
}

const TEAM_COLORS = ["A", "B"];

export async function startCombat(opts: {
  channelId: string;
  guildId: string;
  scenarioId: string;
  players: StartPlayer[];
  npcs?: StartNpc[];
  missionInstanceId?: string;
}): Promise<SessionFull> {
  const scenario = getScenarioById(opts.scenarioId);
  if (!scenario) throw new Error(`Cenário inválido: ${opts.scenarioId}`);

  const free = freeStartCells(scenario);
  const leftCells = free.filter((c) => parseCell(c)!.col <= Math.ceil(scenario.cols / 2));
  const rightCells = free.filter((c) => parseCell(c)!.col > Math.ceil(scenario.cols / 2));

  const session = await prisma.combatSession.create({
    data: {
      channelId: opts.channelId,
      guildId: opts.guildId,
      scenarioId: opts.scenarioId,
      missionInstanceId: opts.missionInstanceId,
    },
  });

  const participantIds: string[] = [];
  const initiative = new Map<string, number>();
  let li = 0;
  for (const p of opts.players) {
    const cell = leftCells[li++] ?? free[0]!;
    // maxHpBonus (ex: vitalidade do Uzumaki) so' entra AQUI, na entrada em
    // combate — nao mexe no hpMax persistido do personagem fora de luta.
    const cMods = characterPassiveMods(p.nodes ?? []);
    const hpMax = Math.round(p.hpMax * (1 + cMods.maxHpBonus));
    const hpCurrent = Math.round(p.hpCurrent * (1 + cMods.maxHpBonus));
    const cp = await prisma.combatParticipant.create({
      data: {
        sessionId: session.id,
        charId: p.charId,
        name: p.name,
        teamId: "A",
        cell,
        hpCurrent,
        hpMax,
        chakra: p.chakra,
        energia: p.energia,
        jutsuIdsJson: JSON.stringify(p.jutsuIds),
        flagsJson: JSON.stringify({
          level: p.level,
          attrs: p.attrs,
          nodes: p.nodes ?? [],
          elements: p.elements ?? [],
        }),
      },
    });
    participantIds.push(cp.id);
    initiative.set(cp.id, cMods.initiativePriority);
  }
  let ri = 0;
  for (const n of opts.npcs ?? []) {
    const tpl = getNpc(n.templateId);
    if (!tpl) continue;
    const cell = rightCells[ri++] ?? free[free.length - 1]!;
    const cp = await prisma.combatParticipant.create({
      data: {
        sessionId: session.id,
        isNpc: true,
        npcTemplate: tpl.id,
        name: tpl.name,
        teamId: "B",
        cell,
        hpCurrent: tpl.hpMax,
        hpMax: tpl.hpMax,
        chakra: 100,
        energia: 100,
        jutsuIdsJson: JSON.stringify(tpl.abilityIds),
        flagsJson: JSON.stringify({
          level: tpl.level ?? Math.max(1, ...Object.values(tpl.attributes)),
          attrs: tpl.attributes,
          nodes: [],
        }),
      },
    });
    participantIds.push(cp.id);
    initiative.set(cp.id, 0);
  }

  // Ordenacao estavel: Sinapse Acelerada antecipa o participante, mantendo a
  // ordem relativa entre personagens com a mesma prioridade.
  participantIds.sort((a, b) => (initiative.get(b) ?? 0) - (initiative.get(a) ?? 0));

  await prisma.combatSession.update({
    where: { id: session.id },
    data: { turnOrderJson: JSON.stringify(participantIds) },
  });

  return (await getSessionById(session.id))!;
}

function freeStartCells(scenario: ScenarioDef): string[] {
  const blocked = new Set([
    ...(scenario.cells.obstacles ?? []),
    ...(scenario.cells.water ?? []),
  ]);
  return allCells(scenario.rows, scenario.cols).filter((c) => !blocked.has(c));
}

// ---------------- Fuga ----------------

export interface FleeResult {
  ok: boolean;
  escaped: boolean;
  chance: number;
  logs: string[];
  error?: string;
}

// Tenta sair do combate. Gasta a acao comum do turno mesmo falhando: fugir e'
// uma aposta, nao uma acao gratis.
export async function attemptFlee(sessionId: string, participantId: string): Promise<FleeResult> {
  const s = await getSessionById(sessionId);
  if (!s) return { ok: false, escaped: false, chance: 0, logs: [], error: "Combate não encontrado." };
  const p = s.participants.find((x) => x.id === participantId);
  if (!p) return { ok: false, escaped: false, chance: 0, logs: [], error: "Você não está neste combate." };
  if (p.hpCurrent <= 0) return { ok: false, escaped: false, chance: 0, logs: [], error: "Você está derrotado." };
  if (p.actedCommon) {
    return { ok: false, escaped: false, chance: 0, logs: [], error: "Ação comum já usada nesta rodada." };
  }
  if (isStunned(p.effects)) {
    return { ok: false, escaped: false, chance: 0, logs: [], error: "Você está atordoado." };
  }

  const enemies = s.participants.filter((x) => x.hpCurrent > 0 && x.teamId !== p.teamId);
  const check = fleeCheck({
    fleeingCell: p.cell,
    enemyCells: enemies.map((e) => e.cell),
    taijutsu: getAttr(p, "taijutsu"),
    fleeLocked: isFleeLocked(p.effects),
    guaranteed: p.flags.guaranteedFlee === true,
    chanceBonus: hasteFleeChanceBonus(p.effects),
    energia: p.energia,
  });
  if (!check.allowed) {
    return { ok: false, escaped: false, chance: 0, logs: [], error: check.reason };
  }

  await markAction(p.id, "COMUM");
  await deductResource(p.id, "energia", BALANCE.flee.energiaCost);

  const logs: string[] = [];
  const escaped = chance(check.chance);
  if (escaped) {
    logs.push(`🏃 **${p.name}** conseguiu fugir do combate!`);
    await prisma.combatParticipant.delete({ where: { id: p.id } });
    await prisma.combatSession.update({
      where: { id: s.id },
      data: { turnOrderJson: JSON.stringify(s.turnOrder.filter((id) => id !== p.id)) },
    });
  } else {
    logs.push(
      `🏃 **${p.name}** tentou fugir e não conseguiu (${Math.round(check.chance * 100)}% de chance).`,
    );
  }
  return { ok: true, escaped, chance: check.chance, logs };
}

export async function endCombat(sessionId: string): Promise<void> {
  await prisma.combatSession.update({ where: { id: sessionId }, data: { status: "ENDED" } });
}

// ---------------- Invocacoes ----------------

// Cria a invocacao numa casa livre ao lado de quem invocou e a insere na ordem
// de turno logo depois dele (age ainda nesta rodada).
//
// A invocacao e' um CombatParticipant isNpc (reusa a IA) no TIME de quem
// invocou, marcado com flags.isSummon. A marca importa: checkVictory ignora
// invocacoes, senao um clone vivo impediria o combate de acabar.
async function createSummon(
  s: SessionFull,
  summoner: SessionFull["participants"][number],
  summon: NonNullable<Ability["summon"]>,
  logs: string[],
  hpBonus = 0, // Vinculo de Barro (Terra) engorda as invocacoes
): Promise<void> {
  const tpl = getNpc(summon.templateId);
  if (!tpl) return;
  const baseHp = summon.hpFraction != null ? summoner.hpMax * summon.hpFraction : tpl.hpMax;
  const hp = Math.max(1, Math.round(baseHp * (1 + hpBonus)));
  const scenario = getScenarioById(s.scenarioId)!;

  // Clones das Sombras: em vez do abilityIds fixo do template, herda um
  // snapshot dos jutsu que o INVOCADOR ja possui agora, sem os caros demais
  // pra um clone usar (maxCostPct). Se o jogador nao tiver nenhum jutsu de
  // dano dentro do teto, o clone entra sem jutsu (ainda assim se move — ver
  // runNpcTurn em npc-combat.ts).
  let abilityIds = tpl.abilityIds;
  if (summon.inheritOwnerJutsu) {
    const owned = await ownedJutsuIds(summoner);
    const maxCost = summon.inheritOwnerJutsu.maxCostPct;
    abilityIds = owned.filter((id) => {
      const ab = getAbility(id);
      return Boolean(ab?.baseDamage) && ab!.cost <= maxCost;
    });
  }

  const blocked = effectiveObstacles(scenario, s.terrain, s.round);
  const taken = new Set(s.participants.filter((p) => p.hpCurrent > 0).map((p) => p.cell));
  const origin = parseCell(summoner.cell);
  if (!origin) return;

  // varias copias de uma vez (ex: a matilha de ninken do Hatake) — cada uma
  // ocupa sua propria casa livre ao redor de quem invocou.
  const spots = neighbors(origin)
    .filter((c) => c.row >= 0 && c.row < scenario.rows && c.col >= 1 && c.col <= scenario.cols)
    .map(toCell)
    .filter((c) => !blocked.has(c) && !taken.has(c))
    .slice(0, Math.max(1, summon.count ?? 1));
  if (!spots.length) {
    logs.push("⚠️ Não há espaço livre ao seu lado para a invocação.");
    return;
  }

  const newIds: string[] = [];
  for (const spot of spots) {
    const cp = await prisma.combatParticipant.create({
      data: {
        sessionId: s.id,
        isNpc: true,
        npcTemplate: tpl.id,
        name: tpl.name,
        teamId: summoner.teamId, // luta do SEU lado
        cell: spot,
        hpCurrent: hp,
        hpMax: hp,
        chakra: 100,
        energia: 100,
        jutsuIdsJson: JSON.stringify(abilityIds),
        flagsJson: JSON.stringify({
          isSummon: true,
          summonerId: summoner.id,
          summonTemplateId: summon.templateId,
          onHit: summon.onHit ?? null,
          onDeath: summon.onDeath ?? null,
          deathReflect: summon.deathReflect ?? null,
          chakraDebt: 0,
          firstActiveRound: summon.actsNextRound ? s.round + 1 : undefined,
        }),
      },
    });
    newIds.push(cp.id);
  }
  if ((summon.count ?? 1) > spots.length) {
    logs.push(`⚠️ Só havia espaço pra ${spots.length} de ${summon.count} invocações.`);
  }

  // entram logo depois de quem invocou, para agir ainda nesta rodada
  const order = [...s.turnOrder];
  const at = order.indexOf(summoner.id);
  if (at >= 0) order.splice(at + 1, 0, ...newIds);
  else order.push(...newIds);
  await prisma.combatSession.update({
    where: { id: s.id },
    data: { turnOrderJson: JSON.stringify(order) },
  });

  const where = spots.join(", ");
  logs.push(
    spots.length > 1
      ? `🌀 ${summoner.name} invocou ${spots.length}x **${tpl.name}** em ${where}.`
      : `🌀 ${summoner.name} invocou **${tpl.name}** em ${where}.`,
  );
}

// Estouro da invocacao ao morrer (clone d'agua molha a area em volta).
async function triggerSummonDeath(
  s: SessionFull,
  dead: SessionFull["participants"][number],
  logs: string[],
): Promise<void> {
  const onDeath = dead.flags.onDeath as
    | { effectId: EffectId; radius: number; duration?: number }
    | null
    | undefined;
  if (!onDeath) return;
  const scenario = getScenarioById(s.scenarioId)!;
  const center = parseCell(dead.cell);
  if (!center) return;

  const area = new Set(
    radiusCells(center, Math.max(1, onDeath.radius), scenario.rows, scenario.cols).map(toCell),
  );
  const atingidos = s.participants.filter(
    (p) => p.hpCurrent > 0 && p.id !== dead.id && area.has(p.cell),
  );
  for (const alvo of atingidos) {
    await applyEffect(
      alvo.id,
      onDeath.effectId,
      1,
      onDeath.duration ?? defaultDurationFor(onDeath.effectId),
    );
  }
  if (atingidos.length) {
    const icon = onDeath.effectId === "STUN" ? "⚡" : "💦";
    logs.push(
      `${icon} **${dead.name}** se desfez e atingiu ${atingidos.map((a) => a.name).join(", ")}.`,
    );
  }
}

// Clones das Sombras: quando o clone morre, o invocador sente parte do dano
// que EXCEDEU o hpMax do clone (ex: 1 de vida, tomou 20 -> excedente 19) e
// paga de volta o chakra acumulado (flags.chakraDebt) de cada jutsu que o
// clone usou em vida. `incomingDamage` e' o dano que efetivamente matou o
// clone nesta troca (variavel `damage` de resolveHit, ja liquida de
// reacao/Barreira).
async function reflectSummonDeath(
  sessionId: string,
  s: SessionFull,
  dead: SessionFull["participants"][number],
  incomingDamage: number,
  logs: string[],
): Promise<void> {
  const deathReflect = dead.flags.deathReflect as
    | { overkillDamagePct: number; jutsuCostPct: number }
    | null
    | undefined;
  if (!deathReflect) return;
  const owner = s.participants.find((p) => p.id === dead.flags.summonerId);
  if (!owner || owner.hpCurrent <= 0) return;

  const reflectedDamage = summonOverkillReflect(incomingDamage, dead.hpMax, deathReflect.overkillDamagePct);
  if (reflectedDamage > 0) {
    const hpAfter = await applyDamage(sessionId, owner, reflectedDamage, logs);
    logs.push(
      `💢 ${dead.name} se desfez e ${owner.name} sentiu o retorno: ${reflectedDamage} de dano (HP ${hpAfter}/${owner.hpMax}).`,
    );
  }

  const chakraDebt = Math.round(Number(dead.flags.chakraDebt ?? 0));
  if (chakraDebt > 0) {
    const newChakra = Math.max(0, owner.chakra - chakraDebt);
    await prisma.combatParticipant.update({ where: { id: owner.id }, data: { chakra: newChakra } });
    logs.push(`🌀 O chakra gasto pelo clone voltou pra ${owner.name}: -${chakraDebt}% de chakra.`);
  }
}

// Persiste as manchas de terreno e atualiza a sessao em memoria.
async function saveTerrain(s: SessionFull, patches: TerrainPatch[]): Promise<void> {
  s.terrain = patches;
  await prisma.combatSession.update({
    where: { id: s.id },
    data: { terrainJson: serializeTerrain(patches) },
  });
}

export function activeParticipant(s: SessionFull) {
  const id = s.turnOrder[s.activeIndex];
  return s.participants.find((p) => p.id === id) ?? null;
}

// ---------------- Movimento ----------------

export interface MoveResult {
  ok: boolean;
  error?: string;
  cost?: number;
}

// Valida um movimento SEM aplicar (usado p/ pré-checar antes de confirmar subida).
export function validateMove(s: SessionFull, participantId: string, dest: string): MoveResult {
  const scenario = getScenarioById(s.scenarioId)!;
  const p = s.participants.find((x) => x.id === participantId);
  if (!p) return { ok: false, error: "Participante fora do combate." };
  if (p.actedMove) return { ok: false, error: "Ação de movimento já usada nesta rodada." };
  const coord = parseCell(dest);
  if (!coord || coord.row >= scenario.rows || coord.col > scenario.cols || coord.col < 1) {
    return { ok: false, error: "Célula inválida." };
  }
  if (isStunned(p.effects)) return { ok: false, error: "Você está atordoado e não pode se mover." };
  if (isRooted(p.effects)) return { ok: false, error: "Você está enraizado e não pode se mover." };
  if (isShadowBound(p.effects)) {
    return { ok: false, error: "Sua sombra está vinculada — seu corpo não obedece, não dá pra se mover." };
  }
  if (!cellHasRoom(s, dest, p.isNpc, p.id)) {
    return {
      ok: false,
      error: p.isNpc ? "Célula cheia (máx. 3 inimigos)." : "Já há outro jogador nessa célula.",
    };
  }
  // obstaculos do cenario + muros/blocos erguidos por jutsu (terreno temporario)
  if (effectiveObstacles(scenario, s.terrain, s.round).has(dest)) {
    return { ok: false, error: "Célula bloqueada por obstáculo." };
  }

  let move = moveRange(getAttr(p, "taijutsu"));
  move = applySlowToMove(move, p.effects);
  move = applyHasteToMove(move, p.effects);
  // pantano na celula de origem prende: sair dele custa o dobro
  move = Math.max(1, Math.floor(move * terrainMoveFactor(s.terrain, p.cell, s.round)));
  // cristal pesa e PODE zerar o movimento (por isso vem depois do piso de 1):
  // coberto de cristal o suficiente, o alvo simplesmente nao anda.
  move = applyCrystalToMove(move, p.effects);
  // Prisma: o usuario esta suspenso num casulo de luz. Nao se move, e ponto.
  if (isPrismed(p.effects)) {
    return { ok: false, error: "Você está imóvel dentro do Prisma." };
  }

  let dist = cellDistance(p.cell, dest);
  // agua reduz deslocamento pela metade, salvo waterWalk ativo
  const onWater = effectiveWater(scenario, s.terrain, s.round).has(dest);
  if (onWater && !p.flags.waterWalk) dist = dist * 2;
  if (dist > move) {
    return { ok: false, error: `Fora do alcance de movimento (max ${move}).` };
  }
  return { ok: true, cost: dist };
}

export async function moveParticipant(
  s: SessionFull,
  participantId: string,
  dest: string,
  opts?: { elevated?: boolean; alsoCommon?: boolean },
): Promise<MoveResult> {
  const chk = validateMove(s, participantId, dest);
  if (!chk.ok) return chk;
  const p = s.participants.find((x) => x.id === participantId)!;

  const newFlags = { ...p.flags, elevated: opts?.elevated ?? false };
  await prisma.combatParticipant.update({
    where: { id: participantId },
    data: {
      cell: dest,
      actedMove: true,
      flagsJson: JSON.stringify(newFlags),
      ...(opts?.alsoCommon ? { actedCommon: true } : {}),
    },
  });
  return { ok: true, cost: chk.cost };
}

// Define a flag de "subido" (altura) de um participante.
export async function setElevated(s: SessionFull, participantId: string, value: boolean): Promise<void> {
  const p = s.participants.find((x) => x.id === participantId);
  if (!p) return;
  const newFlags = { ...p.flags, elevated: value };
  await prisma.combatParticipant.update({
    where: { id: participantId },
    data: { flagsJson: JSON.stringify(newFlags) },
  });
}

// Regra de ocupação: até 3 por célula de cada lado (3 NPCs + 3 jogadores).
// NPCs e jogadores podem coexistir na mesma célula (melee no mesmo quadrado).
export const MAX_PER_CELL = 3;
function cellHasRoom(s: SessionFull, cell: string, isNpc: boolean, selfId?: string): boolean {
  const here = s.participants.filter((p) => p.cell === cell && p.hpCurrent > 0 && p.id !== selfId);
  return here.filter((p) => p.isNpc === isNpc).length < MAX_PER_CELL;
}

// Numera participantes de mesmo nome (ex: 3 "Capanga" -> 1,2,3). Nome único -> null.
// Ordem estável pela ordem dos participantes na sessão.
export function numberSameNames(parts: SessionFull["participants"]): Map<string, number | null> {
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<string, number | null>();
  for (const p of parts) {
    if ((counts.get(p.name) ?? 0) > 1) {
      const n = (seen.get(p.name) ?? 0) + 1;
      seen.set(p.name, n);
      out.set(p.id, n);
    } else {
      out.set(p.id, null);
    }
  }
  return out;
}

// Nome de exibição com numeração (ex: "Capanga 2").
export function displayName(name: string, num: number | null | undefined): string {
  return num ? `${name} ${num}` : name;
}

function getAttr(p: SessionFull["participants"][number], attr: Attribute): number {
  // NPC: do template; player: precisa de lookup. Guardamos em flags p/ simplificar NPC.
  if (p.isNpc && p.npcTemplate) {
    const tpl = getNpc(p.npcTemplate);
    return tpl?.attributes[attr] ?? 1;
  }
  const cached = (p.flags.attrs as Record<string, number> | undefined)?.[attr];
  return cached ?? 1;
}

// Nos da arvore que o participante possui (snapshot tirado no inicio do combate).
// NPC nao tem arvore: nunca ganha passiva de no.
function ownedNodes(p: SessionFull["participants"][number]): string[] {
  if (p.isNpc) return [];
  const nodes = p.flags.nodes;
  return Array.isArray(nodes) ? (nodes as string[]) : [];
}

// ---------------- Uso de habilidade ----------------

export interface AbilityHit {
  targetId: string;
  ability: Ability;
  rawDamage: number;
}

export interface UseAbilityResult {
  ok: boolean;
  error?: string;
  logs: string[];
  hits: AbilityHit[]; // dano pendente de reacao
}

// ---------------- Preview de area (read-only) ----------------

export interface AbilityPreview {
  cells: string[];
  // quem esta na area, separado por lado em relacao ao atacante
  enemies: SessionFull["participants"];
  allies: SessionFull["participants"];
  // atacante confuso: o alvo pode ser redirecionado no uso real
  confused: boolean;
}

export function isAreaShape(ability: Ability): boolean {
  return ability.shape === "LINE" || ability.shape === "CONE" || ability.shape === "RADIUS";
}

// Calcula a area que um jutsu atingiria, SEM aplicar nada. Usado para mostrar o
// preview antes de confirmar. `useAbility` continua sendo a validacao final —
// isto aqui so desenha a intencao.
export function previewAbilityArea(
  s: SessionFull,
  actorId: string,
  ability: Ability,
  targetCell: string | null,
): AbilityPreview | null {
  const actor = s.participants.find((p) => p.id === actorId);
  if (!actor || !targetCell) return null;
  const scenario = getScenarioById(s.scenarioId);
  if (!scenario) return null;

  const cells = resolveAreaCells(ability, actor.cell, targetCell, scenario);
  if (cells.length === 0) return null;

  const hit = ability.chainWetTargets
    ? s.participants.filter((p) => p.hpCurrent > 0 && p.id !== actor.id && isWet(p.effects))
    : s.participants.filter(
        (p) => p.hpCurrent > 0 && p.id !== actor.id && cells.includes(p.cell),
      );
  return {
    cells,
    enemies: hit.filter((p) => p.teamId !== actor.teamId),
    allies: hit.filter((p) => p.teamId === actor.teamId),
    confused: isConfused(actor.effects),
  };
}

// jogador: le jutsus ao vivo do personagem (snapshot pode estar
// desatualizado). NPC: usa o snapshot (jutsuIdsJson). Exportada porque o
// autocomplete de /jutsu (jutsu.ts) precisa da mesma logica pro corpo que o
// jogador estiver de fato controlando, nao so' pro proprio personagem.
async function learnedJutsuIds(p: SessionFull["participants"][number]): Promise<string[]> {
  if (!p.isNpc && p.charId) {
    const rows = await prisma.characterJutsu.findMany({ where: { charId: p.charId } });
    return rows.map((r) => r.jutsuId);
  }
  return JSON.parse(p.jutsuIdsJson) as string[];
}

export async function ownedJutsuIds(p: SessionFull["participants"][number]): Promise<string[]> {
  const learned = await learnedJutsuIds(p);
  const copied = p.flags.sharinganTomoe === 3 ? p.flags.sharinganCopiedAbilityId : undefined;
  return typeof copied === "string" && !learned.includes(copied) ? [...learned, copied] : learned;
}

function sharinganTomoe(flags: Record<string, unknown>): SharinganTomoe | null {
  const value = flags.sharinganTomoe;
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function sharinganDodgeBonus(flags: Record<string, unknown>): number {
  const tomoe = sharinganTomoe(flags);
  return tomoe ? BALANCE.sharingan[tomoe].dodgeBonus : 0;
}

async function offerSharinganCopy(
  s: SessionFull,
  userId: string,
  ability: Ability,
  logs: string[],
): Promise<void> {
  if (!isSharinganCopyable(ability)) return;
  for (const observer of s.participants) {
    if (observer.id === userId || observer.hpCurrent <= 0 || observer.flags.sharinganTomoe !== 3) continue;
    const attrs = (observer.flags.attrs as Record<string, number> | undefined) ?? {};
    let elements = Array.isArray(observer.flags.elements) ? (observer.flags.elements as Element[]) : [];
    if (elements.length === 0 && observer.charId) {
      const rows = await prisma.characterElement.findMany({
        where: { charId: observer.charId },
        select: { element: true },
      });
      elements = rows.map((row) => row.element as Element);
    }
    const node = allNodes().find((candidate) => candidate.grantsAbilityId === ability.id);
    const error = sharinganCopyRequirementError(
      ability,
      {
        level: Number(observer.flags.level ?? 1),
        ninjutsu: attrs.ninjutsu ?? 1,
        elements,
      },
      node ? { level: node.reqLevel, ninjutsu: node.pool === "ninjutsu" ? node.reqPool : undefined } : {},
    );
    if (error) {
      logs.push(`👁️ ${observer.name} observou **${ability.name}**, mas não conseguiu copiá-la: ${error}`);
      continue;
    }

    if (!observer.isNpc && observer.charId) {
      const alreadyKnown = await prisma.characterJutsu.findUnique({
        where: { charId_jutsuId: { charId: observer.charId, jutsuId: ability.id } },
      });
      if (alreadyKnown) continue;
      await prisma.$transaction([
        prisma.characterJutsu.upsert({
          where: { charId_jutsuId: { charId: observer.charId, jutsuId: ability.id } },
          create: { charId: observer.charId, jutsuId: ability.id },
          update: {},
        }),
        prisma.characterSkillNode.upsert({
          where: {
            charId_nodeId: {
              charId: observer.charId,
              nodeId: sharinganCopyNodeId(ability.id),
            },
          },
          create: {
            charId: observer.charId,
            nodeId: sharinganCopyNodeId(ability.id),
          },
          update: {},
        }),
      ]);
      logs.push(`👁️ ${observer.name} copiou **${ability.name}** permanentemente para o Arsenal do Sharingan.`);
      continue;
    }

    await setFlag(observer.id, "sharinganCopiedAbilityId", ability.id);
    logs.push(`👁️ ${observer.name} memorizou **${ability.name}** com o Sharingan de três tomoe.`);
  }
}

export async function useAbility(
  s: SessionFull,
  actorId: string,
  abilityId: string,
  targetCell: string | null,
  targetId?: string | null,
  options?: { allowUnlearned?: boolean },
): Promise<UseAbilityResult> {
  const logs: string[] = [];
  const actor = s.participants.find((p) => p.id === actorId);
  if (!actor) return fail("Você não está neste combate.");
  if (actor.hpCurrent <= 0) return fail("Personagem incapacitado.");
  const foundAbility = getAbility(abilityId);
  if (!foundAbility) return fail("Habilidade desconhecida.");
  let ability = foundAbility;

  const learned = await learnedJutsuIds(actor);
  const isCopied =
    !learned.includes(abilityId) &&
    actor.flags.sharinganTomoe === 3 &&
    actor.flags.sharinganCopiedAbilityId === abilityId;
  if (!learned.includes(abilityId) && !isCopied && !options?.allowUnlearned) {
    return fail("Habilidade não desbloqueada.");
  }
  if (isCopied) {
    const attrs = (actor.flags.attrs as Record<string, number> | undefined) ?? {};
    let elements = Array.isArray(actor.flags.elements) ? (actor.flags.elements as Element[]) : [];
    // Combates antigos/de missão podem não ter o snapshot de elementos nas
    // flags. Nesse caso, lê as afinidades atuais do personagem.
    if (elements.length === 0 && actor.charId) {
      const rows = await prisma.characterElement.findMany({
        where: { charId: actor.charId },
        select: { element: true },
      });
      elements = rows.map((row) => row.element as Element);
    }
    const error = sharinganCopyRequirementError(ability, {
      level: Number(actor.flags.level ?? 1),
      ninjutsu: attrs.ninjutsu ?? 1,
      elements,
    }, (() => {
      const node = allNodes().find((candidate) => candidate.grantsAbilityId === ability.id);
      return node ? { level: node.reqLevel, ninjutsu: node.pool === "ninjutsu" ? node.reqPool : undefined } : {};
    })());
    if (error) return fail(error);
  }

  // Afinidades acumulativas da Lâmina de Chakra. A técnica continua sendo
  // Bukijutsu, mas cada natureza conhecida acrescenta sua própria propriedade.
  if (
    ownedNodes(actor).includes("buki_afinidade_lamina") &&
    ability.tags.includes("lamina-chakra")
  ) {
    const elements = new Set(Array.isArray(actor.flags.elements) ? actor.flags.elements as Element[] : []);
    const basicElements: Element[] = ["FOGO", "AGUA", "VENTO", "RAIO", "TERRA"];
    const knownBasicElements = basicElements.filter((element) => elements.has(element)).length;
    const extraEffects = [...(ability.effects ?? [])];
    if (elements.has("FOGO")) extraEffects.push({ effectId: "BURN", stacks: 1, duration: 2 });
    if (elements.has("RAIO")) extraEffects.push({ effectId: "STUN", duration: 1, chance: 0.2 });
    if (elements.has("TERRA")) extraEffects.push({ effectId: "DEFENSE_DOWN", duration: 1 });
    const affinityCost = ability.cost * (1 + knownBasicElements * 0.1);
    const finalAffinityCost = elements.has("AGUA") ? affinityCost * 0.85 : affinityCost;
    ability = {
      ...ability,
      baseDamage: ability.baseDamage === undefined
        ? undefined
        : ability.baseDamage * (1 + knownBasicElements * 0.1),
      cost: Math.max(1, Math.round(finalAffinityCost)),
      range: ability.range + (elements.has("VENTO") ? 1 : 0),
      effects: extraEffects.length ? extraEffects : ability.effects,
    };
  }
  if (ability.toggleRules) {
    return fail(`Esta técnica é contínua. Use ${ability.toggleRules.command} para ativar ou desativar.`);
  }

  // economia de acao
  if (ability.actionType === "COMUM" && actor.actedCommon) return fail("Ação comum já usada.");
  if (ability.actionType === "BONUS" && actor.actedBonus) return fail("Ação bônus já usada.");
  if (ability.actionType === "MOVIMENTO" && actor.actedMove) return fail("Ação de movimento já usada.");

  if (ability.category === "NINJUTSU" && ninjutsuBlocked(actor.effects)) {
    return fail("Você está impedido de usar Ninjutsu (selo/genjutsu).");
  }
  if (isStunned(actor.effects)) return fail("Você está atordoado e não pode agir.");

  // passivas dos nos comprados (snapshot em flags.nodes)
  const mods = passiveMods(ownedNodes(actor), ability);

  // custo apos maestria e apos passivas de reducao de custo
  const mastery = await masteryFor(actor, ability.resource);
  const cost = Math.max(1, Math.round(costAfterMastery(ability.cost, mastery) * mods.costMult));
  const pool = ability.resource === "chakra" ? actor.chakra : actor.energia;
  if (pool < cost) return fail(`${ability.resource} insuficiente (precisa ${cost}%).`);

  // alvo específico (por participante) ou por célula (fallback p/ NPC/área)
  let targetP =
    (targetId ? s.participants.find((p) => p.id === targetId && p.hpCurrent > 0) : undefined) ??
    (targetCell ? s.participants.find((p) => p.cell === targetCell && p.hpCurrent > 0 && p.id !== actor.id) : undefined) ??
    null;

  // confusao: redireciona alvo para alguem aleatorio
  let effectiveTarget = targetP?.cell ?? targetCell;
  if (isConfused(actor.effects) && needsTarget(ability)) {
    const others = s.participants.filter((p) => p.id !== actor.id && p.hpCurrent > 0);
    const r = pick(others);
    if (r) {
      targetP = r;
      effectiveTarget = r.cell;
      logs.push(`😵 ${actor.name} está confuso e mira em ${r.name}!`);
    }
  }

  // alvo obrigatorio: sem isso o jutsu nao atinge nada. Falha ANTES de gastar
  // recurso/acao — antes esta checagem so rodava quando ja havia alvo, entao
  // usar sem alvo queimava chakra e o turno a toa.
  if (needsTarget(ability) && !effectiveTarget) {
    return fail("Escolha um alvo (nome pelo autocomplete) ou uma célula, ex: `alvo:C4`.");
  }

  const scenario = getScenarioById(s.scenarioId)!;

  if (ability.chainWetTargets && (!targetP || !isWet(targetP.effects))) {
    return fail("O alvo inicial precisa estar Encharcado para conduzir a corrente.");
  }
  if (
    ability.requiresTargetEffect &&
    (!targetP || !ability.requiresTargetEffect.some((eff) => hasEffect(targetP!.effects, eff)))
  ) {
    return fail(
      `O alvo precisa estar sob ${ability.requiresTargetEffect.map(effectLabel).join(" ou ")} para esta técnica funcionar.`,
    );
  }
  if (ability.oncePerCombat && actor.flags.usedOnceAbility === ability.id) {
    return fail(`${ability.name} so pode ser usado uma vez por combate.`);
  }
  if (
    !isCopied &&
    ability.requiresStorm &&
    !ownedNodes(actor).includes("raio_nuvens") &&
    !hasActiveKind(s.terrain, "FIRE", s.round)
  ) {
    return fail("Kirin exige chamas ativas no campo ou a passiva Nuvens de Tempestade.");
  }
  if (
    ability.requiresPet &&
    !s.participants.some((p) => p.hpCurrent > 0 && p.flags.isSummon && p.flags.summonerId === actor.id)
  ) {
    return fail("Precisa do seu cão ninja vivo em campo pra usar essa técnica.");
  }
  if (ability.summon?.maxAlive) {
    const aliveOfKind = s.participants.filter(
      (p) =>
        p.hpCurrent > 0 &&
        p.flags.isSummon &&
        p.flags.summonerId === actor.id &&
        p.flags.summonTemplateId === ability.summon!.templateId,
    ).length;
    if (aliveOfKind >= ability.summon.maxAlive) {
      return fail(`Você já tem o máximo de ${ability.summon.maxAlive} invocações desse tipo vivas em campo.`);
    }
  }
  if (ability.requiresActiveDoujutsu && !actor.flags[ability.requiresActiveDoujutsu.flag]) {
    return fail(`Precisa estar com o ${ability.requiresActiveDoujutsu.label} ativo pra usar essa técnica.`);
  }
  const requiredAbilityId = ability.requirements?.requiresAbilityId;
  if (requiredAbilityId && !(await ownedJutsuIds(actor)).includes(requiredAbilityId)) {
    const reqAbility = getAbility(requiredAbilityId);
    return fail(`Precisa conhecer ${reqAbility?.name ?? requiredAbilityId} pra usar essa técnica.`);
  }

  // alcance
  if (needsTarget(ability) && effectiveTarget) {
    const d = cellDistance(actor.cell, effectiveTarget);
    // passiva pode esticar o alcance (Alcance Estendido, do Vento)
    const baseRange = ability.range + mods.rangeBonus;
    const maxRange = ability.shape === "MELEE" ? Math.max(1, baseRange) : baseRange;
    if (d > maxRange) return fail("Alvo fora do alcance.");
    // linha de visao: muro, arvore e fumaca cortam a mira (corpo a corpo ignora)
    if (ability.shape !== "MELEE" && !ability.pierceObstacles) {
      const blockers = effectiveLineBlockers(scenario, s.terrain, s.round);
      if (!lineIsClear(actor.cell, effectiveTarget, blockers, scenario)) {
        return fail("Sem linha de visão: algo bloqueia o caminho até o alvo.");
      }
    }
  }

  if ((ability.requiredItems?.length || ability.equippedItemIds?.length) && !actor.charId) {
    return fail("Esta técnica exige uma mochila vinculada ao personagem.");
  }
  if (actor.charId && (ability.requiredItems?.length || ability.equippedItemIds?.length)) {
    const itemUse = await validateAndConsumeAbilityItems(
      actor.charId,
      ability.requiredItems,
      ability.equippedItemIds,
    );
    if (!itemUse.ok) return fail(itemUse.error);
    if (itemUse.consumed.length) logs.push(`🎒 Consumiu ${itemUse.consumed.join(", ")}.`);
  }

  // deduz recurso e marca acao
  await deductResource(actor.id, ability.resource, cost);
  // Clones das Sombras (e futuras invocacoes com deathReflect): o custo BASE
  // do jutsu (sem maestria) vira divida acumulada, cobrada do invocador de
  // uma vez so' quando o clone morrer — ver reflectSummonDeath().
  if (actor.flags.isSummon && actor.flags.deathReflect && ability.resource === "chakra") {
    const debtRate = (actor.flags.deathReflect as { jutsuCostPct: number }).jutsuCostPct;
    const increment = Math.round(ability.cost * debtRate);
    if (increment > 0) {
      const current = Number(actor.flags.chakraDebt ?? 0);
      await setFlag(actor.id, "chakraDebt", current + increment);
    }
  }
  await markAction(actor.id, ability.actionType);
  if (ability.oncePerCombat) await setFlag(actor.id, "usedOnceAbility", ability.id);
  if (isCopied) await setFlag(actor.id, "sharinganCopiedAbilityId", undefined);
  logs.push(`✨ ${actor.name} usou **${ability.name}** (-${cost}% ${ability.resource}).`);
  await offerSharinganCopy(s, actor.id, ability, logs);

  // cura / cleanse / buff
  if (ability.baseHeal || ability.cleanses || ability.reduceEffectDuration || ability.restoreResource) {
    const healTarget = targetP ?? actor;
    if (ability.cleanses) {
      for (const eff of ability.cleanses) {
        await prisma.effectInstance.deleteMany({
          where: { participantId: healTarget.id, effectId: eff },
        });
      }
      logs.push(`🧼 Efeitos removidos de ${healTarget.name}: ${ability.cleanses.join(", ")}.`);
    }
    if (ability.reduceEffectDuration) {
      for (const reduction of ability.reduceEffectDuration) {
        const activeEffects = await prisma.effectInstance.findMany({
          where: { participantId: healTarget.id, effectId: reduction.effectId },
        });
        for (const activeEffect of activeEffects) {
          const remaining = activeEffect.duration - reduction.turns;
          if (remaining <= 0) {
            await prisma.effectInstance.delete({ where: { id: activeEffect.id } });
          } else {
            await prisma.effectInstance.update({ where: { id: activeEffect.id }, data: { duration: remaining } });
          }
        }
      }
      logs.push(`🩺 Duração reduzida em ${ability.reduceEffectDuration.map((r) => `${r.turns} turno(s) de ${r.effectId}`).join(", ")} para ${healTarget.name}.`);
    }
    if (ability.baseHeal) {
      let passiveHealMult = mods.healMult;
      if (
        mods.criticalHealBonus &&
        healTarget.hpCurrent / Math.max(1, healTarget.hpMax) <= mods.criticalHealBonus.hpThreshold
      ) {
        passiveHealMult *= mods.criticalHealBonus.mult;
      }
      const heal = computeHeal(
        ability,
        getAttr(actor, "iryoNinjutsu"),
        healMultiplier(healTarget.effects) * passiveHealMult,
      );
      const newHp = Math.min(healTarget.hpMax, healTarget.hpCurrent + heal);
      await prisma.combatParticipant.update({
        where: { id: healTarget.id },
        data: { hpCurrent: newHp },
      });
      logs.push(`💚 ${healTarget.name} recuperou ${heal} HP.`);
    }
    if (ability.restoreResource) {
      const { resource, amount } = ability.restoreResource;
      const pool = resource === "chakra" ? healTarget.chakra : healTarget.energia;
      const restored = Math.min(100, pool + amount) - pool;
      if (restored > 0) {
        await prisma.combatParticipant.update({
          where: { id: healTarget.id },
          data: { [resource]: pool + restored },
        });
        logs.push(`⚡ ${healTarget.name} recuperou ${restored}% de ${resource === "chakra" ? "chakra" : "energia"}.`);
      }
    }
  }

  // buffs self (ex: undodgeable no proximo ataque, sharingan)
  if (ability.shape === "SELF" && (ability.undodgeable || ability.reactionKind === undefined) && !ability.baseDamage) {
    if (ability.undodgeable) {
      await setFlag(actor.id, "nextUndodgeable", true);
      logs.push("🌀 Próximo ataque será impossível de esquivar.");
    }
    if (ability.tags.includes("buff")) {
      await setFlag(actor.id, "reactionBuff", true);
      logs.push("👁️ Buff de leitura/reação ativado.");
    }
  }

  // Efeitos de habilidades SELF sao buffs do proprio usuario — ou do time
  // inteiro, se teamBuff (rede telepatica do Yamanaka): sem alcance, so'
  // limitada a teamBuffMax pessoas no total, contando o proprio ator, e
  // escolhendo as mais proximas dele entre os aliados vivos. Efeitos de
  // ataque continuam sendo aplicados apenas quando o golpe causa dano.
  if (ability.shape === "SELF" && ability.effects) {
    const recipients = ability.teamBuff
      ? [
          actor,
          ...s.participants
            .filter((p) => p.id !== actor.id && p.teamId === actor.teamId && p.hpCurrent > 0)
            .sort((a, b) => cellDistance(actor.cell, a.cell) - cellDistance(actor.cell, b.cell)),
        ].slice(0, ability.teamBuffMax ?? 1)
      : [actor];
    for (const recipient of recipients) {
      for (const ae of ability.effects) {
        if (ae.chance !== undefined && !chance(ae.chance)) continue;
        await applyEffect(
          recipient.id,
          ae.effectId,
          (ae.stacks ?? 1) + (mods.effectStacksBonus[ae.effectId] ?? 0),
          (ae.duration ?? defaultDurationFor(ae.effectId)) + (mods.effectDurationBonus[ae.effectId] ?? 0),
          {
            replaceGroup: ae.replaceGroup,
            onExpire: ae.onExpire,
            empoweredScope: resolveEmpoweredScope(ae.empoweredScope, ability),
          },
        );
        logs.push(`⚡ ${recipient.name} recebeu efeito **${effectLabel(ae.effectId)}**.`);
      }
    }
  }

  // zona que prende inimigos proximos (ex: Domo de Iceberg) — libera sozinha
  // se a Barreira do ator quebrar antes da duracao normal acabar, ver
  // consumeShield() em resolveHit().
  if (ability.trapField) {
    const { effectId: trapEffect, radius, duration } = ability.trapField;
    const enemiesNear = s.participants.filter(
      (p) => p.hpCurrent > 0 && p.teamId !== actor.teamId && cellDistance(actor.cell, p.cell) <= radius,
    );
    for (const enemy of enemiesNear) {
      await applyEffect(enemy.id, trapEffect, 1, duration, {});
      await setFlag(enemy.id, "trappedBy", actor.id);
      await setFlag(enemy.id, "trappedByEffect", trapEffect);
      logs.push(`🥶 ${enemy.name} ficou preso perto de ${actor.name}!`);
    }
  }

  // invocacao: entra no grid ao lado de quem chamou
  if (ability.summon) await createSummon(s, actor, ability.summon, logs, mods.summonHpBonus);

  // terreno: o jutsu marca as celulas atingidas (chamas, poca, muro, fumaca,
  // pantano) — do proprio jutsu ou de passiva (ex: Pavio deixa tudo em chamas)
  if ((ability.terrain || ability.clearsTerrain || mods.terrainOnHit.length) && effectiveTarget) {
    const shaped = resolveAreaCells(ability, actor.cell, effectiveTarget, scenario);
    const cells = shaped.length ? shaped : [effectiveTarget];
    let next = s.terrain;
    if (ability.clearsTerrain) next = clearKindAt(next, cells, ability.clearsTerrain);
    const layers = [
      ...(ability.terrain ? [ability.terrain] : []),
      ...mods.terrainOnHit, // passivas (Pavio)
    ];
    for (const layer of layers) {
      next = mergePatches(
        next,
        makePatches(
          cells,
          layer.kind,
          s.round,
          // Terreno Firme (Terra) faz muro e pantano durarem mais
          (layer.duration ?? BALANCE.terrain.defaultDuration) + mods.terrainDurationBonus,
        ),
      );
    }
    await saveTerrain(s, next);
  }

  // dano: monta hits. `!== undefined` (nao truthy) de proposito: baseDamage:0
  // e' "nasceu sem dano, so' efeito/captura" (Vinculo de Sombra do Nara,
  // Shintenshin do Yamanaka) — precisa passar por resolveHit() pra reacao
  // (esquiva) valer, mesmo sem causar dano nenhum. Ver effectsLanded() em
  // effects.ts, que ja' trata esse caso; so' a montagem do hit aqui estava
  // usando `&&`, que descarta 0 por ser falsy.
  const hits: AbilityHit[] = [];
  if (ability.baseDamage !== undefined && effectiveTarget) {
    const singleShape = ability.shape === "MELEE" || ability.shape === "SINGLE_TARGET";
    let targets: SessionFull["participants"];
    if (ability.chainWetTargets) {
      // A eletricidade usa cada participante Encharcado como condutor. Mantem
      // fogo amigo, assim como as demais areas do jogo.
      targets = s.participants.filter(
        (p) => p.hpCurrent > 0 && p.id !== actor.id && isWet(p.effects),
      );
    } else if (singleShape && targetP) {
      // alvo único e específico: acerta só aquele participante (não toda a célula)
      targets = targetP.id !== actor.id && targetP.hpCurrent > 0 ? [targetP] : [];
    } else {
      const cells = resolveAreaCells(ability, actor.cell, effectiveTarget, scenario);
      targets = s.participants.filter(
        (p) => p.hpCurrent > 0 && p.id !== actor.id && cells.includes(p.cell),
      );
      // garante que o alvo escolhido seja atingido (ex: ponto-blank na mesma célula,
      // onde a linha/cone não tem direção). Alcance já foi validado acima.
      if (targetP && targetP.id !== actor.id && targetP.hpCurrent > 0 && !targets.some((t) => t.id === targetP.id)) {
        targets.push(targetP);
      }
    }
    // cenario e passivas de +dano do elemento multiplicam juntos
    const scenarioMod = ability.element
      ? scenario.elementModifiers?.[ability.element]?.dmgMult
      : undefined;
    const burnMult = burnTaijutsuMultiplier(stacksOf(actor, "BURN"));
    const weakenMult = dehydrationMultiplier(stacksOf(actor, "DEHYDRATION"));
    // Sobrecarga (EMPOWERED): dano de saida multiplicado por tempo limitado —
    // ex: Pilula Secreta do Akimichi. Nao e' condicional ao alvo, entao entra
    // no mesmo produto de "cenario e passivas" calculado uma vez so. Pode ter
    // nascido escopado (so' fisico, so' do mesmo clã) — ver empoweredDamageMult.
    const empoweredMult = empoweredDamageMult(actor.effects, ability);
    const heightBonus = onHeight(actor);
    // Yamanaka: pilotando um corpo emprestado (Shintenshin), todo golpe sai
    // com 1/3 a menos — nao domina o corpo 100%. Vale enquanto o controle
    // durar, nao so' no golpe que capturou (actor.controlledById fica setado
    // pra sessao inteira, ver establishControl()).
    const pilotedMult = actor.controlledById ? BALANCE.yamanaka.pilotedDamageMult : 1;
    for (const t of targets) {
      // dano condicional (ex: Fio d'Agua so vale contra alvo Encharcado) precisa
      // do estado DESTE alvo, entao recalcula por alvo em vez de uma vez so.
      const perTarget = passiveMods(ownedNodes(actor), ability, t.effects);
      const executeMult =
        perTarget.executeBonus && t.hpCurrent / t.hpMax <= perTarget.executeBonus.hpThreshold
          ? perTarget.executeBonus.mult
          : 1;
      const raw = computeDamage(ability, {
        attrValue: getAttr(actor, ability.scalingAttribute ?? "ninjutsu"),
        scenarioDmgMult: (scenarioMod ?? 1) * perTarget.damageMult * executeMult * empoweredMult * pilotedMult,
        burnTaiMult: burnMult,
        weakenMult,
        heightBonus,
      });
      hits.push({ targetId: t.id, ability, rawDamage: raw });
    }
    if (targets.length === 0) logs.push("⚠️ Nenhum alvo válido na área.");
  }

  // sangramento: esforco fisico reabre a ferida do proprio atacante
  if (isPhysicalCategory(ability.category)) {
    const extra = bleedExtraOnPhysical(actor.effects);
    if (extra > 0) {
      const hp = await applyDamage(s.id, actor, extra, logs);
      logs.push(`🩸 ${actor.name} forçou o corte e perdeu ${extra} HP (HP ${hp}/${actor.hpMax}).`);
      if (hp <= 0) logs.push(`☠️ ${actor.name} foi derrotado!`);
    }
  }

  return { ok: true, logs, hits };

  function fail(error: string): UseAbilityResult {
    return { ok: false, error, logs, hits: [] };
  }
}

function needsTarget(a: Ability): boolean {
  return !["SELF"].includes(a.shape);
}

function stacksOf(p: SessionFull["participants"][number], effectId: string): number {
  return p.effects.filter((e) => e.effectId === effectId).reduce((acc, e) => acc + e.stacks, 0);
}

// Altura agora depende de o participante ter SUBIDO (flag elevated), não só de
// pisar numa célula de árvore/altura.
function onHeight(p: SessionFull["participants"][number]): boolean {
  return p.flags.elevated === true;
}

// Resolve um hit (com possivel reacao do alvo). Aplica dano, efeitos on-hit, morte.
export interface ResolveOpts {
  reaction?: "BLOCK" | "DODGE" | "PARRY" | "JUTSU" | "NONE";
  reactionAbilityId?: string;
}

export async function resolveHit(
  sessionId: string,
  hit: AbilityHit,
  attackerId: string,
  opts: ResolveOpts = {},
): Promise<string[]> {
  const s = await getSessionById(sessionId);
  if (!s) return [];
  const target = s.participants.find((p) => p.id === hit.targetId);
  const attacker = s.participants.find((p) => p.id === attackerId);
  if (!target || target.hpCurrent <= 0) return [];
  const logs: string[] = [];
  const ability = hit.ability;
  let damage = hit.rawDamage;
  let dodged = false;

  // passivas do atacante: precisam existir antes da reacao (perfuracao de
  // bloqueio) e depois dela (queimadura, deslocamento).
  const atkMods = attacker ? passiveMods(ownedNodes(attacker), ability, target.effects) : null;

  const undodgeable =
    ability.undodgeable || Boolean(attacker?.flags.nextUndodgeable);

  // reacao — Vinculo de Sombra tira a ESCOLHA do alvo: o corpo dele copia o
  // do atacante, entao nenhuma reacao pedida (Esquivar/Bloquear/Aparar) e'
  // aceita enquanto durar. Isso e' o que torna o combo Possessao -> Enforcamento
  // /Shuriken quase garantido no fluxo real do jogo.
  const requestedReaction = opts.reaction ?? "NONE";
  const boundByShadow = isShadowBound(target.effects);
  if (boundByShadow && requestedReaction !== "NONE") {
    logs.push(
      `🌑 ${target.name} está com a sombra vinculada — o corpo copia o do atacante e não consegue reagir.`,
    );
  }
  const alreadyReacted = target.flags.reactionUsedRound === s.round;
  if (alreadyReacted && requestedReaction !== "NONE") {
    logs.push(`⏳ ${target.name} já usou uma reação defensiva nesta rodada.`);
  }
  const reaction = boundByShadow || alreadyReacted ? "NONE" : requestedReaction;
  if (reaction === "DODGE" && !undodgeable && !ability.unblockable) {
    const reactAb = opts.reactionAbilityId ? getAbility(opts.reactionAbilityId) : undefined;
    const physical = isPhysicalCategory(ability.category);
    const defenseMods = characterPassiveMods(ownedNodes(target));

    // Custo da reacao. Jutsu (Substituicao etc) paga o proprio custo/recurso.
    // Esquiva normal gasta energia contra ataque fisico, chakra contra o resto.
    let canDodge = true;
    if (reactAb) {
      const paid = await payReaction(target, reactAb);
      if (paid === null) {
        canDodge = false;
        logs.push(`❌ ${target.name} não tinha ${reactAb.resource} para usar ${reactAb.name}.`);
      }
    } else {
      const resource: "chakra" | "energia" = physical ? "energia" : "chakra";
      const cost = BALANCE.esquivaNormalCost;
      const poolNow = resource === "chakra" ? target.chakra : target.energia;
      if (poolNow < cost) {
        canDodge = false;
        logs.push(`❌ ${target.name} não tinha ${resource} para esquivar — o golpe acertou.`);
      } else {
        await deductResource(target.id, resource, cost);
      }
    }

    if (canDodge) {
      await setFlag(target.id, "reactionUsedRound", s.round);
      const dc = dodgeChance({
        ability,
        defenseDown: target.effects.some((e) => e.effectId === "DEFENSE_DOWN"),
        attackerHeight: attacker ? onHeight(attacker) : false,
        reactionBonus:
          (target.flags.reactionBuff ? 0.1 : 0) +
          // Tecnica de Substituicao (Fundamentos): reacao de esquiva com bonus proprio.
          // Byakugan ativo no ATACANTE enxerga atraves de logro/clone (nao de
          // corpo-de-verdade-virando-outra-coisa, tipo Hidratacao): corta o
          // bonus pela metade quando a reacao e' isCloneTrick.
          (reactAb?.reactionDodgeBonus ?? 0) *
            (reactAb?.isCloneTrick && attacker?.flags.byakuganActive
              ? BALANCE.byakuganCloneSightMult
              : 1) +
          hasteDodgeBonus(target.effects) +
          // Byakugan (Hyuuga) ativo: visao de 360 graus ajuda contra QUALQUER
          // ataque, fisico ou ninjutsu — nao entra no `physical ? 0 : ...` como
          // o bonus de Raio (que so vale contra ninjutsu).
          (target.flags.byakuganActive ? BALANCE.byakuganDodgeBonus : 0) +
          // Ketsuryuugan (Chinoike) ativo: mesmo raciocinio do Byakugan — le
          // o instante do golpe, vale contra qualquer ataque.
          (target.flags.ketsuryuuganActive ? BALANCE.ketsuryuuganDodgeBonus : 0) +
          // Sharingan: o bônus cresce de acordo com o estágio ativo.
          sharinganDodgeBonus(target.flags) +
          (physical ? 0 : defenseMods.ninjutsuDodgeBonus) -
          // cada acumulo de cristal trava mais um pouco o corpo do alvo
          crystalDodgePenalty(target.effects),
      });
      if (chance(dc)) {
        // mensagem por tipo de reacao usada
        const how = reactAb ? `usou ${reactAb.name} e escapou` : "esquivou no reflexo";
        logs.push(`💨 ${target.name} ${how} (${Math.round(dc * 100)}%)!`);
        damage = 0;
        dodged = true;
      } else {
        logs.push(`${target.name} tentou esquivar (${Math.round(dc * 100)}%) e o golpe acertou.`);
      }
    }
  } else if ((reaction === "BLOCK" || reaction === "PARRY") && !ability.unblockable && !ability.unguardable) {
    const reactAb = opts.reactionAbilityId ? getAbility(opts.reactionAbilityId) : undefined;
    const paid = reactAb ? await payReaction(target, reactAb) : 0;
    if (paid === null) {
      logs.push(`❌ ${target.name} não tinha ${reactAb!.resource} para usar ${reactAb!.name}.`);
    } else {
      await setFlag(target.id, "reactionUsedRound", s.round);
      if (reactAb) await applyReactionBenefits(target, reactAb, logs);
    // Explosao Defensiva (Explosao): apara um projetil (BUKIJUTSU) e devolve
    // o golpe INTEIRO no proprio atacante, em vez de so reduzir o dano. Contra
    // qualquer outra categoria, funciona como um aparo comum (cai no else).
    // NAO usa isPhysicalCategory de proposito: KENJUTSU e' fisico, mas NAO e'
    // projetil — nao da' pra "defletir de volta" um corte de katana empunhada,
    // so' um arremesso (kunai/shuriken). Taijutsu idem.
    if (reaction === "PARRY" && reactAb?.reflectsProjectiles && ability.category === "BUKIJUTSU") {
      const reflected = damage;
      damage = 0;
      logs.push(`💥 ${target.name} defletiu o projétil de volta!`);
      if (reflected > 0 && attacker && attacker.hpCurrent > 0) {
        const hpAtk = await applyDamage(sessionId, attacker, reflected, logs);
        logs.push(
          `🗡️ O projétil voltou em ${attacker.name} e causou ${reflected} de dano (HP ${hpAtk}/${attacker.hpMax}).`,
        );
        if (hpAtk <= 0) logs.push(`☠️ ${attacker.name} foi derrotado pelo próprio golpe!`);
      }
    } else {
      const base = reaction === "PARRY" ? BALANCE.parryReductionBase : BALANCE.blockReductionBase;
      // Fio de Navalha (Vento) corta parte da reducao: o corte passa pela guarda
      const factor = base * (1 - (atkMods?.armorPierce ?? 0));
      const reduced = Math.round(damage * (1 - factor));
      logs.push(
        `🛡️ ${target.name} ${reaction === "PARRY" ? "aparou" : "bloqueou"} e reduziu o dano de ${damage} para ${reduced}.`,
      );
      damage = reduced;
    }

    // Pele de Pedra (Terra): defender rende Barreira para o proximo golpe
    if (ownedNodes(target).includes("terra_raiz")) {
      await applyEffect(
        target.id,
        "SHIELD",
        BALANCE.effects.SHIELD.perDefend,
        defaultDurationFor("SHIELD"),
      );
      logs.push(`🪨 ${target.name} ganhou Barreira ao se defender.`);
    }
    }
  }

  // ver effectsLanded() em effects.ts: distingue "nasceu sem dano de
  // proposito" (Vinculo de Sombra) de "dano foi reduzido a 0 por
  // Bloqueio/Barreira".
  const landed = effectsLanded(damage, ability.baseDamage, dodged);

  // Yamanaka: Shintenshin (ou os Clones) acertou — toma o corpo em vez de
  // causar dano. So dispara em cima de esquiva de verdade (landed cobre
  // dodged=false); bloqueio/aparo ja nao valem contra ela (unguardable).
  if (landed && ability.mindTransfer && attacker) {
    // Domínio Mental (Yamanaka, ápice) pode somar +1 corpo simultâneo alem
    // do teto da propria ability — ver ClanPassiveDef.mindTransferMaxBonus.
    const maxSimultaneous = (ability.mindTransferMax ?? 1) + (atkMods?.mindTransferMaxBonus ?? 0);
    await establishControl(sessionId, attacker.id, target.id, logs, {
      maxSimultaneous,
      turnsLeft: ability.mindTransferTurns,
    });
  }

  // limpa flag de undodgeable do atacante (consumido)
  if (attacker?.flags.nextUndodgeable) await setFlag(attacker.id, "nextUndodgeable", false);
  // Tecnica de Clonagem (Fundamentos): o bonus de esquiva so vale pro
  // PROXIMO golpe recebido — a ilusao se desfaz depois de proteger uma vez.
  if (target.flags.reactionBuff) await setFlag(target.id, "reactionBuff", false);

  // Prisma (Cristal): o casulo de luz refrata o ninjutsu recebido e devolve
  // parte no atacante. Vem ANTES da Barreira: a luz desvia o golpe antes de ele
  // chegar a qualquer camada de defesa. Nao vale para TAI/BUKI de proposito.
  if (damage > 0 && isPrismed(target.effects)) {
    const fisico = isPhysicalCategory(ability.category);
    const { damageTaken, reflected } = refractDamage(damage, !fisico, target.effects);
    if (damageTaken !== damage) {
      logs.push(`💎 O Prisma de ${target.name} refratou o golpe: ${damage} → ${damageTaken}.`);
      damage = damageTaken;
    }
    if (reflected > 0 && attacker && attacker.hpCurrent > 0) {
      const hpAtk = await applyDamage(sessionId, attacker, reflected, logs);
      logs.push(
        `✨ A luz voltou em ${attacker.name} e causou ${reflected} de dano (HP ${hpAtk}/${attacker.hpMax}).`,
      );
      if (hpAtk <= 0) logs.push(`☠️ ${attacker.name} foi derrotado pelo próprio golpe!`);
    }
  }

  // Barreira absorve antes do HP. Raio (Ponta Perfurante) ignora barreira.
  if (damage > 0 && !atkMods?.ignoresShield) {
    // Uma reação pode ter criado Barreira depois que a sessão foi carregada.
    // Relê os efeitos para ela já proteger contra o golpe que a ativou.
    const latestEffects = await prisma.effectInstance.findMany({ where: { participantId: target.id } });
    const pool = shieldPoints(
      latestEffects.map((effect) => ({
        effectId: effect.effectId as EffectId,
        stacks: effect.stacks,
        duration: effect.duration,
        dataJson: effect.dataJson,
      })),
    );
    if (pool > 0) {
      const { damageToHp, absorbed } = absorbWithShield(damage, pool);
      if (absorbed > 0) {
        await consumeShield(target.id, absorbed);
        logs.push(`🛡️ A Barreira de ${target.name} absorveu ${absorbed} de dano.`);
        damage = damageToHp;
        // Barreira zerou: libera quem estava preso por causa dela (ex: Domo
        // de Iceberg do Yuki — ver ability.trapField em useAbility()).
        if (pool - absorbed <= 0) {
          const trapped = s.participants.filter((p) => p.flags.trappedBy === target.id);
          for (const p of trapped) {
            const trapEffect = p.flags.trappedByEffect as string | undefined;
            if (trapEffect) {
              await prisma.effectInstance.deleteMany({ where: { participantId: p.id, effectId: trapEffect } });
            }
            await setFlag(p.id, "trappedBy", null);
            await setFlag(p.id, "trappedByEffect", null);
            logs.push(`❄️ A Barreira de ${target.name} quebrou — ${p.name} não está mais preso.`);
          }
        }
      }
    }
  }

  const newHp = await applyDamage(sessionId, target, damage, logs);
  if (damage > 0) logs.push(`💥 ${target.name} recebeu ${damage} de dano (HP ${newHp}/${target.hpMax}).`);

  // efeitos on-hit — as passivas de fogo do ATACANTE mudam a queimadura
  let hpAfterEffects = newHp;
  const burnOpts = atkMods
    ? {
        extraStacks: atkMods.extraBurnStacks,
        explodeAtStacks: atkMods.burnExplodeAtStacks,
        explodeDamage: atkMods.burnExplodeDamage,
      }
    : undefined;
  if (landed && ability.effects) {
    for (const ae of ability.effects) {
      const effectChance = Math.min(
        1,
        (ae.chance ?? 1) + (atkMods?.effectChanceBonus[ae.effectId] ?? 0),
      );
      if (!chance(effectChance)) continue;
      // passiva pode esticar a duracao (ex: Mare Condutora estende Encharcado)
      const bonus = atkMods?.effectDurationBonus[ae.effectId] ?? 0;
      // Faceta Cortante (Cristal) crava um acumulo a mais por acerto
      const extraStacks =
        (ae.effectId === "CRYSTALLIZED" ? (atkMods?.extraCrystalStacks ?? 0) : 0) +
        (atkMods?.effectStacksBonus[ae.effectId] ?? 0);
      // Genjutsu e' a UNICA categoria em que o atributo de escala (genjutsu)
      // se traduz em duracao em vez de dano bruto (genjutsuScaling fica em 0
      // de proposito, ver balance.ts) — +1 rodada a cada 10 pontos, capado em
      // BALANCE.genjutsuDurationCap. Sem isso o atributo genjutsu nao fazia
      // nada em combate (ver skill combat-engine).
      const baseDur = (ae.duration ?? defaultDurationFor(ae.effectId)) + bonus;
      const finalDur =
        ability.category === "GENJUTSU" && attacker
          ? genjutsuDuration(baseDur, getAttr(attacker, "genjutsu"))
          : baseDur;
      const r = await applyEffect(
        target.id,
        ae.effectId,
        (ae.stacks ?? 1) + extraStacks,
        finalDur,
        {
          burn: ae.effectId === "BURN" ? burnOpts : undefined,
          replaceGroup: ae.replaceGroup,
          onExpire: ae.onExpire,
          empoweredScope: resolveEmpoweredScope(ae.empoweredScope, ability),
        },
      );
      logs.push(`☠️ ${target.name} recebeu efeito **${effectLabel(ae.effectId)}**${r.explosion ? ` (EXPLOSÃO ${r.explosion} dano!)` : ""}.`);
      if (r.sealed) {
        logs.push(
          `💎🔒 O cristal fechou sobre ${target.name}: **selado** (Atordoamento + Imobilização).`,
        );
      }
      if (r.hardened) {
        logs.push(`🌋🔒 A lava endureceu sobre ${target.name}: **preso** (Imobilização).`);
      }
      if (r.collapsed) {
        logs.push(
          `💨💥 A desintegração colapsou a defesa de ${target.name}: **Barreira zerada** e **Defesa Reduzida**.`,
        );
      }
      if (r.explosion) {
        hpAfterEffects = await applyDamage(
          sessionId,
          { id: target.id, name: target.name, hpCurrent: hpAfterEffects, hpMax: target.hpMax, controlledById: target.controlledById },
          r.explosion,
          logs,
        );
      }
    }
  }

  // desarme: cria item dropado
  if (damage > 0 && ability.effects?.some((e) => e.effectId === "DISARM")) {
    await prisma.droppedItem.create({
      data: {
        sessionId: s.id,
        cell: target.cell,
        itemId: "weapon",
        name: `Arma de ${target.name}`,
        kind: "WEAPON",
        ownerCharId: target.charId,
      },
    });
    await setFlag(target.id, "weaponDropped", true);
    logs.push(`🔴 ${target.name} foi desarmado! A arma caiu em ${target.cell}.`);
  }

  // Vento em Brasa: se o golpe passou por uma casa em chamas, o vento leva o
  // fogo junto e queima o alvo. E' o combo Fogo -> Vento em forma mecanica.
  if (damage > 0 && atkMods?.spreadsBurn && attacker) {
    const scenario = getScenarioById(s.scenarioId)!;
    const caminho = resolveAreaCells(ability, attacker.cell, target.cell, scenario);
    const passouPorFogo = [...caminho, attacker.cell].some((c) =>
      hasKindAt(s.terrain, c, "FIRE", s.round),
    );
    if (passouPorFogo) {
      const r = await applyEffect(target.id, "BURN", 1, defaultDurationFor("BURN"), { burn: burnOpts });
      logs.push(
        `🔥💨 O vento cruzou as chamas e incendiou ${target.name}${r.explosion ? ` (EXPLOSÃO ${r.explosion} dano!)` : ""}.`,
      );
      if (r.explosion) {
        hpAfterEffects = await applyDamage(
          sessionId,
          { id: target.id, name: target.name, hpCurrent: hpAfterEffects, hpMax: target.hpMax, controlledById: target.controlledById },
          r.explosion,
          logs,
        );
      }
    }
  }

  // Clone de Raio: o primeiro golpe que causa dano o desfaz e descarrega a
  // eletricidade diretamente em quem o acertou.
  const summonOnHit = target.flags.onHit as
    | { effectId: EffectId; duration?: number }
    | null
    | undefined;
  if (damage > 0 && target.flags.isSummon && summonOnHit && attacker) {
    await applyEffect(
      attacker.id,
      summonOnHit.effectId,
      1,
      summonOnHit.duration ?? defaultDurationFor(summonOnHit.effectId),
    );
    await applyDamage(
      sessionId,
      { id: target.id, name: target.name, hpCurrent: hpAfterEffects, hpMax: target.hpMax, controlledById: target.controlledById },
      hpAfterEffects,
      logs,
    );
    hpAfterEffects = 0;
    logs.push(`⚡ ${target.name} se desfez e aplicou **${effectLabel(summonOnHit.effectId)}** em ${attacker.name}.`);
  }

  // deslocamento: empurra ou puxa o alvo (so se o golpe conectou e ele vive)
  if (landed && ability.push && attacker && hpAfterEffects > 0) {
    const scenario = getScenarioById(s.scenarioId)!;
    const bonus = atkMods?.pushBonus ?? 0;
    // o bonus soma no modulo, sem inverter o sentido do puxao
    const cells = ability.push > 0 ? ability.push + bonus : ability.push - bonus;
    const res = resolvePush({
      originCell: attacker.cell,
      targetCell: target.cell,
      cells,
      rows: scenario.rows,
      cols: scenario.cols,
      blocked: effectiveObstacles(scenario, s.terrain, s.round),
      occupied: new Set(
        s.participants.filter((p) => p.hpCurrent > 0 && p.id !== target.id).map((p) => p.cell),
      ),
    });
    if (res.moved > 0) {
      await prisma.combatParticipant.update({
        where: { id: target.id },
        data: { cell: res.destination },
      });
      const verbo = cells > 0 ? "empurrado" : "puxado";
      logs.push(`💨 ${target.name} foi ${verbo} ${res.moved} casa(s) até ${res.destination}.`);
    }
    // impacto contra parede/obstaculo (passiva Vacuo Cortante, do Vento)
    const impact = impactDamage(res, hasImpactPassive(attacker, ability));
    if (impact > 0) {
      hpAfterEffects = await applyDamage(
        sessionId,
        { id: target.id, name: target.name, hpCurrent: hpAfterEffects, hpMax: target.hpMax, controlledById: target.controlledById },
        impact,
        logs,
      );
      logs.push(`🧱 ${target.name} bateu com força e sofreu ${impact} de dano de impacto.`);
    }
  }

  // A Armadura do Ataque Relampago (efeito HASTE) pune QUALQUER contato
  // fisico enquanto ativa. A Armadura de Espinhos (passiva do Kaguya) so'
  // pune golpe FISICO de verdade (Taijutsu/Bukijutsu/Kenjutsu) — nao um
  // toque ninjutsu — mas e' permanente, nao um efeito temporario.
  if (damage > 0 && ability.shape === "MELEE" && attacker) {
    const physicalHit = isPhysicalCategory(ability.category);
    const shock =
      hasteContactDamage(target.effects) +
      (physicalHit ? characterPassiveMods(ownedNodes(target)).meleeCounterDamage : 0);
    if (shock > 0) {
      const attackerHp = await applyDamage(sessionId, attacker, shock, logs);
      logs.push(`⚡ A armadura de ${target.name} feriu ${attacker.name} por ${shock} de dano.`);
      if (attackerHp <= 0) {
        logs.push(`☠️ ${attacker.name} foi derrotado!`);
        if (attacker.flags.isSummon) await triggerSummonDeath(s, attacker, logs);
      }
    }
  }

  // Bonecos de treino registram e exibem o dano, mas recuperam o HP antes que
  // a engine possa declará-los derrotados.
  const clampedHp = clampInfiniteHp(hpAfterEffects, target.hpMax, target.flags);
  if (clampedHp !== hpAfterEffects) {
    hpAfterEffects = clampedHp;
    await prisma.combatParticipant.update({
      where: { id: target.id },
      data: { hpCurrent: hpAfterEffects },
    });
    logs.push(`🥋 ${target.name} recuperou todo o HP.`);
  }

  if (hpAfterEffects <= 0) {
    logs.push(`☠️ ${target.name} foi derrotado!`);
    // invocacao que morre pode estourar (clone d'agua molha a area)
    if (target.flags.isSummon) await triggerSummonDeath(s, target, logs);
    // Clones das Sombras: parte do dano excedente e' sentido pelo invocador,
    // que tambem paga de volta o chakra que o clone gastou em vida.
    if (target.flags.isSummon && target.flags.deathReflect) {
      await reflectSummonDeath(sessionId, s, target, damage, logs);
    }
    // Yamanaka: corpo controlado morreu — nao fica "controlado" por um cadaver.
    if (target.controlledById) {
      logs.push(`🧠 O corpo controlado morreu — a mente do controlador foi expelida de volta.`);
      await releaseControl(sessionId, target.controlledById, target.id);
    }
  }

  return logs;
}

// Vacuo Cortante (Vento): alvo empurrado contra obstaculo toma dano extra.
function hasImpactPassive(
  attacker: SessionFull["participants"][number],
  ability: Ability,
): boolean {
  return ability.element === "VENTO" && ownedNodes(attacker).includes("vento_vacuo");
}

async function payReaction(
  target: SessionFull["participants"][number],
  reactAb: Ability,
): Promise<number | null> {
  const mastery = await masteryFor(target, reactAb.resource);
  const mods = passiveMods(ownedNodes(target), reactAb);
  const cost = Math.max(1, Math.round(costAfterMastery(reactAb.cost, mastery) * mods.costMult));
  const pool = reactAb.resource === "chakra" ? target.chakra : target.energia;
  if (pool < cost) return null;
  await deductResource(target.id, reactAb.resource, cost);
  return cost;
}

async function applyReactionBenefits(
  target: SessionFull["participants"][number],
  reactAb: Ability,
  logs: string[],
): Promise<void> {
  const mods = passiveMods(ownedNodes(target), reactAb);
  for (const effect of reactAb.effects ?? []) {
    if (effect.chance !== undefined && !chance(effect.chance)) continue;
    const stacks = (effect.stacks ?? 1) + (mods.effectStacksBonus[effect.effectId] ?? 0);
    const duration =
      (effect.duration ?? defaultDurationFor(effect.effectId)) +
      (mods.effectDurationBonus[effect.effectId] ?? 0);
    await applyEffect(target.id, effect.effectId, stacks, duration, {
      replaceGroup: effect.replaceGroup,
      onExpire: effect.onExpire,
      empoweredScope: resolveEmpoweredScope(effect.empoweredScope, reactAb),
    });
    logs.push(`⚡ ${target.name} recebeu efeito **${effectLabel(effect.effectId)}** pela reação.`);
  }
  if (reactAb.cleanses?.length) {
    for (const effectId of reactAb.cleanses) {
      await prisma.effectInstance.deleteMany({
        where: { participantId: target.id, effectId },
      });
    }
    logs.push(`🧼 ${target.name} removeu ${reactAb.cleanses.map(effectLabel).join(", ")}.`);
  }
}

// Gasta pontos de Barreira, comecando pelas instancias que expiram antes.
async function consumeShield(participantId: string, amount: number): Promise<void> {
  const shields = await prisma.effectInstance.findMany({
    where: { participantId, effectId: "SHIELD" },
    orderBy: { duration: "asc" },
  });
  let restante = amount;
  for (const s of shields) {
    if (restante <= 0) break;
    const gasto = Math.min(s.stacks, restante);
    restante -= gasto;
    const sobra = s.stacks - gasto;
    if (sobra <= 0) await prisma.effectInstance.delete({ where: { id: s.id } });
    else await prisma.effectInstance.update({ where: { id: s.id }, data: { stacks: sobra } });
  }
}

// ---------------- Efeitos ----------------

// Resolve o AppliedEffect.empoweredScope (string curta no jutsu) pro formato
// que o dataJson guarda ("clan" precisa saber QUAL clã — vem do proprio
// jutsu que concedeu o efeito, nao do dono do participante, pra funcionar
// igual mesmo se um dia um jutsu de clã puder ser usado fora do proprio clã).
function resolveEmpoweredScope(
  scope: AppliedEffect["empoweredScope"],
  ability: Ability,
): { kind: "physical" } | { kind: "clan"; clanId: string } | undefined {
  if (!scope) return undefined;
  if (scope === "physical") return { kind: "physical" };
  const clanId = ability.requirements?.clanId;
  return clanId ? { kind: "clan", clanId } : undefined;
}

export async function applyEffect(
  participantId: string,
  effectId: string,
  stacks: number,
  duration: number,
  opts?: {
    // passivas do ATACANTE que mudam a queimadura (Brasas Persistentes, Combustao)
    burn?: { extraStacks?: number; explodeAtStacks?: number; explodeDamage?: number };
    // ver AppliedEffect.replaceGroup / .onExpire / .empoweredScope em data/types.ts
    replaceGroup?: string;
    onExpire?: { effectId: EffectId; stacks?: number; duration?: number };
    empoweredScope?: { kind: "physical" } | { kind: "clan"; clanId: string };
  },
): Promise<{ explosion?: number; sealed?: boolean; hardened?: boolean; collapsed?: boolean }> {
  const burnOpts = opts?.burn;
  const replaceGroup = opts?.replaceGroup;
  const onExpire = opts?.onExpire;
  const empoweredScope = opts?.empoweredScope;
  const participant = await prisma.combatParticipant.findUnique({
    where: { id: participantId },
    select: { flagsJson: true },
  });
  const participantFlags = parseFlags(participant?.flagsJson ?? "{}");
  const reduction = receivedEffectDurationReduction(
    Array.isArray(participantFlags.nodes) ? participantFlags.nodes as string[] : [],
    effectId as EffectId,
  );
  const dur = clampDuration(effectId as EffectId, Math.max(1, duration - reduction));

  // cristal: acumula ate SELAR. Mesma forma da queimadura, payoff invertido —
  // em vez de explodir em dano, o casulo fecha e trava o alvo (Atordoar+Imobilizar).
  if (effectId === "CRYSTALLIZED") {
    const existing = await prisma.effectInstance.findFirst({
      where: { participantId, effectId: "CRYSTALLIZED" },
    });
    const { stacks: newStacks, sealed } = applyCrystalStacks(existing?.stacks ?? 0, stacks);
    if (existing) {
      await prisma.effectInstance.update({
        where: { id: existing.id },
        data: { stacks: newStacks, duration: Math.max(existing.duration, dur) },
      });
    } else {
      await prisma.effectInstance.create({
        data: { participantId, effectId, name: "Cristalizado", stacks: newStacks, duration: dur },
      });
    }
    if (sealed) {
      const C = BALANCE.effects.CRYSTALLIZED;
      await applyEffect(participantId, "STUN", 1, C.sealStunDuration);
      await applyEffect(participantId, "ROOT", 1, C.sealRootDuration);
    }
    return { sealed: sealed || undefined };
  }

  // magma: mesma forma do cristal (acumula ate um gatilho), mas o payoff e'
  // mais fraco — so ROOT ao endurecer, sem STUN.
  if (effectId === "MAGMA") {
    const existing = await prisma.effectInstance.findFirst({
      where: { participantId, effectId: "MAGMA" },
    });
    const { stacks: newStacks, hardened } = applyMagmaStacks(existing?.stacks ?? 0, stacks);
    if (existing) {
      await prisma.effectInstance.update({
        where: { id: existing.id },
        data: { stacks: newStacks, duration: Math.max(existing.duration, dur) },
      });
    } else {
      await prisma.effectInstance.create({
        data: { participantId, effectId, name: "Magma", stacks: newStacks, duration: dur },
      });
    }
    if (hardened) {
      const M = BALANCE.effects.MAGMA;
      await applyEffect(participantId, "ROOT", 1, M.hardenRootDuration);
    }
    return { hardened: hardened || undefined };
  }

  // poeira: mesma forma do cristal/magma (acumula ate um gatilho), mas o
  // payoff nao e' Atordoar/Enraizar — e' DESINTEGRAR a defesa: zera toda a
  // Barreira restante do alvo de uma vez (consumeShield com valor bem alto)
  // e aplica Defesa Reduzida. O KKG mais forte tem o gatilho mais rapido
  // (collapseAtStacks 3, contra 4 do Cristal/Magma).
  if (effectId === "DISINTEGRATION") {
    const existing = await prisma.effectInstance.findFirst({
      where: { participantId, effectId: "DISINTEGRATION" },
    });
    const { stacks: newStacks, collapsed } = applyDisintegrationStacks(existing?.stacks ?? 0, stacks);
    if (existing) {
      await prisma.effectInstance.update({
        where: { id: existing.id },
        data: { stacks: newStacks, duration: Math.max(existing.duration, dur) },
      });
    } else {
      await prisma.effectInstance.create({
        data: { participantId, effectId, name: "Desintegração", stacks: newStacks, duration: dur },
      });
    }
    if (collapsed) {
      const D = BALANCE.effects.DISINTEGRATION;
      await consumeShield(participantId, Number.MAX_SAFE_INTEGER);
      await applyEffect(participantId, "DEFENSE_DOWN", 1, D.collapseDefenseDownDuration);
    }
    return { collapsed: collapsed || undefined };
  }

  // queimadura: stacks acumulam e podem explodir
  if (effectId === "BURN") {
    const existing = await prisma.effectInstance.findFirst({
      where: { participantId, effectId: "BURN" },
    });
    const cur = existing?.stacks ?? 0;
    const add = stacks + (burnOpts?.extraStacks ?? 0);
    const { stacks: newStacks, explosionDamage } = applyBurnStacks(cur, add, burnOpts);
    if (existing) {
      await prisma.effectInstance.update({
        where: { id: existing.id },
        data: { stacks: newStacks, duration: Math.max(existing.duration, dur) },
      });
    } else {
      await prisma.effectInstance.create({
        data: { participantId, effectId, name: "Queimadura", stacks: newStacks, duration: dur },
      });
    }
    return { explosion: explosionDamage || undefined };
  }

  // STUN nao stacka
  if (effectId === "STUN") {
    const existing = await prisma.effectInstance.findFirst({ where: { participantId, effectId } });
    if (existing) {
      await prisma.effectInstance.update({
        where: { id: existing.id },
        data: { duration: Math.max(existing.duration, dur) },
      });
      return {};
    }
  }

  // demais: stacka somando — a menos que replaceGroup esteja marcado (ex:
  // Barreira do Tamanho Multiplo/Super Tamanho Multiplo do Akimichi): ai so
  // a contribuicao ANTERIOR do MESMO grupo e substituida, o resto (qualquer
  // outra fonte de Barreira) continua somando normal. onExpire (ex: Sobrecarga
  // -> Defesa Reduzida da Pilula Secreta) fica gravado junto, consumido no
  // tick de efeitos (processTurnStart). As duas tags moram no dataJson, que
  // ja' existia pra isso — ver EffectData/parseEffectData em effects.ts.
  const existing = await prisma.effectInstance.findFirst({ where: { participantId, effectId } });
  const data = parseEffectData(existing?.dataJson);
  const prevFormAmount = replaceGroup && data.formGroup?.group === replaceGroup ? data.formGroup.amount : 0;
  if (replaceGroup) data.formGroup = { group: replaceGroup, amount: stacks };
  if (onExpire) data.onExpire = onExpire;
  if (empoweredScope) data.empoweredScope = empoweredScope;
  if (existing) {
    const newStacks = existing.stacks - prevFormAmount + stacks;
    await prisma.effectInstance.update({
      where: { id: existing.id },
      data: {
        stacks: newStacks,
        duration: clampDuration(effectId as EffectId, Math.max(existing.duration, dur)),
        dataJson: JSON.stringify(data),
      },
    });
  } else {
    await prisma.effectInstance.create({
      data: {
        participantId,
        effectId,
        name: effectLabel(effectId),
        stacks,
        duration: dur,
        dataJson: JSON.stringify(data),
      },
    });
  }
  return {};
}

// ---------------- Turnos ----------------

export interface EndTurnResult {
  logs: string[];
  nextActiveId: string | null;
  newRound: boolean;
}

export async function endTurn(sessionId: string): Promise<EndTurnResult> {
  const s = await getSessionById(sessionId);
  if (!s) return { logs: [], nextActiveId: null, newRound: false };
  const logs: string[] = [];

  // A técnica memorizada pelo Sharingan só fica disponível até o fim do
  // próximo turno do observador. Se não for usada, a leitura se perde.
  const endingId = s.turnOrder[s.activeIndex];
  const ending = endingId ? s.participants.find((p) => p.id === endingId) : undefined;
  if (ending?.flags.sharinganCopiedAbilityId) {
    await setFlag(ending.id, "sharinganCopiedAbilityId", undefined);
    logs.push(`👁️ ${ending.name} perdeu a oportunidade de reproduzir a técnica memorizada.`);
  }

  let idx = s.activeIndex;
  let newRound = false;
  let round = s.round;
  // mortos conhecidos; o snapshot `s` nao enxerga quem morrer dentro deste loop
  const dead = new Set(s.participants.filter((p) => p.hpCurrent <= 0).map((p) => p.id));

  // Escolhe o proximo vivo e roda o inicio de turno dele. Se ele morrer no
  // proprio tick (veneno/queimadura/sangramento), segue para o seguinte —
  // senao o turno ficaria parado num personagem derrotado.
  let nextId: string | null = null;
  for (let attempts = 0; attempts <= s.turnOrder.length; attempts++) {
    idx++;
    if (idx >= s.turnOrder.length) {
      idx = 0;
      round++;
      newRound = true;
      logs.push(`🔁 Rodada ${round}.`);
    }
    const pid = s.turnOrder[idx];
    if (!pid || dead.has(pid)) continue;

    const died = await processTurnStart(sessionId, pid, logs);
    if (!died) {
      nextId = pid;
      break;
    }
    dead.add(pid);
  }

  await prisma.combatSession.update({
    where: { id: sessionId },
    data: { activeIndex: idx, round },
  });

  return { logs, nextActiveId: nextId, newRound };
}

// Roda o inicio de turno do participante. Retorna true se ele morreu no tick.
async function processTurnStart(sessionId: string, participantId: string, logs: string[]): Promise<boolean> {
  const p = await prisma.combatParticipant.findUnique({
    where: { id: participantId },
    include: { effects: true },
  });
  if (!p) return false;
  const flags = parseFlags(p.flagsJson);

  // tick de efeitos (dano por turno + decremento de duracao)
  let hp = p.hpCurrent;
  // soma o dano de efeito-por-turno + terreno pra espelhar no corpo original
  // do Yamanaka, se este participante estiver sendo controlado (ver o final
  // da funcao, apos o write combinado de hp/chakra).
  let dotLoss = 0;
  const remaining: EffectState[] = [];
  const snapshot: EffectState[] = [];
  let corrosaoStacks = 0;
  let desintegracaoStacks = 0;
  for (const e of p.effects) {
    snapshot.push({ effectId: e.effectId as any, stacks: e.stacks, duration: e.duration });
    if (e.effectId === "CORROSION") corrosaoStacks += e.stacks;
    if (e.effectId === "DISINTEGRATION") desintegracaoStacks += e.stacks;
    const res = tickEffect({ effectId: e.effectId as any, stacks: e.stacks, duration: e.duration });
    if (res.damage > 0) {
      hp = Math.max(0, hp - res.damage);
      dotLoss += res.damage;
      logs.push(`☠️ ${p.name} sofreu ${res.damage} de **${effectLabel(e.effectId)}**.`);
    }
    if (res.expired) {
      await prisma.effectInstance.delete({ where: { id: e.id } });
      // onExpire: o efeito que acabou pode deixar outro no lugar — ex: a
      // Sobrecarga (EMPOWERED) da Pilula Secreta vira Defesa Reduzida quando
      // passa (o corpo cobra o preco do surto de forca).
      const onExpire = parseEffectData(e.dataJson).onExpire;
      if (onExpire) {
        await applyEffect(
          participantId,
          onExpire.effectId,
          onExpire.stacks ?? 1,
          onExpire.duration ?? defaultDurationFor(onExpire.effectId),
        );
        logs.push(
          `💤 ${p.name} sentiu o preço de **${effectLabel(e.effectId)}**: ficou com **${effectLabel(onExpire.effectId)}**.`,
        );
      }
    } else {
      await prisma.effectInstance.update({ where: { id: e.id }, data: { duration: e.duration - 1 } });
      remaining.push({ effectId: e.effectId as any, stacks: e.stacks, duration: e.duration - 1 });
    }
  }

  // Corrosao (Vapor): a cada turno, derrete parte da Barreira do portador —
  // ignora o escudo por completo em vez de ser absorvida por ele.
  if (corrosaoStacks > 0) {
    const wanted = corrosionShieldDrain([{ effectId: "CORROSION", stacks: corrosaoStacks, duration: 1 }]);
    const pool = shieldPoints(snapshot);
    const drained = Math.min(wanted, pool);
    if (drained > 0) {
      await consumeShield(participantId, drained);
      logs.push(`🧪 A Corrosão derreteu ${drained} de Barreira de ${p.name}.`);
    }
  }

  // Desintegracao (Poeira): mesmo drenar por turno da Corrosao, so' que mais
  // forte (shieldCorrodePerStack maior) — o colapso ao encher os acumulos
  // (Barreira zerada de vez + Defesa Reduzida) acontece em applyEffect().
  if (desintegracaoStacks > 0) {
    const wanted = disintegrationShieldDrain([
      { effectId: "DISINTEGRATION", stacks: desintegracaoStacks, duration: 1 },
    ]);
    const pool = shieldPoints(snapshot);
    const drained = Math.min(wanted, pool);
    if (drained > 0) {
      await consumeShield(participantId, drained);
      logs.push(`💨 A Desintegração derreteu ${drained} de Barreira de ${p.name}.`);
    }
  }

  // terreno: comecar o turno em chamas queima; comecar dentro d'agua encharca
  const session = await prisma.combatSession.findUnique({ where: { id: sessionId } });
  if (session) {
    const patches = parseTerrain(session.terrainJson);
    const burn = terrainTickDamage(patches, p.cell, session.round);
    if (burn > 0) {
      hp = Math.max(0, hp - burn);
      dotLoss += burn;
      logs.push(`🔥 ${p.name} está em chamas e sofreu ${burn} de dano.`);
    }
    // e' isso que faz o rastro d'agua valer a pena: quem pisa nele fica exposto
    // a Raio. Sem dano, so o marcador. Tecnica da Caminhada Aquatica (Fundamentos)
    // livra o portador tanto do penalti de movimento (ja' tratado em outro
    // lugar) quanto de ficar Encharcado.
    const scenario = getScenarioById(session.scenarioId);
    if (
      !flags.waterWalk &&
      scenario &&
      effectiveWater(scenario, patches, session.round).has(p.cell)
    ) {
      if (!remaining.some((e) => e.effectId === "WET")) {
        await applyEffect(p.id, "WET", 1, defaultDurationFor("WET"));
        logs.push(`💧 ${p.name} está na água e ficou Encharcado.`);
      }
    }
  }

  // upkeep waterWalk
  let chakra = p.chakra;

  // dreno de chakra (preso na cupula de terra)
  const dreno = chakraDrainPerTurn(remaining);
  if (dreno > 0) {
    chakra = Math.max(0, chakra - dreno);
    logs.push(`🌀 ${p.name} perdeu ${dreno}% de chakra (dreno).`);
  }
  if (flags.waterWalk) {
    if (chakra >= BALANCE.waterWalkUpkeepPerTurn) {
      chakra -= BALANCE.waterWalkUpkeepPerTurn;
    } else {
      flags.waterWalk = false;
      logs.push(`🌊 ${p.name} ficou sem chakra e parou de andar sobre a água.`);
    }
  }
  // upkeep Byakugan (Hyuuga) — mesmo padrao do waterWalk
  if (flags.byakuganActive) {
    if (chakra >= BALANCE.byakuganUpkeepPerTurn) {
      chakra -= BALANCE.byakuganUpkeepPerTurn;
    } else {
      flags.byakuganActive = false;
      logs.push(`👁️ ${p.name} ficou sem chakra e o Byakugan se desativou.`);
    }
  }
  // upkeep Ketsuryuugan (Chinoike) — mesmo padrao do Byakugan
  if (flags.ketsuryuuganActive) {
    if (chakra >= BALANCE.ketsuryuuganUpkeepPerTurn) {
      chakra -= BALANCE.ketsuryuuganUpkeepPerTurn;
    } else {
      flags.ketsuryuuganActive = false;
      logs.push(`🩸 ${p.name} ficou sem chakra e o Ketsuryuugan se desativou.`);
    }
  }
  // upkeep Sharingan (Uchiha): um único estágio pode ficar ativo por vez.
  const activeTomoe = sharinganTomoe(flags);
  if (activeTomoe) {
    const upkeepMult = characterPassiveMods(
      Array.isArray(flags.nodes) ? (flags.nodes as string[]) : [],
    ).sharinganUpkeepMult;
    const upkeep = Math.max(1, Math.round(BALANCE.sharingan[activeTomoe].upkeepPerTurn * upkeepMult));
    if (chakra >= upkeep) {
      chakra -= upkeep;
    } else {
      flags.sharinganTomoe = undefined;
      flags.sharinganCopiedAbilityId = undefined;
      logs.push(`👁️ ${p.name} ficou sem chakra e o Sharingan se desativou.`);
    }
  }
  // upkeep Yamanaka (controle) — drena chakra por turno enquanto controlar
  // pelo menos 1 corpo (Shintenshin classico ou os Clones, ate 3 ao mesmo
  // tempo — controllingIds e' sempre array).
  const controllingIds = Array.isArray(flags.controllingIds) ? (flags.controllingIds as string[]) : [];
  if (controllingIds.length > 0) {
    // Domínio Mental (Yamanaka) pode baratear o upkeep — ver ClanPassiveDef.
    const upkeepMult = characterPassiveMods(
      Array.isArray(flags.nodes) ? (flags.nodes as string[]) : [],
    ).mindControlUpkeepMult;
    const upkeepCost = Math.round(BALANCE.yamanaka.upkeepPerTurn * upkeepMult);
    if (chakra >= upkeepCost) {
      chakra -= upkeepCost;
      // mantem o corpo original imovel enquanto durar o controle (STUN normal
      // teria duracao curta e destravaria sozinho; refresca todo turno).
      await applyEffect(p.id, "STUN", 1, defaultDurationFor("STUN"));
    } else {
      logs.push(`🧠 ${p.name} perdeu o controle de todos os corpos (sem chakra pra manter).`);
      await releaseAllControl(sessionId, p.id);
      flags.controllingIds = undefined;
    }
  }

  // resistencia/expiracao Yamanaka: o corpo CONTROLADO resolve isso no
  // proprio turno dele (continua na turnOrder mesmo pilotado).
  if (p.controlledById) {
    const turnsLeft = flags.mindControlTurnsLeft as number | undefined;
    if (turnsLeft !== undefined) {
      // Clones de Transferencia de Mente: duracao fixa (sem disputa) — o
      // controle vale por exatamente 1 turno e libera sozinho no proximo.
      if (turnsLeft <= 0) {
        logs.push(`🧠 O controle mental sobre ${p.name} acabou (durou só 1 turno) — a mente original retomou o corpo.`);
        await releaseControl(sessionId, p.controlledById, p.id);
      } else {
        flags.mindControlTurnsLeft = turnsLeft - 1;
      }
    } else {
      // Shintenshin classico: disputa por Genjutsu todo turno.
      const controller = await prisma.combatParticipant.findUnique({ where: { id: p.controlledById } });
      if (controller && controller.hpCurrent > 0) {
        const controllerFlags = parseFlags(controller.flagsJson);
        // Domínio Mental (Yamanaka, ápice) soma Ninjutsu efetivo so' pra essa
        // disputa — ajuda quem tiver o no', seja controlando ou resistindo.
        const victimNinjutsu =
          getAttr(
            { isNpc: p.isNpc, npcTemplate: p.npcTemplate, flags } as SessionFull["participants"][number],
            "ninjutsu",
          ) +
          characterPassiveMods(Array.isArray(flags.nodes) ? (flags.nodes as string[]) : []).mindControlNinjutsuBonus;
        const casterNinjutsu =
          getAttr(
            { isNpc: controller.isNpc, npcTemplate: controller.npcTemplate, flags: controllerFlags } as SessionFull["participants"][number],
            "ninjutsu",
          ) +
          characterPassiveMods(
            Array.isArray(controllerFlags.nodes) ? (controllerFlags.nodes as string[]) : [],
          ).mindControlNinjutsuBonus;
        const resistChance = yamanakaResistChance(victimNinjutsu, casterNinjutsu);
        if (chance(resistChance)) {
          logs.push(
            `🧠 ${p.name} resistiu ao controle mental e expulsou ${controller.name} de seu corpo! (${Math.round(resistChance * 100)}% de chance)`,
          );
          await releaseControl(sessionId, controller.id, p.id);
        } else {
          logs.push(
            `🧠 ${p.name} tentou resistir ao controle mental, mas falhou. (${Math.round(resistChance * 100)}% de chance)`,
          );
        }
      }
    }
  }

  // regeneracao passiva (ex: vitalidade/chakra do Uzumaki) — cura/restaura no
  // INICIO do proprio turno, so' enquanto vivo (nao ressuscita quem ja bateu
  // 0 nesse mesmo tick de efeitos/terreno acima).
  if (hp > 0) {
    const cMods = characterPassiveMods(Array.isArray(flags.nodes) ? (flags.nodes as string[]) : []);
    if (cMods.hpRegenPerTurn > 0) {
      const before = hp;
      hp = Math.min(p.hpMax, hp + cMods.hpRegenPerTurn);
      if (hp > before) logs.push(`💗 ${p.name} regenerou ${hp - before} HP.`);
    }
    if (cMods.chakraRegenPerTurn > 0) {
      const before = chakra;
      chakra = Math.min(100, chakra + cMods.chakraRegenPerTurn);
      if (chakra > before) logs.push(`🌀 ${p.name} recuperou ${chakra - before}% de chakra.`);
    }
  }

  hp = clampInfiniteHp(hp, p.hpMax, flags);
  await prisma.combatParticipant.update({
    where: { id: participantId },
    data: {
      hpCurrent: hp,
      chakra,
      actedCommon: false,
      actedBonus: false,
      actedMove: false,
      flagsJson: JSON.stringify(flags),
    },
  });
  // Yamanaka: dano de efeito-por-turno/terreno tambem espelha pro corpo
  // original de quem estiver pilotando este participante.
  if (dotLoss > 0) await mirrorControlledDamage(sessionId, p.controlledById, dotLoss, p.name, logs);

  if (hp <= 0) {
    logs.push(`☠️ ${p.name} foi derrotado!`);
    if (p.controlledById) {
      logs.push(`🧠 O corpo controlado morreu — a mente do controlador foi expelida de volta.`);
      await releaseControl(sessionId, p.controlledById, p.id);
    }
    return true;
  }

  // usa os efeitos JA decrementados: um STUN que expirou neste tick nao vale mais.
  if (isStunned(remaining)) {
    logs.push(`💫 ${p.name} está atordoado e perde o turno.`);
  }
  return false;
}

// Yamanaka: acerto de Shintenshin (ou dos Clones) vira controle de corpo.
// So' concede se o alvo ainda nao estiver ocupado por outra mente (nao
// empilha) e se o atacante nao tiver estourado o teto de corpos simultaneos
// (maxSimultaneous — 1 pro Shintenshin classico, ate' 3 pros Clones).
async function establishControl(
  sessionId: string,
  attackerId: string,
  targetId: string,
  logs: string[],
  opts?: { maxSimultaneous?: number; turnsLeft?: number },
): Promise<void> {
  const target = await prisma.combatParticipant.findUnique({ where: { id: targetId } });
  if (!target || target.controlledById) {
    logs.push("🧠 A mente do alvo já está ocupada — a transferência falhou.");
    return;
  }
  const attacker = await prisma.combatParticipant.findUnique({ where: { id: attackerId } });
  if (!attacker) return;
  const flags = parseFlags(attacker.flagsJson);
  const targetFlags = parseFlags(target.flagsJson);
  const attackerLevel = Number(flags.level ?? 1);
  const targetLevel = Number(targetFlags.level ?? 1);
  if (!canYamanakaInvade(attackerLevel, targetLevel)) {
    logs.push(
      `🧠 A mente de ${target.name} é forte demais para ser invadida: está ${targetLevel - attackerLevel} níveis acima do controlador.`,
    );
    return;
  }
  const controllingIds = Array.isArray(flags.controllingIds) ? (flags.controllingIds as string[]) : [];
  const max = opts?.maxSimultaneous ?? 1;
  if (controllingIds.length >= max) {
    logs.push(
      `🧠 ${attacker.name} já está controlando o máximo de corpos ao mesmo tempo (${max}) — a transferência falhou.`,
    );
    return;
  }
  await prisma.combatParticipant.update({ where: { id: targetId }, data: { controlledById: attackerId } });
  await setFlag(attackerId, "controllingIds", [...controllingIds, targetId]);
  if (opts?.turnsLeft !== undefined) await setFlag(targetId, "mindControlTurnsLeft", opts.turnsLeft);
  await applyEffect(attackerId, "STUN", 1, defaultDurationFor("STUN"));
  logs.push(
    `🧠 A mente do atacante tomou o corpo do alvo! O corpo original fica imóvel e vulnerável enquanto durar o controle.`,
  );
}

// Sempre que o corpo CONTROLADO perde HP de verdade, o mesmo tanto sai do
// corpo ORIGINAL de quem o pilota (a mente ainda esta la, exposta). So' dano
// espelha — cura/regen nao. Se o CONTROLADOR morrer disso, forca o release
// (o corpo emprestado nao fica "controlado" por um cadaver).
async function mirrorControlledDamage(
  sessionId: string,
  controlledById: string | null | undefined,
  delta: number,
  bodyName: string,
  logs: string[],
): Promise<void> {
  if (!controlledById || delta <= 0) return;
  const controller = await prisma.combatParticipant.findUnique({ where: { id: controlledById } });
  if (!controller || controller.hpCurrent <= 0) return;
  const hp = Math.max(0, controller.hpCurrent - delta);
  await prisma.combatParticipant.update({ where: { id: controller.id }, data: { hpCurrent: hp } });
  logs.push(
    `🧠 O corpo original de ${controller.name} também sofreu ${delta} de dano (espelhado de ${bodyName}) (HP ${hp}/${controller.hpMax}).`,
  );
  if (hp <= 0) {
    logs.push(`☠️ ${controller.name} foi derrotado (a mente ficou exposta longe do próprio corpo)!`);
    await releaseAllControl(sessionId, controller.id);
  }
}

// Ponto unico de desconto de HP no motor (ver ~10 call sites antigos que
// faziam prisma.combatParticipant.update({ data: { hpCurrent } }) direto).
// Cuida do clamp E do espelhamento Yamanaka num lugar so'.
async function applyDamage(
  sessionId: string,
  participant: { id: string; name: string; hpCurrent: number; hpMax: number; controlledById?: string | null },
  delta: number,
  logs: string[],
): Promise<number> {
  const newHp = Math.max(0, participant.hpCurrent - delta);
  await prisma.combatParticipant.update({ where: { id: participant.id }, data: { hpCurrent: newHp } });
  if (delta > 0) await mirrorControlledDamage(sessionId, participant.controlledById, delta, participant.name, logs);
  return newHp;
}

// Libera UM corpo controlado especifico. So' limpa o STUN artificial do
// controlador quando esse era o ULTIMO corpo que ele controlava — os Clones
// de Transferencia de Mente permitem controlar ate' 3 ao mesmo tempo, entao
// perder um nao deve libertar o corpo original enquanto os outros seguem presos.
async function releaseControl(sessionId: string, controllerId: string, targetId: string): Promise<void> {
  await prisma.combatParticipant.updateMany({
    where: { id: targetId, controlledById: controllerId },
    data: { controlledById: null },
  });
  await setFlag(targetId, "mindControlTurnsLeft", undefined);
  const controller = await prisma.combatParticipant.findUnique({ where: { id: controllerId } });
  if (!controller) return;
  const flags = parseFlags(controller.flagsJson);
  const remaining = (Array.isArray(flags.controllingIds) ? (flags.controllingIds as string[]) : []).filter(
    (id) => id !== targetId,
  );
  await setFlag(controllerId, "controllingIds", remaining.length > 0 ? remaining : undefined);
  if (remaining.length === 0) {
    await prisma.effectInstance.deleteMany({ where: { participantId: controllerId, effectId: "STUN" } });
  }
}

// Libera TODOS os corpos que o controlador estiver controlando de uma vez
// (ficou sem chakra pro upkeep, ou o proprio controlador morreu).
async function releaseAllControl(sessionId: string, controllerId: string): Promise<void> {
  const controller = await prisma.combatParticipant.findUnique({ where: { id: controllerId } });
  if (!controller) return;
  const flags = parseFlags(controller.flagsJson);
  const ids = Array.isArray(flags.controllingIds) ? (flags.controllingIds as string[]) : [];
  for (const targetId of ids) {
    await prisma.combatParticipant.updateMany({
      where: { id: targetId, controlledById: controllerId },
      data: { controlledById: null },
    });
    await setFlag(targetId, "mindControlTurnsLeft", undefined);
  }
  await setFlag(controllerId, "controllingIds", undefined);
  await prisma.effectInstance.deleteMany({ where: { participantId: controllerId, effectId: "STUN" } });
}

// ---------------- helpers de estado ----------------

async function deductResource(id: string, resource: "chakra" | "energia", amount: number): Promise<void> {
  await prisma.combatParticipant.update({
    where: { id },
    data: { [resource]: { decrement: amount } },
  });
}

async function markAction(id: string, actionType: string): Promise<void> {
  const field =
    actionType === "COMUM" ? "actedCommon" : actionType === "BONUS" ? "actedBonus" : actionType === "MOVIMENTO" ? "actedMove" : null;
  if (field) await prisma.combatParticipant.update({ where: { id }, data: { [field]: true } });
}

async function setFlag(id: string, key: string, value: unknown): Promise<void> {
  const p = await prisma.combatParticipant.findUnique({ where: { id } });
  if (!p) return;
  const flags = parseFlags(p.flagsJson);
  flags[key] = value;
  await prisma.combatParticipant.update({ where: { id }, data: { flagsJson: JSON.stringify(flags) } });
}

async function masteryFor(
  p: SessionFull["participants"][number],
  resource: "chakra" | "energia",
): Promise<"BASICO" | "CONTROLADO" | "MESTRE"> {
  if (p.isNpc || !p.charId) return "BASICO";
  const m = await prisma.characterMastery.findUnique({ where: { charId: p.charId } });
  const lvl = resource === "chakra" ? m?.chakraMastery : m?.energiaMastery;
  return (lvl as "BASICO" | "CONTROLADO" | "MESTRE") ?? "BASICO";
}

// Pega arma dropada na celula do participante (gasta acao comum no command layer).
export async function pickUpWeapon(sessionId: string, participantId: string): Promise<string> {
  const p = await prisma.combatParticipant.findUnique({ where: { id: participantId } });
  if (!p) return "Participante inválido.";
  const drop = await prisma.droppedItem.findFirst({ where: { sessionId, cell: p.cell, kind: "WEAPON" } });
  if (!drop) return "Não há arma para pegar nesta célula.";
  await prisma.droppedItem.delete({ where: { id: drop.id } });
  await setFlag(participantId, "weaponDropped", false);
  return `${p.name} pegou a arma de volta.`;
}
