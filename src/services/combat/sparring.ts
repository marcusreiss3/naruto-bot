import {
  ARENA_TREINO_1_CHANNEL_ID,
  ARENA_TREINO_2_CHANNEL_ID,
  ARENA_TREINO_3_CHANNEL_ID,
  ARENA_TREINO_4_CHANNEL_ID,
  ARENA_TREINO_5_CHANNEL_ID,
} from "../../data/scenarios/index.js";

// Canais de treino livre: o combate roda igual (dano, efeitos, morte), mas ao
// fim checkVictory() pula persistResources() nestes canais — a vida/chakra/
// energia do personagem real nunca e' tocada, entao dois jogadores podem
// treinar quantas vezes quiserem sem precisar passar no hospital depois.
export const SPARRING_CHANNEL_IDS: ReadonlySet<string> = new Set([
  ARENA_TREINO_1_CHANNEL_ID,
  ARENA_TREINO_2_CHANNEL_ID,
  ARENA_TREINO_3_CHANNEL_ID,
  ARENA_TREINO_4_CHANNEL_ID,
  ARENA_TREINO_5_CHANNEL_ID,
]);

export function isSparringChannel(channelId: string): boolean {
  return SPARRING_CHANNEL_IDS.has(channelId);
}
