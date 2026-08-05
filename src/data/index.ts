import type { Ability, ClanDef } from "./types.js";
import { ELEMENTAL } from "./jutsus/elemental.js";
import { SUPPORT } from "./jutsus/support.js";
import { FUNDAMENTOS as FUNDAMENTOS_ABILITIES } from "./jutsus/fundamentals.js";
import { ITEM_ABILITIES } from "./jutsus/items.js";
import { BUKIJUTSU_ABILITIES } from "./jutsus/bukijutsu.js";
import { IRYO_ABILITIES } from "./jutsus/iryo.js";
import { KAGE_BUNSHIN_ABILITIES } from "./jutsus/kage-bunshin.js";
import { GENJUTSU_ABILITIES } from "./jutsus/genjutsu.js";
import { TAIJUTSU_ABILITIES } from "./jutsus/taijutsu.js";
import { ARHAT_ABILITIES } from "./jutsus/arhat.js";
import { ADAMANTINO_ABILITIES } from "./jutsus/adamantino.js";
import { FUINJUTSU_ABILITIES } from "./jutsus/fuinjutsu.js";
import { CLAN_ABILITIES, CLANS } from "./clans/index.js";

export const ALL_ABILITIES: Ability[] = [
  ...ELEMENTAL,
  ...SUPPORT,
  ...FUNDAMENTOS_ABILITIES,
  ...ITEM_ABILITIES,
  ...BUKIJUTSU_ABILITIES,
  ...IRYO_ABILITIES,
  ...KAGE_BUNSHIN_ABILITIES,
  ...GENJUTSU_ABILITIES,
  ...TAIJUTSU_ABILITIES,
  ...ARHAT_ABILITIES,
  ...ADAMANTINO_ABILITIES,
  ...FUINJUTSU_ABILITIES,
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
