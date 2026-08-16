import sharp from "sharp";

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
    const image = await sharp(bytes).resize(430, 620, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${image.toString("base64")}`;
  } catch {
    return "";
  }
}

/** Renderiza o card compactado do /perfil. A distribuicao completa segue no /atributos. */
export async function renderProfileCard(data: ProfileCardData): Promise<Buffer> {
  const image = await portrait(data.appearanceUrl);
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
  void svg;
  return sharp(Buffer.from(parchmentSvg)).png().toBuffer();
}
