// Terreno dinamico do combate: celulas ganham estado temporario (chamas, agua,
// obstaculo, fumaca, pantano) com validade em rodadas.
//
// PURO: nao toca Prisma. A sessao guarda a lista serializada em terrainJson e a
// engine chama estas funcoes. O cenario (scenario.cells) continua sendo o terreno
// ESTATICO; aqui e' a camada por cima, que expira.
import { BALANCE } from "../../config/balance.js";
import { TERRAIN_KINDS, type TerrainKind } from "../../config/enums.js";
import type { ScenarioDef } from "../../data/types.js";
import { lineCells, parseCell, toCell } from "../../utils/grid.js";

export type { TerrainKind };

export interface TerrainPatch {
  cell: string;
  kind: TerrainKind;
  untilRound: number; // inclusive: vale enquanto round <= untilRound
}

// Quem impede andar por cima e quem corta linha de visao.
const BLOCKS_MOVE: readonly TerrainKind[] = ["OBSTACLE"];
const BLOCKS_LINE: readonly TerrainKind[] = ["OBSTACLE", "SMOKE"];

export function blocksMovement(kind: TerrainKind): boolean {
  return BLOCKS_MOVE.includes(kind);
}

export function blocksLine(kind: TerrainKind): boolean {
  return BLOCKS_LINE.includes(kind);
}

// ---------------------------------------------------------------- ciclo de vida

export function activePatches(patches: TerrainPatch[], round: number): TerrainPatch[] {
  return patches.filter((p) => p.untilRound >= round);
}

// Cria as manchas de um jutsu. duration em rodadas a partir da rodada atual.
export function makePatches(
  cells: string[],
  kind: TerrainKind,
  round: number,
  duration: number,
): TerrainPatch[] {
  const until = round + Math.max(1, duration) - 1;
  return cells.map((cell) => ({ cell, kind, untilRound: until }));
}

// Junta manchas novas as existentes. Mesma celula+tipo nao duplica: fica a maior
// validade (refrescar chamas por cima de chamas estende, nao empilha).
export function mergePatches(current: TerrainPatch[], incoming: TerrainPatch[]): TerrainPatch[] {
  const byKey = new Map<string, TerrainPatch>();
  for (const p of [...current, ...incoming]) {
    const key = `${p.cell}|${p.kind}`;
    const prev = byKey.get(key);
    if (!prev || p.untilRound > prev.untilRound) byKey.set(key, p);
  }
  return [...byKey.values()];
}

// Remove um tipo de terreno de certas celulas (ex: fogo evapora agua).
export function clearKindAt(
  patches: TerrainPatch[],
  cells: string[],
  kind: TerrainKind,
): TerrainPatch[] {
  const target = new Set(cells);
  return patches.filter((p) => !(p.kind === kind && target.has(p.cell)));
}

// ---------------------------------------------------------------- consultas

export function kindsAt(patches: TerrainPatch[], cell: string, round: number): TerrainKind[] {
  return activePatches(patches, round)
    .filter((p) => p.cell === cell)
    .map((p) => p.kind);
}

export function hasKindAt(
  patches: TerrainPatch[],
  cell: string,
  kind: TerrainKind,
  round: number,
): boolean {
  return kindsAt(patches, cell, round).includes(kind);
}

export function hasActiveKind(
  patches: TerrainPatch[],
  kind: TerrainKind,
  round: number,
): boolean {
  return activePatches(patches, round).some((p) => p.kind === kind);
}

// Celulas que impedem passagem: obstaculo do cenario + obstaculo temporario.
export function effectiveObstacles(
  scenario: ScenarioDef,
  patches: TerrainPatch[],
  round: number,
): Set<string> {
  const set = new Set(scenario.cells.obstacles ?? []);
  for (const p of activePatches(patches, round)) {
    if (blocksMovement(p.kind)) set.add(p.cell);
  }
  return set;
}

// Celulas de agua: as do cenario + as encharcadas por jutsu (menos as evaporadas).
export function effectiveWater(
  scenario: ScenarioDef,
  patches: TerrainPatch[],
  round: number,
): Set<string> {
  const set = new Set(scenario.cells.water ?? []);
  for (const p of activePatches(patches, round)) {
    if (p.kind === "WATER") set.add(p.cell);
  }
  return set;
}

// Celulas que cortam linha de visao: arvores e obstaculos do cenario + fumaca/muro.
export function effectiveLineBlockers(
  scenario: ScenarioDef,
  patches: TerrainPatch[],
  round: number,
): Set<string> {
  const set = new Set([...(scenario.cells.obstacles ?? []), ...(scenario.cells.trees ?? [])]);
  for (const p of activePatches(patches, round)) {
    if (blocksLine(p.kind)) set.add(p.cell);
  }
  return set;
}

// Ha linha limpa entre origem e alvo? Extremidades nao contam: estar atras de um
// muro bloqueia, mas mirar no proprio muro (ou de cima dele) nao.
export function lineIsClear(
  originCell: string,
  targetCell: string,
  blockers: Set<string>,
  scenario: ScenarioDef,
): boolean {
  const origin = parseCell(originCell);
  const target = parseCell(targetCell);
  if (!origin || !target) return true;
  const path = lineCells(origin, target, 99, scenario.rows, scenario.cols).map(toCell);
  for (const cell of path) {
    if (cell === originCell || cell === targetCell) continue;
    if (blockers.has(cell)) return false;
  }
  return true;
}

// Dano de fim de turno por estar numa celula em chamas.
export function terrainTickDamage(
  patches: TerrainPatch[],
  cell: string,
  round: number,
): number {
  return hasKindAt(patches, cell, "FIRE", round) ? BALANCE.terrain.fireDmgPerTurn : 0;
}

// Multiplicador de movimento do pantano (empilha com agua na engine).
export function terrainMoveFactor(
  patches: TerrainPatch[],
  cell: string,
  round: number,
): number {
  return hasKindAt(patches, cell, "SWAMP", round) ? BALANCE.terrain.swampMoveFactor : 1;
}

// ---------------------------------------------------------------- serializacao

export function parseTerrain(json: string): TerrainPatch[] {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is TerrainPatch =>
        !!p &&
        typeof (p as TerrainPatch).cell === "string" &&
        typeof (p as TerrainPatch).untilRound === "number" &&
        TERRAIN_KINDS.includes((p as TerrainPatch).kind),
    );
  } catch {
    return [];
  }
}

export function serializeTerrain(patches: TerrainPatch[]): string {
  return JSON.stringify(patches);
}
