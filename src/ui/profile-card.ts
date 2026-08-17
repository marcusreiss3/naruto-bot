import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface ProfileCardData {
  name: string;
  username: string;
  level: number;
  rank: string;
  village: string;
  clan: string;
  trait?: { name: string; rarity: string };
  hp: { current: number; max: number };
  chakra: number;
  energy: number;
  elements: string[];
  fightingStyles: string[];
  appearanceUrl?: string;
}

const xml = (value: string) => value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
let landscapeData: Promise<string> | null = null;

function wrap(values: string[], limit: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const value of values) {
    const next = current ? `${current} • ${value}` : value;
    if (current && next.length > limit) {
      lines.push(current);
      current = value;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).map(xml);
}

async function portrait(url?: string): Promise<string> {
  if (!url) return "";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    // PNG preserva transparência: personagens recortados deixam aparecer o
    // cenário do card, em vez de ganharem o fundo preto do JPEG.
    // "cover" remove as faixas vazias sem deformar a arte nem perder alpha.
    const image = await sharp(bytes).resize(365, 500, { fit: "cover", position: "centre" }).png().toBuffer();
    return `data:image/png;base64,${image.toString("base64")}`;
  } catch {
    return "";
  }
}

async function landscape(): Promise<string> {
  landscapeData ??= readFile(resolve(process.cwd(), "public/assets/bg/profile-card-landscape.png"))
    .then((file) => sharp(file).resize(1200, 675, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer())
    .then((file) => `data:image/jpeg;base64,${file.toString("base64")}`)
    .catch(() => "");
  return landscapeData;
}

/** Renderiza o card compactado do /perfil. A distribuicao completa segue no /atributos. */
export async function renderProfileCard(data: ProfileCardData): Promise<Buffer> {
  const image = await portrait(data.appearanceUrl);
  const landscapeImage = await landscape();
  const hp = clamp(data.hp.current / Math.max(1, data.hp.max));
  const chakra = clamp(data.chakra / 100);
  const energy = clamp(data.energy / 100);
  const trait = data.trait ? `${xml(data.trait.name)} · ${xml(data.trait.rarity)}` : "Nenhuma trait";
  const elements = data.elements.length ? data.elements.map(xml).join("  •  ") : "Nenhum elemento";
  const styles = data.fightingStyles.length ? data.fightingStyles.map(xml).join("  •  ") : "Não definido";
  const artwork = image
    ? `<image href="${image}" x="60" y="60" width="420" height="555" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="270" cy="275" r="170" fill="#dc5b5b" fill-opacity=".13"/><path d="M270 160c-64 0-115 53-115 118 0 39 16 72 39 95l-31 175h214l-31-175c23-23 39-56 39-95 0-65-51-118-115-118Z" fill="#070a10" fill-opacity=".68"/><text x="270" y="565" text-anchor="middle" class="placeholder">ARTE DO PERSONAGEM</text>`;
  const bar = (y: number, label: string, value: string, pct: number, color: string) => `<text x="570" y="${y}" class="label">${label}</text><text x="1080" y="${y}" text-anchor="end" class="amount">${value}</text><rect x="570" y="${y + 16}" width="510" height="15" rx="8" fill="#ffffff" fill-opacity=".12"/><rect x="570" y="${y + 16}" width="${Math.round(510 * pct)}" height="15" rx="8" fill="${color}"/>`;
  const elementLines = wrap(data.elements.length ? data.elements : ["Nenhum elemento"], 34);
  const styleLines = wrap(data.fightingStyles.length ? data.fightingStyles : ["Não definido"], 27);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#10151e"/><stop offset="1" stop-color="#080b11"/></linearGradient><style>.title{font:800 43px Arial;fill:#f8f1e7}.subtitle{font:500 18px Arial;fill:#b6c0ce}.kicker,.label{font:700 15px Arial;letter-spacing:2px;fill:#9fabbc}.value{font:700 23px Arial;fill:#f7f1e8}.amount{font:500 17px Arial;fill:#c8d0dc}.placeholder{font:700 15px Arial;letter-spacing:2px;fill:#e5b0a6}</style></defs><rect width="1200" height="675" fill="url(#bg)"/><rect x="28" y="28" width="1144" height="619" rx="25" fill="#101823" stroke="#ffffff" stroke-opacity=".14" stroke-width="2"/><rect x="28" y="28" width="13" height="619" rx="7" fill="#dc5b5b"/><clipPath id="p"><rect x="60" y="60" width="420" height="555" rx="18"/></clipPath><g clip-path="url(#p)"><rect x="60" y="60" width="420" height="555" fill="#291e2a"/>${artwork}</g><rect x="60" y="60" width="420" height="555" rx="18" fill="none" stroke="#ffffff" stroke-opacity=".12"/><text x="570" y="92" class="kicker" fill="#e4847d">PERFIL SHINOBI</text><text x="570" y="145" class="title">${xml(data.name)}</text><text x="570" y="177" class="subtitle">@${xml(data.username)}  •  ${xml(data.village)}</text><rect x="1010" y="68" width="115" height="74" rx="15" fill="#dc5b5b" fill-opacity=".14" stroke="#dc5b5b" stroke-opacity=".55"/><text x="1068" y="95" text-anchor="middle" class="kicker">NÍVEL</text><text x="1068" y="126" text-anchor="middle" class="value" style="font-size:29px">${data.level}</text><line x1="570" y1="208" x2="1125" y2="208" stroke="#ffffff" stroke-opacity=".12"/><text x="570" y="244" class="label">CLÃ</text><text x="570" y="274" class="value">${xml(data.clan)}</text><text x="850" y="244" class="label">RANK</text><text x="850" y="274" class="value">${xml(data.rank)}</text><rect x="570" y="300" width="555" height="72" rx="14" fill="#dc5b5b" fill-opacity=".08" stroke="#dc5b5b" stroke-opacity=".35"/><text x="592" y="327" class="label">TRAIT</text><text x="592" y="354" class="value" style="font-size:20px">${trait}</text>${bar(418,"VIDA",`${data.hp.current} / ${data.hp.max}`,hp,"#ef6b6c")}${bar(478,"CHAKRA",`${Math.round(data.chakra)} / 100`,chakra,"#66b7ed")}${bar(538,"ENERGIA",`${Math.round(data.energy)} / 100`,energy,"#efcf79")}<line x1="570" y1="589" x2="1125" y2="589" stroke="#ffffff" stroke-opacity=".12"/><text x="570" y="617" class="label">ELEMENTOS</text><text x="570" y="640" class="subtitle">${elements}</text><text x="850" y="617" class="label">ESTILO DE LUTA</text><text x="850" y="640" class="subtitle">${styles}</text></svg>`;
  const parchmentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><filter id="grain"><feTurbulence baseFrequency=".55" numOctaves="3"/><feColorMatrix values="1 0 0 0 .45 0 1 0 0 .30 0 0 1 0 .10 0 0 0 .13 0"/></filter><linearGradient id="paper" x2="1" y2="1"><stop stop-color="#ecd9a6"/><stop offset=".55" stop-color="#cfb278"/><stop offset="1" stop-color="#98703d"/></linearGradient><style>.t{font:800 42px Georgia,serif;fill:#302014}.s{font:500 17px Georgia,serif;fill:#5c412a}.k{font:700 14px Arial;letter-spacing:2px;fill:#704d2c}.v{font:700 21px Georgia,serif;fill:#342215}.a{font:500 16px Arial;fill:#543b24}</style></defs><rect width="1200" height="675" fill="#25170f"/><rect x="28" y="28" width="1144" height="619" rx="18" fill="url(#paper)" stroke="#f6e5b8" stroke-width="3"/><rect x="28" y="28" width="1144" height="619" rx="18" filter="url(#grain)" opacity=".3"/><path d="M45 75H1155M45 600H1155" stroke="#7b2820" stroke-width="5" opacity=".75"/><circle cx="1110" cy="575" r="42" fill="none" stroke="#7b2820" stroke-width="5" opacity=".75"/><path d="M1088 575h44m-22-22v44" stroke="#7b2820" stroke-width="4" opacity=".75"/><clipPath id="portrait"><rect x="60" y="80" width="365" height="500" rx="12"/></clipPath><g clip-path="url(#portrait)"><rect x="60" y="80" width="365" height="500" fill="#39251d"/>${artwork}</g><rect x="60" y="80" width="365" height="500" rx="12" fill="none" stroke="#603b22" stroke-width="3"/><text x="485" y="88" class="k">REGISTRO SHINOBI</text><text x="485" y="140" class="t">${xml(data.name)}</text><text x="485" y="170" class="s">@${xml(data.username)}  •  ${xml(data.village)}</text><rect x="1010" y="62" width="112" height="67" rx="10" fill="#7b2820"/><text x="1066" y="88" text-anchor="middle" class="k" fill="#f2dfb5">NÍVEL</text><text x="1066" y="116" text-anchor="middle" class="v" fill="#fff1cc" style="font-size:27px">${data.level}</text><line x1="485" y1="198" x2="1122" y2="198" stroke="#765331" stroke-opacity=".5"/><text x="485" y="230" class="k">CLÃ</text><text x="485" y="258" class="v">${xml(data.clan)}</text><text x="765" y="230" class="k">RANK</text><text x="765" y="258" class="v">${xml(data.rank)}</text><rect x="485" y="280" width="637" height="65" rx="10" fill="#f0dfb5" fill-opacity=".48" stroke="#8b3028" stroke-opacity=".55"/><text x="505" y="306" class="k">TRAIT</text><text x="505" y="331" class="v" style="font-size:19px">${trait}</text><text x="485" y="381" class="k">RECURSOS</text><text x="485" y="413" class="k">VIDA</text><text x="995" y="413" text-anchor="end" class="a">${data.hp.current} / ${data.hp.max}</text><rect x="485" y="426" width="510" height="14" rx="7" fill="#684b31" fill-opacity=".25"/><rect x="485" y="426" width="${Math.round(510 * hp)}" height="14" rx="7" fill="#af3c32"/><text x="485" y="466" class="k">CHAKRA</text><text x="995" y="466" text-anchor="end" class="a">${Math.round(data.chakra)} / 100</text><rect x="485" y="479" width="510" height="14" rx="7" fill="#684b31" fill-opacity=".25"/><rect x="485" y="479" width="${Math.round(510 * chakra)}" height="14" rx="7" fill="#397ea7"/><text x="485" y="519" class="k">ENERGIA</text><text x="995" y="519" text-anchor="end" class="a">${Math.round(data.energy)} / 100</text><rect x="485" y="532" width="510" height="14" rx="7" fill="#684b31" fill-opacity=".25"/><rect x="485" y="532" width="${Math.round(510 * energy)}" height="14" rx="7" fill="#a87525"/><line x1="485" y1="565" x2="1122" y2="565" stroke="#765331" stroke-opacity=".5"/><text x="485" y="589" class="k">ELEMENTOS</text>${elementLines.map((line, index) => `<text x="485" y="${614 + index * 18}" class="a">${line}</text>`).join("")}<text x="825" y="589" class="k">ESTILO DE LUTA</text>${styleLines.map((line, index) => `<text x="825" y="${614 + index * 18}" class="a">${line}</text>`).join("")}</svg>`;
  const roll = (x: number) => `<g><rect x="${x}" y="12" width="64" height="651" rx="28" fill="#1d2740" stroke="#0c1120" stroke-width="5"/><rect x="${x + 9}" y="34" width="46" height="607" rx="21" fill="#26385d"/><rect x="${x + 18}" y="85" width="28" height="505" rx="12" fill="#fff0c2" stroke="#bd7a2a" stroke-width="2"/><path d="M${x + 21} 98v479M${x + 43} 98v479" stroke="#e5bc72" stroke-width="2" opacity=".8"/><path d="M${x + 14} 52v570M${x + 50} 52v570" stroke="#637ba9" stroke-width="3" stroke-opacity=".8"/><rect x="${x}" y="45" width="64" height="25" rx="10" fill="#f5ba25" stroke="#a86d14" stroke-width="3"/><rect x="${x}" y="606" width="64" height="25" rx="10" fill="#f5ba25" stroke="#a86d14" stroke-width="3"/><path d="M${x + 5} 82h54M${x + 5} 594h54" stroke="#fef0a4" stroke-width="3" opacity=".9"/><ellipse cx="${x + 32}" cy="22" rx="31" ry="16" fill="#ffe586" stroke="#1d2740" stroke-width="4"/><ellipse cx="${x + 32}" cy="653" rx="31" ry="16" fill="#cd7c2f" stroke="#1d2740" stroke-width="4"/><ellipse cx="${x + 32}" cy="22" rx="18" ry="9" fill="#9d5d25"/><path d="M${x + 8} 128c18-13 30-13 48 0M${x + 8} 545c18 13 30 13 48 0" fill="none" stroke="#dc2632" stroke-width="8"/><circle cx="${x + 32}" cy="128" r="7" fill="#ffe586"/><circle cx="${x + 32}" cy="545" r="7" fill="#ffe586"/></g>`;
  const premiumRoll = (x: number) => `<g>
    <rect x="${x}" y="-12" width="96" height="699" rx="43" fill="url(#rollDark)" stroke="#080b12" stroke-width="6"/>
    <rect x="${x + 11}" y="20" width="74" height="635" rx="32" fill="#111827" stroke="#40516e" stroke-width="3"/>
    <rect x="${x + 23}" y="88" width="50" height="499" rx="19" fill="url(#rollCore)" stroke="#a66a17" stroke-width="3"/>
    <path d="M${x + 32} 108v459M${x + 64} 108v459" stroke="#f0bd45" stroke-width="2" opacity=".66"/>
    <path d="M${x + 38} 116q10 10 20 0M${x + 38} 206q10 10 20 0M${x + 38} 296q10 10 20 0M${x + 38} 386q10 10 20 0M${x + 38} 476q10 10 20 0" fill="none" stroke="#d99a2b" stroke-width="3" opacity=".7"/>
    <rect x="${x + 20}" y="155" width="56" height="12" rx="5" fill="url(#rollGold)" stroke="#82500e" stroke-width="2"/>
    <rect x="${x + 20}" y="508" width="56" height="12" rx="5" fill="url(#rollGold)" stroke="#82500e" stroke-width="2"/>
    <path d="M${x + 16} 52v571M${x + 80} 52v571" stroke="#40516e" stroke-width="4" opacity=".85"/>
    <rect x="${x - 3}" y="45" width="102" height="37" rx="15" fill="url(#rollGold)" stroke="#8c5812" stroke-width="4" filter="url(#goldGlow)"/>
    <rect x="${x - 3}" y="594" width="102" height="37" rx="15" fill="url(#rollGold)" stroke="#8c5812" stroke-width="4" filter="url(#goldGlow)"/>
    <path d="M${x + 9} 53h76M${x + 9} 602h76" stroke="#fff3ac" stroke-width="3" stroke-linecap="round" opacity=".72"/>
    <path d="M${x + 8} 92h80M${x + 8} 584h80" stroke="#fff0a1" stroke-width="3" opacity=".85"/>
    <ellipse cx="${x + 48}" cy="17" rx="47" ry="23" fill="url(#rollGold)" stroke="#080b12" stroke-width="5"/>
    <ellipse cx="${x + 48}" cy="658" rx="47" ry="23" fill="url(#rollGold)" stroke="#080b12" stroke-width="5"/>
    <ellipse cx="${x + 48}" cy="17" rx="28" ry="13" fill="#71391f" stroke="#f2b33d" stroke-width="3"/>
    <ellipse cx="${x + 48}" cy="658" rx="28" ry="13" fill="#71391f" stroke="#f2b33d" stroke-width="3"/>
    <path d="M${x + 5} 135c27-18 55-18 86 0M${x + 5} 540c27 18 55 18 86 0" fill="none" stroke="#861923" stroke-width="12" stroke-linecap="round"/>
    <path d="M${x + 5} 132c27-16 55-16 86 0M${x + 5} 537c27 16 55 16 86 0" fill="none" stroke="#e52d39" stroke-width="7" stroke-linecap="round"/>
    <path d="M${x + 48} 137q-13 13-6 29l-12 15M${x + 48} 538q13-13 6-29l12-15" fill="none" stroke="#d52230" stroke-width="7" stroke-linecap="round"/>
    <circle cx="${x + 48}" cy="135" r="7" fill="#ffe588" stroke="#9e6517" stroke-width="3"/>
    <circle cx="${x + 48}" cy="540" r="7" fill="#ffe588" stroke="#9e6517" stroke-width="3"/>
  </g>`;
  const scrollRolls = `<defs><linearGradient id="rollDark" x2="1"><stop stop-color="#080b12"/><stop offset=".48" stop-color="#1d2740"/><stop offset="1" stop-color="#070a10"/></linearGradient><linearGradient id="rollCore" x2="1"><stop stop-color="#070a10"/><stop offset=".45" stop-color="#26334b"/><stop offset=".7" stop-color="#111827"/><stop offset="1" stop-color="#05070c"/></linearGradient><linearGradient id="rollGold" x2="0" y2="1"><stop stop-color="#fff0a1"/><stop offset=".42" stop-color="#f5ba25"/><stop offset="1" stop-color="#b87114"/></linearGradient><filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${premiumRoll(-20)}${premiumRoll(1124)}`;
  const frameBands = `<defs><linearGradient id="frameGold" x2="0" y2="1"><stop stop-color="#fff0a1"/><stop offset=".28" stop-color="#f3bd37"/><stop offset=".68" stop-color="#c98218"/><stop offset="1" stop-color="#8e5410"/></linearGradient><linearGradient id="lifeBar" x2="0" y2="1"><stop stop-color="#ff6a61"/><stop offset="1" stop-color="#c62e37"/></linearGradient><linearGradient id="chakraBar" x2="0" y2="1"><stop stop-color="#69d8ff"/><stop offset="1" stop-color="#2098d8"/></linearGradient><linearGradient id="energyBar" x2="0" y2="1"><stop stop-color="#ffdc63"/><stop offset="1" stop-color="#d99a20"/></linearGradient><filter id="frameDepth" x="-10%" y="-50%" width="120%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#4c2a08" flood-opacity=".45"/></filter><filter id="barDepth" x="-3%" y="-60%" width="106%" height="220%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#2b1609" flood-opacity=".28"/></filter></defs><g filter="url(#frameDepth)"><rect x="60" y="25" width="1080" height="19" rx="8" fill="url(#frameGold)" stroke="#8e5410" stroke-width="2"/><path d="M72 29h1056" stroke="#fff1a6" stroke-width="2" stroke-linecap="round" opacity=".72"/><rect x="60" y="641" width="1080" height="19" rx="8" fill="url(#frameGold)" stroke="#8e5410" stroke-width="2"/><path d="M72 645h1056" stroke="#fff1a6" stroke-width="2" stroke-linecap="round" opacity=".64"/></g>`;
  const currentLevelBadge = `<rect x="1010" y="62" width="112" height="67" rx="10" fill="#7b2820"/><text x="1066" y="88" text-anchor="middle" class="k" fill="#f2dfb5">NÍVEL</text><text x="1066" y="116" text-anchor="middle" class="v" fill="#fff1cc" style="font-size:27px">${data.level}</text>`;
  const levelSeal = `<defs><filter id="waxShadow" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#35100d" flood-opacity=".5"/></filter></defs><g transform="translate(1046 101)"><path d="M0-47c8 3 13-1 20 3 6 4 7 10 15 13 8 2 11 8 10 16 8 5 8 12 3 19 4 8 1 15-7 19-1 9-7 13-16 13-5 8-12 10-20 6-8 6-16 4-22-2-9 2-15-3-17-11-9-3-12-10-9-18-7-6-5-14 2-20-3-8 1-15 9-19 3-9 10-12 19-10 6-7 14-7 21-2 7-5 15-3 20 3Z" fill="#8f1722" stroke="#65101a" stroke-width="4" filter="url(#waxShadow)"/><circle r="36" fill="#b5202c" stroke="#e84a52" stroke-width="2"/><path d="M-25-22c12-13 34-16 49-3" fill="none" stroke="#ff7b76" stroke-width="5" stroke-linecap="round" opacity=".55"/><path d="M-26 24c15 11 36 10 50-2" fill="none" stroke="#660f18" stroke-width="5" stroke-linecap="round" opacity=".48"/><text y="-8" text-anchor="middle" style="font:700 11px Arial;letter-spacing:1.8px;fill:#ffe7ae">NÍVEL</text><text y="24" text-anchor="middle" style="font:800 29px Georgia,serif;fill:#fff4cd;paint-order:stroke;stroke:#70111b;stroke-width:1.5px">${data.level}</text></g>`;
  // Mantém a moldura inteira fora do rolo esquerdo sem reduzir a área útil.
  const portraitX = 84;
  const portraitArtwork = image
    ? `<image href="${image}" x="${portraitX}" y="80" width="365" height="500" preserveAspectRatio="xMidYMid slice"/>`
    : artwork;
  const landscapeLayer = landscapeImage
    ? `<image href="${landscapeImage}" width="1200" height="675" preserveAspectRatio="xMidYMid slice"/><rect width="1200" height="675" fill="#fff0c2" fill-opacity=".48"/>`
    : '<rect width="1200" height="675" fill="#25170f"/>';
  const portraitBackground = landscapeImage
    ? `<image href="${landscapeImage}" x="${portraitX}" y="80" width="365" height="500" preserveAspectRatio="xMidYMid slice"/><rect x="${portraitX}" y="80" width="365" height="500" fill="#13203a" fill-opacity=".16"/>`
    : `<rect x="${portraitX}" y="80" width="365" height="500" fill="#39251d"/>`;
  const themedParchment = parchmentSvg
    .replace('<rect width="1200" height="675" fill="#25170f"/>', landscapeLayer)
    .replace('fill="url(#paper)" stroke="#f6e5b8"', 'fill="url(#paper)" fill-opacity=".76" stroke="#f6e5b8"')
    .replace(currentLevelBadge, levelSeal)
    .replaceAll('x2="1122"', 'x2="1098"')
    .replace('width="637" height="65"', 'width="613" height="65"')
    .replace('<rect x="60" y="80" width="365" height="500" fill="#39251d"/>', portraitBackground)
    .replace(artwork, portraitArtwork)
    .replaceAll('x="60" y="80" width="365"', `x="${portraitX}" y="80" width="365"`)
    .replace(/<path d="M45 75H1155M45 600H1155"[^>]*\/>/, "")
    .replace(/<circle cx="1110" cy="575"[^>]*\/><path d="M1088 575h44m-22-22v44"[^>]*\/>/, "")
    .replace("</svg>", `${frameBands}${scrollRolls}</svg>`);
  // A paleta leva o card do pergaminho envelhecido para o acabamento vivo dos
  // emojis do servidor: papel luminoso, rolos azul-marinho, ouro e vermelho.
  const livelyParchment = themedParchment
    .replaceAll('fill="#af3c32"', 'fill="url(#lifeBar)" filter="url(#barDepth)"')
    .replaceAll('fill="#397ea7"', 'fill="url(#chakraBar)" filter="url(#barDepth)"')
    .replaceAll('fill="#a87525"', 'fill="url(#energyBar)" filter="url(#barDepth)"')
    .replaceAll("#25170f", "#17213a")
    .replaceAll("#ecd9a6", "#fff2c5")
    .replaceAll("#cfb278", "#f6c45f")
    .replaceAll("#98703d", "#cd7c2f")
    .replaceAll("#71352a", "#1d2740")
    .replaceAll("#c99a4c", "#f5ba25")
    .replaceAll("#e1bd68", "#ffe588")
    .replaceAll("#b77a35", "#d98c31")
    .replaceAll("#7b2820", "#dc2632")
    .replaceAll("#5c1b18", "#8f1722")
    .replaceAll("#f2dfb5", "#fff4cd")
    .replaceAll("#8b3028", "#d6413e")
    .replaceAll("#b53d35", "#e94b4b")
    .replaceAll("#397ea7", "#239de4")
    .replaceAll("#b9812c", "#f1aa21");
  void svg;
  return sharp(Buffer.from(livelyParchment)).png().toBuffer();
}
