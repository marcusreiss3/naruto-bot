// Reforma semanal (secao 6.4).
//
// Segunda-feira 00:15 o bot abre uma cobranca por predio que paga manutencao:
// setor nivel 1+, Ichiraku ativo e Centro nivel 2+. Empório, Marcenaria,
// Fundição e Oficina sao infraestrutura inicial e ficam isentos nesta versao.
//
// Depois de 72 h sem pagamento a cobranca vence e o predio vai para
// NECESSITA_REFORMA. O que isso faz e o que NAO faz:
//
//   faz  — setor para de produzir e de bonificar coleta; Ichiraku para de
//          comprar, vender e produzir; Centro perde o desconto e volta a
//          permitir uma obra por vez.
//   NAO  — nao rebaixa nivel, nao cobra juro, nao acumula semanas, nao cancela
//          obra ja iniciada e nao afeta os outros predios da vila.
//
// "Uma pendencia representa a reforma em atraso": enquanto houver cobranca em
// aberto, a semana seguinte NAO abre outra.

import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem } from "../../data/items.js";
import { ICHIRAKU_CONSTRUCTION } from "../../data/shops.js";
import { CENTER, SECTORS } from "../../data/sectors.js";
import { VILLAGE_IDS, VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import { log } from "../../utils/logger.js";
import { EconomyError, runEconomy } from "./errors.js";
import { recordLedger, type Tx } from "./ledger.js";
import { activePopulation } from "./population.js";
import { accumulatedCost, effectiveCenterDiscount, maintenanceDue } from "./sector-math.js";
import { debitTreasury, removeVillageStock } from "./village-economy.js";
import { maintenanceCycleKey } from "./week.js";

export type MaintenanceBuildingType = "SECTOR" | "CENTER" | "SHOP";

interface Cobravel {
  buildingType: MaintenanceBuildingType;
  buildingKey: string;
  name: string;
  level: number;
}

// Quem paga reforma nesta vila AGORA. A lista e' derivada do estado real dos
// predios, nunca de uma tabela paralela.
async function cobraveis(villageId: VillageId): Promise<Cobravel[]> {
  const [setores, centro, ichiraku] = await Promise.all([
    prisma.villageUpgrade.findMany({ where: { villageId, level: { gte: 1 } } }),
    prisma.villageCenter.findUnique({ where: { villageId } }),
    prisma.villageShop.findUnique({
      where: { villageId_shopType: { villageId, shopType: ICHIRAKU_CONSTRUCTION.shop } },
    }),
  ]);

  const lista: Cobravel[] = setores.map((row) => ({
    buildingType: "SECTOR",
    buildingKey: row.sectorKey,
    name: SECTORS.find((s) => s.key === row.sectorKey)?.name ?? row.sectorKey,
    level: row.level,
  }));

  if (centro && centro.level >= 2) {
    lista.push({
      buildingType: "CENTER",
      buildingKey: CENTER.buildingKey,
      name: CENTER.name,
      level: centro.level,
    });
  }
  // So' o Ichiraku ATIVO paga: em obra ou aguardando canal ele ainda nao opera.
  if (ichiraku && (ichiraku.status === "ACTIVE" || ichiraku.status === "SUSPENDED")) {
    lista.push({
      buildingType: "SHOP",
      buildingKey: ICHIRAKU_CONSTRUCTION.buildingKey,
      name: "Ichiraku — Casa de Lámen",
      level: 1,
    });
  }
  return lista;
}

// ---------------- Abertura do ciclo ----------------

export interface ChargeCreated {
  villageId: VillageId;
  buildingKey: string;
  name: string;
  ryoDue: number;
  items: Record<string, number>;
  dueAt: Date;
}

// Abre as cobrancas do ciclo. Idempotente por dois caminhos independentes: a
// unicidade (vila, predio, ciclo) e a checagem de pendencia em aberto.
export async function openMaintenanceCycle(
  now = new Date(),
  villages: readonly VillageId[] = VILLAGE_IDS,
): Promise<ChargeCreated[]> {
  const cycleKey = maintenanceCycleKey(now);
  const dueAt = new Date(now.getTime() + ECONOMY.maintenanceGraceMs);
  const criadas: ChargeCreated[] = [];

  for (const villageId of villages) {
    const [pop, centro, lista] = await Promise.all([
      activePopulation(villageId, now),
      prisma.villageCenter.findUnique({ where: { villageId } }),
      cobraveis(villageId),
    ]);
    // O desconto e' consultado no momento de GERAR a cobranca e congelado nela;
    // evoluir o Centro depois nao reduz pendencia ja criada (secao 6.4).
    const desconto = effectiveCenterDiscount(centro?.level ?? 1, centro?.status ?? "OK");

    for (const predio of lista) {
      const pendente = await prisma.villageMaintenanceCharge.findFirst({
        where: {
          villageId,
          buildingKey: predio.buildingKey,
          status: { in: ["PENDING", "OVERDUE"] },
        },
        select: { id: true },
      });
      if (pendente) continue; // uma pendencia por predio, sem acumular semanas

      const acumulado = accumulatedCost(predio.buildingType, predio.buildingKey, predio.level);
      const devido = maintenanceDue(acumulado, pop.factor, desconto);
      if (devido.ryo <= 0 && !Object.keys(devido.items).length) continue;

      try {
        await prisma.villageMaintenanceCharge.create({
          data: {
            villageId,
            buildingType: predio.buildingType,
            buildingKey: predio.buildingKey,
            cycleKey,
            levelAtCharge: predio.level,
            factorFrozen: pop.factor,
            centerDiscount: desconto,
            ryoDue: devido.ryo,
            itemsJson: JSON.stringify(devido.items),
            dueAt,
          },
        });
      } catch {
        continue; // ja existia cobranca deste ciclo para este predio
      }
      criadas.push({
        villageId,
        buildingKey: predio.buildingKey,
        name: predio.name,
        ryoDue: devido.ryo,
        items: devido.items,
        dueAt,
      });
    }
  }
  return criadas;
}

// ---------------- Vencimento ----------------

export interface OverdueApplied {
  villageId: VillageId;
  buildingType: string;
  buildingKey: string;
}

// Passa para NECESSITA_REFORMA o que estourou as 72 h. Suspende SOMENTE o
// predio afetado — os outros continuam produzindo, vendendo e descontando.
export async function applyOverdueMaintenance(now = new Date()): Promise<OverdueApplied[]> {
  const vencidas = await prisma.villageMaintenanceCharge.findMany({
    where: { status: "PENDING", dueAt: { lte: now } },
  });

  const aplicadas: OverdueApplied[] = [];
  for (const cobranca of vencidas) {
    const feita = await prisma.$transaction(async (tx) => {
      const { count } = await tx.villageMaintenanceCharge.updateMany({
        where: { id: cobranca.id, status: "PENDING" },
        data: { status: "OVERDUE" },
      });
      if (count === 0) return false;
      await suspender(tx, cobranca.villageId, cobranca.buildingType, cobranca.buildingKey);
      await recordLedger(tx, {
        type: "MAINTENANCE_COST",
        villageId: cobranca.villageId,
        ryoDelta: 0,
        reason: `Reforma atrasada: ${cobranca.buildingKey}`,
        meta: {
          chargeId: cobranca.id,
          buildingType: cobranca.buildingType,
          buildingKey: cobranca.buildingKey,
          event: "OVERDUE",
        },
      });
      return true;
    });
    if (feita) {
      aplicadas.push({
        villageId: cobranca.villageId as VillageId,
        buildingType: cobranca.buildingType,
        buildingKey: cobranca.buildingKey,
      });
    }
  }
  return aplicadas;
}

// O nivel nunca e' tocado aqui: so' o `status`.
async function suspender(
  tx: Tx,
  villageId: string,
  buildingType: string,
  buildingKey: string,
): Promise<void> {
  if (buildingType === "CENTER") {
    await tx.villageCenter.updateMany({
      where: { villageId },
      data: { status: "NECESSITA_REFORMA" },
    });
    return;
  }
  if (buildingType === "SECTOR") {
    await tx.villageUpgrade.updateMany({
      where: { villageId, sectorKey: buildingKey },
      data: { status: "NECESSITA_REFORMA" },
    });
    return;
  }
  await tx.villageShop.updateMany({
    where: { villageId, shopType: ICHIRAKU_CONSTRUCTION.shop, status: "ACTIVE" },
    data: { status: "SUSPENDED" },
  });
}

async function reativar(
  tx: Tx,
  villageId: string,
  buildingType: string,
  buildingKey: string,
): Promise<void> {
  if (buildingType === "CENTER") {
    await tx.villageCenter.updateMany({ where: { villageId }, data: { status: "OK" } });
    return;
  }
  if (buildingType === "SECTOR") {
    await tx.villageUpgrade.updateMany({
      where: { villageId, sectorKey: buildingKey },
      data: { status: "OK" },
    });
    return;
  }
  // O Ichiraku so' volta para ACTIVE se ja tiver canal: senao continua na fila
  // de AWAITING_CHANNEL da etapa 05.
  await tx.villageShop.updateMany({
    where: {
      villageId,
      shopType: ICHIRAKU_CONSTRUCTION.shop,
      status: "SUSPENDED",
      discordChannelId: { not: null },
    },
    data: { status: "ACTIVE" },
  });
}

// ---------------- Pagamento ----------------

export interface MaintenancePaid {
  buildingKey: string;
  name: string;
  ryoPago: number;
  itens: { itemId: string; name: string; qty: number }[];
  reativado: boolean;
}

// Paga uma pendencia e reativa o predio na hora. Tudo numa transacao: nao ha
// estado em que o cofre pagou e o predio continuou suspenso.
export async function payMaintenance(
  chargeId: string,
  actorDiscordId: string,
  now = new Date(),
) {
  return runEconomy(async (): Promise<MaintenancePaid> =>
    prisma.$transaction(async (tx) => {
      const cobranca = await tx.villageMaintenanceCharge.findUnique({ where: { id: chargeId } });
      if (!cobranca) throw new EconomyError("Cobrança não encontrada.");
      if (cobranca.status === "PAID") throw new EconomyError("Esta reforma já foi paga.");

      // Trava de duplo clique: só uma transação sai de PENDING/OVERDUE.
      const { count } = await tx.villageMaintenanceCharge.updateMany({
        where: { id: chargeId, status: { in: ["PENDING", "OVERDUE"] } },
        data: { status: "PAID", paidAt: now, paidByDiscordId: actorDiscordId },
      });
      if (count === 0) throw new EconomyError("Esta reforma já foi paga.");

      const itens = JSON.parse(cobranca.itemsJson) as Record<string, number>;
      const nome = cobranca.buildingKey;

      if (cobranca.ryoDue > 0) {
        await debitTreasury(tx, {
          villageId: cobranca.villageId as VillageId,
          amount: cobranca.ryoDue,
          type: "MAINTENANCE_COST",
          reason: `Reforma de ${nome} (${cobranca.cycleKey})`,
          actorDiscordId,
          meta: { chargeId, buildingKey: cobranca.buildingKey, cycleKey: cobranca.cycleKey },
        });
      }
      for (const [itemId, qty] of Object.entries(itens)) {
        await removeVillageStock(tx, {
          villageId: cobranca.villageId as VillageId,
          itemId,
          qty,
          type: "MAINTENANCE_COST",
          reason: `Reforma de ${nome}: ${getItem(itemId)?.name ?? itemId}`,
          actorDiscordId,
          meta: { chargeId, buildingKey: cobranca.buildingKey },
        });
      }

      const estavaVencida = cobranca.status === "OVERDUE";
      await reativar(tx, cobranca.villageId, cobranca.buildingType, cobranca.buildingKey);

      return {
        buildingKey: cobranca.buildingKey,
        name: nome,
        ryoPago: cobranca.ryoDue,
        itens: Object.entries(itens).map(([itemId, qty]) => ({
          itemId,
          name: getItem(itemId)?.name ?? itemId,
          qty,
        })),
        reativado: estavaVencida,
      };
    }),
  );
}

// Perdao administrativo: marca como paga sem cobrar, reativa e audita.
export async function resolveMaintenance(
  villageId: VillageId,
  buildingKey: string,
  motivo: string,
  actorDiscordId: string,
  now = new Date(),
) {
  return runEconomy(async () => {
    const resolvidas = await prisma.$transaction(async (tx) => {
      const abertas = await tx.villageMaintenanceCharge.findMany({
        where: { villageId, buildingKey, status: { in: ["PENDING", "OVERDUE"] } },
      });
      if (!abertas.length) throw new EconomyError("Não há reforma pendente nesse prédio.");

      await tx.villageMaintenanceCharge.updateMany({
        where: { villageId, buildingKey, status: { in: ["PENDING", "OVERDUE"] } },
        data: { status: "PAID", paidAt: now, paidByDiscordId: actorDiscordId },
      });
      for (const cobranca of abertas) {
        await reativar(tx, villageId, cobranca.buildingType, cobranca.buildingKey);
      }
      await recordLedger(tx, {
        type: "ADMIN_ADJUSTMENT",
        villageId,
        actorDiscordId,
        reason: motivo,
        meta: { buildingKey, event: "MAINTENANCE_RESOLVED", cobrancas: abertas.length },
      });
      return abertas.length;
    });
    return { resolvidas };
  });
}

// ---------------- Leitura ----------------

export interface MaintenanceView {
  id: string;
  buildingType: string;
  buildingKey: string;
  name: string;
  ryoDue: number;
  itens: { itemId: string; name: string; qty: number }[];
  status: string;
  dueAt: Date;
  cycleKey: string;
}

export async function pendingMaintenance(villageId: VillageId): Promise<MaintenanceView[]> {
  const linhas = await prisma.villageMaintenanceCharge.findMany({
    where: { villageId, status: { in: ["PENDING", "OVERDUE"] } },
    orderBy: { dueAt: "asc" },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    buildingType: linha.buildingType,
    buildingKey: linha.buildingKey,
    name:
      linha.buildingType === "CENTER"
        ? CENTER.name
        : linha.buildingType === "SHOP"
          ? "Ichiraku — Casa de Lámen"
          : (SECTORS.find((s) => s.key === linha.buildingKey)?.name ?? linha.buildingKey),
    ryoDue: linha.ryoDue,
    itens: Object.entries(JSON.parse(linha.itemsJson) as Record<string, number>).map(
      ([itemId, qty]) => ({ itemId, name: getItem(itemId)?.name ?? itemId, qty }),
    ),
    status: linha.status,
    dueAt: linha.dueAt,
    cycleKey: linha.cycleKey,
  }));
}

// Abre o ciclo e aplica os vencimentos numa passada so'. Usada pelo job e pela
// recuperacao de boot.
export async function runMaintenancePass(now = new Date()): Promise<{
  criadas: ChargeCreated[];
  vencidas: OverdueApplied[];
}> {
  const criadas = await openMaintenanceCycle(now).catch((err) => {
    log.error("Falha ao abrir o ciclo de reforma:", err);
    return [] as ChargeCreated[];
  });
  const vencidas = await applyOverdueMaintenance(now).catch((err) => {
    log.error("Falha ao aplicar reformas vencidas:", err);
    return [] as OverdueApplied[];
  });
  for (const cobranca of criadas) {
    log.info(
      `Reforma aberta em ${VILLAGE_NAMES[cobranca.villageId]}: ${cobranca.name} — ${cobranca.ryoDue} Ryō.`,
    );
  }
  return { criadas, vencidas };
}
