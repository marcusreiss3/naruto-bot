// Obras da vila (secoes 6.1, 6.3 e 7.7).
//
// UM modelo (`VillageConstruction`) para as tres coisas que ocupam a fila:
// setor, Centro da Vila e Ichiraku. Nao existe tabela paralela de obra de loja.
//
// Tres travas, todas com a condicao na clausula WHERE do proprio UPDATE:
//
//   1. VAGA GLOBAL — `Village.constructionSlotsUsed < capacidade`. A capacidade
//      vem do nivel do Centro (1/2/3) e cai para 1 se o Centro estiver em
//      reforma. Dois cliques simultaneos nao iniciam duas obras.
//   2. PREDIO OCUPADO — `constructingTo IS NULL` no setor/Centro e
//      `status = LOCKED` no Ichiraku. Impede empilhar dois niveis do mesmo
//      predio, mesmo havendo vaga sobrando.
//   3. CONCLUSAO UNICA — `status = IN_PROGRESS` no UPDATE de fechamento. O bot
//      desligado por dias conclui tudo no boot seguinte, uma vez cada.
//
// O custo e o fator de populacao sao CONGELADOS na linha da obra. Concluir
// nunca recalcula nada: a vila crescer ou encolher no meio da obra nao muda o
// que ja foi cobrado.

import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem } from "../../data/items.js";
import { ICHIRAKU_CONSTRUCTION } from "../../data/shops.js";
import {
  CENTER,
  MAX_CENTER_LEVEL,
  MAX_SECTOR_LEVEL,
  SECTORS,
  getSector,
  isSectorKey,
  type SectorKey,
} from "../../data/sectors.js";
import { VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import { EconomyError, runEconomy } from "./errors.js";
import { recordLedger, type Tx } from "./ledger.js";
import { activePopulation } from "./population.js";
import { effectiveCapacity, nextLevelCost, scaleCost, type Cost } from "./sector-math.js";
import { debitTreasury, removeVillageStock } from "./village-economy.js";

export type BuildingType = "SECTOR" | "CENTER" | "SHOP";

export interface FrozenCost {
  ryo: number;
  itens: { itemId: string; name: string; qty: number }[];
}

function toFrozen(custo: Cost): FrozenCost {
  return {
    ryo: custo.ryo,
    itens: Object.entries(custo.items).map(([itemId, qty]) => ({
      itemId,
      name: getItem(itemId)?.name ?? itemId,
      qty,
    })),
  };
}

// Custo da obra do Ichiraku com o fator aplicado. Mantido exportado porque a
// etapa 05 e os testes dela usam este nome.
export function scaleConstructionCost(factor: number): FrozenCost {
  return toFrozen(
    scaleCost(
      { ryo: ICHIRAKU_CONSTRUCTION.baseCostRyo, items: ICHIRAKU_CONSTRUCTION.baseCostItems },
      factor,
    ),
  );
}

// ---------------- Estado dos predios ----------------

// Cria os quatro setores no nivel 0 e o Centro no nivel 1. Idempotente e
// nao-destrutivo: nunca rebaixa nivel nem apaga pendencia de reforma.
export async function ensureVillageBuildings(db: Tx = prisma): Promise<number> {
  const villages = await db.village.findMany({ select: { id: true } });
  let criados = 0;
  for (const village of villages) {
    for (const sector of SECTORS) {
      const existente = await db.villageUpgrade.findUnique({
        where: { villageId_sectorKey: { villageId: village.id, sectorKey: sector.key } },
        select: { id: true },
      });
      if (existente) continue;
      await db.villageUpgrade.create({ data: { villageId: village.id, sectorKey: sector.key } });
      criados += 1;
    }
    const centro = await db.villageCenter.findUnique({
      where: { villageId: village.id },
      select: { id: true },
    });
    if (!centro) {
      await db.villageCenter.create({ data: { villageId: village.id, level: 1 } });
      criados += 1;
    }
  }
  return criados;
}

export async function getCenter(villageId: VillageId) {
  return prisma.villageCenter.upsert({
    where: { villageId },
    create: { villageId, level: 1 },
    update: {},
  });
}

export async function getSectors(villageId: VillageId) {
  await ensureVillageBuildings();
  return prisma.villageUpgrade.findMany({ where: { villageId }, orderBy: { sectorKey: "asc" } });
}

export async function getSectorRow(villageId: VillageId, sectorKey: SectorKey) {
  return prisma.villageUpgrade.upsert({
    where: { villageId_sectorKey: { villageId, sectorKey } },
    create: { villageId, sectorKey },
    update: {},
  });
}

// ---------------- Vaga na fila ----------------

export interface CapacityView {
  usadas: number;
  total: number;
  centerLevel: number;
  centerStatus: string;
  // Verdadeiro quando o Centro em reforma esta segurando a capacidade.
  limitadaPorReforma: boolean;
}

export async function capacityView(villageId: VillageId): Promise<CapacityView> {
  const [village, centro] = await Promise.all([
    prisma.village.findUniqueOrThrow({ where: { id: villageId } }),
    getCenter(villageId),
  ]);
  const total = effectiveCapacity(centro.level, centro.status);
  return {
    usadas: village.constructionSlotsUsed,
    total,
    centerLevel: centro.level,
    centerStatus: centro.status,
    limitadaPorReforma: centro.status !== "OK" && centro.level > ECONOMY.constructionSlots,
  };
}

// Reserva uma vaga. `capacidade` chega como NUMERO LITERAL de fora porque o SQL
// nao compara duas colunas num WHERE; ela e' lida no comeco da mesma transacao,
// e o pior caso de uma corrida com a conclusao do Centro e' recusar uma obra
// que caberia — nunca deixar passar uma a mais.
async function claimConstructionSlot(
  tx: Tx,
  villageId: VillageId,
  capacidade: number,
): Promise<void> {
  const { count } = await tx.village.updateMany({
    where: { id: villageId, constructionSlotsUsed: { lt: capacidade } },
    data: { constructionSlotsUsed: { increment: 1 } },
  });
  if (count === 0) {
    throw new EconomyError(
      `${VILLAGE_NAMES[villageId]} já está com as ${capacidade} vaga(s) de obra ocupadas. Espere uma terminar.`,
    );
  }
}

async function releaseConstructionSlot(tx: Tx, villageId: string): Promise<void> {
  await tx.village.updateMany({
    where: { id: villageId, constructionSlotsUsed: { gt: 0 } },
    data: { constructionSlotsUsed: { decrement: 1 } },
  });
}

// ---------------- Prévia ----------------

export interface BuildPreview {
  buildingType: BuildingType;
  buildingKey: string;
  name: string;
  levelAtual: number;
  targetLevel: number | null;
  status: string;
  custo: FrozenCost | null;
  durationMs: number;
  conclusaoPrevista: Date | null;
  factor: number;
  ativos: number;
  capacidade: CapacityView;
  cofreDisponivel: number;
  estoque: { itemId: string; name: string; precisa: number; tem: number }[];
  emObra: boolean;
  reformaPendente: boolean;
  motivoBloqueio: string | null;
}

// Tudo que a tela de confirmacao precisa, sem escrever nada.
export async function buildPreview(
  villageId: VillageId,
  buildingType: "SECTOR" | "CENTER",
  buildingKey: string,
  now = new Date(),
): Promise<BuildPreview> {
  const [pop, capacidade, village] = await Promise.all([
    activePopulation(villageId, now),
    capacityView(villageId),
    prisma.village.findUniqueOrThrow({ where: { id: villageId } }),
  ]);

  const linha =
    buildingType === "CENTER"
      ? await getCenter(villageId)
      : await getSectorRow(villageId, buildingKey as SectorKey);
  const nome =
    buildingType === "CENTER" ? CENTER.name : (getSector(buildingKey)?.name ?? buildingKey);

  const proximo = nextLevelCost(buildingType, buildingKey, linha.level);
  const custo = proximo ? scaleCost({ ryo: proximo.ryo, items: proximo.items }, pop.factor) : null;

  const estoque = custo
    ? await Promise.all(
        Object.entries(custo.items).map(async ([itemId, precisa]) => ({
          itemId,
          name: getItem(itemId)?.name ?? itemId,
          precisa,
          tem:
            (
              await prisma.villageStock.findUnique({
                where: { villageId_itemId: { villageId, itemId } },
                select: { qty: true },
              })
            )?.qty ?? 0,
        })),
      )
    : [];

  const cofreDisponivel = Math.max(0, village.treasuryRyo - village.reservedRyo);
  const emObra = linha.constructingTo !== null;
  const reformaPendente = linha.status !== "OK";

  let motivoBloqueio: string | null = null;
  if (!proximo) motivoBloqueio = `${nome} já está no nível máximo.`;
  else if (emObra) motivoBloqueio = `${nome} já tem uma obra em andamento.`;
  // Secao 6.4: obra nao comeca com reforma pendente NO PREDIO que sera melhorado.
  else if (reformaPendente) motivoBloqueio = `${nome} está com a reforma atrasada. Pague antes de evoluir.`;
  else if (capacidade.usadas >= capacidade.total) {
    motivoBloqueio = capacidade.limitadaPorReforma
      ? "O Centro está em reforma: enquanto isso a vila só toca uma obra por vez."
      : `Todas as ${capacidade.total} vaga(s) de obra estão ocupadas.`;
  } else if (custo && cofreDisponivel < custo.ryo) {
    motivoBloqueio = `O cofre tem ${cofreDisponivel} Ryō livres; a obra pede ${custo.ryo}.`;
  } else if (estoque.some((row) => row.tem < row.precisa)) {
    motivoBloqueio = "Falta material no estoque central.";
  }

  return {
    buildingType,
    buildingKey,
    name: nome,
    levelAtual: linha.level,
    targetLevel: proximo?.targetLevel ?? null,
    status: linha.status,
    custo: custo ? toFrozen(custo) : null,
    durationMs: proximo?.durationMs ?? 0,
    conclusaoPrevista: proximo ? new Date(now.getTime() + proximo.durationMs) : null,
    factor: pop.factor,
    ativos: pop.ativos,
    capacidade,
    cofreDisponivel,
    estoque,
    emObra,
    reformaPendente,
    motivoBloqueio,
  };
}

// ---------------- Início de obra ----------------

// Debita cofre e estoque e cria a obra numa unica transacao. Qualquer recusa
// (vaga, predio ocupado, reforma, cofre, estoque) derruba tudo — nao existe
// estado em que a vila pagou e a obra nao comecou.
export async function startConstruction(
  villageId: VillageId,
  buildingType: "SECTOR" | "CENTER",
  buildingKey: string,
  actorDiscordId: string,
  now = new Date(),
) {
  if (buildingType === "SECTOR" && !isSectorKey(buildingKey)) {
    return { ok: false as const, error: "Setor desconhecido." };
  }

  // Consultas pesadas ficam FORA da transacao (SQLite escreve em serie); o
  // fator e a capacidade entram nela como numeros ja lidos.
  const pop = await activePopulation(villageId, now);
  const capacidade = await capacityView(villageId);

  return runEconomy(async () => {
    const resultado = await prisma.$transaction(async (tx) => {
      const linha =
        buildingType === "CENTER"
          ? await tx.villageCenter.findUniqueOrThrow({ where: { villageId } })
          : await tx.villageUpgrade.findUniqueOrThrow({
              where: { villageId_sectorKey: { villageId, sectorKey: buildingKey } },
            });
      const nome =
        buildingType === "CENTER" ? CENTER.name : (getSector(buildingKey)?.name ?? buildingKey);

      if (linha.status !== "OK") {
        throw new EconomyError(`${nome} está com a reforma atrasada. Pague a reforma antes de evoluir.`);
      }
      const proximo = nextLevelCost(buildingType, buildingKey, linha.level);
      if (!proximo) throw new EconomyError(`${nome} já está no nível máximo.`);

      // Trava do predio: só sai de `constructingTo = null` uma vez.
      const ocupado =
        buildingType === "CENTER"
          ? await tx.villageCenter.updateMany({
              where: { villageId, constructingTo: null, level: linha.level },
              data: { constructingTo: proximo.targetLevel },
            })
          : await tx.villageUpgrade.updateMany({
              where: {
                villageId,
                sectorKey: buildingKey,
                constructingTo: null,
                level: linha.level,
              },
              data: { constructingTo: proximo.targetLevel },
            });
      if (ocupado.count === 0) {
        throw new EconomyError(`${nome} já tem uma obra em andamento.`);
      }

      await claimConstructionSlot(tx, villageId, capacidade.total);

      const custo = scaleCost({ ryo: proximo.ryo, items: proximo.items }, pop.factor);
      await debitTreasury(tx, {
        villageId,
        amount: custo.ryo,
        type: "CONSTRUCTION_COST",
        reason: `${nome} nível ${proximo.targetLevel} (fator ${pop.factor.toFixed(2)})`,
        actorDiscordId,
        meta: { buildingType, buildingKey, targetLevel: proximo.targetLevel, factor: pop.factor },
      });
      for (const [itemId, qty] of Object.entries(custo.items)) {
        await removeVillageStock(tx, {
          villageId,
          itemId,
          qty,
          type: "CONSTRUCTION_COST",
          reason: `${nome} nível ${proximo.targetLevel}: ${getItem(itemId)?.name ?? itemId}`,
          actorDiscordId,
          meta: { buildingType, buildingKey, targetLevel: proximo.targetLevel },
        });
      }

      const obra = await tx.villageConstruction.create({
        data: {
          villageId,
          buildingType,
          buildingKey,
          targetLevel: proximo.targetLevel,
          costRyo: custo.ryo,
          costItemsJson: JSON.stringify(custo.items),
          populationFactor: pop.factor,
          finishesAt: new Date(now.getTime() + proximo.durationMs),
          startedByDiscordId: actorDiscordId,
        },
      });
      return { obra, custo: toFrozen(custo), nome, targetLevel: proximo.targetLevel };
    });
    return { ...resultado, factor: pop.factor };
  });
}

// Obra do Ichiraku. Mesma fila e mesma vaga; o que muda e' a trava do predio
// (status LOCKED da loja) e o fato de nao haver nivel-alvo.
export async function startIchiraku(
  villageId: VillageId,
  actorDiscordId: string,
  now = new Date(),
) {
  const pop = await activePopulation(villageId, now);
  const custo = scaleConstructionCost(pop.factor);
  const capacidade = await capacityView(villageId);

  return runEconomy(async () => {
    const obra = await prisma.$transaction(async (tx) => {
      const shop = await tx.villageShop.findUnique({
        where: { villageId_shopType: { villageId, shopType: ICHIRAKU_CONSTRUCTION.shop } },
      });
      if (!shop) throw new EconomyError("O Ichiraku ainda não existe nesta vila.");
      const virou = await tx.villageShop.updateMany({
        where: { id: shop.id, status: "LOCKED" },
        data: { status: "CONSTRUCTING" },
      });
      if (virou.count === 0) {
        throw new EconomyError(
          shop.status === "CONSTRUCTING"
            ? "A obra do Ichiraku já está em andamento."
            : "O Ichiraku desta vila já foi construído.",
        );
      }

      await claimConstructionSlot(tx, villageId, capacidade.total);

      await debitTreasury(tx, {
        villageId,
        amount: custo.ryo,
        type: "CONSTRUCTION_COST",
        reason: `Obra do Ichiraku (fator ${pop.factor.toFixed(2)})`,
        actorDiscordId,
        meta: { buildingKey: ICHIRAKU_CONSTRUCTION.buildingKey, factor: pop.factor },
      });
      for (const item of custo.itens) {
        await removeVillageStock(tx, {
          villageId,
          itemId: item.itemId,
          qty: item.qty,
          type: "CONSTRUCTION_COST",
          reason: `Obra do Ichiraku: ${item.name}`,
          actorDiscordId,
          meta: { buildingKey: ICHIRAKU_CONSTRUCTION.buildingKey },
        });
      }

      return tx.villageConstruction.create({
        data: {
          villageId,
          buildingType: ICHIRAKU_CONSTRUCTION.buildingType,
          buildingKey: ICHIRAKU_CONSTRUCTION.buildingKey,
          costRyo: custo.ryo,
          costItemsJson: JSON.stringify(
            Object.fromEntries(custo.itens.map((item) => [item.itemId, item.qty])),
          ),
          populationFactor: pop.factor,
          finishesAt: new Date(now.getTime() + ICHIRAKU_CONSTRUCTION.durationMs),
          startedByDiscordId: actorDiscordId,
        },
      });
    });
    return { obra, custo, factor: pop.factor };
  });
}

// Prévia do Ichiraku, no mesmo formato usado pela aba Comércio da etapa 05.
export interface IchirakuPreview {
  factor: number;
  ativos: number;
  custo: FrozenCost;
  conclusaoPrevista: Date;
  vagasUsadas: number;
  vagasTotais: number;
  cofreDisponivel: number;
  estoque: { itemId: string; name: string; precisa: number; tem: number }[];
  emObra: boolean;
  status: string;
}

export async function ichirakuPreview(
  villageId: VillageId,
  now = new Date(),
): Promise<IchirakuPreview> {
  const [village, pop, shop, obra, capacidade] = await Promise.all([
    prisma.village.findUniqueOrThrow({ where: { id: villageId } }),
    activePopulation(villageId, now),
    prisma.villageShop.findUnique({
      where: { villageId_shopType: { villageId, shopType: ICHIRAKU_CONSTRUCTION.shop } },
    }),
    prisma.villageConstruction.findFirst({
      where: { villageId, buildingKey: ICHIRAKU_CONSTRUCTION.buildingKey, status: "IN_PROGRESS" },
    }),
    capacityView(villageId),
  ]);

  const custo = scaleConstructionCost(pop.factor);
  const estoque = await Promise.all(
    custo.itens.map(async (item) => ({
      itemId: item.itemId,
      name: item.name,
      precisa: item.qty,
      tem:
        (
          await prisma.villageStock.findUnique({
            where: { villageId_itemId: { villageId, itemId: item.itemId } },
            select: { qty: true },
          })
        )?.qty ?? 0,
    })),
  );

  return {
    factor: pop.factor,
    ativos: pop.ativos,
    custo,
    conclusaoPrevista: new Date(now.getTime() + ICHIRAKU_CONSTRUCTION.durationMs),
    vagasUsadas: capacidade.usadas,
    vagasTotais: capacidade.total,
    cofreDisponivel: Math.max(0, village.treasuryRyo - village.reservedRyo),
    estoque,
    emObra: Boolean(obra),
    status: shop?.status ?? "LOCKED",
  };
}

// ---------------- Conclusão ----------------

export interface CompletedConstruction {
  villageId: VillageId;
  buildingType: string;
  buildingKey: string;
  targetLevel: number | null;
  shopType: string;
}

// Conclui as obras vencidas. Idempotente: o `status: IN_PROGRESS` no WHERE do
// UPDATE e' o que garante uma conclusao so' por obra, mesmo com dois timers ou
// depois de dias offline.
export async function completeFinishedConstructions(
  now = new Date(),
): Promise<CompletedConstruction[]> {
  const vencidas = await prisma.villageConstruction.findMany({
    where: { status: "IN_PROGRESS", finishesAt: { lte: now } },
    select: { id: true, villageId: true, buildingType: true, buildingKey: true, targetLevel: true },
    orderBy: { finishesAt: "asc" },
  });

  const concluidas: CompletedConstruction[] = [];
  for (const obra of vencidas) {
    const feita = await prisma.$transaction(async (tx) => {
      const { count } = await tx.villageConstruction.updateMany({
        where: { id: obra.id, status: "IN_PROGRESS" },
        data: { status: "COMPLETED", completedAt: now },
      });
      if (count === 0) return false;

      await releaseConstructionSlot(tx, obra.villageId);
      await applyCompletion(tx, obra);

      await recordLedger(tx, {
        type: "CONSTRUCTION_COST",
        villageId: obra.villageId,
        ryoDelta: 0,
        reason: `Obra concluída: ${obra.buildingKey}${obra.targetLevel ? ` nível ${obra.targetLevel}` : ""}`,
        meta: {
          constructionId: obra.id,
          buildingType: obra.buildingType,
          buildingKey: obra.buildingKey,
          targetLevel: obra.targetLevel,
          event: "COMPLETED",
        },
      });
      return true;
    });

    if (feita) {
      concluidas.push({
        villageId: obra.villageId as VillageId,
        buildingType: obra.buildingType,
        buildingKey: obra.buildingKey,
        targetLevel: obra.targetLevel,
        shopType: ICHIRAKU_CONSTRUCTION.shop,
      });
    }
  }
  return concluidas;
}

// Efeito da conclusao no predio. O nivel so' sobe aqui, e so' se a obra
// realmente estava apontando para ele.
async function applyCompletion(
  tx: Tx,
  obra: { villageId: string; buildingType: string; buildingKey: string; targetLevel: number | null },
): Promise<void> {
  if (obra.buildingType === "CENTER" && obra.targetLevel) {
    await tx.villageCenter.updateMany({
      where: { villageId: obra.villageId, constructingTo: obra.targetLevel },
      data: { level: obra.targetLevel, constructingTo: null },
    });
    return;
  }
  if (obra.buildingType === "SECTOR" && obra.targetLevel) {
    await tx.villageUpgrade.updateMany({
      where: {
        villageId: obra.villageId,
        sectorKey: obra.buildingKey,
        constructingTo: obra.targetLevel,
      },
      data: { level: obra.targetLevel, constructingTo: null },
    });
    return;
  }
  if (obra.buildingKey === ICHIRAKU_CONSTRUCTION.buildingKey) {
    // A loja NAO fica ativa aqui: quem ativa e' a criacao do canal de RP.
    await tx.villageShop.updateMany({
      where: {
        villageId: obra.villageId,
        shopType: ICHIRAKU_CONSTRUCTION.shop,
        status: "CONSTRUCTING",
      },
      data: { status: "AWAITING_CHANNEL" },
    });
  }
}

// Cancelamento administrativo. Nao ha reembolso automatico (secao 6.3): o custo
// ja foi consumido pela obra. Libera a vaga e destrava o predio uma vez so'.
export async function cancelConstruction(
  constructionId: string,
  motivo: string,
  actorDiscordId: string,
) {
  return runEconomy(async () => {
    const cancelada = await prisma.$transaction(async (tx) => {
      const obra = await tx.villageConstruction.findUnique({ where: { id: constructionId } });
      if (!obra) throw new EconomyError("Obra não encontrada.");
      const { count } = await tx.villageConstruction.updateMany({
        where: { id: constructionId, status: "IN_PROGRESS" },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      if (count === 0) throw new EconomyError("Esta obra já foi encerrada.");

      await releaseConstructionSlot(tx, obra.villageId);
      if (obra.buildingType === "CENTER") {
        await tx.villageCenter.updateMany({
          where: { villageId: obra.villageId },
          data: { constructingTo: null },
        });
      } else if (obra.buildingType === "SECTOR") {
        await tx.villageUpgrade.updateMany({
          where: { villageId: obra.villageId, sectorKey: obra.buildingKey },
          data: { constructingTo: null },
        });
      } else {
        await tx.villageShop.updateMany({
          where: {
            villageId: obra.villageId,
            shopType: ICHIRAKU_CONSTRUCTION.shop,
            status: "CONSTRUCTING",
          },
          data: { status: "LOCKED" },
        });
      }

      await recordLedger(tx, {
        type: "ADMIN_ADJUSTMENT",
        villageId: obra.villageId,
        actorDiscordId,
        reason: motivo,
        meta: { constructionId, buildingKey: obra.buildingKey, event: "CANCELLED" },
      });
      return obra;
    });
    return { obra: cancelada };
  });
}

// Conclusao forçada pela staff: antecipa o prazo e deixa o job normal fazer o
// resto, para nao existir um segundo caminho de conclusao.
export async function forceFinishConstruction(
  constructionId: string,
  motivo: string,
  actorDiscordId: string,
  now = new Date(),
) {
  return runEconomy(async () => {
    const { count } = await prisma.villageConstruction.updateMany({
      where: { id: constructionId, status: "IN_PROGRESS" },
      data: { finishesAt: now },
    });
    if (count === 0) throw new EconomyError("Esta obra já foi encerrada.");
    await prisma.$transaction((tx) =>
      recordLedger(tx, {
        type: "ADMIN_ADJUSTMENT",
        actorDiscordId,
        reason: motivo,
        meta: { constructionId, event: "FORCE_FINISH" },
      }),
    );
    const concluidas = await completeFinishedConstructions(now);
    return { concluidas };
  });
}

export async function activeConstructions(villageId: VillageId) {
  return prisma.villageConstruction.findMany({
    where: { villageId, status: "IN_PROGRESS" },
    orderBy: { finishesAt: "asc" },
  });
}

export async function nextConstructionDeadline(): Promise<Date | null> {
  const proxima = await prisma.villageConstruction.findFirst({
    where: { status: "IN_PROGRESS" },
    orderBy: { finishesAt: "asc" },
    select: { finishesAt: true },
  });
  return proxima?.finishesAt ?? null;
}

// Nome legivel de qualquer chave de predio.
export function buildingName(buildingType: string, buildingKey: string): string {
  if (buildingType === "CENTER") return CENTER.name;
  if (buildingType === "SHOP") return "Ichiraku — Casa de Lámen";
  return getSector(buildingKey)?.name ?? buildingKey;
}

export const MAX_LEVELS = { SECTOR: MAX_SECTOR_LEVEL, CENTER: MAX_CENTER_LEVEL };
