import type { Ability, ClanDef } from "./types.js";
import { ELEMENTAL } from "./jutsus/elemental.js";
import { SUPPORT } from "./jutsus/support.js";
import { FUNDAMENTOS as FUNDAMENTOS_ABILITIES } from "./jutsus/fundamentals.js";
import { CLAN_ABILITIES, CLANS } from "./clans/index.js";

export const ALL_ABILITIES: Ability[] = [
  ...ELEMENTAL,
  ...SUPPORT,
  ...FUNDAMENTOS_ABILITIES,
  ...CLAN_ABILITIES,
];

const ABILITY_MAP = new Map<string, Ability>(ALL_ABILITIES.map((a) => [a.id, a]));
const CLAN_MAP = new Map<string, ClanDef>(CLANS.map((c) => [c.id, c]));

export function getAbility(id: string): Ability | undefined {
  return ABILITY_MAP.get(id);
}

export function getClan(id: string): ClanDef | undefined {
  return CLAN_MAP.get(id);
}

export { CLANS };
export * from "./scenarios/index.js";
export * from "./missions/index.js";
export * from "./npcs.js";
