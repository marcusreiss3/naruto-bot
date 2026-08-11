// Matematica dos setores, do Centro e da reforma semanal (secoes 6.2 a 6.4).
// Puro: sem Prisma, sem Discord, sem relogio. Toda conta desta etapa mora aqui.

import { ECONOMY } from "../../config/balance.js";
import { ICHIRAKU_CONSTRUCTION } from "../../data/shops.js";
import {
  CENTER,
  MAX_CENTER_LEVEL,
  MAX_SECTOR_LEVEL,
  centerLevelCost,
  centerMaintenanceDiscount,
  sectorLevelCost,
  sectorProductionBase,
  type SectorKey,
} from "../../data/sectors.js";
import { isRareResource } from "../../data/items.js";

// Forma minima do loot. Declarada aqui em vez de importada de
// economy/gathering.ts de proposito: aquele modulo importa Prisma e importa
// ESTE, entao puxa-lo criaria ciclo e tiraria a pureza daqui.
export interface GatherLoot {
  itemId: string;
  qty: number;
}

export interface Cost {
  ryo: number;
  items: Record<string, number>;
}

function somar(destino: Record<string, number>, origem: Record<string, number>): void {
  for (const [itemId, qty] of Object.entries(origem)) {
    destino[itemId] = (destino[itemId] ?? 0) + qty;
  }
}

// ---------------- Custo de obra ----------------

// Custo-BASE do proximo nivel, antes do fator. `undefined` = nao ha proximo
// nivel (setor no 5, Centro no 3).
export function nextLevelCost(
  buildingType: "SECTOR" | "CENTER",
  key: string,
  levelAtual: number,
): { targetLevel: number; ryo: number; items: Record<string, number>; durationMs: number } | undefined {
  const alvo = levelAtual + 1;
  if (buildingType === "CENTER") {
    if (alvo > MAX_CENTER_LEVEL) return undefined;
    const custo = centerLevelCost(alvo);
    return custo ? { targetLevel: alvo, ...custo } : undefined;
  }
  if (alvo > MAX_SECTOR_LEVEL) return undefined;
  const custo = sectorLevelCost(key as SectorKey, alvo);
  return custo ? { targetLevel: alvo, ...custo } : undefined;
}

// Aplica o fator de populacao. Arredonda para CIMA, como manda a secao 6.2 —
// uma vila minuscula paga menos, mas nunca zero.
export function scaleCost(custo: Cost, factor: number): Cost {
  return {
    ryo: Math.ceil(custo.ryo * factor),
    items: Object.fromEntries(
      Object.entries(custo.items).map(([itemId, qty]) => [itemId, Math.ceil(qty * factor)]),
    ),
  };
}

// ---------------- Custo acumulado (base da reforma) ----------------

// Soma dos custos-BASE de todos os niveis ja investidos no predio. E' isso que
// a manutencao percentua — nao o custo do ultimo nivel, nem o custo ja
// multiplicado pelo fator.
export function accumulatedCost(
  buildingType: "SECTOR" | "CENTER" | "SHOP",
  key: string,
  level: number,
): Cost {
  const total: Cost = { ryo: 0, items: {} };

  if (buildingType === "SHOP") {
    // O Ichiraku e' a unica loja que paga reforma: as outras quatro sao
    // infraestrutura inicial e ficam isentas nesta versao (secao 6.4).
    if (key !== ICHIRAKU_CONSTRUCTION.buildingKey) return total;
    total.ryo = ICHIRAKU_CONSTRUCTION.baseCostRyo;
    somar(total.items, ICHIRAKU_CONSTRUCTION.baseCostItems);
    return total;
  }

  if (buildingType === "CENTER") {
    // Nivel 1 e' gratuito: a soma comeca no 2.
    for (let nivel = 2; nivel <= level; nivel += 1) {
      const custo = centerLevelCost(nivel);
      if (!custo) continue;
      total.ryo += custo.ryo;
      somar(total.items, custo.items);
    }
    return total;
  }

  for (let nivel = 1; nivel <= level; nivel += 1) {
    const custo = sectorLevelCost(key as SectorKey, nivel);
    if (!custo) continue;
    total.ryo += custo.ryo;
    somar(total.items, custo.items);
  }
  return total;
}

// ---------------- Reforma semanal ----------------

export interface MaintenanceDue {
  ryo: number;
  items: Record<string, number>;
}

// Ryo = teto(teto(3% x base x fator) x desconto do Centro).
// Material = teto(1% x acumulado x fator), SEM desconto.
//
// O desconto entra depois do primeiro arredondamento de proposito: e' o que
// reproduz os 104 / 94 / 84 Ryo do exemplo da secao 6.4 para um setor nivel 3
// com fator 0,50 nos Centros 1, 2 e 3.
export function maintenanceDue(
  acumulado: Cost,
  factor: number,
  centerDiscount: number,
): MaintenanceDue {
  const ryoSemDesconto = Math.ceil(ECONOMY.maintenanceRyoRate * acumulado.ryo * factor);
  const items: Record<string, number> = {};
  for (const [itemId, qty] of Object.entries(acumulado.items)) {
    const devido = Math.ceil(ECONOMY.maintenanceItemRate * qty * factor);
    if (devido > 0) items[itemId] = devido;
  }
  return { ryo: Math.ceil(ryoSemDesconto * centerDiscount), items };
}

// Centro em reforma perde o desconto ate ser reparado (secao 6.4).
export function effectiveCenterDiscount(level: number, status: string): number {
  return status === "OK" ? centerMaintenanceDiscount(level) : 1;
}

// ---------------- Capacidade da fila ----------------

// Centro em NECESSITA_REFORMA nao cancela obra ja iniciada, mas limita novos
// inicios a uma vaga (secao 6.1).
export function effectiveCapacity(centerLevel: number, centerStatus: string): number {
  if (centerStatus !== "OK") return ECONOMY.constructionSlots;
  return Math.min(MAX_CENTER_LEVEL, Math.max(ECONOMY.constructionSlots, centerLevel));
}

// ---------------- Producao diaria ----------------

// Producao-base x fator, teto por item. Nivel 0 nao produz nada.
//
// Nenhum item raro aparece na tabela de producao, e esta funcao filtra de novo:
// producao passiva NUNCA gera Minerio Raro nem Madeira Reforcada (secao 6.1).
export function dailyProduction(key: SectorKey, level: number, factor: number): Record<string, number> {
  const base = sectorProductionBase(key, level);
  const saida: Record<string, number> = {};
  for (const [itemId, qty] of Object.entries(base)) {
    if (isRareResource(itemId)) continue;
    const total = Math.ceil(qty * factor);
    if (total > 0) saida[itemId] = total;
  }
  return saida;
}

// ---------------- Bonus de coleta ----------------

// +5% por nivel acima do 1, ate +20% (secao 6.3). Nivel 0 e 1 nao bonificam.
export function sectorGatherBonus(level: number, status = "OK"): number {
  // Setor em reforma suspende producao passiva E bonus de coleta (secao 6.4).
  if (status !== "OK" || level < 2) return 0;
  return Math.min(
    ECONOMY.sectorGatherBonusMax,
    (level - 1) * ECONOMY.sectorGatherBonusPerLevel,
  );
}

// Quantas unidades extras o bonus rende nesta coleta.
//
// A parte fracionaria vira CHANCE, nao arredondamento: com +5% num loot de 5
// unidades o extra exato e' 0,25, entao ha 25% de chance de +1. Arredondar
// mataria o bonus dos niveis 2 e 3, porque um loot de coleta tem 3 a 7
// unidades e 5% disso nunca chega a 1.
export function bonusUnits(totalComum: number, bonus: number, roll: number): number {
  if (bonus <= 0 || totalComum <= 0) return 0;
  const exato = totalComum * bonus;
  const inteiro = Math.floor(exato);
  return roll < exato - inteiro ? inteiro + 1 : inteiro;
}

// Distribui as unidades extras nos montes COMUNS, do maior para o menor, em
// rodizio. Item raro nunca recebe. Puro e deterministico: o unico acaso e' o
// `roll` que ja entrou em bonusUnits.
export function distributeBonus(
  loot: GatherLoot[],
  extras: number,
  elegivel: (itemId: string) => boolean,
): GatherLoot[] {
  if (extras <= 0) return loot;
  const alvos = loot
    .map((entry, index) => ({ index, entry }))
    .filter(({ entry }) => !isRareResource(entry.itemId) && elegivel(entry.itemId))
    .sort((a, b) => b.entry.qty - a.entry.qty || a.index - b.index);
  if (!alvos.length) return loot;

  const saida = loot.map((entry) => ({ ...entry }));
  for (let i = 0; i < extras; i += 1) {
    saida[alvos[i % alvos.length]!.index]!.qty += 1;
  }
  return saida;
}

// ---------------- Rotulos ----------------

export function describeCost(custo: Cost, nomeDe: (itemId: string) => string): string {
  const materiais = Object.entries(custo.items)
    .map(([itemId, qty]) => `${qty} ${nomeDe(itemId)}`)
    .join(", ");
  return materiais ? `${custo.ryo} Ryō, ${materiais}` : `${custo.ryo} Ryō`;
}

export const CENTER_KEY = CENTER.buildingKey;
