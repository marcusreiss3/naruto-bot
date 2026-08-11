import type { GuildMember } from "discord.js";
import { ENV } from "../config/env.js";
import {
  MANSAO_HOKAGE_CHANNEL_ID,
  MANSAO_KAZEKAGE_CHANNEL_ID,
  MANSAO_MIZUKAGE_CHANNEL_ID,
  MANSAO_RAIKAGE_CHANNEL_ID,
  MANSAO_TSUCHIKAGE_CHANNEL_ID,
} from "../data/scenarios/index.js";

// Identidade das vilas mora em src/data/villages.ts (puro). Aqui fica so' o
// que depende do Discord. Reexportado para nao quebrar quem ja importava daqui.
export { VILLAGE_IDS, VILLAGE_NAMES, isVillageId, normalizeVillageId } from "../data/villages.js";
export type { VillageId } from "../data/villages.js";

import { VILLAGE_IDS, type VillageId } from "../data/villages.js";

export const VILLAGE_ROLES: Record<VillageId, string> = {
  KONOHA: "1523372974965522582",
  SUNA: "1523373008767684740",
  IWA: "1523373069354143905",
  KUMO: "1523373105102192711",
  KIRI: "1523373127957090444",
};

export const VILLAGE_MANSIONS: Record<VillageId, string> = {
  KONOHA: MANSAO_HOKAGE_CHANNEL_ID,
  SUNA: MANSAO_KAZEKAGE_CHANNEL_ID,
  IWA: MANSAO_TSUCHIKAGE_CHANNEL_ID,
  KUMO: MANSAO_RAIKAGE_CHANNEL_ID,
  KIRI: MANSAO_MIZUKAGE_CHANNEL_ID,
};

export function villageFromMember(member: GuildMember | null | undefined): VillageId {
  if (!member) return "KONOHA";
  for (const village of VILLAGE_IDS) {
    if (member.roles.cache.has(VILLAGE_ROLES[village])) return village;
  }
  return "KONOHA";
}

// O site autentica apenas a identidade do Discord; para gates de vila ele
// consulta o membro no servidor com o token do bot. Falha segura em Konoha:
// nunca concede indevidamente um ramo exclusivo de Kirigakure.
export async function villageForDiscordUser(guildId: string, discordId: string): Promise<VillageId> {
  if (!guildId || !discordId) return "KONOHA";
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
    headers: { Authorization: `Bot ${ENV.DISCORD_TOKEN}` },
  }).catch(() => null);
  if (!res?.ok) return "KONOHA";
  const body = await res.json().catch(() => null) as { roles?: unknown } | null;
  const roles = Array.isArray(body?.roles) ? body.roles : [];
  for (const village of VILLAGE_IDS) {
    if (roles.includes(VILLAGE_ROLES[village])) return village;
  }
  return "KONOHA";
}
