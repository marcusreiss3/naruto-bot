import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// URL pública do Square Blob. O arquivo-fonte fica fora do deploy; este é o
// mesmo fluxo usado pelos demais assets rasterizados do site.
export const LEVEL_CARD_BACKGROUND_URL =
  "https://public-blob.squarecloud.dev/7d832704f601b901e94bbc61ac38256dcbc8439d/bg_/xp_banner.png";

// Coordenadas da arte-base em pixels. Mantidas num único lugar para que o
// desenho da barra não dependa de valores mágicos espalhados pelo comando.
export const LEVEL_CARD_COORDINATES = {
  canvas: { width: 2172, height: 724 },
  name: { x: 216, y: 228, maxWidth: 1360, align: "left" },
  level: { x: 1900, y: 225, align: "right" },
  xpText: { x: 1086, y: 420, align: "center" },
  xpTrack: { x: 244, y: 335, width: 1684, height: 102, radius: 48 },
  xpFill: { x: 262, y: 351, width: 1648, height: 70, radius: 33 },
} as const;

export interface LevelCardData {
  name: string;
  level: number;
  xp: number;
  xpRequired: number;
}

const xml = (value: string) => value.replace(/[<>&'"]/g, (char) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
})[char]!);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
let levelBanner: Promise<Buffer> | null = null;

async function loadLevelBanner(): Promise<Buffer> {
  const localPath = resolve(process.cwd(), "public/assets/bg/xp-banner.png");
  try {
    // Desenvolvimento e testes não dependem de rede; produção usa o Blob,
    // pois public/assets não acompanha o deploy.
    return await readFile(localPath);
  } catch {
    const response = await fetch(LEVEL_CARD_BACKGROUND_URL, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Não foi possível carregar a arte de nível (${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  }
}

async function banner(): Promise<Buffer> {
  levelBanner ??= loadLevelBanner().then((file) => sharp(file).png().toBuffer());
  return levelBanner;
}

/** Renderiza a arte-base sem dados, útil somente para conferir o layout. */
export async function renderLevelCardPreview(): Promise<Buffer> {
  return banner();
}

/** Renderiza o cartão de nível com a experiência atual do personagem. */
export async function renderLevelCard(data: LevelCardData): Promise<Buffer> {
  const { name, level, xpText, xpTrack, xpFill } = LEVEL_CARD_COORDINATES;
  const isMaxLevel = data.xpRequired <= 0;
  const progress = isMaxLevel ? 1 : clamp(data.xp / data.xpRequired);
  const fillWidth = Math.max(0, Math.round(xpFill.width * progress));
  const xpLabel = isMaxLevel ? "NÍVEL MÁXIMO" : `${data.xp.toLocaleString("pt-BR")} / ${data.xpRequired.toLocaleString("pt-BR")} XP`;
  const safeName = xml(data.name.slice(0, 42));
  const nameFontSize = data.name.length > 28 ? 42 : 57;

  const overlay = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${LEVEL_CARD_COORDINATES.canvas.width}" height="${LEVEL_CARD_COORDINATES.canvas.height}">
      <defs>
        <linearGradient id="track" x2="0" y2="1"><stop stop-color="#0b162b"/><stop offset="1" stop-color="#172743"/></linearGradient>
        <linearGradient id="fill" x2="1" y2="0"><stop stop-color="#c83a27"/><stop offset=".5" stop-color="#ee8b24"/><stop offset="1" stop-color="#ffd55a"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <style>
          .kicker { font: 700 24px Arial, sans-serif; letter-spacing: 5px; fill: #6b311f; }
          .name { font: 800 57px Georgia, serif; fill: #32180f; paint-order: stroke; stroke: #ffe9ad; stroke-width: 5px; stroke-opacity: .45; }
          .level-kicker { font: 700 19px Arial, sans-serif; letter-spacing: 3px; fill: #6b311f; }
          .level { font: 800 45px Georgia, serif; fill: #32180f; }
          .xp { font: 800 29px Arial, sans-serif; letter-spacing: 2px; fill: #fff6d8; paint-order: stroke; stroke: #191426; stroke-width: 6px; stroke-opacity: .9; }
        </style>
      </defs>
      <text x="${name.x}" y="${name.y - 69}" class="kicker">REGISTRO DE EXPERIÊNCIA</text>
      <text x="${name.x}" y="${name.y}" class="name" style="font-size:${nameFontSize}px">${safeName}</text>
      <text x="${level.x}" y="${level.y - 47}" text-anchor="end" class="level-kicker">NÍVEL</text>
      <text x="${level.x}" y="${level.y}" text-anchor="end" class="level">${data.level}</text>
      <rect x="${xpTrack.x}" y="${xpTrack.y}" width="${xpTrack.width}" height="${xpTrack.height}" rx="${xpTrack.radius}" fill="url(#track)" stroke="#7a2b23" stroke-width="5"/>
      <rect x="${xpFill.x}" y="${xpFill.y}" width="${fillWidth}" height="${xpFill.height}" rx="${xpFill.radius}" fill="url(#fill)" filter="url(#glow)"/>
      <text x="${xpText.x}" y="${xpText.y}" text-anchor="middle" class="xp">${xpLabel}</text>
    </svg>
  `);

  return sharp(await banner())
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
