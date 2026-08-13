// As cinco vilas como conteudo puro: sem discord.js, sem ENV, sem Prisma.
// O seed e os servicos de economia importam daqui; village-service.ts continua
// dono do que depende do Discord (cargos, mansoes, inferencia por membro).

export const VILLAGE_IDS = ["KONOHA", "SUNA", "IWA", "KUMO", "KIRI"] as const;
export type VillageId = (typeof VILLAGE_IDS)[number];

export const VILLAGE_NAMES: Record<VillageId, string> = {
  KONOHA: "Konohagakure",
  SUNA: "Sunagakure",
  IWA: "Iwagakure",
  KUMO: "Kumogakure",
  KIRI: "Kirigakure",
};

// Canal de avisos de cada vila. E' onde a ordem de coleta aberta e' anunciada
// (com botao `Aceitar ordem`) e onde sai o registro publico de saque do Kage.
// Confirmado pela staff em 2026-08-11: as cinco vilas tem canal proprio e o
// jogador comum enxerga todos.
export const VILLAGE_ANNOUNCE_CHANNELS: Record<VillageId, string> = {
  KONOHA: "1536739194708164608",
  SUNA: "1536739340862881812",
  IWA: "1536739735307943956",
  KUMO: "1536739627380121620",
  KIRI: "1536739452209201363",
};

// Centro comercial de cada vila: o unico canal onde `/loja` abre o menu geral
// (secao 7.1). Konoha, Suna e Kiri ja existiam como constante em
// data/scenarios/index.ts, que continua sendo a fonte delas — aqui o mapa por
// vila e' o que a economia consulta. Kumo e Iwa foram informados pela staff em
// 2026-08-11 e so' existem aqui.
//
// Nao confundir com VILLAGE_ANNOUNCE_CHANNELS (avisos) nem com VILLAGE_MANSIONS
// (administracao): sao tres conjuntos distintos de canal por vila.
export const VILLAGE_MARKET_CHANNELS: Record<VillageId, string> = {
  KONOHA: "1516183249712582657",
  SUNA: "1523372488292302958",
  IWA: "1523372453403955281",
  KUMO: "1523372472223793254",
  KIRI: "1523372437398487151",
};

// Categoria onde o canal de RP do Ichiraku e' criado quando a obra conclui
// (secao 7.7). O canal herda as permissoes da categoria.
export const ICHIRAKU_CATEGORY_BY_VILLAGE: Record<VillageId, string> = {
  KONOHA: "1528608576220954804",
  SUNA: "1528609210663829524",
  IWA: "1528610530930200596",
  KUMO: "1528610721003344013",
  KIRI: "1528610385555361902",
};

// Nome EXATO do canal do Ichiraku. E' tambem a chave de busca que torna a
// criacao idempotente: antes de criar, procuramos este nome na categoria.
export const ICHIRAKU_CHANNEL_NAME = "│・🍜〃﹕𝐈chiraku";

// Qual vila tem este canal como centro comercial. Null fora deles.
export function villageFromMarketChannel(channelId: string): VillageId | null {
  for (const id of VILLAGE_IDS) {
    if (VILLAGE_MARKET_CHANNELS[id] === channelId) return id;
  }
  return null;
}

export function isVillageId(value: unknown): value is VillageId {
  return (VILLAGE_IDS as readonly unknown[]).includes(value);
}

// Falha segura em Konoha: nunca concede indevidamente um ramo exclusivo de
// outra vila quando o dado de origem esta corrompido ou ausente.
export function normalizeVillageId(value: unknown): VillageId {
  return isVillageId(value) ? value : "KONOHA";
}
