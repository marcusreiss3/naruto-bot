import { characterPassiveMods } from "./passives.js";

/** Pontuação usada para ordenar o primeiro turno de cada combate. */
export function initiativeScore(
  attributes: Record<string, number> | undefined,
  nodeIds: string[] = [],
): number {
  return (attributes?.taijutsu ?? 0) + characterPassiveMods(nodeIds).initiativePriority;
}

/**
 * Mantém a ordem de entrada como desempate. Assim, iniciativas iguais não
 * introduzem aleatoriedade entre a criação da sessão e as rodadas seguintes.
 */
export function orderByInitiative(ids: string[], scores: ReadonlyMap<string, number>): string[] {
  return ids
    .map((id, index) => ({ id, index }))
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.index - b.index)
    .map(({ id }) => id);
}
