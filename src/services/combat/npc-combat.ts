import { getAbility, getScenarioById, getNpc } from "../../data/index.js";
import type { Attribute } from "../../config/enums.js";
import { parseCell, toCell, distance, neighbors, type Coord } from "../../utils/grid.js";
import { moveRange } from "../characters/formulas.js";
import {
  getSessionById,
  moveParticipant,
  useAbility,
  resolveHit,
  type SessionFull,
} from "./combat-engine.js";

// Roda o turno de um NPC: aproxima do inimigo mais proximo e usa uma habilidade.
export async function runNpcTurn(sessionId: string, npcId: string): Promise<string[]> {
  const logs: string[] = [];
  let session = await getSessionById(sessionId);
  if (!session) return logs;
  const npc = session.participants.find((p) => p.id === npcId);
  if (!npc || npc.hpCurrent <= 0) return logs;

  const enemies = session.participants.filter((p) => p.teamId !== npc.teamId && p.hpCurrent > 0);
  if (enemies.length === 0) return logs;
  const target = nearest(npc.cell, enemies);
  if (!target) return logs;

  const abilities = (JSON.parse(npc.jutsuIdsJson) as string[])
    .map((id) => getAbility(id))
    .filter((a): a is NonNullable<ReturnType<typeof getAbility>> => Boolean(a) && Boolean(a!.baseDamage));

  // inimigo inanimado (ex: tronco): sem habilidades de dano, não se move nem
  // ataca. Invocações (isSummon) sempre tentam se mover mesmo sem jutsu
  // utilizável — ex: Clone das Sombras que só herdou jutsu caro demais do
  // invocador ainda avança até o alvo, só não ataca.
  if (abilities.length === 0 && !npc.flags.isSummon) {
    return [`🪵 ${npc.name} permanece imóvel.`];
  }

  const inRange = (cell: string) =>
    abilities.find((a) => {
      const max = a.shape === "MELEE" ? Math.max(1, a.range) : a.range;
      return cellDist(cell, target.cell) <= max;
    });

  // se ja nao esta em alcance, anda ate o limite de movimento em direcao ao alvo
  if (!inRange(npc.cell)) {
    const move = moveRange(npcAttr(npc, "taijutsu"));
    const dest = walkToward(session, npc.cell, target.cell, move);
    if (dest && dest !== npc.cell) {
      const mv = await moveParticipant(session, npc.id, dest);
      if (mv.ok) logs.push(`🤖 ${npc.name} avançou para ${dest}.`);
      session = (await getSessionById(sessionId))!;
    }
  }

  // Clone das Sombras (summon.actsNextRound): entra em campo e pode se mover,
  // mas só ataca a partir da rodada seguinte à que foi criado.
  const firstActiveRound = npc.flags.firstActiveRound as number | undefined;
  if (firstActiveRound !== undefined && session.round < firstActiveRound) {
    logs.push(`🌀 ${npc.name} acabou de ser invocado e ainda não pode atacar.`);
    return logs;
  }

  // ataca se houver alvo em alcance
  const npcNow = session.participants.find((p) => p.id === npcId)!;
  const ability = inRange(npcNow.cell);
  if (ability) {
    const res = await useAbility(session, npcId, ability.id, target.cell, target.id);
    logs.push(...res.logs);
    for (const hit of res.hits) {
      logs.push(...(await resolveHit(sessionId, hit, npcId, { reaction: "NONE" })));
    }
  } else {
    logs.push(`🤖 ${npc.name} não alcançou ninguém neste turno.`);
  }
  return logs;
}

function npcAttr(p: SessionFull["participants"][number], attr: Attribute): number {
  if (p.npcTemplate) return getNpc(p.npcTemplate)?.attributes[attr] ?? 1;
  return 1;
}

function nearest(from: string, list: SessionFull["participants"]): SessionFull["participants"][number] | null {
  let best: SessionFull["participants"][number] | null = null;
  let bd = Infinity;
  for (const p of list) {
    const d = cellDist(from, p.cell);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function cellDist(a: string, b: string): number {
  const ca = parseCell(a);
  const cb = parseCell(b);
  if (!ca || !cb) return Infinity;
  return distance(ca, cb);
}

// Anda passo-a-passo em direcao ao alvo, ate `steps` celulas, evitando obstaculos.
// Empilha ate 3 NPCs por celula; pode pisar na celula do alvo (mesmo quadrado).
// Para a 1 celula do alvo (alcance melee). Retorna a celula final.
function walkToward(session: SessionFull, from: string, to: string, steps: number): string {
  const scenario = getScenarioById(session.scenarioId)!;
  const tc = parseCell(to)!;
  // contagem de NPCs vivos por celula (limite de empilhamento)
  const npcCount = new Map<string, number>();
  for (const p of session.participants) {
    if (p.hpCurrent > 0 && p.isNpc) npcCount.set(p.cell, (npcCount.get(p.cell) ?? 0) + 1);
  }
  const blocked = new Set(scenario.cells.obstacles ?? []);
  let cur = parseCell(from)!;

  for (let i = 0; i < steps; i++) {
    if (distance(cur, tc) <= 1) break; // ja adjacente
    const opts = neighbors(cur)
      .filter((c) => c.row >= 0 && c.row < scenario.rows && c.col >= 1 && c.col <= scenario.cols)
      .filter((c) => {
        const cell = toCell(c);
        return !blocked.has(cell) && (npcCount.get(cell) ?? 0) < 3;
      });
    let best: Coord | null = null;
    let bd = distance(cur, tc);
    for (const c of opts) {
      const d = distance(c, tc);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) break;
    cur = best;
  }
  return toCell(cur);
}
