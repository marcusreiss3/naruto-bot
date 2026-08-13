// Regras compartilhadas pelas investigações Rank B.

export const RANK_B_PARTY_MAX = 4;
export const MEMORY_MAX_ATTEMPTS = 2;
export const MEMORY_PREPARE_SECONDS = 3;
export const MEMORY_WORD_DISPLAY_MS = 1_500;

export function rankBInvestigationMembers(memberIds: Iterable<string>): string[] {
  return [...new Set(memberIds)].slice(0, RANK_B_PARTY_MAX);
}

export function investigationClueQuota(totalClues: number, partySize: number): number {
  return Math.ceil(Math.max(0, totalClues) / Math.max(1, partySize));
}

export function clueCountsByUser(
  members: readonly string[],
  attemptUsers: Record<string, string>,
): Record<string, number> {
  const counts = Object.fromEntries(members.map((id) => [id, 0])) as Record<string, number>;
  for (const userId of Object.values(attemptUsers)) {
    if (userId in counts) counts[userId] = (counts[userId] ?? 0) + 1;
  }
  return counts;
}

export function canUncoverClue(
  userId: string,
  members: readonly string[],
  attemptUsers: Record<string, string>,
  totalClues: number,
): { ok: true } | { ok: false; reason: string } {
  if (!members.includes(userId)) {
    return { ok: false, reason: "Apenas membros da party desta missão podem investigar." };
  }
  const counts = clueCountsByUser(members, attemptUsers);
  const own = counts[userId] ?? 0;
  const quota = investigationClueQuota(totalClues, members.length);
  if (own >= quota) {
    return { ok: false, reason: `Você já desvendou seu limite de ${quota} pista(s) nesta investigação.` };
  }

  // Rodadas justas: antes de alguém pegar a pista extra, todo membro da party
  // precisa ter desvendado ao menos a mesma quantidade. Com 3 ninjas e 4
  // pistas, cada um pega uma e qualquer um pode assumir a quarta.
  const minimum = Math.min(...members.map((id) => counts[id] ?? 0));
  if (members.length > 1 && own > minimum) {
    return { ok: false, reason: "Deixe os outros membros da party desvendarem uma pista antes de assumir outra." };
  }
  return { ok: true };
}

export function createMemorySequence(size: number, random: () => number = Math.random): number[] {
  const sequence = Array.from({ length: Math.max(0, Math.floor(size)) }, (_, index) => index);
  for (let index = sequence.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [sequence[index], sequence[target]] = [sequence[target]!, sequence[index]!];
  }
  return sequence;
}

export function evaluateMemoryChoice(
  sequence: readonly number[],
  position: number,
  selected: number,
): "wrong" | "next" | "complete" {
  if (sequence[position] !== selected) return "wrong";
  return position + 1 >= sequence.length ? "complete" : "next";
}
