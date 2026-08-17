import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ATTRIBUTE_LABELS, ATTRIBUTES, type Attribute } from "../config/enums.js";

export interface AttributesCardData {
  name: string;
  username: string;
  pool: number;
  current: Record<Attribute, number>;
  draft: Partial<Record<Attribute, number>>;
  trait?: { name: string; description: string };
  clan?: { name: string; description: string };
}

const xml = (value: string) => value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
let landscapeData: Promise<string> | null = null;

function lines(value: string, limit: number, max = 2): string[] {
  const words = value.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > limit) {
      out.push(line);
      line = word;
      if (out.length === max) break;
    } else line = next;
  }
  if (line && out.length < max) out.push(line);
  return out.map(xml);
}

async function landscape(): Promise<string> {
  landscapeData ??= readFile(resolve(process.cwd(), "public/assets/bg/profile-card-landscape.png"))
    .then((file) => sharp(file).resize(1200, 675, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer())
    .then((file) => `data:image/jpeg;base64,${file.toString("base64")}`)
    .catch(() => "");
  return landscapeData;
}

/** Ficha visual do /atributos; os controles de distribuicao continuam no Discord. */
export async function renderAttributesCard(data: AttributesCardData): Promise<Buffer> {
  const background = await landscape();
  const traitLines = lines(data.trait?.description ?? "Nenhum traço equipado.", 48, 3);
  const clanLines = lines(data.clan?.description ?? "Sem clã selecionado.", 48, 3);
  const bonusPanel = (x: number, width: number, label: string, name: string, description: string[]) =>
    `<g><rect x="${x}" y="171" width="${width}" height="56" rx="10" fill="#fff5d1" fill-opacity=".5" stroke="#b77a26" stroke-opacity=".52"/><text x="${x + 17}" y="190" class="k">${label} · ${xml(name)}</text>${description.map((line, index) => `<text x="${x + 17}" y="${210 + index * 14}" class="description">${line}</text>`).join("")}</g>`;
  const bonusPanels = `${bonusPanel(105, 470, "TRAÇO", data.trait?.name ?? "Nenhum", traitLines)}${bonusPanel(610, 475, "CLÃ", data.clan?.name ?? "Nenhum", clanLines)}`;
  const expandedBonusPanel = (x: number, width: number, label: string, name: string, description: string[]) =>
    `<g><rect x="${x}" y="171" width="${width}" height="78" rx="10" fill="#fff5d1" fill-opacity=".5" stroke="#b77a26" stroke-opacity=".52"/><text x="${x + 17}" y="190" class="k">${label} · ${xml(name)}</text>${description.map((line, index) => `<text x="${x + 17}" y="${211 + index * 16}" class="description">${line}</text>`).join("")}</g>`;
  const expandedBonusPanels = `${expandedBonusPanel(105, 470, "TRAÇO", data.trait?.name ?? "Nenhum", traitLines)}${expandedBonusPanel(610, 475, "CLÃ", data.clan?.name ?? "Nenhum", clanLines)}`;
  const spaciousBonusPanel = (x: number, width: number, label: string, name: string, description: string[]) =>
    `<g><rect x="${x}" y="171" width="${width}" height="94" rx="10" fill="#fff5d1" fill-opacity=".5" stroke="#b77a26" stroke-opacity=".52"/><text x="${x + 17}" y="190" class="k">${label} · ${xml(name)}</text>${description.map((line, index) => `<text x="${x + 17}" y="${211 + index * 16}" class="description">${line}</text>`).join("")}</g>`;
  const spaciousBonusPanels = `${spaciousBonusPanel(105, 470, "TRAÇO", data.trait?.name ?? "Nenhum", traitLines)}${spaciousBonusPanel(610, 475, "CLÃ", data.clan?.name ?? "Nenhum", clanLines)}`;
  const rows = ATTRIBUTES.map((attribute, index) => {
    const column = index < 5 ? 0 : 1;
    const row = index % 5;
    const x = column === 0 ? 105 : 610;
    const y = 298 + row * 55;
    const base = data.current[attribute];
    const added = data.draft[attribute] ?? 0;
    const total = base + added;
    return `<g><rect x="${x}" y="${y}" width="475" height="48" rx="12" fill="#fff6d4" fill-opacity=".42" stroke="#a96c1b" stroke-opacity=".48"/><text x="${x + 18}" y="${y + 30}" class="attribute">${xml(ATTRIBUTE_LABELS[attribute])}</text><rect x="${x + 395}" y="${y + 8}" width="62" height="32" rx="10" fill="#1d2740" stroke="#f3bd37" stroke-width="2"/><text x="${x + 426}" y="${y + 31}" text-anchor="middle" class="number">${total}</text>${added > 0 ? `<text x="${x + 370}" y="${y + 31}" text-anchor="end" class="pending">+${added}</text>` : ""}</g>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="paper" x2="1" y2="1"><stop stop-color="#fff3c6"/><stop offset=".5" stop-color="#f4c862"/><stop offset="1" stop-color="#d59627"/></linearGradient><linearGradient id="gold" x2="0" y2="1"><stop stop-color="#fff3a8"/><stop offset=".35" stop-color="#f4be36"/><stop offset="1" stop-color="#9a5b0e"/></linearGradient><linearGradient id="roll" x2="1"><stop stop-color="#080b12"/><stop offset=".48" stop-color="#26334b"/><stop offset="1" stop-color="#080b12"/></linearGradient><filter id="shadow" x="-20%" y="-30%" width="140%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#4b2907" flood-opacity=".42"/></filter><style>.title{font:800 38px Georgia,serif;fill:#302014}.k{font:700 14px Arial;letter-spacing:2px;fill:#704d2c}.attribute{font:700 18px Georgia,serif;fill:#342215}.number{font:800 20px Georgia,serif;fill:#fff4cd}.pending{font:700 15px Arial;fill:#148552}.muted{font:600 12px Arial;fill:#876a42}.description{font:500 13px Arial;fill:#563d26}.sealLabel{font:700 11px Arial;letter-spacing:1.5px;fill:#ffe9b4}.sealNumber{font:800 30px Georgia,serif;fill:#fff6d5}</style></defs>${background ? `<image href="${background}" width="1200" height="675" preserveAspectRatio="xMidYMid slice"/>` : '<rect width="1200" height="675" fill="#18233a"/>'}<rect width="1200" height="675" fill="#fff0c2" fill-opacity=".42"/><rect x="28" y="28" width="1144" height="619" rx="18" fill="url(#paper)" fill-opacity=".77" stroke="#fff1b8" stroke-width="3"/><g filter="url(#shadow)"><rect x="60" y="25" width="1080" height="19" rx="8" fill="url(#gold)" stroke="#8e5410" stroke-width="2"/><path d="M72 29h1056" stroke="#fff2ab" stroke-width="2" opacity=".72"/><rect x="60" y="641" width="1080" height="19" rx="8" fill="url(#gold)" stroke="#8e5410" stroke-width="2"/><path d="M72 645h1056" stroke="#fff2ab" stroke-width="2" opacity=".64"/></g><g>${[-20, 1124].map((x) => `<rect x="${x}" y="-12" width="96" height="699" rx="43" fill="url(#roll)" stroke="#080b12" stroke-width="6"/><rect x="${x + 23}" y="88" width="50" height="499" rx="19" fill="#101827" stroke="#b8791c" stroke-width="3"/><path d="M${x + 32} 109v458M${x + 64} 109v458" stroke="#f0bd45" stroke-width="2" opacity=".66"/><rect x="${x - 3}" y="45" width="102" height="37" rx="15" fill="url(#gold)" stroke="#8c5812" stroke-width="4"/><rect x="${x - 3}" y="594" width="102" height="37" rx="15" fill="url(#gold)" stroke="#8c5812" stroke-width="4"/><ellipse cx="${x + 48}" cy="17" rx="47" ry="23" fill="url(#gold)" stroke="#080b12" stroke-width="5"/><ellipse cx="${x + 48}" cy="658" rx="47" ry="23" fill="url(#gold)" stroke="#080b12" stroke-width="5"/><path d="M${x + 5} 135c27-18 55-18 86 0M${x + 5} 540c27 18 55 18 86 0" fill="none" stroke="#dc2632" stroke-width="8" stroke-linecap="round"/></g>`).join("")}<text x="105" y="91" class="k">FICHA TÉCNICA</text><text x="105" y="137" class="title">${xml(data.name)}</text><line x1="105" y1="154" x2="1095" y2="154" stroke="#765331" stroke-opacity=".46"/><g transform="translate(1044 104)"><path d="M0-44c8 3 14-1 20 4 7 4 7 11 15 14 8 2 10 9 9 16 8 6 7 13 2 19 4 8 1 15-7 19-2 9-8 13-16 12-6 8-13 9-21 5-8 6-16 4-22-2-9 2-15-3-17-11-8-3-11-10-8-18-7-6-5-14 2-20-3-8 1-15 9-19 3-9 10-11 19-10 6-7 14-7 21-2 7-5 15-3 20 3Z" fill="#a71926" stroke="#6a111a" stroke-width="4"/><circle r="34" fill="#c22834" stroke="#f05a5b" stroke-width="2"/><text y="-7" text-anchor="middle" class="sealLabel">PONTOS</text><text y="23" text-anchor="middle" class="sealNumber">${data.pool}</text></g><g><rect x="105" y="171" width="470" height="39" rx="10" fill="#fff5d1" fill-opacity=".5" stroke="#b77a26" stroke-opacity=".52"/><text x="122" y="196" class="k">TRAIT · ${xml(data.trait?.name ?? "Nenhuma")}</text>${traitLines.map((line, i) => `<text x="290" y="188" class="description">${i === 0 ? line : ""}</text>`).join("")}</g><g><rect x="610" y="171" width="475" height="39" rx="10" fill="#fff5d1" fill-opacity=".5" stroke="#b77a26" stroke-opacity=".52"/><text x="627" y="196" class="k">CLÃ · ${xml(data.clan?.name ?? "Nenhum")}</text>${clanLines.map((line, i) => `<text x="770" y="188" class="description">${i === 0 ? line : ""}</text>`).join("")}</g><text x="105" y="246" class="k">ATRIBUTOS</text>${rows}<rect x="105" y="532" width="980" height="83" rx="14" fill="#fff5d1" fill-opacity=".5" stroke="#b77a26" stroke-opacity=".5"/><text x="126" y="558" class="k">EFEITO DOS ATRIBUTOS</text><text x="126" y="582" class="description">Ninjutsu, Taijutsu, Genjutsu, Bukijutsu, Iryō Ninjutsu, Fūinjutsu, Dōjutsu e Kenjutsu liberam e fortalecem técnicas.</text><text x="126" y="604" class="description">Kugutsu e Senjutsu ainda não possuem efeito mecânico. Use o seletor e os botões abaixo para distribuir seus pontos.</text></svg>`;
  // Cada rolo precisa do seu proprio grupo SVG; o primeiro ja fecha o grupo
  // externo criado na interpolacao, entao abrimos o grupo do segundo aqui.
  const validSvg = svg
    .replace("TRAIT ·", "TRAÇO ·")
    .replace("Nenhuma trait equipada.", "Nenhum traço equipado.")
    .replace(
      "Ninjutsu, Taijutsu, Genjutsu, Bukijutsu, Iryō Ninjutsu, Fūinjutsu, Dōjutsu e Kenjutsu liberam e fortalecem técnicas.",
      "Os atributos liberam técnicas, mas não aumentam o dano delas. Além disso, Taijutsu aumenta a vida máxima e a iniciativa em +1 a cada ponto.",
    )
    .replace("Kugutsu e Senjutsu ainda não possuem efeito mecânico. Use o seletor e os botões abaixo para distribuir seus pontos.", "Use o seletor e os botões abaixo para distribuir seus pontos.")
    .replace('</g><rect x="1124"', '</g><g><rect x="1124"')
    .replace('<text x="105" y="137" class="title"', '<text x="105" y="124" class="title"')
    .replace('<line x1="105" y1="154"', `<text x="105" y="150" class="description">@${xml(data.username)}</text><line x1="105" y1="160"`)
    .replace(/<g><rect x="105" y="171" width="470" height="39"[\s\S]*?<\/g><g><rect x="610" y="171" width="475" height="39"[\s\S]*?<\/g><text x="105" y="246"/, `${spaciousBonusPanels}<text x="105" y="288"`);
  const spaciousSvg = validSvg
    .replaceAll('height="675"', 'height="790"')
    .replace('height="619"', 'height="715"')
    .replaceAll('height="699"', 'height="814"')
    .replaceAll('height="499"', 'height="614"')
    .replaceAll('109v458', '109v573')
    .replaceAll('y="594"', 'y="709"')
    .replaceAll('cy="658"', 'cy="773"')
    .replaceAll('540c27', '655c27')
    .replace('<rect x="60" y="641"', '<rect x="60" y="738"')
    .replace('M72 645h1056', 'M72 742h1056')
    .replace('<rect x="105" y="532"', '<rect x="105" y="590"')
    .replace('<text x="126" y="558"', '<text x="126" y="616"')
    .replace('<text x="126" y="582"', '<text x="126" y="640"')
    .replace('<text x="126" y="604"', '<text x="126" y="662"');
  return sharp(Buffer.from(spaciousSvg)).png().toBuffer();
}
