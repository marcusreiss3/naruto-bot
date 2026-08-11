import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem } from "../../data/items.js";
import { VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import { addInventoryItem, removeInventoryItem } from "../characters/inventory.js";
import { spendCharacterRyo, grantCharacterRyo } from "./character-economy.js";
import { EconomyError, runEconomy } from "./errors.js";
import { recordLedger } from "./ledger.js";
import {
  addVillageStock,
  creditTreasury,
  debitTreasury,
  removeVillageStock,
} from "./village-economy.js";
import { weekKeyFor, weekStartFor } from "./week.js";

// Saldo disponivel = cofre menos o que ja esta comprometido. Saque nunca
// encosta na reserva (hoje: ordem de coleta; na etapa 6: obra e manutencao).
export function availableTreasury(treasuryRyo: number, reservedRyo: number): number {
  return Math.max(0, treasuryRyo - reservedRyo);
}

// Teto do saque: 10% do disponivel por semana, menos o que ja foi sacado nesta
// competencia, e nunca mais que o teto por saque.
export function withdrawalAllowance(
  available: number,
  alreadyWithdrawnThisWeek: number,
): number {
  const semanal = Math.floor(available * ECONOMY.kageWeeklyWithdrawalRate);
  const restante = Math.max(0, semanal - alreadyWithdrawnThisWeek);
  return Math.min(restante, ECONOMY.kageWithdrawalCap);
}

export interface TreasuryView {
  villageId: VillageId;
  treasuryRyo: number;
  reservedRyo: number;
  available: number;
  withdrawnThisWeek: number;
  allowance: number;
  withdrawalsLocked: boolean;
  weekKey: string;
}

export async function treasuryView(villageId: VillageId, now = new Date()): Promise<TreasuryView> {
  const village = await prisma.village.findUniqueOrThrow({ where: { id: villageId } });
  const withdrawnThisWeek = await withdrawnSince(villageId, weekStartFor(now));
  const available = availableTreasury(village.treasuryRyo, village.reservedRyo);
  return {
    villageId,
    treasuryRyo: village.treasuryRyo,
    reservedRyo: village.reservedRyo,
    available,
    withdrawnThisWeek,
    allowance: withdrawalAllowance(available, withdrawnThisWeek),
    withdrawalsLocked: village.withdrawalsLocked,
    weekKey: weekKeyFor(now),
  };
}

// Quanto o Kage ja sacou desde o inicio da competencia. Sai do proprio
// livro-caixa: nao existe contador paralelo que possa divergir.
async function withdrawnSince(villageId: VillageId, desde: Date): Promise<number> {
  const saques = await prisma.villageLedger.aggregate({
    where: { villageId, type: "KAGE_WITHDRAWAL", createdAt: { gte: desde } },
    _sum: { ryoDelta: true },
  });
  return Math.abs(saques._sum.ryoDelta ?? 0);
}

// ---------------- Doação (qualquer ninja) ----------------

export async function donateRyo(
  charId: string,
  villageId: VillageId,
  amount: number,
  actorDiscordId: string,
) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  return runEconomy(async () => {
    const saldo = await prisma.$transaction(async (tx) => {
      // spendCharacterRyo exige saldo suficiente: quem esta em divida nao doa.
      const restante = await spendCharacterRyo(tx, {
        charId,
        amount,
        type: "DONATION_RYO",
        villageId,
        reason: `Doação ao cofre de ${VILLAGE_NAMES[villageId]}`,
        actorDiscordId,
        errorMessage: `Você não tem ${amount} Ryō para doar.`,
      });
      await tx.village.update({
        where: { id: villageId },
        data: { treasuryRyo: { increment: amount } },
      });
      return restante;
    });
    return { saldo };
  });
}

export async function donateItem(
  charId: string,
  villageId: VillageId,
  itemId: string,
  qty: number,
  actorDiscordId: string,
) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };

  return runEconomy(async () => {
    const estoque = await prisma.$transaction(async (tx) => {
      await removeInventoryItem(tx, charId, itemId, qty, `Você não possui ${qty}x ${item.name}.`);
      return addVillageStock(tx, {
        villageId,
        itemId,
        qty,
        type: "DONATION_ITEM",
        reason: `Doação de ${item.name}`,
        charId,
        actorDiscordId,
      });
    });
    return { estoque, name: item.name };
  });
}

// ---------------- Cofre (Kage) ----------------

// Aporte voluntario: sai da conta pessoal do Kage e entra no cofre na mesma
// transacao. Nao cria Ryo, nao aumenta limite de saque e nao e' reversivel.
export async function kageDeposit(
  charId: string,
  villageId: VillageId,
  amount: number,
  actorDiscordId: string,
) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  return runEconomy(async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      const antes = await tx.village.findUniqueOrThrow({
        where: { id: villageId },
        select: { treasuryRyo: true },
      });
      const saldoPessoal = await spendCharacterRyo(tx, {
        charId,
        amount,
        type: "KAGE_DEPOSIT",
        villageId,
        reason: `Aporte pessoal do Kage ao cofre de ${VILLAGE_NAMES[villageId]}`,
        actorDiscordId,
        errorMessage: `Você não tem ${amount} Ryō para depositar.`,
        meta: { treasuryBefore: antes.treasuryRyo, treasuryAfter: antes.treasuryRyo + amount },
      });
      const depois = await tx.village.update({
        where: { id: villageId },
        data: { treasuryRyo: { increment: amount } },
        select: { treasuryRyo: true },
      });
      return { saldoPessoal, cofreAntes: antes.treasuryRyo, cofreDepois: depois.treasuryRyo };
    });
    return resultado;
  });
}

export interface WithdrawalOutcome {
  amount: number;
  cofreAntes: number;
  cofreDepois: number;
  saldoPessoal: number;
  motivo: string;
}

export async function kageWithdraw(
  charId: string,
  villageId: VillageId,
  amount: number,
  motivo: string,
  actorDiscordId: string,
  now = new Date(),
) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const razao = motivo.trim();
  if (razao.length < ECONOMY.withdrawalReasonMin || razao.length > ECONOMY.withdrawalReasonMax) {
    return {
      ok: false as const,
      error: `O motivo precisa ter de ${ECONOMY.withdrawalReasonMin} a ${ECONOMY.withdrawalReasonMax} caracteres.`,
    };
  }

  return runEconomy(async (): Promise<WithdrawalOutcome> =>
    prisma.$transaction(async (tx) => {
      const village = await tx.village.findUniqueOrThrow({ where: { id: villageId } });
      if (village.withdrawalsLocked) {
        throw new EconomyError("Os saques desta vila estão bloqueados pela staff.");
      }

      // Revalidado DENTRO da transacao: o painel pode ter sido aberto ha
      // minutos e o limite ja ter sido consumido por outro saque.
      const available = availableTreasury(village.treasuryRyo, village.reservedRyo);
      const jaSacado = await tx.villageLedger
        .aggregate({
          where: { villageId, type: "KAGE_WITHDRAWAL", createdAt: { gte: weekStartFor(now) } },
          _sum: { ryoDelta: true },
        })
        .then((r) => Math.abs(r._sum.ryoDelta ?? 0));
      const limite = withdrawalAllowance(available, jaSacado);

      if (amount > limite) {
        throw new EconomyError(
          limite <= 0
            ? "Você já atingiu o limite de saque desta semana."
            : `O máximo que você pode sacar agora é ${limite} Ryō.`,
        );
      }

      const cofreDepois = await debitTreasury(tx, {
        villageId,
        amount,
        type: "KAGE_WITHDRAWAL",
        reason: razao,
        actorDiscordId,
        charId,
        meta: { treasuryBefore: village.treasuryRyo, treasuryAfter: village.treasuryRyo - amount },
      });
      const saldoPessoal = await grantCharacterRyo(tx, {
        charId,
        amount,
        type: "KAGE_WITHDRAWAL",
        villageId,
        reason: razao,
        actorDiscordId,
      });

      return {
        amount,
        cofreAntes: village.treasuryRyo,
        cofreDepois,
        saldoPessoal,
        motivo: razao,
      };
    }),
  );
}

// ---------------- Estoque (Kage) ----------------

// Transferencia de estoque da vila para um ninja. O Kage escolhe item,
// quantidade e destinatario — nunca edita a quantidade diretamente.
export async function withdrawStockToCharacter(
  villageId: VillageId,
  itemId: string,
  qty: number,
  targetCharId: string,
  actorDiscordId: string,
) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };

  return runEconomy(async () => {
    const restante = await prisma.$transaction(async (tx) => {
      const sobrou = await removeVillageStock(tx, {
        villageId,
        itemId,
        qty,
        type: "STOCK_WITHDRAWAL",
        reason: `Retirada de estoque: ${item.name}`,
        charId: targetCharId,
        actorDiscordId,
      });
      await addInventoryItem(tx, targetCharId, itemId, qty);
      return sobrou;
    });
    return { restante, name: item.name };
  });
}

// ---------------- Ajustes da staff ----------------

export async function adminAdjustTreasury(
  villageId: VillageId,
  delta: number,
  motivo: string,
  actorDiscordId: string,
) {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false as const, error: "Informe um ajuste inteiro diferente de zero." };
  }
  return runEconomy(async () => {
    const saldo = await prisma.$transaction(async (tx) => {
      const move = {
        villageId,
        amount: Math.abs(delta),
        type: "ADMIN_ADJUSTMENT" as const,
        reason: motivo,
        actorDiscordId,
      };
      return delta > 0 ? creditTreasury(tx, move) : debitTreasury(tx, move);
    });
    return { saldo };
  });
}

export async function adminAdjustStock(
  villageId: VillageId,
  itemId: string,
  delta: number,
  motivo: string,
  actorDiscordId: string,
) {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false as const, error: "Informe um ajuste inteiro diferente de zero." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };

  return runEconomy(async () => {
    const qty = await prisma.$transaction(async (tx) => {
      const move = {
        villageId,
        itemId,
        qty: Math.abs(delta),
        type: "ADMIN_ADJUSTMENT" as const,
        reason: motivo,
        actorDiscordId,
      };
      return delta > 0 ? addVillageStock(tx, move) : removeVillageStock(tx, move);
    });
    return { qty, name: item.name };
  });
}

// Bloqueio de saque: nao apaga historico, so' impede novos saques.
export async function setWithdrawalsLocked(
  villageId: VillageId,
  locked: boolean,
  motivo: string,
  actorDiscordId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.village.update({ where: { id: villageId }, data: { withdrawalsLocked: locked } });
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId,
      actorDiscordId,
      reason: motivo,
      meta: { field: "withdrawalsLocked", to: locked },
    });
  });
}

export async function setKage(
  villageId: VillageId,
  kageDiscordId: string | null,
  managedByStaff: boolean,
  motivo: string,
  actorDiscordId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.village.update({
      where: { id: villageId },
      data: { kageDiscordId, managedByStaff },
    });
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId,
      actorDiscordId,
      reason: motivo,
      meta: { field: "kage", kageDiscordId, managedByStaff },
    });
  });
}

export async function setTaxRate(
  villageId: VillageId,
  taxRate: number,
  motivo: string,
  actorDiscordId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(taxRate) || taxRate < ECONOMY.minTaxRate || taxRate > ECONOMY.maxTaxRate) {
    return {
      ok: false,
      error: `A taxa precisa ficar entre ${ECONOMY.minTaxRate * 100}% e ${ECONOMY.maxTaxRate * 100}%.`,
    };
  }
  await prisma.$transaction(async (tx) => {
    await tx.village.update({ where: { id: villageId }, data: { taxRate } });
    // A competencia aberta ja congelou a taxa: a mudanca so' vale na proxima.
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId,
      actorDiscordId,
      reason: motivo,
      meta: { field: "taxRate", to: taxRate },
    });
  });
  return { ok: true };
}
