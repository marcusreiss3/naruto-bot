// Calculo do imposto pessoal semanal (secao 3.2 de docs/economia-vilas.md).
//
// Puro: recebe os acumuladores da competencia e as taxas ja congeladas, devolve
// o que cobrar. Nao le relogio, nao le banco. Quem persiste e' weekly-tax.ts.

import { ECONOMY } from "../../config/balance.js";

export interface WeeklyActivity {
  villageId: string;
  taxableXp: number;
  taxableMissionRyo: number;
}

export interface WeeklyCharge {
  villageId: string;
  taxRate: number;
  taxableBase: number;
  taxRyo: number;
}

export interface WeeklyTaxResult {
  totalXp: number;
  goal: number;
  // Abaixo da meta a competencia fecha ISENTO_INATIVO: cobra zero, nao altera
  // Ryo e nao credita cofre.
  exempt: boolean;
  charges: WeeklyCharge[];
  totalRyo: number;
}

// A meta e' avaliada pelo TOTAL do personagem, somando registros de vilas
// diferentes; ja o Ryo cobrado e' repartido por vila conforme o Ryo de missao
// registrado para cada uma.
export function computeWeeklyTax(
  activities: WeeklyActivity[],
  frozenRateByVillage: Record<string, number | undefined>,
  goal: number = ECONOMY.weeklyTaxableXpGoal,
): WeeklyTaxResult {
  const totalXp = activities.reduce((sum, a) => sum + Math.max(0, a.taxableXp), 0);

  if (totalXp < goal) {
    return { totalXp, goal, exempt: true, charges: [], totalRyo: 0 };
  }

  const charges: WeeklyCharge[] = [];
  for (const activity of activities) {
    const taxableBase = Math.max(0, activity.taxableMissionRyo);
    const taxRate = frozenRateByVillage[activity.villageId];
    // Sem taxa congelada nao ha competencia aberta para aquela vila: nao inventa
    // uma taxa, so' nao cobra.
    if (taxRate === undefined) continue;
    const taxRyo = Math.floor(taxableBase * taxRate);
    if (taxRyo <= 0) continue;
    charges.push({ villageId: activity.villageId, taxRate, taxableBase, taxRyo });
  }

  return {
    totalXp,
    goal,
    exempt: false,
    charges,
    totalRyo: charges.reduce((sum, c) => sum + c.taxRyo, 0),
  };
}
