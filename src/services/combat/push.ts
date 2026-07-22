// Empurrao e puxao. PURO: calcula para ONDE o alvo vai parar; a engine grava.
//
// Regra: o alvo desliza casa a casa na direcao (ou contra ela, no puxao). Para
// no primeiro impedimento — borda do mapa, obstaculo ou casa ocupada — e quem
// para batendo em algo solido toma dano de impacto.
import { BALANCE } from "../../config/balance.js";
import { parseCell, toCell, type Coord } from "../../utils/grid.js";

export interface PushContext {
  originCell: string; // de onde veio o golpe (define a direcao)
  targetCell: string; // onde o alvo esta
  cells: number; // >0 empurra p/ longe, <0 puxa p/ perto
  rows: number;
  cols: number;
  blocked: Set<string>; // obstaculos (terreno efetivo)
  occupied: Set<string>; // celulas com gente
}

export interface PushResult {
  destination: string; // onde o alvo parou (pode ser a propria celula)
  moved: number; // quantas casas andou de fato
  hitWall: boolean; // parou por bater em algo solido (nao por acabar a distancia)
}

// Direcao normalizada de origem -> alvo (-1, 0 ou 1 em cada eixo).
function direction(from: Coord, to: Coord): Coord {
  return { row: Math.sign(to.row - from.row), col: Math.sign(to.col - from.col) };
}

export function resolvePush(ctx: PushContext): PushResult {
  const origin = parseCell(ctx.originCell);
  const target = parseCell(ctx.targetCell);
  if (!origin || !target || ctx.cells === 0) {
    return { destination: ctx.targetCell, moved: 0, hitWall: false };
  }

  const dir = direction(origin, target);
  // mesma celula: sem direcao definida, nao ha para onde empurrar
  if (dir.row === 0 && dir.col === 0) {
    return { destination: ctx.targetCell, moved: 0, hitWall: false };
  }

  const pulling = ctx.cells < 0;
  const steps = Math.min(Math.abs(ctx.cells), BALANCE.push.maxCells);
  const step: Coord = pulling
    ? { row: -dir.row, col: -dir.col }
    : { row: dir.row, col: dir.col };

  let current = target;
  let moved = 0;
  let hitWall = false;

  for (let i = 0; i < steps; i++) {
    const next: Coord = { row: current.row + step.row, col: current.col + step.col };
    // borda do mapa
    if (next.row < 0 || next.row >= ctx.rows || next.col < 1 || next.col > ctx.cols) {
      hitWall = true;
      break;
    }
    const cell = toCell(next);
    // puxao nunca passa por cima de quem atacou
    if (pulling && cell === ctx.originCell) {
      hitWall = true;
      break;
    }
    if (ctx.blocked.has(cell) || ctx.occupied.has(cell)) {
      hitWall = true;
      break;
    }
    current = next;
    moved++;
  }

  return { destination: toCell(current), moved, hitWall };
}

// Dano de bater em parede/obstaculo. So conta se realmente esbarrou em algo.
export function impactDamage(result: PushResult, enabled: boolean): number {
  return enabled && result.hitWall ? BALANCE.push.impactDamage : 0;
}
