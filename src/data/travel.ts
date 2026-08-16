import { VILLAGE_NAMES } from "./villages.js";
import type { EmojiKey } from "../ui/economy-emojis.js";

// Mapa do sistema de viagem. Os tempos representam ritmo de jogo, nao minutos
// literais do anime: a geografia canonica serve para ordenar o que e' perto ou
// longe, e o intervalo final fica entre 5 e 20 minutos.

export const TRAVEL_LOCATION_IDS = [
  "KONOHA",
  "SUNA",
  "KIRI",
  "KUMO",
  "IWA",
  "FLORESTA",
  "MONTANHAS",
  "CAMPO_ABERTO",
  "DESERTO",
] as const;

export type TravelLocationId = (typeof TRAVEL_LOCATION_IDS)[number];
export type TravelLocationKind = "VILLAGE" | "OPEN_WORLD";
export type TravelPathId = "FLORESTA" | "DESERTO" | "MONTANHA";

export interface TravelLocation {
  id: TravelLocationId;
  label: string;
  emojiKey: EmojiKey;
  kind: TravelLocationKind;
  roleId: string;
  channelIds: readonly string[];
  arrivalChannelId: string;
}

export interface TravelPath {
  id: TravelPathId;
  label: string;
  emojiKey: EmojiKey;
  roleId: string;
}

export const TRAVEL_PATHS: Record<TravelPathId, TravelPath> = {
  FLORESTA: {
    id: "FLORESTA",
    label: "Caminho da Floresta",
    emojiKey: "floresta_rio",
    roleId: "1537476916490276924",
  },
  DESERTO: {
    id: "DESERTO",
    label: "Caminho do Deserto",
    emojiKey: "deserto",
    roleId: "1537476956931620935",
  },
  MONTANHA: {
    id: "MONTANHA",
    label: "Caminho da Montanha",
    emojiKey: "montanhas_caverna",
    roleId: "1537477005346345030",
  },
};

export const TRAVEL_LOCATIONS: Record<TravelLocationId, TravelLocation> = {
  KONOHA: {
    id: "KONOHA",
    label: VILLAGE_NAMES.KONOHA,
    emojiKey: "konoha",
    kind: "VILLAGE",
    roleId: "1537474891014607009",
    channelIds: ["1528612609434194010"],
    arrivalChannelId: "1528612609434194010",
  },
  SUNA: {
    id: "SUNA",
    label: VILLAGE_NAMES.SUNA,
    emojiKey: "suna",
    kind: "VILLAGE",
    roleId: "1537474970739941376",
    channelIds: ["1528612734071996586"],
    arrivalChannelId: "1528612734071996586",
  },
  KIRI: {
    id: "KIRI",
    label: VILLAGE_NAMES.KIRI,
    emojiKey: "kiri",
    kind: "VILLAGE",
    roleId: "1537475041955029142",
    channelIds: ["1528612808932196422"],
    arrivalChannelId: "1528612808932196422",
  },
  KUMO: {
    id: "KUMO",
    label: VILLAGE_NAMES.KUMO,
    emojiKey: "kumo",
    kind: "VILLAGE",
    roleId: "1537475145424306176",
    channelIds: ["1528612950347087872"],
    arrivalChannelId: "1528612950347087872",
  },
  IWA: {
    id: "IWA",
    label: VILLAGE_NAMES.IWA,
    emojiKey: "iwagakure",
    kind: "VILLAGE",
    roleId: "1537475259442401301",
    channelIds: ["1528612907640684706"],
    arrivalChannelId: "1528612907640684706",
  },
  FLORESTA: {
    id: "FLORESTA",
    label: "Floresta e Rio",
    emojiKey: "floresta_rio",
    kind: "OPEN_WORLD",
    roleId: "1537474136505458698",
    channelIds: ["1515881109878214746", "1515881122179842113"],
    arrivalChannelId: "1515881109878214746",
  },
  MONTANHAS: {
    id: "MONTANHAS",
    label: "Montanhas e Caverna",
    emojiKey: "montanhas_caverna",
    kind: "OPEN_WORLD",
    roleId: "1537474202259427349",
    channelIds: ["1515881137170546852", "1521879431168131132"],
    arrivalChannelId: "1515881137170546852",
  },
  CAMPO_ABERTO: {
    id: "CAMPO_ABERTO",
    label: "Campo Aberto",
    emojiKey: "campo_aberto",
    kind: "OPEN_WORLD",
    roleId: "1537474632205074543",
    channelIds: ["1522249926845923339"],
    arrivalChannelId: "1522249926845923339",
  },
  DESERTO: {
    id: "DESERTO",
    label: "Deserto",
    emojiKey: "deserto",
    kind: "OPEN_WORLD",
    roleId: "1537474774563823686",
    channelIds: ["1516428050063954152"],
    arrivalChannelId: "1516428050063954152",
  },
};

// Matriz simetrica. Konoha fica no centro; Suna no sudoeste; Iwa no
// noroeste; Kumo no nordeste; Kiri a leste e separada pelo mar. Os biomas
// proximos de cada vila recebem os menores tempos.
const MINUTES: Record<TravelLocationId, Record<TravelLocationId, number>> = {
  KONOHA:       { KONOHA: 0,  SUNA: 15, KIRI: 20, KUMO: 18, IWA: 15, FLORESTA: 5,  MONTANHAS: 13, CAMPO_ABERTO: 7,  DESERTO: 14 },
  SUNA:         { KONOHA: 15, SUNA: 0,  KIRI: 20, KUMO: 20, IWA: 13, FLORESTA: 16, MONTANHAS: 15, CAMPO_ABERTO: 9,  DESERTO: 5  },
  KIRI:         { KONOHA: 20, SUNA: 20, KIRI: 0,  KUMO: 14, IWA: 18, FLORESTA: 8,  MONTANHAS: 14, CAMPO_ABERTO: 10, DESERTO: 20 },
  KUMO:         { KONOHA: 18, SUNA: 20, KIRI: 14, KUMO: 0,  IWA: 15, FLORESTA: 14, MONTANHAS: 5,  CAMPO_ABERTO: 10, DESERTO: 19 },
  IWA:          { KONOHA: 15, SUNA: 13, KIRI: 18, KUMO: 15, IWA: 0,  FLORESTA: 14, MONTANHAS: 5,  CAMPO_ABERTO: 9,  DESERTO: 13 },
  FLORESTA:     { KONOHA: 5,  SUNA: 16, KIRI: 8,  KUMO: 14, IWA: 14, FLORESTA: 0,  MONTANHAS: 10, CAMPO_ABERTO: 5,  DESERTO: 15 },
  MONTANHAS:    { KONOHA: 13, SUNA: 15, KIRI: 14, KUMO: 5,  IWA: 5,  FLORESTA: 10, MONTANHAS: 0,  CAMPO_ABERTO: 8,  DESERTO: 14 },
  CAMPO_ABERTO: { KONOHA: 7,  SUNA: 9,  KIRI: 10, KUMO: 10, IWA: 9,  FLORESTA: 5,  MONTANHAS: 8,  CAMPO_ABERTO: 0,  DESERTO: 10 },
  DESERTO:      { KONOHA: 14, SUNA: 5,  KIRI: 20, KUMO: 19, IWA: 13, FLORESTA: 15, MONTANHAS: 14, CAMPO_ABERTO: 10, DESERTO: 0  },
};

const AFFINITY: Record<TravelLocationId, TravelPathId> = {
  KONOHA: "FLORESTA",
  SUNA: "DESERTO",
  KIRI: "FLORESTA",
  KUMO: "MONTANHA",
  IWA: "MONTANHA",
  FLORESTA: "FLORESTA",
  MONTANHAS: "MONTANHA",
  CAMPO_ABERTO: "FLORESTA",
  DESERTO: "DESERTO",
};

export function isTravelLocationId(value: unknown): value is TravelLocationId {
  return (TRAVEL_LOCATION_IDS as readonly unknown[]).includes(value);
}

export function isTravelPathId(value: unknown): value is TravelPathId {
  return value === "FLORESTA" || value === "DESERTO" || value === "MONTANHA";
}

export function travelLocationFromChannel(channelId: string): TravelLocationId | null {
  for (const id of TRAVEL_LOCATION_IDS) {
    if (TRAVEL_LOCATIONS[id].channelIds.includes(channelId)) return id;
  }
  return null;
}

export function travelMinutes(origin: TravelLocationId, destination: TravelLocationId): number {
  return MINUTES[origin][destination];
}

export function travelPath(origin: TravelLocationId, destination: TravelLocationId): TravelPathId {
  // Campo Aberto nao tem cargo de caminho proprio. Nele, o terreno de saida
  // (ou o terreno de chegada) decide qual das tres rotas existentes usar.
  if (destination === "CAMPO_ABERTO") return AFFINITY[origin];
  return AFFINITY[destination];
}

export const TRAVEL_LOCATION_ROLE_IDS = TRAVEL_LOCATION_IDS.map((id) => TRAVEL_LOCATIONS[id].roleId);
export const TRAVEL_PATH_ROLE_IDS = Object.values(TRAVEL_PATHS).map((path) => path.roleId);
export const ALL_TRAVEL_ROLE_IDS = [...TRAVEL_LOCATION_ROLE_IDS, ...TRAVEL_PATH_ROLE_IDS];
