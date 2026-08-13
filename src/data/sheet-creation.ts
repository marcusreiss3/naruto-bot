import { randomInt } from "node:crypto";
import path from "node:path";
import { CLANS } from "./clans/index.js";
import { traitsByRarity, type TraitDef } from "./traits.js";
import type { TraitRarity } from "../config/enums.js";
import type { VillageId } from "./villages.js";

export const SHEET_LAUNCH_CHANNEL_ID = "1537492104819900427";
export const UNREGISTERED_ROLE_ID = "1527501428401373305";
export const REGISTERED_ROLE_ID = "1527501571943039006";
export const SHEET_CHANNEL_TTL_MS = 60 * 60_000;
export const CLAN_CHOICE_TTL_MS = 10 * 60_000;
export const COMPLETED_CHANNEL_TTL_MS = 30_000;

export const SHEET_VILLAGE_ROLES: Record<VillageId, string> = {
  KONOHA: "1523372974965522582",
  SUNA: "1523373008767684740",
  IWA: "1523373069354143905",
  KUMO: "1523373105102192711",
  KIRI: "1523373127957090444",
};

export const SHEET_LOCATION_ROLES: Record<VillageId, string> = {
  KONOHA: "1537474891014607009",
  SUNA: "1537474970739941376",
  IWA: "1537475259442401301",
  KUMO: "1537475145424306176",
  KIRI: "1537475041955029142",
};

export const CLANS_BY_VILLAGE: Record<VillageId, readonly string[]> = {
  KONOHA: [
    "uchiha", "yamanaka", "hyuuga", "lee", "nara", "senju", "inuzuka",
    "akimichi", "sarutobi", "uzumaki", "aburame", "hatake",
  ],
  SUNA: ["kazekage", "shirogane", "kamaitachi"],
  KIRI: ["hoshigaki", "hozuki", "kaguya", "yuki"],
  KUMO: ["yotsuki", "chinoike", "raikage"],
  IWA: ["bakurei", "kamizuru", "onoki"],
};

export interface ClanVillageRoll {
  villageId: VillageId;
  clanId: string;
}

export function clanOptionFromRoll(options: readonly ClanVillageRoll[], index: number): ClanVillageRoll {
  if (!Number.isInteger(index) || index < 0 || index >= options.length) {
    throw new RangeError("O índice sorteado precisa apontar para uma opção de clã existente.");
  }
  return options[index]!;
}

export function randomClanOption(options: readonly ClanVillageRoll[]): ClanVillageRoll {
  if (!options.length) throw new Error("Não há opções de clã salvas para o sorteio automático.");
  return clanOptionFromRoll(options, randomInt(options.length));
}

const VILLAGES = Object.keys(CLANS_BY_VILLAGE) as VillageId[];
const CLAN_IDS = new Set(CLANS.map((clan) => clan.id));

export function rollClanVillageOptions(count = 3): ClanVillageRoll[] {
  const maximum = Object.values(CLANS_BY_VILLAGE).reduce((sum, clans) => sum + clans.length, 0);
  const wanted = Math.max(1, Math.min(count, maximum));
  const options: ClanVillageRoll[] = [];
  const used = new Set<string>();
  while (options.length < wanted) {
    const villageId = VILLAGES[randomInt(VILLAGES.length)]!;
    const clans = CLANS_BY_VILLAGE[villageId];
    const clanId = clans[randomInt(clans.length)]!;
    const key = `${villageId}:${clanId}`;
    if (used.has(key)) continue;
    used.add(key);
    options.push({ villageId, clanId });
  }
  return options;
}

// Pesos em pontos-base: soma exata de 10.000, evitando erro de ponto
// flutuante no limite de 0,5% da faixa mitica.
export const TRAIT_RARITY_WEIGHTS: ReadonlyArray<{ rarity: TraitRarity; weight: number }> = [
  { rarity: "COMUM", weight: 4_750 },
  { rarity: "RARA", weight: 3_000 },
  { rarity: "EPICA", weight: 1_500 },
  { rarity: "LENDARIA", weight: 700 },
  { rarity: "MITICA", weight: 50 },
];

export function traitRarityFromRoll(value: number): TraitRarity {
  if (!Number.isInteger(value) || value < 0 || value >= 10_000) {
    throw new RangeError("O sorteio da trait deve estar entre 0 e 9999.");
  }
  let cursor = 0;
  for (const entry of TRAIT_RARITY_WEIGHTS) {
    cursor += entry.weight;
    if (value < cursor) return entry.rarity;
  }
  return "MITICA";
}

export interface TraitRoll {
  rarity: TraitRarity;
  options: TraitDef[];
}

export function rollTrait(): TraitRoll {
  const rarity = traitRarityFromRoll(randomInt(10_000));
  const pool = traitsByRarity(rarity);
  if (!pool.length) throw new Error(`Nenhuma trait configurada para ${rarity}.`);
  if (rarity === "MITICA") return { rarity, options: [...pool] };
  return { rarity, options: [pool[randomInt(pool.length)]!] };
}

const CLAN_ICON_FILES: Record<string, string> = {
  uchiha: "uchiha/sharingan-1-tomoe.png",
  yamanaka: "footer/Yamanaka_Symbol.png",
  hyuuga: "footer/Hyuuga_Symbol.png",
  lee: "footer/lee.webp",
  nara: "footer/Nara_Symbol.png",
  senju: "footer/Senju_Symbol.png",
  inuzuka: "footer/Inuzuka_Symbol.png",
  akimichi: "footer/Akimichi_Symbol.png",
  sarutobi: "footer/Sarutobi_Symbol.png",
  uzumaki: "footer/Uzumaki_Symbol.png",
  aburame: "footer/Aburame_Symbol.png",
  hatake: "footer/Hatake_Symbol.png",
  kazekage: "footer/doton.png",
  shirogane: "footer/bukijutsu.png",
  kamaitachi: "footer/Kamaitachi_Symbol.png",
  hoshigaki: "footer/Hoshigaki_Symbol.png",
  hozuki: "footer/Hozuki_Symbol.png",
  kaguya: "footer/Kaguya_Symbol.png",
  yuki: "footer/Yuki_Symbol.png",
  yotsuki: "footer/yotsuki.png",
  chinoike: "footer/Chinoike_Symbol.png",
  raikage: "footer/Raikage_Symbol.png",
  bakurei: "footer/bakurei.png",
  kamizuru: "footer/Kamiuru_Symbol.png",
  onoki: "footer/onoki.png",
};

export function clanIconPath(clanId: string): string {
  const relative = CLAN_ICON_FILES[clanId];
  if (!relative || !CLAN_IDS.has(clanId)) throw new Error(`Ícone de clã não configurado: ${clanId}`);
  return path.join(process.cwd(), "public", "assets", "icons", ...relative.split("/"));
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/^especialista em /, "especialista ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-");
}

export function traitIconPath(trait: TraitDef): string {
  return path.join(process.cwd(), "public", "assets", "icons", "traits", `${slug(trait.name)}.png`);
}
