import { BALANCE } from "../../config/balance.js";
import { prisma } from "../../db/client.js";
import { addXp } from "./character-service.js";

// XP é permitido em todo canal do servidor, exceto os espaços administrativos,
// de criação e arenas que não representam RP. Canais de /ficha criados no
// futuro são barrados separadamente pela sessão persistida no banco.
export const ROLEPLAY_XP_EXCLUDED_CHANNEL_IDS = new Set<string>([
  "1516084510968778953",
  "1520114256740352061",
  "1520114348079583263",
  "1520114532511387729",
  "1520115244981289162",
  "1520115478532456719",
  "1520115743469994105",
  "1520115799854153991",
  "1520115882347466804",
  "1520116009518764194",
  "1520116229225058304",
  "1520116350360617154",
  "1532259278352552059",
  "1532489626604797992",
  "1532490677253050508",
  "1532490901400846477",
  "1533259689381462117",
  "1533260961547288666",
  "1533261034704343220",
  "1533261132150870137",
  "1533263291248414801",
  "1533263360873861130",
  "1533265940261638204",
  "1533269210615251014",
  "1537492104819900427",
  "1539984596584632430",
  "1539984630953025536",
  "1539984648376156190",
  "1539984757704757350",
  "1539984779959869520",
]);

export function isRoleplayChannel(channelId: string): boolean {
  return !ROLEPLAY_XP_EXCLUDED_CHANNEL_IDS.has(channelId);
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
  // DMs não entram: a regra vale somente para canais do servidor.
  if (input.guildId === "global" || !isRoleplayChannel(input.channelId) || !validRoleplayContent(input.content)) return null;

  // Cada /ficha abre um canal temporário e registra o ID em uma sessão. Esta
  // consulta também cobre novos canais sem precisar adicioná-los à lista acima.
  const sheetSession = await prisma.sheetCreationSession.findUnique({
    where: { channelId: input.channelId },
    select: { id: true },
  });
  if (sheetSession) return null;

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
