// Producao passiva diaria dos setores (secao 6.1 e 6.3).
//
// A idempotencia NAO depende do relogio: ela e' a unicidade
// (villageId, buildingKey, dayKey) de `VillageProductionRun`. Dois timers
// armados, um reinicio no meio do deposito ou o bot fora do ar por uma semana
// dao no mesmo resultado — cada dia rende exatamente uma vez.
//
// O deposito vai para o ESTOQUE CENTRAL da vila, nunca para o inventario do
// Kage, e nunca inclui Minerio Raro ou Madeira Reforcada.

import { prisma } from "../../db/client.js";
import { getItem } from "../../data/items.js";
import { SECTORS, type SectorKey } from "../../data/sectors.js";
import { VILLAGE_IDS, type VillageId } from "../../data/villages.js";
import { log } from "../../utils/logger.js";
import { activePopulation } from "./population.js";
import { dailyProduction } from "./sector-math.js";
import { addVillageStock } from "./village-economy.js";
import { dayKeyFor } from "./week.js";

export interface ProductionOutcome {
  villageId: VillageId;
  dayKey: string;
  porSetor: { sectorKey: SectorKey; level: number; itens: Record<string, number> }[];
  totalItens: number;
}

// Roda a producao de UM dia para UMA vila. Chamada tanto pelo job quanto pela
// recuperacao de boot; devolve null quando aquele dia ja tinha sido processado.
export async function runVillageProduction(
  villageId: VillageId,
  dayKey: string,
  now = new Date(),
): Promise<ProductionOutcome | null> {
  const setores = await prisma.villageUpgrade.findMany({ where: { villageId } });
  const produtivos = setores.filter((row) => row.level >= 1 && row.status === "OK");
  if (!produtivos.length) return null;

  // Fator lido uma vez por vila e gravado na linha da execucao: o relatorio de
  // amanha nao muda porque a populacao mudou hoje.
  const pop = await activePopulation(villageId, now);

  const porSetor: ProductionOutcome["porSetor"] = [];
  let totalItens = 0;

  for (const setor of produtivos) {
    const itens = dailyProduction(setor.sectorKey as SectorKey, setor.level, pop.factor);
    if (!Object.keys(itens).length) continue;

    const depositou = await prisma.$transaction(async (tx) => {
      // A chave de execucao e' criada ANTES do deposito: se a criacao falhar
      // por duplicata, a transacao inteira cai e nada e' somado.
      try {
        await tx.villageProductionRun.create({
          data: {
            villageId,
            buildingKey: setor.sectorKey,
            dayKey,
            level: setor.level,
            factor: pop.factor,
            itemsJson: JSON.stringify(itens),
          },
        });
      } catch {
        return false;
      }

      for (const [itemId, qty] of Object.entries(itens)) {
        await addVillageStock(tx, {
          villageId,
          itemId,
          qty,
          type: "PASSIVE_PRODUCTION",
          reason: `Produção diária — ${setor.sectorKey} nível ${setor.level} (${dayKey})`,
          meta: { buildingKey: setor.sectorKey, dayKey, factor: pop.factor },
        });
      }
      return true;
    });

    if (!depositou) continue;
    porSetor.push({ sectorKey: setor.sectorKey as SectorKey, level: setor.level, itens });
    totalItens += Object.values(itens).reduce((soma, qty) => soma + qty, 0);
  }

  if (!porSetor.length) return null;
  return { villageId, dayKey, porSetor, totalItens };
}

// Processa os dias em aberto de todas as vilas, do mais antigo para o mais
// novo. `diasParaTras` limita a recuperacao: o bot fora do ar por um mes nao
// deve despejar trinta dias de produção de uma vez.
export const PRODUCTION_CATCHUP_DAYS = 7;

export async function runPendingProduction(
  now = new Date(),
  diasParaTras = PRODUCTION_CATCHUP_DAYS,
): Promise<ProductionOutcome[]> {
  const resultados: ProductionOutcome[] = [];
  for (let atras = diasParaTras; atras >= 0; atras -= 1) {
    const dia = new Date(now.getTime() - atras * 24 * 3_600_000);
    const dayKey = dayKeyFor(dia);
    for (const villageId of VILLAGE_IDS) {
      const saida = await runVillageProduction(villageId, dayKey, now).catch((err) => {
        log.error(`Falha na produção de ${villageId} em ${dayKey}:`, err);
        return null;
      });
      if (saida) resultados.push(saida);
    }
  }
  return resultados;
}

// ---------------- Leitura para o painel ----------------

export interface ProductionPreview {
  sectorKey: SectorKey;
  name: string;
  level: number;
  status: string;
  itens: { itemId: string; name: string; qty: number }[];
  jaRodouHoje: boolean;
}

export async function productionPreview(
  villageId: VillageId,
  now = new Date(),
): Promise<ProductionPreview[]> {
  const [setores, pop, hoje] = await Promise.all([
    prisma.villageUpgrade.findMany({ where: { villageId }, orderBy: { sectorKey: "asc" } }),
    activePopulation(villageId, now),
    prisma.villageProductionRun.findMany({
      where: { villageId, dayKey: dayKeyFor(now) },
      select: { buildingKey: true },
    }),
  ]);
  const rodados = new Set(hoje.map((row) => row.buildingKey));
  const porChave = new Map(setores.map((row) => [row.sectorKey, row]));

  return SECTORS.map((def) => {
    const linha = porChave.get(def.key);
    const level = linha?.level ?? 0;
    const status = linha?.status ?? "OK";
    const itens = status === "OK" ? dailyProduction(def.key, level, pop.factor) : {};
    return {
      sectorKey: def.key,
      name: def.name,
      level,
      status,
      itens: Object.entries(itens).map(([itemId, qty]) => ({
        itemId,
        name: getItem(itemId)?.name ?? itemId,
        qty,
      })),
      jaRodouHoje: rodados.has(def.key),
    };
  });
}
