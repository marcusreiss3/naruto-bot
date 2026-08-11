// Canal de RP do Ichiraku (secao 7.7).
//
// Isto e' a unica parte da etapa 05 que fala com o Discord fora de um handler
// de interacao, e ela e' escrita para poder falhar. A obra ja foi paga quando
// esta rotina roda; entao ela precisa ser:
//
//   idempotente — nunca cria um segundo canal, nem depois de reinicio, erro de
//                 permissao ou execucao concorrente;
//   nao-cobradora — falhar aqui NAO devolve, nao recobra e nao reinicia obra.
//                 A loja fica em AWAITING_CHANNEL e a proxima tentativa segue
//                 de onde parou;
//   ordenada     — a loja so' vira ACTIVE DEPOIS de existir um canal valido
//                 persistido.

import { ChannelType, type Client, type Guild } from "discord.js";
import { prisma } from "../../db/client.js";
import {
  ICHIRAKU_CATEGORY_BY_VILLAGE,
  ICHIRAKU_CHANNEL_NAME,
  VILLAGE_NAMES,
  type VillageId,
} from "../../data/villages.js";
import { ICHIRAKU_CONSTRUCTION } from "../../data/shops.js";
import { log } from "../../utils/logger.js";
import { recordLedger } from "./ledger.js";

export type ChannelSyncStatus =
  | "CREATED"
  | "REUSED"
  | "ALREADY_ACTIVE"
  | "NOT_PENDING"
  | "NO_CATEGORY"
  | "NO_PERMISSION"
  | "ERROR";

export interface ChannelSyncResult {
  villageId: VillageId;
  status: ChannelSyncStatus;
  channelId: string | null;
  detail?: string;
}

// Grava o canal e ativa a loja na MESMA transacao: nao existe estado em que o
// canal esta salvo e a loja continua fechada, nem o contrario.
async function activateWithChannel(
  villageId: VillageId,
  channelId: string,
  origem: ChannelSyncStatus,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.villageShop.updateMany({
      where: { villageId, shopType: ICHIRAKU_CONSTRUCTION.shop },
      data: { discordChannelId: channelId, status: "ACTIVE" },
    });
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId,
      reason: `Ichiraku de ${VILLAGE_NAMES[villageId]} aberto ao público`,
      meta: { shopType: ICHIRAKU_CONSTRUCTION.shop, channelId, origem },
    });
  });
}

// Tenta garantir o canal do Ichiraku de UMA vila. Segura para chamar sempre:
// se nao houver nada pendente, devolve NOT_PENDING sem tocar no Discord.
export async function syncIchirakuChannel(
  client: Client,
  villageId: VillageId,
): Promise<ChannelSyncResult> {
  const shop = await prisma.villageShop.findUnique({
    where: { villageId_shopType: { villageId, shopType: ICHIRAKU_CONSTRUCTION.shop } },
  });
  if (!shop) return { villageId, status: "NOT_PENDING", channelId: null };
  if (shop.status !== "AWAITING_CHANNEL" && shop.status !== "ACTIVE") {
    return { villageId, status: "NOT_PENDING", channelId: null };
  }

  // Ja tem canal gravado: so' confirma que ele ainda existe. Um canal apagado a
  // mao devolve a loja para AWAITING_CHANNEL na proxima passada.
  if (shop.discordChannelId) {
    const existente = await client.channels.fetch(shop.discordChannelId).catch(() => null);
    if (existente) {
      if (shop.status !== "ACTIVE") {
        await activateWithChannel(villageId, shop.discordChannelId, "REUSED");
        return { villageId, status: "REUSED", channelId: shop.discordChannelId };
      }
      return { villageId, status: "ALREADY_ACTIVE", channelId: shop.discordChannelId };
    }
    await prisma.villageShop.updateMany({
      where: { id: shop.id },
      data: { discordChannelId: null, status: "AWAITING_CHANNEL" },
    });
  }

  const categoriaId = ICHIRAKU_CATEGORY_BY_VILLAGE[villageId];
  const categoria = await client.channels.fetch(categoriaId).catch(() => null);
  if (!categoria || categoria.type !== ChannelType.GuildCategory) {
    log.warn(`Ichiraku de ${villageId}: categoria ${categoriaId} não encontrada.`);
    return { villageId, status: "NO_CATEGORY", channelId: null, detail: categoriaId };
  }
  const guild: Guild = categoria.guild;

  // Antes de criar, procura o nome EXATO dentro da categoria. E' o que impede
  // duplicata quando o canal existe mas o id se perdeu do banco.
  const jaExiste = guild.channels.cache.find(
    (canal) =>
      canal.parentId === categoriaId &&
      canal.type === ChannelType.GuildText &&
      canal.name === ICHIRAKU_CHANNEL_NAME,
  );
  if (jaExiste) {
    await activateWithChannel(villageId, jaExiste.id, "REUSED");
    return { villageId, status: "REUSED", channelId: jaExiste.id };
  }

  try {
    const canal = await guild.channels.create({
      name: ICHIRAKU_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: categoriaId,
      // Mesmo estilo visual das mansoes: o canal herda a categoria.
      permissionOverwrites: categoria.permissionOverwrites.cache.map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow,
        deny: overwrite.deny,
      })),
    });
    await activateWithChannel(villageId, canal.id, "CREATED");
    return { villageId, status: "CREATED", channelId: canal.id };
  } catch (err) {
    // Falta de permissao nao pode virar cobranca nova nem canal duplicado: a
    // loja fica em AWAITING_CHANNEL e a staff retoma por /admin-vila.
    log.error(`Ichiraku de ${villageId}: falha ao criar o canal.`, err);
    const semPermissao = String(err).includes("Missing Permissions");
    return {
      villageId,
      status: semPermissao ? "NO_PERMISSION" : "ERROR",
      channelId: null,
      detail: String(err).slice(0, 200),
    };
  }
}

// Passa por todas as vilas com Ichiraku esperando canal. Chamada no boot e
// depois de cada conclusao de obra.
export async function syncPendingIchirakuChannels(client: Client): Promise<ChannelSyncResult[]> {
  const pendentes = await prisma.villageShop.findMany({
    where: { shopType: ICHIRAKU_CONSTRUCTION.shop, status: "AWAITING_CHANNEL" },
    select: { villageId: true },
  });
  const resultados: ChannelSyncResult[] = [];
  for (const linha of pendentes) {
    resultados.push(await syncIchirakuChannel(client, linha.villageId as VillageId));
  }
  return resultados;
}

// Canal do Ichiraku de uma vila, se ja existir. `/loja` aceita este canal alem
// do centro comercial.
export async function ichirakuChannelOf(villageId: VillageId): Promise<string | null> {
  const shop = await prisma.villageShop.findUnique({
    where: { villageId_shopType: { villageId, shopType: ICHIRAKU_CONSTRUCTION.shop } },
    select: { discordChannelId: true, status: true },
  });
  return shop?.status === "ACTIVE" ? shop.discordChannelId : null;
}

// Vila cujo canal de Ichiraku e' este. Null fora deles.
export async function villageFromIchirakuChannel(channelId: string): Promise<VillageId | null> {
  const shop = await prisma.villageShop.findFirst({
    where: {
      shopType: ICHIRAKU_CONSTRUCTION.shop,
      status: "ACTIVE",
      discordChannelId: channelId,
    },
    select: { villageId: true },
  });
  return (shop?.villageId as VillageId | undefined) ?? null;
}
