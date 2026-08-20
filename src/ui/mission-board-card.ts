import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import type { DailyMissionRank } from "../services/missions/daily-mission-board.js";

export interface MissionBoardCardData {
  dayKey: string;
  offers: { rank: DailyMissionRank; name: string; description: string; locked: boolean; claimed: boolean }[];
}

let backgroundData: Promise<string> | null = null;
const xml = (value: string) => value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!);

function wrap(value: string, limit: number, maxLines = 2): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > limit) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.map(xml);
}

async function background(): Promise<string> {
  backgroundData ??= readFile(resolve(process.cwd(), "public/assets/bg/mission-board-landscape.png"))
    .then((file) => sharp(file).resize(1200, 675, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer())
    .then((file) => `data:image/jpeg;base64,${file.toString("base64")}`)
    .catch(() => "");
  return backgroundData;
}

/** Card individual do mural. O fundo e' arte fixa; as ofertas são renderizadas no momento da consulta. */
export async function renderMissionBoardCard(data: MissionBoardCardData): Promise<Buffer> {
  const image = await background();
  const rows = data.offers.map((offer, index) => {
    const y = 192 + index * 122;
    const rankColor = offer.rank === "D" ? "#4c9b60" : offer.rank === "C" ? "#3f78b9" : "#a45142";
    const status = offer.claimed ? "ACEITA" : offer.locked ? "RANK RESTRITO" : "DISPONÍVEL";
    const statusColor = offer.claimed ? "#19804c" : offer.locked ? "#8d5b28" : "#456b91";
    const description = wrap(offer.description, 78);
    return `<g opacity="${offer.locked ? ".62" : "1"}"><rect x="257" y="${y}" width="686" height="102" rx="13" fill="#fff4cf" fill-opacity=".7" stroke="#855721" stroke-opacity=".65"/><rect x="276" y="${y + 17}" width="67" height="50" rx="11" fill="${rankColor}" stroke="#fff0ac" stroke-width="2"/><text x="309" y="${y + 51}" text-anchor="middle" class="rank">${offer.rank}</text><text x="365" y="${y + 31}" class="mission">[${offer.rank}] ${xml(offer.name)}</text><text x="365" y="${y + 54}" class="description">${description[0] ?? ""}</text><text x="365" y="${y + 72}" class="description">${description[1] ?? ""}</text><rect x="793" y="${y + 17}" width="128" height="26" rx="8" fill="${statusColor}" fill-opacity=".94"/><text x="857" y="${y + 35}" text-anchor="middle" class="status">${status}</text></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#3d2109" flood-opacity=".4"/></filter><style>.k{font:700 14px Arial;letter-spacing:2px;fill:#71502d}.title{font:800 38px Georgia,serif;fill:#38230f}.rank{font:800 29px Georgia,serif;fill:#fff5cc}.mission{font:800 22px Georgia,serif;fill:#3e2813}.description{font:500 14px Arial;fill:#614226}.status{font:800 11px Arial;letter-spacing:1px;fill:#fff1c4}</style></defs>${image ? `<image href="${image}" width="1200" height="675" preserveAspectRatio="xMidYMid slice"/>` : '<rect width="1200" height="675" fill="#243047"/>'}<rect x="228" y="92" width="744" height="483" rx="14" fill="#ffedbd" fill-opacity=".1"/><text x="600" y="132" text-anchor="middle" class="title" filter="url(#shadow)">Mural de Missões</text><text x="600" y="158" text-anchor="middle" class="k">OFERTAS PESSOAIS · ${xml(data.dayKey)} · RENOVA À 00:00 (BRASÍLIA)</text>${rows}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
