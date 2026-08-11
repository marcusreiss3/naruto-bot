import { prisma } from "../../db/client.js";
import { VILLAGE_NAMES, isVillageId, type VillageId } from "../../data/villages.js";
import { isTaxableRank, normalizeNinjaRank } from "./character-economy.js";
import { recordLedger, type Tx } from "./ledger.js";
import { computeWeeklyTax, type WeeklyActivity } from "./tax-math.js";
import { ensureCurrentTaxPeriods } from "./village-economy.js";
import { weekEndFromKey, weekKeyFor } from "./week.js";

// ---------------- Acumulacao ----------------

export interface MissionActivity {
  charId: string;
  ninjaRank: string;
  villageId: string | null;
  xp: number;
  ryo: number;
  at?: Date;
}

// Acumula XP e Ryo tributaveis da missao concluida. Roda na MESMA transacao da
// recompensa (ver completeMission), entao ou as duas coisas acontecem ou
// nenhuma.
//
// Nao acumula quando: rank e' Academia (protege jogador novo) ou o personagem
// nao tem vila. O `upsert` na chave (weekKey, charId, villageId) soma no
// registro existente sem nunca criar dois.
export async function accumulateMissionActivity(
  tx: Tx,
  activity: MissionActivity,
): Promise<boolean> {
  const rank = normalizeNinjaRank(activity.ninjaRank);
  if (!isTaxableRank(rank)) return false;
  if (!isVillageId(activity.villageId)) return false;

  const weekKey = weekKeyFor(activity.at ?? new Date());
  const xp = Math.max(0, Math.trunc(activity.xp));
  const ryo = Math.max(0, Math.trunc(activity.ryo));

  await tx.weeklyTaxActivity.upsert({
    where: {
      weekKey_charId_villageId: { weekKey, charId: activity.charId, villageId: activity.villageId },
    },
    create: {
      weekKey,
      charId: activity.charId,
      villageId: activity.villageId,
      rankAtEarn: rank,
      taxableXp: xp,
      taxableMissionRyo: ryo,
    },
    // rankAtEarn guarda o rank do PRIMEIRO ganho da semana naquela vila; o que
    // importa para a cobranca e' ter sido tributavel, e a linha so' existe se foi.
    update: { taxableXp: { increment: xp }, taxableMissionRyo: { increment: ryo } },
  });
  return true;
}

// ---------------- Fechamento ----------------

export interface CharacterReceipt {
  charId: string;
  discordId: string;
  guildId: string;
  weekKey: string;
  exempt: boolean;
  totalXp: number;
  balanceBefore: number;
  balanceAfter: number;
  totalRyo: number;
  lines: { villageId: VillageId; taxRate: number; taxableBase: number; taxRyo: number }[];
}

export interface CloseWeekResult {
  weekKey: string;
  charactersProcessed: number;
  charactersExempt: number;
  totalCharged: number;
  receipts: CharacterReceipt[];
}

// Fecha a competencia `weekKey`. Idempotente em dois niveis:
//   1. so' carrega WeeklyTaxActivity com status OPEN;
//   2. WeeklyTaxCharge tem unicidade (weekKey, charId, villageId) e a linha ja
//      existente faz a parcela ser pulada.
// Rodar duas vezes produz uma cobranca so' e um credito de cofre so'.
export async function closeWeek(weekKey: string): Promise<CloseWeekResult> {
  const periods = await prisma.villageTaxPeriod.findMany({ where: { weekKey } });
  const frozenRateByVillage: Record<string, number | undefined> = {};
  for (const period of periods) frozenRateByVillage[period.villageId] = period.taxRateFrozen;

  const activities = await prisma.weeklyTaxActivity.findMany({
    where: { weekKey, status: "OPEN" },
  });

  const byChar = new Map<string, typeof activities>();
  for (const activity of activities) {
    const list = byChar.get(activity.charId);
    if (list) list.push(activity);
    else byChar.set(activity.charId, [activity]);
  }

  const result: CloseWeekResult = {
    weekKey,
    charactersProcessed: 0,
    charactersExempt: 0,
    totalCharged: 0,
    receipts: [],
  };

  for (const [charId, rows] of byChar) {
    const receipt = await closeWeekForCharacter(charId, weekKey, rows, frozenRateByVillage);
    if (!receipt) continue;
    result.charactersProcessed += 1;
    if (receipt.exempt) result.charactersExempt += 1;
    result.totalCharged += receipt.totalRyo;
    result.receipts.push(receipt);
  }

  // Marca a competencia como fechada e abre a nova zerada. O historico da
  // anterior nunca e' apagado: "resetar" e' comecar contadores novos em zero.
  await prisma.villageTaxPeriod.updateMany({
    where: { weekKey, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await ensureCurrentTaxPeriods();

  return result;
}

async function closeWeekForCharacter(
  charId: string,
  weekKey: string,
  rows: { id: string; villageId: string; taxableXp: number; taxableMissionRyo: number }[],
  frozenRateByVillage: Record<string, number | undefined>,
): Promise<CharacterReceipt | null> {
  const input: WeeklyActivity[] = rows.map((row) => ({
    villageId: row.villageId,
    taxableXp: row.taxableXp,
    taxableMissionRyo: row.taxableMissionRyo,
  }));
  const outcome = computeWeeklyTax(input, frozenRateByVillage);
  const activityIds = rows.map((row) => row.id);

  return prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUnique({
      where: { id: charId },
      select: { id: true, discordId: true, guildId: true, ryo: true },
    });
    if (!char) return null;

    if (outcome.exempt) {
      await tx.weeklyTaxActivity.updateMany({
        where: { id: { in: activityIds }, status: "OPEN" },
        data: { status: "ISENTO_INATIVO" },
      });
      return {
        charId,
        discordId: char.discordId,
        guildId: char.guildId,
        weekKey,
        exempt: true,
        totalXp: outcome.totalXp,
        balanceBefore: char.ryo,
        balanceAfter: char.ryo,
        totalRyo: 0,
        lines: [],
      } satisfies CharacterReceipt;
    }

    // Parcelas ja cobradas numa execucao anterior nao entram de novo.
    const jaCobradas = await tx.weeklyTaxCharge.findMany({
      where: { weekKey, charId, villageId: { in: outcome.charges.map((c) => c.villageId) } },
      select: { villageId: true },
    });
    const cobradas = new Set(jaCobradas.map((c) => c.villageId));
    const pendentes = outcome.charges.filter((c) => !cobradas.has(c.villageId));

    const balanceBefore = char.ryo;
    let saldo = balanceBefore;
    const lines: CharacterReceipt["lines"] = [];

    for (const charge of pendentes) {
      if (!isVillageId(charge.villageId)) continue;
      const balanceAfter = saldo - charge.taxRyo;

      // Debita SEM piso em zero: a cobranca tributaria e' a unica via
      // autorizada a deixar o saldo negativo (vira divida, nao bloqueia missao).
      await tx.userCharacter.update({
        where: { id: charId },
        data: { ryo: { decrement: charge.taxRyo } },
      });
      await tx.village.update({
        where: { id: charge.villageId },
        data: { treasuryRyo: { increment: charge.taxRyo } },
      });
      await recordLedger(tx, {
        type: "WEEKLY_ACTIVITY_TAX",
        villageId: charge.villageId,
        ryoDelta: charge.taxRyo,
        charId,
        reason: `Imposto semanal ${weekKey}`,
        meta: {
          weekKey,
          taxRate: charge.taxRate,
          taxableBase: charge.taxableBase,
          balanceBefore: saldo,
          balanceAfter,
        },
      });
      await tx.weeklyTaxCharge.create({
        data: {
          weekKey,
          charId,
          villageId: charge.villageId,
          taxRate: charge.taxRate,
          taxableBase: charge.taxableBase,
          taxRyo: charge.taxRyo,
          balanceBefore: saldo,
          balanceAfter,
        },
      });

      saldo = balanceAfter;
      lines.push({
        villageId: charge.villageId,
        taxRate: charge.taxRate,
        taxableBase: charge.taxableBase,
        taxRyo: charge.taxRyo,
      });
    }

    await tx.weeklyTaxActivity.updateMany({
      where: { id: { in: activityIds }, status: "OPEN" },
      data: { status: "CLOSED" },
    });

    return {
      charId,
      discordId: char.discordId,
      guildId: char.guildId,
      weekKey,
      exempt: false,
      totalXp: outcome.totalXp,
      balanceBefore,
      balanceAfter: saldo,
      totalRyo: lines.reduce((sum, line) => sum + line.taxRyo, 0),
      lines,
    } satisfies CharacterReceipt;
  });
}

// Competencias abertas cujo fim ja passou — o que o boot precisa processar
// depois de o bot ficar fora do ar durante um domingo.
export async function pendingWeekKeys(now = new Date()): Promise<string[]> {
  const periods = await prisma.villageTaxPeriod.findMany({
    where: { status: "OPEN" },
    select: { weekKey: true },
    distinct: ["weekKey"],
  });
  // O vencimento sai da propria chave da competencia, nunca de `openedAt`: uma
  // competencia gravada com atraso ainda vence no domingo que lhe pertence.
  return periods
    .filter((period) => weekEndFromKey(period.weekKey).getTime() <= now.getTime())
    .map((period) => period.weekKey)
    .sort();
}

// Recibo formatado. Sem barra de XP e sem "faltam X XP": a meta e' oculta de
// proposito (secao 3.2). O isento nem recebe recibo.
export function formatReceipt(receipt: CharacterReceipt): string {
  const linhas = receipt.lines.map(
    (line) =>
      `• **${VILLAGE_NAMES[line.villageId]}**: ${line.taxRyo} Ryō ` +
      `(${(line.taxRate * 100).toFixed(0)}% de ${line.taxableBase} Ryō de missão)`,
  );
  const saldo =
    receipt.balanceAfter < 0
      ? `Saldo: **Dívida de ${Math.abs(receipt.balanceAfter)} Ryō**`
      : `Saldo: **${receipt.balanceAfter} Ryō**`;
  return [
    `🧾 **Imposto semanal — competência ${receipt.weekKey}**`,
    "",
    ...linhas,
    "",
    `Total cobrado: **${receipt.totalRyo} Ryō**`,
    saldo,
  ].join("\n");
}

export async function markReceiptSent(charId: string, weekKey: string): Promise<void> {
  await prisma.weeklyTaxCharge.updateMany({
    where: { charId, weekKey },
    data: { receiptSentAt: new Date() },
  });
}
