// Helpers de grid. Linhas A.. (row index 0-based), colunas 1..cols.
import { BALANCE } from "../config/balance.js";

export interface Coord {
  row: number; // 0-based (A=0)
  col: number; // 1-based
}

const A = "A".charCodeAt(0);

export function parseCell(cell: string): Coord | null {
  const m = /^([A-Za-z])(\d{1,2})$/.exec(cell.trim());
  if (!m) return null;
  const row = m[1]!.toUpperCase().charCodeAt(0) - A;
  const col = parseInt(m[2]!, 10);
  if (row < 0 || col < 1) return null;
  return { row, col };
}

export function toCell(c: Coord): string {
  return String.fromCharCode(A + c.row) + String(c.col);
}

export function inBounds(c: Coord, rows: number, cols: number): boolean {
  return c.row >= 0 && c.row < rows && c.col >= 1 && c.col <= cols;
}

// Distancia Chebyshev (movimento em 8 direcoes) - usada p/ alcance/movimento.
export function distance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

export function distanceCells(a: string, b: string): number {
  const ca = parseCell(a);
  const cb = parseCell(b);
  if (!ca || !cb) return Infinity;
  return distance(ca, cb);
}

export function neighbors(c: Coord): Coord[] {
  const out: Coord[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      out.push({ row: c.row + dr, col: c.col + dc });
    }
  }
  return out;
}

// Celulas em linha reta de origem -> alvo, ate `range`.
// A mira e encaixada numa das 8 direcoes (o sinal do delta), entao mirar num
// alvo fora de linha pura dispara na direcao mais proxima.
// Para quando sai do grid.
export function lineCells(origin: Coord, target: Coord, range: number, rows: number, cols: number): Coord[] {
  const dr = Math.sign(target.row - origin.row);
  const dc = Math.sign(target.col - origin.col);
  const out: Coord[] = [];
  if (dr === 0 && dc === 0) return out;
  let cur = { row: origin.row, col: origin.col };
  for (let i = 0; i < range; i++) {
    cur = { row: cur.row + dr, col: cur.col + dc };
    if (!inBounds(cur, rows, cols)) break;
    out.push({ ...cur });
  }
  return out;
}

// Celulas dentro de raio (Chebyshev) a partir do centro.
export function radiusCells(center: Coord, radius: number, rows: number, cols: number): Coord[] {
  const out: Coord[] = [];
  for (let r = center.row - radius; r <= center.row + radius; r++) {
    for (let c = center.col - radius; c <= center.col + radius; c++) {
      const cc = { row: r, col: c };
      if (inBounds(cc, rows, cols) && distance(center, cc) <= radius) out.push(cc);
    }
  }
  return out;
}

// Cone: celulas cujo angulo em relacao a direcao origem->alvo cabe dentro do
// meio-angulo configurado (BALANCE.coneHalfAngleDeg), ate `range`.
//
// O teste e o cosseno do angulo entre o vetor origem->celula e a direcao mirada.
// Direcao cardinal vira um triangulo; direcao diagonal vira o mesmo leque girado
// 45deg (a borda parece reta porque o alcance usa distancia de Chebyshev, igual
// ao resto da engine).
export function coneCells(origin: Coord, target: Coord, range: number, rows: number, cols: number): Coord[] {
  const dr = target.row - origin.row;
  const dc = target.col - origin.col;
  if (dr === 0 && dc === 0) return [];
  const len = Math.hypot(dr, dc);
  const ur = dr / len;
  const uc = dc / len;
  // epsilon para a celula exatamente na borda do angulo nao cair fora por float
  const minCos = Math.cos((BALANCE.coneHalfAngleDeg * Math.PI) / 180) - 1e-9;

  const out: Coord[] = [];
  for (let r = origin.row - range; r <= origin.row + range; r++) {
    for (let c = origin.col - range; c <= origin.col + range; c++) {
      const cc = { row: r, col: c };
      if (!inBounds(cc, rows, cols)) continue;
      const d = distance(origin, cc);
      if (d === 0 || d > range) continue;
      const vr = cc.row - origin.row;
      const vc = cc.col - origin.col;
      const cos = (vr * ur + vc * uc) / Math.hypot(vr, vc);
      if (cos >= minCos) out.push(cc);
    }
  }
  return out;
}

export function allCells(rows: number, cols: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c <= cols; c++) out.push(toCell({ row: r, col: c }));
  }
  return out;
}
