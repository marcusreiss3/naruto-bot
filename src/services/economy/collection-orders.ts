import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem, isRareResource } from "../../data/items.js";
import { VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import { grantCharacterRyo } from "./character-economy.js";
import { EconomyError, runEconomy } from "./errors.js";
import { recordLedger, type Tx } from "./ledger.js";
import { addVillageStock } from "./village-economy.js";

// Ordens de coleta (secao 4.2.1).
//
// O desenho todo gira em volta de uma ideia: o Kage NAO tira recurso de
// ninguem. Ele reserva Ryo do cofre e faz uma oferta; quem quiser aceita, e a
// partir dai a coleta do recurso-alvo vira entrega paga. O que protege a vila
// e' a reserva; o que protege o ninja e' o aceite voluntario.

export interface CreateOrderInput {
  villageId: VillageId;
  itemId: string;
  targetQty: number;
  rewardPerUnit: number;
  budgetMax: number;
  durationMs: number;
  audience: "OPEN" | "INVITE";
  createdByDiscordId: string;
}

// Quanto ainda pode ser pago. Fecha a ordem quando zera.
export function remainingBudget(budgetMax: number, budgetSpent: number): number {
  return Math.max(0, budgetMax - budgetSpent);
}

// Quantas unidades ainda cabem: limitadas pela meta E pelo orcamento.
export function acceptableQty(
  targetQty: number,
  deliveredQty: number,
  budgetMax: number,
  budgetSpent: number,
  rewardPerUnit: number,
  oferecido: number,
): number {
  const vagaMeta = Math.max(0, targetQty - deliveredQty);
  const vagaOrcamento =
    rewardPerUnit > 0
      ? Math.floor(remainingBudget(budgetMax, budgetSpent) / rewardPerUnit)
      : vagaMeta;
  return Math.max(0, Math.min(oferecido, vagaMeta, vagaOrcamento));
}

export async function createOrder(input: CreateOrderInput) {
  const item = getItem(input.itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };
  // Raro nunca e' alvo: ele so' chega a vila por doacao manual.
  if (isRareResource(input.itemId)) {
    return { ok: false as const, error: `${item.name} é um recurso raro e só pode ser doado à mão.` };
  }
  if (!Number.isInteger(input.targetQty) || input.targetQty <= 0) {
    return { ok: false as const, error: "A meta precisa ser um número inteiro positivo." };
  }
  if (!Number.isInteger(input.rewardPerUnit) || input.rewardPerUnit <= 0) {
    return { ok: false as const, error: "A recompensa por unidade precisa ser positiva." };
  }
  if (!Number.isInteger(input.budgetMax) || input.budgetMax <= 0) {
    return { ok: false as const, error: "O orçamento precisa ser positivo." };
  }
  if (
    input.durationMs < ECONOMY.orderMinDurationMs ||
    input.durationMs > ECONOMY.orderMaxDurationMs
  ) {
    return { ok: false as const, error: "O prazo precisa ficar entre 1 hora e 7 dias." };
  }

  return runEconomy(async () => {
    const order = await prisma.$transaction(async (tx) => {
      // Reserva o orcamento. O SQL nao compara duas colunas num WHERE, entao o
      // disponivel (cofre - reserva) e' calculado aqui e a escrita usa os dois
      // valores lidos como condicao. Se outra ordem entrar no meio, `count` vem
      // 0 e a transacao inteira cai — ninguem reserva o mesmo Ryo duas vezes.
      const village = await tx.village.findUniqueOrThrow({ where: { id: input.villageId } });
      const disponivel = village.treasuryRyo - village.reservedRyo;
      if (disponivel < input.budgetMax) {
        throw new EconomyError(
          `O cofre de ${VILLAGE_NAMES[input.villageId]} tem ${disponivel} Ryō livres; a ordem pede ${input.budgetMax}.`,
        );
      }
      const { count } = await tx.village.updateMany({
        where: {
          id: input.villageId,
          treasuryRyo: village.treasuryRyo,
          reservedRyo: village.reservedRyo,
        },
        data: { reservedRyo: { increment: input.budgetMax } },
      });
      if (count === 0) {
        throw new EconomyError("O cofre mudou durante a criação. Tente de novo.");
      }

      const criada = await tx.collectionOrder.create({
        data: {
          villageId: input.villageId,
          itemId: input.itemId,
          targetQty: input.targetQty,
          rewardPerUnit: input.rewardPerUnit,
          budgetMax: input.budgetMax,
          audience: input.audience,
          deadline: new Date(Date.now() + input.durationMs),
          createdByDiscordId: input.createdByDiscordId,
        },
      });
      await recordLedger(tx, {
        type: "COLLECTION_ORDER_RESERVE",
        villageId: input.villageId,
        ryoDelta: 0,
        itemId: input.itemId,
        itemQty: input.targetQty,
        actorDiscordId: input.createdByDiscordId,
        reason: `Reserva de ${input.budgetMax} Ryō para ordem de ${item.name}`,
        meta: { orderId: criada.id, budgetMax: input.budgetMax, rewardPerUnit: input.rewardPerUnit },
      });
      return criada;
    });
    return { order };
  });
}

// ---------------- Aceite / recusa ----------------

// Um ninja so' tem uma ordem por vez. O claim e' um UPDATE condicional em
// `activeOrderId = null`: dois cliques simultaneos nao passam os dois.
export async function acceptOrder(charId: string, orderId: string, now = new Date()) {
  return runEconomy(async () => {
    const order = await prisma.$transaction(async (tx) => {
      const alvo = await tx.collectionOrder.findUnique({ where: { id: orderId } });
      if (!alvo) throw new EconomyError("Ordem não encontrada.");
      assertOrderOpen(alvo, now);

      const char = await tx.userCharacter.findUniqueOrThrow({
        where: { id: charId },
        select: { villageId: true },
      });
      if (char.villageId !== alvo.villageId) {
        throw new EconomyError(`Esta ordem é de ${VILLAGE_NAMES[alvo.villageId as VillageId]}.`);
      }

      await tx.characterEconomyState.upsert({
        where: { charId },
        create: { charId },
        update: {},
      });
      const { count } = await tx.characterEconomyState.updateMany({
        where: { charId, activeOrderId: null },
        data: { activeOrderId: orderId },
      });
      if (count === 0) {
        throw new EconomyError("Você já tem uma ordem de coleta ativa. Conclua ou saia dela antes.");
      }

      await tx.collectionOrderMember.upsert({
        where: { orderId_charId: { orderId, charId } },
        create: { orderId, charId, status: "ACCEPTED" },
        update: { status: "ACCEPTED" },
      });
      await recordLedger(tx, {
        type: "COLLECTION_ORDER_RESERVE",
        villageId: alvo.villageId,
        charId,
        reason: "Aceite de ordem de coleta",
        meta: { orderId, event: "ACCEPTED" },
      });
      return alvo;
    });
    return { order };
  });
}

export async function declineOrder(charId: string, orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.collectionOrder.findUnique({ where: { id: orderId } });
    await tx.collectionOrderMember.upsert({
      where: { orderId_charId: { orderId, charId } },
      create: { orderId, charId, status: "DECLINED" },
      update: { status: "DECLINED" },
    });
    if (order) {
      await recordLedger(tx, {
        type: "COLLECTION_ORDER_RESERVE",
        villageId: order.villageId,
        charId,
        reason: "Recusa de convite de ordem",
        meta: { orderId, event: "DECLINED" },
      });
    }
  });
}

export async function inviteToOrder(orderId: string, charId: string): Promise<void> {
  await prisma.collectionOrderMember.upsert({
    where: { orderId_charId: { orderId, charId } },
    create: { orderId, charId, status: "INVITED" },
    update: {},
  });
}

// Ordem que o ninja aceitou e ainda esta valendo.
export async function activeOrderFor(charId: string, now = new Date()) {
  const estado = await prisma.characterEconomyState.findUnique({
    where: { charId },
    select: { activeOrderId: true },
  });
  if (!estado?.activeOrderId) return null;
  const order = await prisma.collectionOrder.findUnique({ where: { id: estado.activeOrderId } });
  if (!order) return null;
  if (order.status !== "ACTIVE" || order.deadline.getTime() <= now.getTime()) return null;
  return order;
}

interface OrderState {
  status: string;
  deadline: Date;
  targetQty: number;
  deliveredQty: number;
  budgetMax: number;
  budgetSpent: number;
  rewardPerUnit: number;
}

function assertOrderOpen(order: OrderState, now: Date): void {
  if (order.status !== "ACTIVE") throw new EconomyError("Esta ordem já foi encerrada.");
  if (order.deadline.getTime() <= now.getTime()) throw new EconomyError("O prazo desta ordem venceu.");
  if (order.deliveredQty >= order.targetQty) throw new EconomyError("Esta ordem já atingiu a meta.");
  if (remainingBudget(order.budgetMax, order.budgetSpent) < order.rewardPerUnit) {
    throw new EconomyError("O orçamento desta ordem acabou.");
  }
}

// ---------------- Entrega ----------------

export interface DeliveryOutcome {
  entregue: number;
  pago: number;
  sobrouParaInventario: number;
}

// Chamado pela coleta quando o recurso sorteado e' o alvo de uma ordem ativa.
// Roda DENTRO da transacao da coleta: estoque, reserva, saldo do ninja e
// progresso mudam juntos ou nao mudam.
//
// Revalida tudo aqui dentro (ordem ativa, prazo, vaga de meta, reserva), porque
// entre o sorteio e este ponto outra entrega pode ter fechado a ordem.
export async function deliverToOrder(
  tx: Tx,
  charId: string,
  orderId: string,
  itemId: string,
  qty: number,
  now = new Date(),
): Promise<DeliveryOutcome> {
  const order = await tx.collectionOrder.findUnique({ where: { id: orderId } });
  const nada = { entregue: 0, pago: 0, sobrouParaInventario: qty };

  if (!order) return nada;
  if (order.status !== "ACTIVE") return nada;
  if (order.deadline.getTime() <= now.getTime()) return nada;
  if (order.itemId !== itemId) return nada;
  // Raro nunca e' capturado automaticamente, mesmo que fosse o alvo.
  if (isRareResource(itemId)) return nada;

  const aceito = acceptableQty(
    order.targetQty,
    order.deliveredQty,
    order.budgetMax,
    order.budgetSpent,
    order.rewardPerUnit,
    qty,
  );
  if (aceito <= 0) return nada;

  const pagamento = aceito * order.rewardPerUnit;

  // Trava de corrida: so' avanca se meta e orcamento ainda comportarem. Duas
  // confirmacoes simultaneas nao ultrapassam nenhum dos dois.
  const { count } = await tx.collectionOrder.updateMany({
    where: {
      id: orderId,
      status: "ACTIVE",
      deliveredQty: { lte: order.targetQty - aceito },
      budgetSpent: { lte: order.budgetMax - pagamento },
    },
    data: { deliveredQty: { increment: aceito }, budgetSpent: { increment: pagamento } },
  });
  if (count === 0) return nada;

  await addVillageStock(tx, {
    villageId: order.villageId as VillageId,
    itemId,
    qty: aceito,
    type: "STOCK_DEPOSIT",
    reason: "Entrega de ordem de coleta",
    charId,
  });

  // O pagamento sai da reserva, nao do cofre livre: o Ryo ja estava preso.
  await tx.village.update({
    where: { id: order.villageId },
    data: { treasuryRyo: { decrement: pagamento }, reservedRyo: { decrement: pagamento } },
  });
  await grantCharacterRyo(tx, {
    charId,
    amount: pagamento,
    type: "COLLECTION_ORDER_PAYOUT",
    villageId: order.villageId,
    reason: `Entrega de ${aceito}x ${getItem(itemId)?.name ?? itemId}`,
    meta: { orderId, qty: aceito },
  });
  await tx.collectionOrderMember.update({
    where: { orderId_charId: { orderId, charId } },
    data: { deliveredQty: { increment: aceito }, paidRyo: { increment: pagamento } },
  });

  return { entregue: aceito, pago: pagamento, sobrouParaInventario: qty - aceito };
}

// ---------------- Fechamento ----------------

export type CloseReason = "COMPLETED" | "CANCELLED" | "EXPIRED";

// Fecha uma vez so' e devolve ao cofre apenas a reserva NAO usada. Material ja
// entregue continua no estoque e pagamento concluido nao e' revertido.
export async function closeOrder(orderId: string, reason: CloseReason, actorDiscordId?: string) {
  return runEconomy(async () => {
    const devolvido = await prisma.$transaction(async (tx) => {
      // A condicao `status: ACTIVE` no WHERE e' o que garante fechamento unico.
      const { count } = await tx.collectionOrder.updateMany({
        where: { id: orderId, status: "ACTIVE" },
        data: { status: reason, closedAt: new Date(), closedReason: reason },
      });
      if (count === 0) return 0;

      const order = await tx.collectionOrder.findUniqueOrThrow({ where: { id: orderId } });
      const sobra = remainingBudget(order.budgetMax, order.budgetSpent);
      if (sobra > 0) {
        await tx.village.update({
          where: { id: order.villageId },
          data: { reservedRyo: { decrement: sobra } },
        });
        await recordLedger(tx, {
          type: "COLLECTION_ORDER_REFUND",
          villageId: order.villageId,
          ryoDelta: 0,
          actorDiscordId,
          reason: `Devolução de reserva não usada (${reason})`,
          meta: { orderId, sobra },
        });
      }

      // Libera todo mundo que estava preso a ela.
      await tx.characterEconomyState.updateMany({
        where: { activeOrderId: orderId },
        data: { activeOrderId: null },
      });
      return sobra;
    });
    return { devolvido };
  });
}

// Fecha o que venceu ou ja bateu a meta. Chamada no boot e depois de cada
// entrega; idempotente pelo mesmo WHERE condicional de closeOrder.
export async function closeFinishedOrders(now = new Date()): Promise<number> {
  const candidatas = await prisma.collectionOrder.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      deadline: true,
      targetQty: true,
      deliveredQty: true,
      budgetMax: true,
      budgetSpent: true,
      rewardPerUnit: true,
    },
  });

  let fechadas = 0;
  for (const order of candidatas) {
    const venceu = order.deadline.getTime() <= now.getTime();
    const bateuMeta = order.deliveredQty >= order.targetQty;
    const semOrcamento =
      remainingBudget(order.budgetMax, order.budgetSpent) < order.rewardPerUnit;
    if (!venceu && !bateuMeta && !semOrcamento) continue;

    const resultado = await closeOrder(order.id, venceu && !bateuMeta ? "EXPIRED" : "COMPLETED");
    if (resultado.ok) fechadas += 1;
  }
  return fechadas;
}
