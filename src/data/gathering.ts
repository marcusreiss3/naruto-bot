import {
  CAMPO_ABERTO_CHANNEL_ID,
  CAVERNA_CHANNEL_ID,
  DESERTO_CHANNEL_ID,
  FLORESTA_CHANNEL_ID,
  RIO_CHANNEL_ID,
} from "./scenarios/index.js";

// A Montanha e' area de coleta mas ainda nao tem mapa de combate (secao 4.3 do
// spec pede a constante sem forcar um cenario novo). Por isso o id mora aqui e
// nao em scenarios/index.ts.
export const MONTANHA_CHANNEL_ID = "1515881137170546852";

export const GATHER_ACTIONS = ["MINERAR", "COLETAR", "CACAR", "PESCAR", "COLETAR_AGUA"] as const;
export type GatherAction = (typeof GATHER_ACTIONS)[number];

// Nome do subcomando no Discord -> acao interna. `coletar-agua` porque o
// Discord nao aceita espaco em nome de subcomando.
export const GATHER_ACTION_BY_SUBCOMMAND: Record<string, GatherAction> = {
  minerar: "MINERAR",
  coletar: "COLETAR",
  cacar: "CACAR",
  pescar: "PESCAR",
  "coletar-agua": "COLETAR_AGUA",
};

export const GATHER_ACTION_LABELS: Record<GatherAction, string> = {
  MINERAR: "Mineração",
  COLETAR: "Coleta",
  CACAR: "Caça",
  PESCAR: "Pesca",
  COLETAR_AGUA: "Coleta de água",
};

export interface GatherAreaDef {
  id: string;
  name: string;
  channelId: string;
  // Recursos por acao. A acao so' e' permitida na area se tiver pool aqui.
  pools: Partial<Record<GatherAction, string[]>>;
}

// Tabela da secao 4.3. Caca e pesca tem forma de recompensa propria (ver
// gathering.ts): a pool declara o alvo principal e o secundario, nesta ordem.
export const GATHER_AREAS: GatherAreaDef[] = [
  {
    id: "DESERTO",
    name: "Deserto",
    channelId: DESERTO_CHANNEL_ID,
    pools: {
      COLETAR: ["fibra_vegetal", "fruta", "argila", "sal"],
      CACAR: ["carne_crua", "couro"],
    },
  },
  {
    id: "CAMPO_ABERTO",
    name: "Campo Aberto",
    channelId: CAMPO_ABERTO_CHANNEL_ID,
    pools: {
      COLETAR: ["madeira", "fibra_vegetal", "grao", "fruta", "erva_medicinal"],
      CACAR: ["carne_crua", "couro"],
    },
  },
  {
    id: "RIO",
    name: "Rio",
    channelId: RIO_CHANNEL_ID,
    pools: {
      PESCAR: ["peixe_cru", "fibra_vegetal"],
      COLETAR_AGUA: ["agua_limpa"],
      COLETAR: ["argila", "fibra_vegetal", "erva_medicinal"],
    },
  },
  {
    id: "FLORESTA",
    name: "Floresta",
    channelId: FLORESTA_CHANNEL_ID,
    pools: {
      COLETAR: ["madeira", "fruta", "erva_medicinal", "fibra_vegetal"],
      CACAR: ["carne_crua", "couro"],
    },
  },
  {
    id: "MONTANHA",
    name: "Montanha",
    channelId: MONTANHA_CHANNEL_ID,
    pools: {
      MINERAR: ["pedra", "minerio_ferro", "carvao"],
      COLETAR: ["erva_medicinal"],
      CACAR: ["carne_crua", "couro"],
    },
  },
  {
    id: "CAVERNA",
    name: "Caverna",
    channelId: CAVERNA_CHANNEL_ID,
    pools: {
      MINERAR: ["pedra", "minerio_ferro", "carvao", "argila"],
      COLETAR_AGUA: ["agua_limpa"],
    },
  },
];

const AREA_BY_CHANNEL = new Map(GATHER_AREAS.map((area) => [area.channelId, area]));

export function areaForChannel(channelId: string): GatherAreaDef | undefined {
  return AREA_BY_CHANNEL.get(channelId);
}

export function areasForAction(action: GatherAction): GatherAreaDef[] {
  return GATHER_AREAS.filter((area) => area.pools[action]?.length);
}
