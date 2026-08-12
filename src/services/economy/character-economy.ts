import { prisma } from "../../db/client.js";
import { NINJA_RANKS, type NinjaRank } from "../../config/enums.js";
import { EconomyError } from "./errors.js";
import { characterPassiveMods } from "../combat/passives.js";
import { recordLedger, type LedgerEntry, type Tx } from "./ledger.js";

// ---------------- Rank ----------------

export function isNinjaRank(value: unknown): value is NinjaRank {
  return (NINJA_RANKS as readonly unknown[]).includes(value);
}

// Falha segura em ACADEMIA: rank desconhecido nunca vira tributavel por acidente.
export function normalizeNinjaRank(value: unknown): NinjaRank {
  return isNinjaRank(value) ? value : "ACADEMIA";
}

export function rankIndex(rank: NinjaRank): number {
  return NINJA_RANKS.indexOf(rank);
}

export function rankAtLeast(rank: NinjaRank, min: NinjaRank): boolean {
  return rankIndex(rank) >= rankIndex(min);
}

// Quem entra na apuracao do imposto pessoal semanal. Academia nao e' tributado
// (secao 2 de docs/economia-vilas.md).
export function isTaxableRank(rank: NinjaRank): boolean {
  return rankAtLeast(rank, "GENIN");
}

// Nao existe um `setNinjaRank(charId, rank)` solto de proposito: mudar rank e'
// acao administrativa e precisa gravar o motivo no livro-caixa na MESMA
// transacao. Ver handleRankSet em src/commands/admin-vila.ts.

// ---------------- Estado economico ----------------

// Backfill para personagens criados antes desta etapa. Idempotente.
export async function ensureEconomyState(charId: string) {
  return prisma.characterEconomyState.upsert({
    where: { charId },
    create: { charId },
    update: {},
  });
}

// ---------------- Ryo do personagem ----------------

interface RyoMove {
  charId: string;
  amount: number; // sempre positivo
  type: LedgerEntry["type"];
  reason: string;
  villageId?: string | null;
  actorDiscordId?: string | null;
  meta?: Record<string, unknown>;
  // Mensagem de saldo insuficiente especifica do contexto (so' no gasto).
  errorMessage?: string;
}

function assertPositiveRyo(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError("Valor de Ryō inválido.");
  }
}

export async function grantCharacterRyo(tx: Tx, move: RyoMove): Promise<number> {
  assertPositiveRyo(move.amount);
  // Faro para Negocios / Cacador de Recompensas (traits): este e' o unico
  // caminho de ENTRADA de ryo do jogador, entao o bonus mora aqui e vale pra
  // qualquer fonte. Gasto (spendCharacterRyo) nao e' afetado de proposito.
  const trait = await tx.characterTrait.findUnique({ where: { charId: move.charId } });
  const bonus = characterPassiveMods(trait ? [trait.traitId] : []).ryoBonus;
  const amount = bonus > 0 ? Math.round(move.amount * (1 + bonus)) : move.amount;
  const char = await tx.userCharacter.update({
    where: { id: move.charId },
    data: { ryo: { increment: amount } },
    select: { ryo: true },
  });
  await recordLedger(tx, {
    type: move.type,
    villageId: move.villageId ?? null,
    ryoDelta: amount,
    charId: move.charId,
    actorDiscordId: move.actorDiscordId,
    reason: move.reason,
    meta: move.meta,
  });
  return char.ryo;
}

// Gasto normal do jogador: exige saldo suficiente e a condicao vai no WHERE do
// UPDATE, entao dois gastos concorrentes nao passam os dois. Quem esta em
// divida (saldo negativo pela cobranca da etapa 2) simplesmente nao consegue
// gastar ate voltar ao positivo — a mesma condicao cobre esse caso.
//
// A UNICA via que pode deixar `ryo` negativo e' a cobranca tributaria semanal
// da etapa 2, que nao usa este helper.
export async function spendCharacterRyo(tx: Tx, move: RyoMove): Promise<number> {
  assertPositiveRyo(move.amount);
  const { count } = await tx.userCharacter.updateMany({
    where: { id: move.charId, ryo: { gte: move.amount } },
    data: { ryo: { decrement: move.amount } },
  });
  if (count === 0) {
    throw new EconomyError(move.errorMessage ?? `Você precisa de ${move.amount} Ryō para isso.`);
  }
  const char = await tx.userCharacter.findUniqueOrThrow({
    where: { id: move.charId },
    select: { ryo: true },
  });
  await recordLedger(tx, {
    type: move.type,
    villageId: move.villageId ?? null,
    ryoDelta: -move.amount,
    charId: move.charId,
    actorDiscordId: move.actorDiscordId,
    reason: move.reason,
    meta: move.meta,
  });
  return char.ryo;
}

// ---------------- Ajuste administrativo ----------------

// Correcao de staff no Ryo pessoal. Fica separado de grant/spend de proposito:
// e' a UNICA porta, alem da cobranca semanal, que pode deixar o saldo negativo.
//
// Isso NAO afrouxa a regra da secao 3.2. A regra existe para nenhum caminho de
// JOGO criar divida — comprar, doar, craftar e sacar continuam exigindo saldo.
// Aqui e' staff, com motivo obrigatorio e lancamento no livro-caixa; sem esta
// porta nao havia como estornar Ryo dado por engano nem preparar um teste de
// divida.
export async function adminSetCharacterRyo(
  charId: string,
  alvo: number,
  reason: string,
  actorDiscordId: string,
): Promise<{ antes: number; depois: number }> {
  if (!Number.isInteger(alvo)) throw new EconomyError("Informe um valor inteiro.");
  return prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUniqueOrThrow({
      where: { id: charId },
      select: { ryo: true, villageId: true },
    });
    await tx.userCharacter.update({ where: { id: charId }, data: { ryo: alvo } });
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId: char.villageId,
      ryoDelta: alvo - char.ryo,
      charId,
      actorDiscordId,
      reason,
      meta: { field: "characterRyo", mode: "SET", from: char.ryo, to: alvo },
    });
    return { antes: char.ryo, depois: alvo };
  });
}

export async function adminAddCharacterRyo(
  charId: string,
  delta: number,
  reason: string,
  actorDiscordId: string,
): Promise<{ antes: number; depois: number }> {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new EconomyError("Informe um ajuste inteiro diferente de zero.");
  }
  return prisma.$transaction(async (tx) => {
    // O incremento vai no proprio UPDATE: dois ajustes concorrentes somam os
    // dois em vez de um sobrescrever o outro.
    const char = await tx.userCharacter.update({
      where: { id: charId },
      data: { ryo: { increment: delta } },
      select: { ryo: true, villageId: true },
    });
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId: char.villageId,
      ryoDelta: delta,
      charId,
      actorDiscordId,
      reason,
      meta: { field: "characterRyo", mode: "ADD", delta, to: char.ryo },
    });
    return { antes: char.ryo - delta, depois: char.ryo };
  });
}

// Saldo negativo e' divida, nao "disponivel". Ver secao 3.2 do spec.
export function formatRyo(ryo: number): string {
  return ryo < 0
    ? `Dívida: ${Math.abs(ryo).toLocaleString("pt-BR")} Ryō`
    : `${ryo.toLocaleString("pt-BR")} Ryō`;
}
