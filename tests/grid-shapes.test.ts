import { describe, it, expect } from "vitest";
import { coneCells, lineCells, radiusCells, parseCell, toCell, distance } from "../src/utils/grid.js";

const ROWS = 9;
const COLS = 12;
const origin = parseCell("E5")!; // row 4, col 5

const cells = (list: { row: number; col: number }[]) => list.map(toCell).sort();

describe("cone", () => {
  it("nao atinge nada atras nem ao lado da origem", () => {
    // mirando LESTE: nada com coluna <= 5 pode ser atingido
    const east = coneCells(origin, parseCell("E8")!, 3, ROWS, COLS);
    for (const c of east) {
      expect(c.col).toBeGreaterThan(origin.col);
    }
    // a coluna da origem (norte/sul dela) ficava dentro do cone no bug antigo
    expect(cells(east)).not.toContain("B5");
    expect(cells(east)).not.toContain("H5");
    // e nada atras
    expect(cells(east)).not.toContain("E2");
  });

  it("abre em leque conforme a distancia", () => {
    const east = coneCells(origin, parseCell("E8")!, 3, ROWS, COLS);
    const byDist = (d: number) => east.filter((c) => distance(origin, c) === d).length;
    // 45deg de meio-angulo: 3 celulas a 1 de distancia, 5 a 2, 7 a 3
    expect(byDist(1)).toBe(3);
    expect(byDist(2)).toBe(5);
    expect(byDist(3)).toBe(7);
    expect(east.length).toBe(15);
  });

  it("inclui a celula mirada e a linha central", () => {
    const east = coneCells(origin, parseCell("E8")!, 3, ROWS, COLS);
    const names = cells(east);
    expect(names).toContain("E6");
    expect(names).toContain("E7");
    expect(names).toContain("E8"); // alvo
  });

  it("respeita o alcance", () => {
    const east = coneCells(origin, parseCell("E8")!, 3, ROWS, COLS);
    for (const c of east) expect(distance(origin, c)).toBeLessThanOrEqual(3);
    expect(cells(east)).not.toContain("E9");
  });

  it("aponta para o lado certo em cada direcao", () => {
    const north = coneCells(origin, parseCell("B5")!, 2, ROWS, COLS);
    for (const c of north) expect(c.row).toBeLessThan(origin.row);

    const south = coneCells(origin, parseCell("H5")!, 2, ROWS, COLS);
    for (const c of south) expect(c.row).toBeGreaterThan(origin.row);

    const west = coneCells(origin, parseCell("E2")!, 2, ROWS, COLS);
    for (const c of west) expect(c.col).toBeLessThan(origin.col);
  });

  it("na diagonal fica dentro do quadrante mirado", () => {
    const se = coneCells(origin, parseCell("H8")!, 3, ROWS, COLS);
    for (const c of se) {
      expect(c.row).toBeGreaterThanOrEqual(origin.row);
      expect(c.col).toBeGreaterThanOrEqual(origin.col);
    }
    // mesma area do cone cardinal: o leque so girou
    expect(se.length).toBe(15);
  });

  it("nao sai do grid", () => {
    const corner = parseCell("A1")!;
    const c = coneCells(corner, parseCell("A4")!, 3, ROWS, COLS);
    for (const cc of c) {
      expect(cc.row).toBeGreaterThanOrEqual(0);
      expect(cc.row).toBeLessThan(ROWS);
      expect(cc.col).toBeGreaterThanOrEqual(1);
      expect(cc.col).toBeLessThanOrEqual(COLS);
    }
  });

  it("sem direcao (alvo na propria celula) nao atinge nada", () => {
    expect(coneCells(origin, origin, 3, ROWS, COLS)).toEqual([]);
  });
});

describe("linha", () => {
  it("segue reto ate o alcance", () => {
    const l = lineCells(origin, parseCell("E8")!, 3, ROWS, COLS);
    expect(cells(l)).toEqual(["E6", "E7", "E8"]);
  });

  it("para na borda do grid em vez de sair", () => {
    const l = lineCells(parseCell("E11")!, parseCell("E12")!, 5, ROWS, COLS);
    // so sobra E12 antes de sair do grid
    expect(cells(l)).toEqual(["E12"]);
  });

  it("sem direcao nao atinge nada", () => {
    expect(lineCells(origin, origin, 3, ROWS, COLS)).toEqual([]);
  });
});

describe("raio", () => {
  it("cobre o quadrado de Chebyshev ao redor do centro", () => {
    const r = radiusCells(origin, 1, ROWS, COLS);
    // 3x3 incluindo o centro
    expect(r.length).toBe(9);
    expect(cells(r)).toContain("E5");
    expect(cells(r)).toContain("D4");
    expect(cells(r)).toContain("F6");
  });

  it("recorta nas bordas do grid", () => {
    const r = radiusCells(parseCell("A1")!, 1, ROWS, COLS);
    // canto: so 2x2
    expect(r.length).toBe(4);
  });
});
