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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#10151e"/><stop offset="1" stop-color="#080b11"/></linearGradient><style>.title{font:800 43px Arial;fill:#f8f1e7}.subtitle{font:500 18px Arial;fill:#b6c0ce}.kicker,.label{font:700 15px Arial;letter-spacing:2px;fill:#9fabbc}.value{font:700 23px Arial;fill:#f7f1e8}.amount{font:500 17px Arial;fill:#c8d0dc}.placeholder{font:700 15px Arial;letter-spacing:2px;fill:#e5b0a6}</style></defs><rect width="1200" height="675" fill="url(#bg)"/><rect x="28" y="28" width="1144" height="619" rx="25" fill="#101823" stroke="#ffffff" stroke-opacity=".14" stroke-width="2"/><rect x="28" y="28" width="13" height="619" rx="7" fill="#dc5b5b"/><clipPath id="p"><rect x="60" y="60" width="420" height="555" rx="18"/></clipPath><g clip-path="url(#p)"><rect x="60" y="60" width="420" height="555" fill="#291e2a"/>${artwork}</g><rect x="60" y="60" width="420" height="555" rx="18" fill="none" stroke="#ffffff" stroke-opacity=".12"/><text x="570" y="92" class="kicker" fill="#e4847d">PERFIL SHINOBI</text><text x="570" y="145" class="title">${xml(data.name)}</text><text x="570" y="177" class="subtitle">@${xml(data.username)}  •  ${xml(data.village)}</text><rect x="1010" y="68" width="115" height="74" rx="15" fill="#dc5b5b" fill-opacity=".14" stroke="#dc5b5b" stroke-opacity=".55"/><text x="1068" y="95" text-anchor="middle" class="kicker">NÍVEL</text><text x="1068" y="126" text-anchor="middle" class="value" style="font-size:29px">${data.level}</text><line x1="570" y1="208" x2="1125" y2="208" stroke="#ffffff" stroke-opacity=".12"/><text x="570" y="244" class="label">CLÃ</text><text x="570" y="274" class="value">${xml(data.clan)}</text><text x="850" y="244" class="label">RANK</text><text x="850" y="274" class="value">${xml(data.rank)}</text><rect x="570" y="300" width="555" height="72" rx="14" fill="#dc5b5b" fill-opacity=".08" stroke="#dc5b5b" stroke-opacity=".35"/><text x="592" y="327" class="label">TRAIT</text><text x="592" y="354" class="value" style="font-size:20px">${trait}</text>${bar(418,"VIDA",`${data.hp.current} / ${data.hp.max}`,hp,"#ef6b6c")}${bar(478,"CHAKRA",`${Math.round(data.chakra)} / 100`,chakra,"#66b7ed")}${bar(538,"ENERGIA",`${Math.round(data.energy)} / 100`,energy,"#efcf79")}<line x1="570" y1="589" x2="1125" y2="589" stroke="#ffffff" stroke-opacity=".12"/><text x="570" y="617" class="label">ELEMENTOS</text><text x="570" y="640" class="subtitle">${elements}</text><text x="850" y="617" class="label">ESTILO DE LUTA</text><text x="850" y="640" class="subtitle">${styles}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
