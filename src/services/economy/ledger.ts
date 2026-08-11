import type { Prisma } from "@prisma/client";
import type { LedgerType } from "../../config/enums.js";

// Cliente Prisma dentro de uma transacao. Todo helper de economia recebe isso
// em vez do `prisma` global: quem abre a transacao e' o caso de uso, e a
// interacao do Discord NUNCA fica aberta dentro dela (SQLite = escrita serial).
export type Tx = Prisma.TransactionClient;

export interface LedgerEntry {
  type: LedgerType;
  // Nulo quando o movimento nao toca cofre/estoque de vila (recompensa de
  // missao, compra de NPC). Continua no mesmo livro para que toda alteracao
  // de Ryo tenha auditoria.
  villageId?: string | null;
  ryoDelta?: number;
  itemId?: string | null;
  itemQty?: number | null;
  // Quem executou (staff/Kage). Nulo = automatico (job, recompensa).
  actorDiscordId?: string | null;
  // Personagem afetado pelo movimento.
  charId?: string | null;
  reason?: string;
  meta?: Record<string, unknown>;
}

// Unico ponto de escrita do livro-caixa. Append-only: nao existe update nem
// delete de lancamento em lugar nenhum do codigo — corrigir um erro e' criar
// um lancamento novo de sinal contrario (ADMIN_ADJUSTMENT com motivo).
export async function recordLedger(tx: Tx, entry: LedgerEntry): Promise<void> {
  await tx.villageLedger.create({
    data: {
      villageId: entry.villageId ?? null,
      type: entry.type,
      ryoDelta: entry.ryoDelta ?? 0,
      itemId: entry.itemId ?? null,
      itemQty: entry.itemQty ?? null,
      actorDiscordId: entry.actorDiscordId ?? null,
      charId: entry.charId ?? null,
      reason: entry.reason ?? "",
      metaJson: JSON.stringify(entry.meta ?? {}),
    },
  });
}
