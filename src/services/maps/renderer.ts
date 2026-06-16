import sharp from "sharp";
import fs from "fs";
import path from "path";
import type { ScenarioDef } from "../../data/types.js";
import { toCell } from "../../utils/grid.js";
import { log } from "../../utils/logger.js";

export interface RenderEntity {
  cell: string;
  label: string; // 1-3 chars
  color: string; // cor do anel/preenchimento
  kind?: "PLAYER" | "NPC" | "CAT" | "MARKER";
  imageUrl?: string; // aparência remota (jogador)
  imageFile?: string; // arquivo local em assets/ (NPC)
  badge?: string; // número no canto superior direito (diferencia homônimos)
  // dados p/ o painel de status (barras na imagem)
  name?: string; // nome completo p/ o painel
  hp?: number;
  hpMax?: number;
  chakra?: number;
  energia?: number;
}

export interface RenderDrop {
  cell: string;
  label?: string;
}

export interface RenderState {
  scenario: ScenarioDef;
  round?: number;
  entities: RenderEntity[];
  drops?: RenderDrop[];
}

const CELLW = 60;
const CELLH = 60;
const PAD_LEFT = 36;
const PAD_TOP = 60;
const PAD_BOTTOM = 90;
const TOKEN = 46; // diâmetro da ficha (imagem) do personagem

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cellTopLeft(cell: string): { x: number; y: number } | null {
  const m = /^([A-Za-z])(\d{1,2})$/.exec(cell.trim());
  if (!m) return null;
  const row = m[1]!.toUpperCase().charCodeAt(0) - 65;
  const col = parseInt(m[2]!, 10);
  return { x: PAD_LEFT + (col - 1) * CELLW, y: PAD_TOP + row * CELLH };
}

// Desenha uma barra (fundo + preenchimento proporcional + rótulo centralizado).
function bar(
  parts: string[],
  x: number,
  cy: number,
  w: number,
  val: number,
  max: number,
  fg: string,
  bg: string,
  label: string,
): void {
  const h = 13;
  const y = cy - h / 2;
  const pct = Math.max(0, Math.min(1, max > 0 ? val / max : 0));
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${bg}"/>`);
  if (pct > 0) parts.push(`<rect x="${x}" y="${y}" width="${Math.round(w * pct)}" height="${h}" rx="3" fill="${fg}"/>`);
  parts.push(
    `<text x="${x + w / 2}" y="${cy + 4}" fill="#fff" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">${esc(label)}</text>`,
  );
}

async function loadBgImage(file: string, gridW: number, gridH: number): Promise<Buffer | null> {
  const bgPath = path.join(process.cwd(), "assets", "maps", file);
  try {
    const raw = fs.readFileSync(bgPath);
    return await sharp(raw).resize(gridW, gridH, { fit: "fill" }).png().toBuffer();
  } catch {
    return null;
  }
}

// Baixa (URL) ou lê (arquivo) a imagem de uma entidade.
async function loadEntitySource(e: RenderEntity): Promise<Buffer | null> {
  try {
    if (e.imageUrl) {
      const res = await fetch(e.imageUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    if (e.imageFile) {
      // imageFile é relativo a assets/ (ex: enemies/x.png, npcs/y.png)
      const p = path.join(process.cwd(), "assets", e.imageFile);
      return fs.readFileSync(p);
    }
  } catch (err) {
    log.warn("[mapa] falha ao carregar imagem de entidade:", (err as Error).message);
  }
  return null;
}

// Posiciona até 3 entidades empilhadas na mesma célula (offset + tamanho menor).
function stackLayout(idx: number, n: number): { dx: number; dy: number; size: number } {
  if (n <= 1) return { dx: 0, dy: 0, size: TOKEN };
  const size = 32;
  if (n === 2) {
    return idx === 0 ? { dx: -12, dy: 0, size } : { dx: 12, dy: 0, size };
  }
  const tri = [
    { dx: 0, dy: -12, size },
    { dx: -12, dy: 10, size },
    { dx: 12, dy: 10, size },
  ];
  return tri[idx] ?? { dx: 0, dy: 0, size };
}

// Recorta a imagem num círculo de diâmetro `size`.
async function circularToken(input: Buffer, size: number): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(input)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

export const MapRenderer = {
  async renderScenario(state: RenderState): Promise<Buffer> {
    const { scenario } = state;
    const rows = scenario.rows;
    const cols = scenario.cols;
    // entidades com stats entram no painel inferior
    const roster = state.entities.filter((e) => e.kind !== "CAT" && e.kind !== "MARKER" && e.hp !== undefined);
    const ROW_H = 26;
    const panelH = roster.length ? 14 + roster.length * ROW_H + 8 : 0;
    const width = PAD_LEFT + cols * CELLW + 20;
    const gridH = rows * CELLH;
    const height = PAD_TOP + gridH + 30 + panelH + 16; // grid + legenda + painel
    const gridW = cols * CELLW;

    const trees = new Set(scenario.cells.trees ?? []);
    const elevated = new Set(scenario.cells.height ?? []);
    const water = new Set(scenario.cells.water ?? []);
    const obstacles = new Set(scenario.cells.obstacles ?? []);
    const terrainFill = scenario.terrain === "sand" ? "#d9c372" : "#7cba6b";

    const bgBuffer = scenario.image ? await loadBgImage(scenario.image, gridW, gridH) : null;
    const hasImage = bgBuffer !== null;

    // ----- SVG base: título, labels, grade, terreno, emojis, drops -----
    const base: string[] = [];
    if (!hasImage) {
      base.push(`<rect x="${PAD_LEFT}" y="${PAD_TOP}" width="${gridW}" height="${gridH}" fill="${terrainFill}"/>`);
    }

    const title = `${esc(scenario.name)}${state.round ? `  •  Rodada ${state.round}` : ""}`;
    base.push(
      `<text x="${PAD_LEFT}" y="34" fill="#e6e6e6" font-family="sans-serif" font-size="22" font-weight="bold">${title}</text>`,
    );
    for (let c = 1; c <= cols; c++) {
      const x = PAD_LEFT + (c - 1) * CELLW + CELLW / 2;
      base.push(
        `<text x="${x}" y="${PAD_TOP - 8}" fill="#9aa4b2" font-family="sans-serif" font-size="14" text-anchor="middle">${c}</text>`,
      );
    }
    for (let r = 0; r < rows; r++) {
      const y = PAD_TOP + r * CELLH + CELLH / 2 + 5;
      base.push(
        `<text x="${PAD_LEFT - 14}" y="${y}" fill="#9aa4b2" font-family="sans-serif" font-size="14" text-anchor="middle">${String.fromCharCode(65 + r)}</text>`,
      );
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const cell = toCell({ row: r, col: c });
        const x = PAD_LEFT + (c - 1) * CELLW;
        const y = PAD_TOP + r * CELLH;
        if (hasImage) {
          let fillAttr = 'fill="none"';
          if (water.has(cell)) fillAttr = 'fill="#2d5673" fill-opacity="0.6"';
          else if (trees.has(cell)) fillAttr = 'fill="#003c00" fill-opacity="0.45"';
          else if (elevated.has(cell)) fillAttr = 'fill="#5a3e00" fill-opacity="0.35"';
          else if (obstacles.has(cell)) fillAttr = 'fill="#141510" fill-opacity="0.6"';
          base.push(
            `<rect x="${x}" y="${y}" width="${CELLW - 2}" height="${CELLH - 2}" ${fillAttr} stroke="#000000" stroke-opacity="0.35" stroke-width="1" rx="2"/>`,
          );
        } else {
          let fill = terrainFill;
          if (water.has(cell)) fill = "#2d5673";
          else if (trees.has(cell)) fill = "#2f5234";
          else if (elevated.has(cell)) fill = "#7a6030";
          else if (obstacles.has(cell)) fill = "#4a4030";
          base.push(
            `<rect x="${x}" y="${y}" width="${CELLW - 2}" height="${CELLH - 2}" fill="${fill}" stroke="#3a4250" stroke-width="1" rx="4"/>`,
          );
        }
        if (trees.has(cell)) {
          base.push(`<text x="${x + CELLW / 2}" y="${y + CELLH / 2 + 6}" font-size="20" text-anchor="middle">🌲</text>`);
        } else if (elevated.has(cell)) {
          base.push(`<text x="${x + CELLW / 2}" y="${y + CELLH / 2 + 6}" font-size="18" text-anchor="middle">⬆️</text>`);
        } else if (water.has(cell)) {
          base.push(`<text x="${x + CELLW / 2}" y="${y + CELLH / 2 + 6}" font-size="18" text-anchor="middle">💧</text>`);
        } else if (obstacles.has(cell)) {
          base.push(`<text x="${x + CELLW / 2}" y="${y + CELLH / 2 + 6}" font-size="18" text-anchor="middle">⬛</text>`);
        }
      }
    }

    for (const d of state.drops ?? []) {
      const pos = cellTopLeft(d.cell);
      if (!pos) continue;
      base.push(
        `<circle cx="${pos.x + CELLW / 2}" cy="${pos.y + CELLH / 2}" r="8" fill="#e74c3c" stroke="#fff" stroke-width="1"/>`,
      );
    }

    const legendY = PAD_TOP + gridH + 20;
    const legend = "🌲 árvore   ⬆️ altura   💧 água   ⬛ obstáculo   🔴 arma";
    base.push(
      `<text x="${PAD_LEFT}" y="${legendY}" fill="#9aa4b2" font-family="sans-serif" font-size="13">${legend}</text>`,
    );

    // ----- painel de status (barras na imagem) -----
    if (roster.length) {
      const panelTop = legendY + 12;
      base.push(
        `<rect x="${PAD_LEFT - 4}" y="${panelTop}" width="${gridW + 8}" height="${roster.length * ROW_H + 8}" fill="#11161e" fill-opacity="0.85" rx="6"/>`,
      );
      roster.forEach((e, i) => {
        const y = panelTop + 8 + i * ROW_H;
        const cy = y + ROW_H / 2 - 2;
        const isPlayer = e.kind === "PLAYER";
        const dead = (e.hp ?? 0) <= 0;
        // swatch
        base.push(`<circle cx="${PAD_LEFT + 6}" cy="${cy}" r="6" fill="${e.color}"/>`);
        // nome
        const nm = (e.name ?? e.label) + (e.badge ? ` ${e.badge}` : "");
        base.push(
          `<text x="${PAD_LEFT + 18}" y="${cy + 4}" fill="${dead ? "#7d8794" : "#e6e6e6"}" font-family="sans-serif" font-size="13" font-weight="bold">${esc(nm.slice(0, 18))}${dead ? " ☠️" : ""}</text>`,
        );
        // barra de HP
        bar(base, PAD_LEFT + 168, cy, 120, e.hp ?? 0, e.hpMax ?? 1, "#2ecc71", "#7f1d1d", `${e.hp ?? 0}/${e.hpMax ?? 0}`);
        // jogadores: chakra + energia
        if (isPlayer) {
          bar(base, PAD_LEFT + 300, cy, 70, e.chakra ?? 0, 100, "#3498db", "#1b3a52", `CK ${Math.round(e.chakra ?? 0)}`);
          bar(base, PAD_LEFT + 378, cy, 70, e.energia ?? 0, 100, "#f1c40f", "#5a4a0a", `EN ${Math.round(e.energia ?? 0)}`);
        }
      });
    }

    const isDead = (e: RenderEntity) => e.hp !== undefined && e.hp <= 0;

    // agrupa entidades por célula p/ espalhar quando houver empilhamento (até 3)
    // (mortos saem do mapa, ficam só no painel)
    const groups = new Map<string, RenderEntity[]>();
    for (const e of state.entities) {
      if (e.kind === "CAT" || e.kind === "MARKER" || isDead(e)) continue;
      const arr = groups.get(e.cell) ?? [];
      arr.push(e);
      groups.set(e.cell, arr);
    }
    // offset/tamanho por entidade conforme posição no grupo
    const layout = new Map<RenderEntity, { dx: number; dy: number; size: number }>();
    for (const arr of groups.values()) {
      const n = arr.length;
      arr.forEach((e, i) => layout.set(e, stackLayout(i, n)));
    }
    const layoutOf = (e: RenderEntity) => layout.get(e) ?? { dx: 0, dy: 0, size: TOKEN };

    // ----- fichas (imagens) das entidades + camada de anéis/labels por cima -----
    const tokenComposites: sharp.OverlayOptions[] = [];
    const entitiesWithToken = new Set<RenderEntity>();
    for (const e of state.entities) {
      if (e.kind === "CAT" || e.kind === "MARKER" || isDead(e)) continue;
      if (!e.imageUrl && !e.imageFile) continue;
      const pos = cellTopLeft(e.cell);
      if (!pos) continue;
      const src = await loadEntitySource(e);
      if (!src) continue;
      const { dx, dy, size } = layoutOf(e);
      try {
        const tok = await circularToken(src, size);
        tokenComposites.push({
          input: tok,
          top: Math.round(pos.y + (CELLH - size) / 2 + dy),
          left: Math.round(pos.x + (CELLW - size) / 2 + dx),
        });
        entitiesWithToken.add(e);
      } catch (err) {
        log.warn("[mapa] falha ao gerar ficha:", (err as Error).message);
      }
    }

    const top: string[] = [];
    for (const e of state.entities) {
      const pos = cellTopLeft(e.cell);
      if (!pos) continue;
      if (e.kind === "MARKER") {
        const cx = pos.x + CELLW / 2;
        const cy = pos.y + CELLH / 2;
        top.push(`<text x="${cx}" y="${cy + 8}" font-size="26" text-anchor="middle">${esc(e.label)}</text>`);
        continue;
      }
      if (e.kind === "CAT") {
        const cx = pos.x + CELLW / 2;
        const cy = pos.y + CELLH / 2;
        top.push(`<text x="${cx}" y="${cy + 8}" font-size="26" text-anchor="middle">🐱</text>`);
        continue;
      }
      if (isDead(e)) continue;
      const { dx, dy, size } = layoutOf(e);
      const cx = pos.x + CELLW / 2 + dx;
      const cy = pos.y + CELLH / 2 + dy;
      const r = entitiesWithToken.has(e) ? size / 2 : Math.min(18, size / 2);
      if (entitiesWithToken.has(e)) {
        // imagem já composta: só desenha o anel colorido por cima
        top.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${e.color}" stroke-width="3"/>`);
      } else {
        // sem imagem: bolinha colorida + label
        top.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${e.color}" stroke="#101418" stroke-width="2"/>`);
        top.push(
          `<text x="${cx}" y="${cy + 5}" fill="#fff" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">${esc(e.label.slice(0, 3))}</text>`,
        );
      }
      // badge numérico no canto superior direito
      if (e.badge) {
        const bx = cx + r * 0.78;
        const by = cy - r * 0.78;
        top.push(`<circle cx="${bx}" cy="${by}" r="9" fill="#101418" stroke="#fff" stroke-width="1.5"/>`);
        top.push(
          `<text x="${bx}" y="${by + 4}" fill="#fff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${esc(e.badge)}</text>`,
        );
      }
    }

    const baseSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${base.join("")}</svg>`,
    );
    const topSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${top.join("")}</svg>`,
    );

    const layers: sharp.OverlayOptions[] = [];
    if (hasImage && bgBuffer) layers.push({ input: bgBuffer, top: PAD_TOP, left: PAD_LEFT });
    layers.push({ input: baseSvg, top: 0, left: 0 });
    layers.push(...tokenComposites);
    layers.push({ input: topSvg, top: 0, left: 0 });

    return sharp({
      create: { width, height, channels: 4, background: { r: 30, g: 37, b: 48, alpha: 255 } },
    })
      .composite(layers)
      .png()
      .toBuffer();
  },
};
