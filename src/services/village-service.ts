import type { GuildMember } from "discord.js";
import {
  MANSAO_HOKAGE_CHANNEL_ID,
  MANSAO_KAZEKAGE_CHANNEL_ID,
  MANSAO_MIZUKAGE_CHANNEL_ID,
  MANSAO_RAIKAGE_CHANNEL_ID,
  MANSAO_TSUCHIKAGE_CHANNEL_ID,
} from "../data/scenarios/index.js";

export type VillageId = "KONOHA" | "SUNA" | "IWA" | "KUMO" | "KIRI";

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

export const VILLAGE_NAMES: Record<VillageId, string> = {
  KONOHA: "Konoha",
  SUNA: "Sunagakure",
  IWA: "Iwagakure",
  KUMO: "Kumogakure",
  KIRI: "Kirigakure",
};

export function villageFromMember(member: GuildMember | null | undefined): VillageId {
  if (!member) return "KONOHA";
  for (const village of Object.keys(VILLAGE_ROLES) as VillageId[]) {
    if (member.roles.cache.has(VILLAGE_ROLES[village])) return village;
  }
  return "KONOHA";
}

export function normalizeVillageId(value: unknown): VillageId {
  if (value === "SUNA" || value === "IWA" || value === "KUMO" || value === "KIRI" || value === "KONOHA") {
    return value;
  }
  return "KONOHA";
}
