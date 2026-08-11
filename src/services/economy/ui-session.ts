// Sessao do painel efemero de /loja (secao 7.5).
//
// O customId carrega SO' o id opaco da sessao: nunca preco, saldo, quantidade
// confiavel nem permissao. Toda confirmacao releˆ loja, cofre, personagem e
// sessao do banco.
//
// A sessao vive no banco, e nao num collector por mensagem, porque:
//   - collector morre no reinicio e deixa painel zumbi que nao responde;
//   - handler global + sessao persistida sobrevive a deploy no meio de uma
//     compra;
//   - e a expiracao vira um dado auditavel em vez de um timer.

import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { isShopType, type ShopType } from "../../data/shops.js";
import { EconomyError } from "./errors.js";
import type { VillageId } from "../../data/villages.js";

export interface SessionSeed {
  ownerDiscordId: string;
  guildId: string;
  channelId: string;
  villageId: VillageId;
  charId: string;
  shopType?: ShopType | null;
}

// Escolha pendente do jogador: o que ele selecionou e ainda vai confirmar.
// Nada aqui e' fonte de verdade — o servico revalida tudo na transacao.
export interface SessionData {
  itemId?: string;
  qty?: number;
  recipeId?: string;
  contractId?: string;
  origem?: "SHOP" | "CENTRAL";
  preferido?: string;
  motivo?: string;
}

export async function createSession(seed: SessionSeed, now = new Date()) {
  return prisma.discordUiSession.create({
    data: {
      ownerDiscordId: seed.ownerDiscordId,
      guildId: seed.guildId,
      channelId: seed.channelId,
      villageId: seed.villageId,
      charId: seed.charId,
      shopType: seed.shopType ?? null,
      expiresAt: new Date(now.getTime() + ECONOMY.shopSessionTtlMs),
    },
  });
}

// Carrega validando dono e prazo. Lanca EconomyError com mensagem pronta: um
// painel de 20 minutos atras nao pode movimentar valor nenhum.
export async function requireSession(
  sessionId: string,
  ownerDiscordId: string,
  now = new Date(),
) {
  const session = await prisma.discordUiSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new EconomyError("Este painel expirou. Abra `/loja` de novo.");
  if (session.ownerDiscordId !== ownerDiscordId) {
    throw new EconomyError("Este painel é de outra pessoa.");
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new EconomyError("Este painel expirou. Abra `/loja` de novo.");
  }
  return session;
}

export function sessionShopType(session: { shopType: string | null }): ShopType | null {
  return isShopType(session.shopType) ? session.shopType : null;
}

export function sessionData(session: { dataJson: string }): SessionData {
  try {
    return JSON.parse(session.dataJson) as SessionData;
  } catch {
    return {};
  }
}

// Atualiza a tela/escolha pendente e renova o prazo, porque o jogador acabou de
// interagir.
export async function updateSession(
  sessionId: string,
  patch: { shopType?: ShopType | null; screen?: string; data?: SessionData },
  now = new Date(),
) {
  return prisma.discordUiSession.update({
    where: { id: sessionId },
    data: {
      ...(patch.shopType !== undefined ? { shopType: patch.shopType } : {}),
      ...(patch.screen !== undefined ? { screen: patch.screen } : {}),
      ...(patch.data !== undefined ? { dataJson: JSON.stringify(patch.data) } : {}),
      expiresAt: new Date(now.getTime() + ECONOMY.shopSessionTtlMs),
    },
  });
}

export async function closeSession(sessionId: string): Promise<void> {
  await prisma.discordUiSession.deleteMany({ where: { id: sessionId } });
}

// Limpeza das sessoes vencidas. Chamada no boot e a cada abertura de /loja;
// nao precisa de job proprio porque a validacao de prazo ja e' feita na leitura.
export async function purgeExpiredSessions(now = new Date()): Promise<number> {
  const { count } = await prisma.discordUiSession.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}
