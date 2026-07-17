import { prisma } from "../../db/client.js";
import { BALANCE } from "../../config/balance.js";
import type { Attribute } from "../../config/enums.js";
import { getAbility, getScenarioById, getNpc } from "../../data/index.js";
import type { Ability, ScenarioDef } from "../../data/types.js";
import { allCells, parseCell, toCell } from "../../utils/grid.js";
import { pick, randInt, chance } from "../../utils/random.js";
import { costAfterMastery, moveRange } from "../characters/formulas.js";
import {
  computeDamage,
  computeHeal,
  dodgeChance,
  resolveAreaCells,
  cellDistance,
} from "./combat-math.js";
import {
  applyBurnStacks,
  applySlowToMove,
  bleedExtraOnPhysical,
  burnTaijutsuMultiplier,
  healMultiplier,
  isConfused,
  isRooted,
  isStunned,
  ninjutsuBlocked,
  tickEffect,
  type EffectState,
} from "./effects.js";

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
    missionInstanceId: s.missionInstanceId ?? null,
    participants: s.participants.map((p: any) => ({
      ...p,
      effects: p.effects.map((e: any) => ({
        effectId: e.effectId,
        stacks: e.stacks,
        duration: e.duration,
      })),
      flags: parseFlags(p.flagsJson),
    })),
    drops: s.drops,
  };
}

export interface StartPlayer {
  charId: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  chakra: number;
  energia: number;
  jutsuIds: string[];
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
  let li = 0;
  for (const p of opts.players) {
    const cell = leftCells[li++] ?? free[0]!;
    const cp = await prisma.combatParticipant.create({
      data: {
        sessionId: session.id,
        charId: p.charId,
        name: p.name,
        teamId: "A",
        cell,
        hpCurrent: p.hpCurrent,
        hpMax: p.hpMax,
        chakra: p.chakra,
        energia: p.energia,
        jutsuIdsJson: JSON.stringify(p.jutsuIds),
      },
    });
    participantIds.push(cp.id);
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
      },
    });
    participantIds.push(cp.id);
  }

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

export async function endCombat(sessionId: string): Promise<void> {
  await prisma.combatSession.update({ where: { id: sessionId }, data: { status: "ENDED" } });
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
  if (isRooted(p.effects)) return { ok: false, error: "Você está enraizado e não pode se mover." };
  if (!cellHasRoom(s, dest, p.isNpc, p.id)) {
    return {
      ok: false,
      error: p.isNpc ? "Célula cheia (máx. 3 inimigos)." : "Já há outro jogador nessa célula.",
    };
  }
  if ((scenario.cells.obstacles ?? []).includes(dest)) {
    return { ok: false, error: "Célula bloqueada por obstáculo." };
  }

  let move = moveRange(getAttr(p, "taijutsu"));
  move = applySlowToMove(move, p.effects);

  let dist = cellDistance(p.cell, dest);
  // agua reduz deslocamento pela metade, salvo waterWalk ativo
  const onWater = (scenario.cells.water ?? []).includes(dest);
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

export async function useAbility(
  s: SessionFull,
  actorId: string,
  abilityId: string,
  targetCell: string | null,
  targetId?: string | null,
): Promise<UseAbilityResult> {
  const logs: string[] = [];
  const actor = s.participants.find((p) => p.id === actorId);
  if (!actor) return fail("Você não está neste combate.");
  if (actor.hpCurrent <= 0) return fail("Personagem incapacitado.");
  const ability = getAbility(abilityId);
  if (!ability) return fail("Habilidade desconhecida.");

  // jogador: lê jutsus ao vivo do personagem (snapshot pode estar desatualizado). NPC: usa snapshot.
  let owned: string[];
  if (!actor.isNpc && actor.charId) {
    const rows = await prisma.characterJutsu.findMany({ where: { charId: actor.charId } });
    owned = rows.map((r) => r.jutsuId);
  } else {
    owned = JSON.parse(actor.jutsuIdsJson) as string[];
  }
  if (!owned.includes(abilityId)) return fail("Habilidade não desbloqueada.");

  // economia de acao
  if (ability.actionType === "COMUM" && actor.actedCommon) return fail("Ação comum já usada.");
  if (ability.actionType === "BONUS" && actor.actedBonus) return fail("Ação bônus já usada.");
  if (ability.actionType === "MOVIMENTO" && actor.actedMove) return fail("Ação de movimento já usada.");

  if (ability.category === "NINJUTSU" && ninjutsuBlocked(actor.effects)) {
    return fail("Você está impedido de usar Ninjutsu (selo/genjutsu).");
  }
  if (isStunned(actor.effects)) return fail("Você está atordoado e não pode agir.");

  // custo apos maestria
  const mastery = await masteryFor(actor, ability.resource);
  const cost = costAfterMastery(ability.cost, mastery);
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

  // alcance
  if (needsTarget(ability) && effectiveTarget) {
    const d = cellDistance(actor.cell, effectiveTarget);
    const maxRange = ability.shape === "MELEE" ? Math.max(1, ability.range) : ability.range;
    if (d > maxRange) return fail("Alvo fora do alcance.");
  }

  // deduz recurso e marca acao
  await deductResource(actor.id, ability.resource, cost);
  await markAction(actor.id, ability.actionType);
  logs.push(`✨ ${actor.name} usou **${ability.name}** (-${cost}% ${ability.resource}).`);

  const scenario = getScenarioById(s.scenarioId)!;

  // cura / cleanse / buff
  if (ability.baseHeal || ability.cleanses) {
    const healTarget = targetP ?? actor;
    if (ability.cleanses) {
      for (const eff of ability.cleanses) {
        await prisma.effectInstance.deleteMany({
          where: { participantId: healTarget.id, effectId: eff },
        });
      }
      logs.push(`🧼 Efeitos removidos de ${healTarget.name}: ${ability.cleanses.join(", ")}.`);
    }
    if (ability.baseHeal) {
      const heal = computeHeal(ability, getAttr(actor, "iryo"), healMultiplier(healTarget.effects));
      const newHp = Math.min(healTarget.hpMax, healTarget.hpCurrent + heal);
      await prisma.combatParticipant.update({
        where: { id: healTarget.id },
        data: { hpCurrent: newHp },
      });
      logs.push(`💚 ${healTarget.name} recuperou ${heal} HP.`);
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

  // dano: monta hits
  const hits: AbilityHit[] = [];
  if (ability.baseDamage && effectiveTarget) {
    const singleShape = ability.shape === "MELEE" || ability.shape === "SINGLE_TARGET";
    let targets: SessionFull["participants"];
    if (singleShape && targetP) {
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
    const elemMod = ability.element
      ? scenario.elementModifiers?.[ability.element]?.dmgMult
      : undefined;
    const burnMult = burnTaijutsuMultiplier(stacksOf(actor, "BURN"));
    const heightBonus = onHeight(actor);
    for (const t of targets) {
      let raw = computeDamage(ability, {
        attrValue: getAttr(actor, ability.scalingAttribute ?? "ninjutsu"),
        scenarioDmgMult: elemMod,
        burnTaiMult: burnMult,
        heightBonus,
      });
      hits.push({ targetId: t.id, ability, rawDamage: raw });
    }
    if (targets.length === 0) logs.push("⚠️ Nenhum alvo válido na área.");
  }

  // sangramento: esforco fisico reabre a ferida do proprio atacante
  if (ability.category === "TAIJUTSU" || ability.category === "KENJUTSU") {
    const extra = bleedExtraOnPhysical(actor.effects);
    if (extra > 0) {
      const hp = Math.max(0, actor.hpCurrent - extra);
      await prisma.combatParticipant.update({ where: { id: actor.id }, data: { hpCurrent: hp } });
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

  const undodgeable =
    ability.undodgeable || Boolean(attacker?.flags.nextUndodgeable);

  // reacao
  const reaction = opts.reaction ?? "NONE";
  if (reaction === "DODGE" && !undodgeable && !ability.unblockable) {
    const reactAb = opts.reactionAbilityId ? getAbility(opts.reactionAbilityId) : undefined;
    const dc = dodgeChance({
      ability,
      defenderTaijutsu: getAttr(target, "taijutsu"),
      defenderNinjutsu: getAttr(target, "ninjutsu"),
      defenseDown: target.effects.some((e) => e.effectId === "DEFENSE_DOWN"),
      attackerHeight: attacker ? onHeight(attacker) : false,
      reactionBonus: target.flags.reactionBuff ? 0.1 : 0,
    });
    if (reactAb) await payReaction(target, reactAb);
    if (chance(dc)) {
      logs.push(`💨 ${target.name} esquivou (${Math.round(dc * 100)}%)!`);
      damage = 0;
    } else {
      logs.push(`${target.name} tentou esquivar (${Math.round(dc * 100)}%) e falhou.`);
    }
  } else if ((reaction === "BLOCK" || reaction === "PARRY") && !ability.unblockable) {
    const reactAb = opts.reactionAbilityId ? getAbility(opts.reactionAbilityId) : undefined;
    if (reactAb) await payReaction(target, reactAb);
    const factor =
      reaction === "PARRY" ? BALANCE.parryReductionBase : BALANCE.blockReductionBase;
    const reduced = Math.round(damage * (1 - factor));
    logs.push(
      `🛡️ ${target.name} ${reaction === "PARRY" ? "aparou" : "bloqueou"} e reduziu o dano de ${damage} para ${reduced}.`,
    );
    damage = reduced;
  }

  // limpa flag de undodgeable do atacante (consumido)
  if (attacker?.flags.nextUndodgeable) await setFlag(attacker.id, "nextUndodgeable", false);

  const newHp = Math.max(0, target.hpCurrent - damage);
  await prisma.combatParticipant.update({ where: { id: target.id }, data: { hpCurrent: newHp } });
  if (damage > 0) logs.push(`💥 ${target.name} recebeu ${damage} de dano (HP ${newHp}/${target.hpMax}).`);

  // efeitos on-hit
  if (damage > 0 && ability.effects) {
    for (const ae of ability.effects) {
      if (ae.chance !== undefined && !chance(ae.chance)) continue;
      const r = await applyEffect(target.id, ae.effectId, ae.stacks ?? 1, ae.duration ?? 1);
      logs.push(`☠️ ${target.name} recebeu efeito ${ae.effectId}${r.explosion ? ` (EXPLOSÃO ${r.explosion} dano!)` : ""}.`);
      if (r.explosion) {
        const hp2 = Math.max(0, newHp - r.explosion);
        await prisma.combatParticipant.update({ where: { id: target.id }, data: { hpCurrent: hp2 } });
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

  const finalHp = (await prisma.combatParticipant.findUnique({ where: { id: target.id } }))?.hpCurrent ?? newHp;
  if (finalHp <= 0) logs.push(`☠️ ${target.name} foi derrotado!`);

  return logs;
}

async function payReaction(target: SessionFull["participants"][number], reactAb: Ability): Promise<void> {
  const mastery = await masteryFor(target, reactAb.resource);
  const cost = costAfterMastery(reactAb.cost, mastery);
  await deductResource(target.id, reactAb.resource, cost);
}

// ---------------- Efeitos ----------------

export async function applyEffect(
  participantId: string,
  effectId: string,
  stacks: number,
  duration: number,
): Promise<{ explosion?: number }> {
  // queimadura: stacks acumulam e podem explodir
  if (effectId === "BURN") {
    const existing = await prisma.effectInstance.findFirst({
      where: { participantId, effectId: "BURN" },
    });
    const cur = existing?.stacks ?? 0;
    const { stacks: newStacks, explosionDamage } = applyBurnStacks(cur, stacks);
    if (existing) {
      await prisma.effectInstance.update({
        where: { id: existing.id },
        data: { stacks: newStacks, duration: Math.max(existing.duration, duration) },
      });
    } else {
      await prisma.effectInstance.create({
        data: { participantId, effectId, name: "Queimadura", stacks: newStacks, duration },
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
        data: { duration: Math.max(existing.duration, duration) },
      });
      return {};
    }
  }

  // demais: stacka somando
  const existing = await prisma.effectInstance.findFirst({ where: { participantId, effectId } });
  if (existing) {
    await prisma.effectInstance.update({
      where: { id: existing.id },
      data: { stacks: existing.stacks + stacks, duration: Math.max(existing.duration, duration) },
    });
  } else {
    await prisma.effectInstance.create({
      data: { participantId, effectId, name: effectId, stacks, duration },
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

  let idx = s.activeIndex + 1;
  let newRound = false;
  let round = s.round;
  if (idx >= s.turnOrder.length) {
    idx = 0;
    round++;
    newRound = true;
    logs.push(`🔁 Rodada ${round}.`);
  }

  // pula derrotados
  let guard = 0;
  while (guard++ < s.turnOrder.length) {
    const pid = s.turnOrder[idx]!;
    const p = s.participants.find((x) => x.id === pid);
    if (p && p.hpCurrent > 0) break;
    idx++;
    if (idx >= s.turnOrder.length) {
      idx = 0;
      round++;
      newRound = true;
    }
  }

  await prisma.combatSession.update({
    where: { id: sessionId },
    data: { activeIndex: idx, round },
  });

  // processa inicio de turno do novo ativo: efeitos + reset de acoes + upkeeps
  const nextId = s.turnOrder[idx] ?? null;
  if (nextId) {
    await processTurnStart(sessionId, nextId, logs);
  }

  return { logs, nextActiveId: nextId, newRound };
}

async function processTurnStart(sessionId: string, participantId: string, logs: string[]): Promise<void> {
  const p = await prisma.combatParticipant.findUnique({
    where: { id: participantId },
    include: { effects: true },
  });
  if (!p) return;

  // tick de efeitos (dano por turno + decremento de duracao)
  let hp = p.hpCurrent;
  for (const e of p.effects) {
    const res = tickEffect({ effectId: e.effectId as any, stacks: e.stacks, duration: e.duration });
    if (res.damage > 0) {
      hp = Math.max(0, hp - res.damage);
      logs.push(`☠️ ${p.name} sofreu ${res.damage} de ${e.effectId}.`);
    }
    if (res.expired) {
      await prisma.effectInstance.delete({ where: { id: e.id } });
    } else {
      await prisma.effectInstance.update({ where: { id: e.id }, data: { duration: e.duration - 1 } });
    }
  }

  // upkeep waterWalk
  const flags = parseFlags(p.flagsJson);
  let chakra = p.chakra;
  if (flags.waterWalk) {
    if (chakra >= BALANCE.waterWalkUpkeepPerTurn) {
      chakra -= BALANCE.waterWalkUpkeepPerTurn;
    } else {
      flags.waterWalk = false;
      logs.push(`🌊 ${p.name} ficou sem chakra e parou de andar sobre a água.`);
    }
  }
  // upkeep Yamanaka (controle)
  if (flags.controllingId) {
    if (chakra >= BALANCE.yamanaka.upkeepPerTurn) {
      chakra -= BALANCE.yamanaka.upkeepPerTurn;
    } else {
      logs.push(`🧠 ${p.name} perdeu o controle do corpo (sem chakra).`);
      await releaseControl(sessionId, p.id);
      flags.controllingId = undefined;
    }
  }

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

  if (isStunned(p.effects.map((e) => ({ effectId: e.effectId as any, stacks: e.stacks, duration: e.duration })))) {
    logs.push(`💫 ${p.name} está atordoado e perde o turno.`);
  }
}

async function releaseControl(sessionId: string, controllerId: string): Promise<void> {
  const controlled = await prisma.combatParticipant.findFirst({
    where: { sessionId, controlledById: controllerId },
  });
  if (controlled) {
    await prisma.combatParticipant.update({
      where: { id: controlled.id },
      data: { controlledById: null },
    });
  }
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
