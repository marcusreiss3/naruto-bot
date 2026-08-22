import { BALANCE } from "../../config/balance.js";
import { SCENARIOS } from "../../data/scenarios/index.js";
import { TRAVEL_LOCATIONS } from "../../data/travel.js";
import { prisma } from "../../db/client.js";
import { addXp } from "./character-service.js";

// Canais de narrativa sem /mapa que já existem no servidor. Os demais são
// obtidos de SCENARIOS, para que abrir um novo mapa o torne elegível sem manter
// uma segunda lista manualmente.
const EXTRA_ROLEPLAY_CHANNEL_IDS = [
  "1537470138851401840",
  "1537470404019490897",
  "1537470479013511218",
] as const;

export const ROLEPLAY_CHANNEL_IDS = new Set<string>([
  ...EXTRA_ROLEPLAY_CHANNEL_IDS,
  ...SCENARIOS.map((scenario) => scenario.channelId).filter((channelId) => !channelId.startsWith("mission:")),
  ...Object.values(TRAVEL_LOCATIONS).flatMap((location) => location.channelIds),
]);

export function isRoleplayChannel(channelId: string): boolean {
  return ROLEPLAY_CHANNEL_IDS.has(channelId);
}

function validRoleplayContent(content: string): boolean {
  const clean = content.trim();
  return clean.length >= BALANCE.xp.roleplay.minimumContentLength && /[\p{L}\p{N}]/u.test(clean);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Credita XP silenciosamente por uma mensagem de narrativa válida. O cooldown
 * é aleatório e salvo no banco; assim, spam, troca de canal e restart não
 * reduzem o intervalo. Retorna o XP creditado somente para observabilidade.
 */
export async function awardRoleplayXp(input: {
  discordId: string;
  guildId: string;
  channelId: string;
  content: string;
  now?: Date;
}): Promise<number | null> {
  if (!isRoleplayChannel(input.channelId) || !validRoleplayContent(input.content)) return null;

  // Mensagem de RP não cria ficha automaticamente: só personagens existentes
  // participam da progressão.
  const character = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId: input.discordId, guildId: input.guildId } },
    select: { id: true },
  });
  if (!character) return null;

  const now = input.now ?? new Date();
  const cooldownMs = randomInt(BALANCE.xp.roleplay.cooldownMinMs, BALANCE.xp.roleplay.cooldownMaxMs);
  const nextAwardAt = new Date(now.getTime() + cooldownMs);
  const current = await prisma.roleplayXpCooldown.findUnique({ where: { charId: character.id } });

  if (!current) {
    try {
      await prisma.roleplayXpCooldown.create({ data: { charId: character.id, nextAwardAt } });
    } catch (error) {
      // Outra mensagem simultânea já abriu o intervalo e vai receber o crédito.
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") return null;
      throw error;
    }
  } else {
    const claimed = await prisma.roleplayXpCooldown.updateMany({
      where: { charId: character.id, nextAwardAt: { lte: now } },
      data: { nextAwardAt },
    });
    if (claimed.count === 0) return null;
  }

  const reward = randomInt(BALANCE.xp.roleplay.rewardMin, BALANCE.xp.roleplay.rewardMax);
  await addXp(character.id, reward);
  return reward;
}
