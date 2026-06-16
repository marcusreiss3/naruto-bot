// Enums centrais (SQLite nao tem enum nativo no Prisma; usamos strings + estes tipos).

export const ELEMENTS = ["FOGO", "AGUA", "VENTO", "TERRA", "RAIO"] as const;
export type Element = (typeof ELEMENTS)[number];

export const ATTRIBUTES = ["ninjutsu", "iryo", "taijutsu", "genjutsu", "kenjutsu"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const CATEGORIES = ["NINJUTSU", "IRYO", "TAIJUTSU", "GENJUTSU", "KENJUTSU", "CLA"] as const;
export type Category = (typeof CATEGORIES)[number];

export const RESOURCES = ["chakra", "energia"] as const;
export type Resource = (typeof RESOURCES)[number];

export const MASTERY_LEVELS = ["BASICO", "CONTROLADO", "MESTRE"] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export const ACTION_TYPES = ["COMUM", "BONUS", "MOVIMENTO", "REACAO"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const SHAPES = [
  "MELEE",
  "LINE",
  "CONE",
  "RADIUS",
  "SINGLE_TARGET",
  "SELF",
  "ALLY",
  "GLOBAL_OR_SCENARIO",
] as const;
export type Shape = (typeof SHAPES)[number];

export const RANKS = ["D", "C", "B", "A"] as const;
export type Rank = (typeof RANKS)[number];

export const EFFECT_IDS = [
  "BURN", // queimadura
  "POISON", // veneno
  "BLEED", // sangramento
  "STUN", // atordoamento
  "SLOW", // lentidao
  "DISARM", // desarme
  "CONFUSION", // confusao
  "ROOT", // enraizado
  "NINJUTSU_BLOCK", // bloqueio mental de ninjutsu
  "DEFENSE_DOWN",
] as const;
export type EffectId = (typeof EFFECT_IDS)[number];
