import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import type { VillageId } from "../../data/villages.js";

// Populacao ativa (secao 6.2).
//
// A partir da etapa 06 o fator multiplica custo de obra, custo de reforma e
// producao diaria. Ele e' sempre CONGELADO no instante em que a obra ou a
// cobranca nasce — a vila crescer no meio de uma obra nao muda o que ja foi
// cobrado.
//
// A contagem sai de evento REAL dos ultimos 14 dias (coleta/craft/comida,
// missao concluida e movimento de Ryo com personagem). Nunca de quantidade de
// cargo no Discord: cargo nao prova atividade.

// fator = limitar(N / 20) entre 0,30 e 1,50, com N = max(1, ativos).
export function populationFactor(ativos: number): number {
  const n = Math.max(1, ativos);
  const bruto = n / ECONOMY.populationBaseline;
  return Math.min(ECONOMY.populationFactorMax, Math.max(ECONOMY.populationFactorMin, bruto));
}

export interface PopulationView {
  villageId: VillageId;
  ativos: number;
  factor: number;
  desde: Date;
  // Verdadeiro quando a staff fixou o numero por /admin-vila populacao.
  override: boolean;
}

// Personagens UNICOS da vila que agiram nos ultimos 14 dias. Contamos
// personagem distinto, nao acao: quem coletou trinta vezes vale 1.
//
// Fontes de atividade: coleta/craft/comida (EconomyActionLog) e missao
// concluida (WeeklyTaxActivity). Doacao e compra ja aparecem no ledger, mas
// entram aqui pelo personagem afetado.
export async function activePopulation(
  villageId: VillageId,
  now = new Date(),
): Promise<PopulationView> {
  const desde = new Date(now.getTime() - ECONOMY.activeWindowDays * 24 * 60 * 60_000);

  // Override da staff (secao 8): usado para consertar uma apuracao errada ou
  // segurar o custo de uma vila nova. Curto-circuita a consulta inteira.
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { populationOverride: true },
  });
  if (village?.populationOverride != null) {
    return {
      villageId,
      ativos: village.populationOverride,
      factor: populationFactor(village.populationOverride),
      desde,
      override: true,
    };
  }

  const [acoes, missoes, movimentos] = await Promise.all([
    prisma.economyActionLog.findMany({
      where: { createdAt: { gte: desde }, character: { villageId } },
      select: { charId: true },
      distinct: ["charId"],
    }),
    prisma.weeklyTaxActivity.findMany({
      where: { updatedAt: { gte: desde }, villageId },
      select: { charId: true },
      distinct: ["charId"],
    }),
    prisma.villageLedger.findMany({
      where: { createdAt: { gte: desde }, villageId, charId: { not: null } },
      select: { charId: true },
      distinct: ["charId"],
    }),
  ]);

  const unicos = new Set<string>();
  for (const linha of acoes) unicos.add(linha.charId);
  for (const linha of missoes) unicos.add(linha.charId);
  for (const linha of movimentos) if (linha.charId) unicos.add(linha.charId);

  return {
    villageId,
    ativos: unicos.size,
    factor: populationFactor(unicos.size),
    desde,
    override: false,
  };
}
