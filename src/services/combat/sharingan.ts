import { KEKKEI_GENKAI, type Element } from "../../config/enums.js";
import type { Ability } from "../../data/types.js";

export const SHARINGAN_ABILITY_BY_TOMOE = {
  1: "uchiha_sharingan_1_tomoe",
  2: "uchiha_sharingan_2_tomoe",
  3: "uchiha_sharingan_3_tomoe",
} as const;

export type SharinganTomoe = keyof typeof SHARINGAN_ABILITY_BY_TOMOE;
export const SHARINGAN_COPY_NODE_PREFIX = "uchiha_copy:";

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
}

export interface SharinganCopyGate {
  level?: number;
  ninjutsu?: number;
}

// O Sharingan copia técnicas moldadas por natureza elemental. Gelo e madeira
// são exceções explícitas, identificadas pelas tags canônicas da habilidade.
export function isSharinganCopyable(ability: Ability): boolean {
  if (ability.category !== "NINJUTSU" || !ability.element) return false;
  if (ability.requirements?.clanId) return false;
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

  const element = ability.element!;
  if (!context.elements.includes(element)) {
    const kind = KEKKEI_GENKAI.includes(element as (typeof KEKKEI_GENKAI)[number])
      ? "kekkei genkai"
      : "elemento";
    return `Você precisa ter a afinidade de ${kind} ${element} desbloqueada.`;
  }

  const requiredLevel = gate.level ?? ability.requirements?.level ?? 1;
  if (context.level < requiredLevel) {
    return `A técnica copiada exige nível ${requiredLevel}.`;
  }

  const requiredNinjutsu = gate.ninjutsu ?? ability.requirements?.attributes?.ninjutsu ?? 1;
  if (context.ninjutsu < requiredNinjutsu) {
    return `A técnica copiada exige Ninjutsu ${requiredNinjutsu}.`;
  }

  return null;
}
