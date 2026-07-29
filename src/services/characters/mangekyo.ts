export const CHARACTER_CONDITIONS = ["TRAUMA"] as const;
export type CharacterCondition = (typeof CHARACTER_CONDITIONS)[number];

export const CHARACTER_CONDITION_NODE_PREFIX = "condition:";

export function characterConditionNodeId(condition: CharacterCondition): string {
  return `${CHARACTER_CONDITION_NODE_PREFIX}${condition.toLowerCase()}`;
}

export function conditionFromNodeId(nodeId: string): CharacterCondition | null {
  const value = nodeId.slice(CHARACTER_CONDITION_NODE_PREFIX.length).toUpperCase();
  return (CHARACTER_CONDITIONS as readonly string[]).includes(value)
    ? (value as CharacterCondition)
    : null;
}

export const MANGEKYO_VARIANTS = ["ITACHI", "SASUKE", "SHISUI", "OBITO", "MADARA"] as const;
export type MangekyoVariant = (typeof MANGEKYO_VARIANTS)[number];

export const MANGEKYO_VARIANT_LABEL: Record<MangekyoVariant, string> = {
  ITACHI: "Mangekyō Itachi",
  SASUKE: "Mangekyō Sasuke",
  SHISUI: "Mangekyō Shisui",
  OBITO: "Mangekyō Obito",
  MADARA: "Mangekyō Madara",
};

const MANGEKYO_VARIANT_NODE_PREFIX = "uchiha_mangekyo_variant:";

export function mangekyoVariantNodeId(variant: MangekyoVariant): string {
  return `${MANGEKYO_VARIANT_NODE_PREFIX}${variant.toLowerCase()}`;
}

export function mangekyoVariantFromNodeId(nodeId: string): MangekyoVariant | null {
  const value = nodeId.slice(MANGEKYO_VARIANT_NODE_PREFIX.length).toUpperCase();
  return (MANGEKYO_VARIANTS as readonly string[]).includes(value)
    ? (value as MangekyoVariant)
    : null;
}

export function rollMangekyoVariant(random: () => number = Math.random): MangekyoVariant {
  return MANGEKYO_VARIANTS[Math.floor(random() * MANGEKYO_VARIANTS.length)]!;
}
