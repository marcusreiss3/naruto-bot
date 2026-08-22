// A linhagem Kazekage desperta UMA manipulação de areia ao comprar a raiz da
// árvore. A escolha fica persistida como um CharacterSkillNode técnico, igual
// à variação do Mangekyō: não consome pontos nem aparece como nó comprável.
export const KAZEKAGE_SAND_VARIANTS = ["AREIA", "FERRO", "OURO"] as const;
export type KazekageSandVariant = (typeof KAZEKAGE_SAND_VARIANTS)[number];

export const KAZEKAGE_SAND_VARIANT_LABEL: Record<KazekageSandVariant, string> = {
  AREIA: "Areia",
  FERRO: "Areia de Ferro",
  OURO: "Pó de Ouro",
};

const KAZEKAGE_SAND_VARIANT_NODE_PREFIX = "kazekage_areia_variant:";

export function kazekageSandVariantNodeId(variant: KazekageSandVariant): string {
  return `${KAZEKAGE_SAND_VARIANT_NODE_PREFIX}${variant.toLowerCase()}`;
}

export function kazekageSandVariantFromNodeId(nodeId: string): KazekageSandVariant | null {
  const value = nodeId.slice(KAZEKAGE_SAND_VARIANT_NODE_PREFIX.length).toUpperCase();
  return (KAZEKAGE_SAND_VARIANTS as readonly string[]).includes(value)
    ? (value as KazekageSandVariant)
    : null;
}

export function rollKazekageSandVariant(random: () => number = Math.random): KazekageSandVariant {
  return KAZEKAGE_SAND_VARIANTS[Math.floor(random() * KAZEKAGE_SAND_VARIANTS.length)]!;
}
