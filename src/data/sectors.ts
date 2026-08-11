// Setores da vila e Centro da Vila (secao 6 de docs/economia-vilas.md).
//
// Conteudo puro: so' a TABELA MESTRE. Fator de populacao, arredondamento,
// custo acumulado e manutencao ficam em services/economy/sector-math.ts — aqui
// nao existe conta nenhuma, para a tabela poder ser conferida linha a linha
// contra o documento.

import type { GatherAction } from "./gathering.js";

export const SECTOR_KEYS = [
  "CRIACAO_HORTAS",
  "MINAS_FUNDICOES",
  "SILVICULTURA_COLETA",
  "POCOS_RESERVATORIOS",
] as const;
export type SectorKey = (typeof SECTOR_KEYS)[number];

export const MAX_SECTOR_LEVEL = 5;
export const MAX_CENTER_LEVEL = 3;

// Situacao de um predio quanto a reforma. O nivel NUNCA e' perdido: a pendencia
// suspende o beneficio, nao o investimento.
export const BUILDING_STATUSES = ["OK", "NECESSITA_REFORMA"] as const;
export type BuildingStatus = (typeof BUILDING_STATUSES)[number];

export interface SectorDef {
  key: SectorKey;
  name: string;
  emoji: string;
  description: string;
  // Acao de coleta bonificada pelo setor. Poços bonificam SO' agua limpa, por
  // isso tem `onlyItemId`.
  bonusAction: GatherAction;
  bonusOnlyItemId?: string;
}

export const SECTORS: SectorDef[] = [
  {
    key: "CRIACAO_HORTAS",
    name: "Criação e Hortas",
    emoji: "🌾",
    description: "Carne, grão, frutas e couro. Melhora levemente o resultado de caça.",
    bonusAction: "CACAR",
  },
  {
    key: "MINAS_FUNDICOES",
    name: "Minas e Fundições",
    emoji: "⛏️",
    description: "Pedra, minério de ferro e carvão. Aumenta materiais comuns de mineração.",
    bonusAction: "MINERAR",
  },
  {
    key: "SILVICULTURA_COLETA",
    name: "Silvicultura e Coleta",
    emoji: "🌲",
    description: "Madeira, fibra, ervas e frutas. Aumenta materiais comuns de coleta natural.",
    bonusAction: "COLETAR",
  },
  {
    key: "POCOS_RESERVATORIOS",
    name: "Poços e Reservatórios",
    emoji: "💧",
    description: "Água Limpa. Aumenta apenas a Água Limpa obtida em `/acao coletar-agua`.",
    bonusAction: "COLETAR_AGUA",
    bonusOnlyItemId: "agua_limpa",
  },
];

const SECTOR_MAP = new Map(SECTORS.map((sector) => [sector.key, sector]));

export function getSector(key: string): SectorDef | undefined {
  return SECTOR_MAP.get(key as SectorKey);
}

export function isSectorKey(value: unknown): value is SectorKey {
  return (SECTOR_KEYS as readonly unknown[]).includes(value);
}

// ---------------- Custo e duracao das obras de setor ----------------

export interface LevelCost {
  ryo: number;
  items: Record<string, number>;
  durationMs: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Custo comum da secao 6.3, indexado pelo NIVEL-ALVO (1 a 5).
const SECTOR_COMMON: Record<number, { ryo: number; madeira: number; pedra: number; ferro: number; durationMs: number }> = {
  1: { ryo: 1200, madeira: 80, pedra: 80, ferro: 20, durationMs: 3 * HOUR },
  2: { ryo: 2100, madeira: 140, pedra: 130, ferro: 40, durationMs: 1 * DAY },
  3: { ryo: 3600, madeira: 240, pedra: 220, ferro: 70, durationMs: 3 * DAY },
  4: { ryo: 5800, madeira: 380, pedra: 350, ferro: 120, durationMs: 7 * DAY },
  5: { ryo: 9000, madeira: 600, pedra: 550, ferro: 200, durationMs: 15 * DAY },
};

// Materiais especificos, ADICIONAIS ao comum (tabela da secao 6.3).
const SECTOR_SPECIFIC: Record<SectorKey, Record<number, Record<string, number>>> = {
  CRIACAO_HORTAS: {
    1: { grao: 30, couro: 15 },
    2: { grao: 60, couro: 25 },
    3: { grao: 100, couro: 40 },
    4: { grao: 150, couro: 60 },
    5: { grao: 240, couro: 100, agua_limpa: 80 },
  },
  MINAS_FUNDICOES: {
    1: { carvao: 25 },
    2: { carvao: 45 },
    3: { carvao: 75 },
    4: { carvao: 120 },
    5: { carvao: 180, minerio_raro: 1 },
  },
  SILVICULTURA_COLETA: {
    1: { fibra_vegetal: 25 },
    2: { fibra_vegetal: 45 },
    3: { fibra_vegetal: 75 },
    4: { fibra_vegetal: 120 },
    5: { fibra_vegetal: 180, madeira_reforcada: 1 },
  },
  POCOS_RESERVATORIOS: {
    1: { argila: 20, fibra_vegetal: 10 },
    2: { argila: 40, fibra_vegetal: 18 },
    3: { argila: 70, fibra_vegetal: 30 },
    4: { argila: 110, fibra_vegetal: 45 },
    5: { argila: 170, fibra_vegetal: 75 },
  },
};

// Custo-BASE do salto para `level`, antes do fator de populacao.
export function sectorLevelCost(key: SectorKey, level: number): LevelCost | undefined {
  const comum = SECTOR_COMMON[level];
  const especifico = SECTOR_SPECIFIC[key][level];
  if (!comum || !especifico) return undefined;
  return {
    ryo: comum.ryo,
    items: {
      madeira: comum.madeira,
      pedra: comum.pedra,
      minerio_ferro: comum.ferro,
      ...especifico,
    },
    durationMs: comum.durationMs,
  };
}

// ---------------- Producao diaria ----------------

// Producao-BASE por nivel (secao 6.3). Nivel 0 nao produz.
//
// A tabela do spec diz "fruta/erva" a partir do nivel 2 na Silvicultura: aqui
// isso vira metade de cada, arredondando a fruta para cima — o total bate com
// a tabela e nenhum dos dois some.
const SECTOR_PRODUCTION: Record<SectorKey, Record<number, Record<string, number>>> = {
  CRIACAO_HORTAS: {
    1: { carne_crua: 8, grao: 4, couro: 2 },
    2: { carne_crua: 14, grao: 8, couro: 4 },
    3: { carne_crua: 22, grao: 13, couro: 6 },
    4: { carne_crua: 32, grao: 19, couro: 9 },
    5: { carne_crua: 45, grao: 28, couro: 13 },
  },
  MINAS_FUNDICOES: {
    1: { pedra: 10, minerio_ferro: 4, carvao: 3 },
    2: { pedra: 18, minerio_ferro: 8, carvao: 6 },
    3: { pedra: 28, minerio_ferro: 13, carvao: 10 },
    4: { pedra: 40, minerio_ferro: 20, carvao: 15 },
    5: { pedra: 55, minerio_ferro: 30, carvao: 22 },
  },
  SILVICULTURA_COLETA: {
    1: { madeira: 10, fibra_vegetal: 6, fruta: 3 },
    2: { madeira: 18, fibra_vegetal: 11, fruta: 3, erva_medicinal: 2 },
    3: { madeira: 28, fibra_vegetal: 17, fruta: 4, erva_medicinal: 4 },
    4: { madeira: 40, fibra_vegetal: 25, fruta: 6, erva_medicinal: 6 },
    5: { madeira: 55, fibra_vegetal: 35, fruta: 9, erva_medicinal: 8 },
  },
  POCOS_RESERVATORIOS: {
    1: { agua_limpa: 10 },
    2: { agua_limpa: 18 },
    3: { agua_limpa: 28 },
    4: { agua_limpa: 40 },
    5: { agua_limpa: 55 },
  },
};

export function sectorProductionBase(key: SectorKey, level: number): Record<string, number> {
  return SECTOR_PRODUCTION[key][level] ?? {};
}

// ---------------- Centro da Vila ----------------

// Nivel 1 e' gratuito e inicial; a tabela cobre os saltos 2 e 3 (secao 6.1).
const CENTER_LEVELS: Record<number, LevelCost> = {
  2: {
    ryo: 5000,
    items: { madeira: 300, pedra: 260, minerio_ferro: 100 },
    durationMs: 3 * DAY,
  },
  3: {
    ryo: 11000,
    items: { madeira: 650, pedra: 550, minerio_ferro: 220 },
    durationMs: 10 * DAY,
  },
};

export function centerLevelCost(level: number): LevelCost | undefined {
  return CENTER_LEVELS[level];
}

// Obras simultaneas permitidas pelo Centro: nivel 1 -> 1, nivel 2 -> 2, 3 -> 3.
export function centerCapacity(level: number): number {
  return Math.min(MAX_CENTER_LEVEL, Math.max(1, level));
}

// Desconto do Centro no Ryo da manutencao: 1,00 / 0,90 / 0,80 (secao 6.4).
// NUNCA se aplica a material, custo de obra ou preco de loja.
export function centerMaintenanceDiscount(level: number): number {
  const tabela: Record<number, number> = { 1: 1, 2: 0.9, 3: 0.8 };
  return tabela[Math.min(MAX_CENTER_LEVEL, Math.max(1, level))] ?? 1;
}

export const CENTER = {
  buildingType: "CENTER" as const,
  buildingKey: "CENTRO" as const,
  name: "Centro da Vila",
  emoji: "🏛️",
  description:
    "Não gera recurso: define quantas obras a vila toca ao mesmo tempo e desconta o Ryō da reforma semanal.",
};
