import { ATTRIBUTE_LABELS, type Attribute, type Element } from "../../config/enums.js";
import type { Ability } from "../../data/types.js";
import { TAIJUTSU_TREE } from "../../data/taijutsu-tree.js";
import { ARHAT_TREE } from "../../data/arhat-tree.js";
import { ADAMANTINO_TREE } from "../../data/adamantino-tree.js";

export const SHARINGAN_ABILITY_BY_TOMOE = {
  1: "uchiha_sharingan_1_tomoe",
  2: "uchiha_sharingan_2_tomoe",
  3: "uchiha_sharingan_3_tomoe",
} as const;

export type SharinganTomoe = keyof typeof SHARINGAN_ABILITY_BY_TOMOE;
export const SHARINGAN_COPY_NODE_PREFIX = "uchiha_copy:";
const BASIC_ELEMENTS: readonly Element[] = ["FOGO", "AGUA", "VENTO", "TERRA", "RAIO"];
const COPYABLE_TAIJUTSU_IDS = new Set(
  [...TAIJUTSU_TREE, ...ARHAT_TREE, ...ADAMANTINO_TREE]
    .filter((node) => node.kind === "JUTSU" && node.grantsAbilityId)
    .map((node) => node.grantsAbilityId!),
);

export function sharinganCopyNodeId(abilityId: string): string {
  return `${SHARINGAN_COPY_NODE_PREFIX}${abilityId}`;
}

export function abilityIdFromSharinganCopyNode(nodeId: string): string | null {
  return nodeId.startsWith(SHARINGAN_COPY_NODE_PREFIX)
    ? nodeId.slice(SHARINGAN_COPY_NODE_PREFIX.length)
    : null;
}

export interface SharinganCopyContext {
  level: number;
  ninjutsu: number;
  elements: Element[];
  attributes?: Partial<Record<Attribute, number>>;
}

export interface SharinganCopyGate {
  level?: number;
  ninjutsu?: number;
  attribute?: { key: Attribute; value: number };
}

// O Sharingan copia técnicas moldadas por natureza elemental. Gelo e madeira
// são exceções explícitas, identificadas pelas tags canônicas da habilidade.
export function isSharinganCopyable(ability: Ability): boolean {
  const isAllowedTaijutsu =
    ability.category === "TAIJUTSU" &&
    COPYABLE_TAIJUTSU_IDS.has(ability.id);
  if (isAllowedTaijutsu) return true;
  if (
    ability.category !== "NINJUTSU" ||
    !ability.element ||
    !BASIC_ELEMENTS.includes(ability.element) ||
    ability.requirements?.clanId
  ) return false;
  const tags = new Set(ability.tags.map((tag) => tag.toLocaleLowerCase("pt-BR")));
  if (["gelo", "hyoton", "madeira", "mokuton"].some((tag) => tags.has(tag))) return false;
  return true;
}

export function sharinganCopyRequirementError(
  ability: Ability,
  context: SharinganCopyContext,
  gate: SharinganCopyGate = {},
): string | null {
  if (!isSharinganCopyable(ability)) return "O Sharingan não consegue copiar essa técnica.";

  if (ability.element && !context.elements.includes(ability.element)) {
    return `Você precisa ter a afinidade do elemento ${ability.element} desbloqueada.`;
  }

  const requiredLevel = gate.level ?? ability.requirements?.level ?? 1;
  if (context.level < requiredLevel) {
    return `A técnica copiada exige nível ${requiredLevel}.`;
  }

  const requiredAttribute = gate.attribute ?? (ability.element
    ? { key: "ninjutsu" as const, value: gate.ninjutsu ?? ability.requirements?.attributes?.ninjutsu ?? 1 }
    : undefined);
  if (requiredAttribute) {
    const amount = requiredAttribute.key === "ninjutsu"
      ? context.attributes?.ninjutsu ?? context.ninjutsu
      : context.attributes?.[requiredAttribute.key] ?? 1;
    if (amount < requiredAttribute.value) {
      return `A técnica copiada exige ${ATTRIBUTE_LABELS[requiredAttribute.key]} ${requiredAttribute.value}.`;
    }
  }

  return null;
}
