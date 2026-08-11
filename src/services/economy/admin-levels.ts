// Ajuste direto de nivel pela staff (`/admin-vila nivel set` e `centro set`).
//
// E' a ferramenta pedida na secao 8 para casos como "setar nivel 3 da vila X".
// Ela NAO e' um atalho de jogo: e' correcao administrativa, e por isso precisa
// deixar o estado inteiro consistente, nao so' o numero.
//
// "Sem obra fantasma" significa tres coisas, todas feitas na mesma transacao:
//   1. obra em andamento naquele predio e' CANCELADA e a vaga da fila volta;
//   2. `constructingTo` e' limpo, para o predio nao ficar travado para sempre;
//   3. cobranca de reforma que deixou de fazer sentido (setor rebaixado a 0,
//      Centro rebaixado a 1) e' encerrada, senao o predio ficaria devendo por
//      um nivel que nao existe mais.
//
// Nada disso reembolsa: baixar nivel nao devolve Ryo nem material.

import { prisma } from "../../db/client.js";
import { CENTER, MAX_CENTER_LEVEL, MAX_SECTOR_LEVEL, getSector, type SectorKey } from "../../data/sectors.js";
import type { VillageId } from "../../data/villages.js";
import { EconomyError, runEconomy } from "./errors.js";
import { recordLedger, type Tx } from "./ledger.js";

// Encerra a obra em andamento do predio e devolve a vaga. Uma vez so': a
// condicao `status = IN_PROGRESS` esta no WHERE do UPDATE.
async function limparObraPendente(
  tx: Tx,
  villageId: VillageId,
  buildingKey: string,
  motivo: string,
  actorDiscordId: string,
): Promise<number> {
  const abertas = await tx.villageConstruction.findMany({
    where: { villageId, buildingKey, status: "IN_PROGRESS" },
    select: { id: true },
  });
  let canceladas = 0;
  for (const obra of abertas) {
    const { count } = await tx.villageConstruction.updateMany({
      where: { id: obra.id, status: "IN_PROGRESS" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    if (count === 0) continue;
    canceladas += 1;
    await tx.village.updateMany({
      where: { id: villageId, constructionSlotsUsed: { gt: 0 } },
      data: { constructionSlotsUsed: { decrement: 1 } },
    });
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId,
      actorDiscordId,
      reason: motivo,
      meta: { constructionId: obra.id, buildingKey, event: "CANCELLED_BY_LEVEL_SET" },
    });
  }
  return canceladas;
}

// Encerra pendencia de reforma que perdeu o objeto (predio abaixo do nivel que
// paga manutencao).
async function limparReformaSemObjeto(
  tx: Tx,
  villageId: VillageId,
  buildingKey: string,
  aindaCobra: boolean,
): Promise<number> {
  if (aindaCobra) return 0;
  const { count } = await tx.villageMaintenanceCharge.updateMany({
    where: { villageId, buildingKey, status: { in: ["PENDING", "OVERDUE"] } },
    data: { status: "PAID", paidAt: new Date() },
  });
  return count;
}

export interface LevelSetOutcome {
  name: string;
  de: number;
  para: number;
  obrasCanceladas: number;
  reformasEncerradas: number;
}

export async function setSectorLevel(
  villageId: VillageId,
  sectorKey: SectorKey,
  level: number,
  motivo: string,
  actorDiscordId: string,
) {
  if (!Number.isInteger(level) || level < 0 || level > MAX_SECTOR_LEVEL) {
    return { ok: false as const, error: `O nível precisa ficar entre 0 e ${MAX_SECTOR_LEVEL}.` };
  }
  const def = getSector(sectorKey);
  if (!def) return { ok: false as const, error: "Setor desconhecido." };

  return runEconomy(
    async (): Promise<LevelSetOutcome> =>
      prisma.$transaction(async (tx) => {
        const atual = await tx.villageUpgrade.upsert({
          where: { villageId_sectorKey: { villageId, sectorKey } },
          create: { villageId, sectorKey },
          update: {},
        });

        const obrasCanceladas = await limparObraPendente(
          tx,
          villageId,
          sectorKey,
          motivo,
          actorDiscordId,
        );
        const reformasEncerradas = await limparReformaSemObjeto(tx, villageId, sectorKey, level >= 1);

        await tx.villageUpgrade.update({
          where: { villageId_sectorKey: { villageId, sectorKey } },
          // `status: OK` porque rebaixar/subir por decisao da staff nao pode
          // deixar o setor suspenso por uma pendencia que acabou de ser
          // encerrada; se a cobranca continua valendo, ela e' recriada no
          // proximo ciclo.
          data: { level, constructingTo: null, status: reformasEncerradas > 0 ? "OK" : atual.status },
        });

        await recordLedger(tx, {
          type: "ADMIN_ADJUSTMENT",
          villageId,
          actorDiscordId,
          reason: motivo,
          meta: {
            field: "sectorLevel",
            sectorKey,
            from: atual.level,
            to: level,
            obrasCanceladas,
            reformasEncerradas,
          },
        });

        return {
          name: def.name,
          de: atual.level,
          para: level,
          obrasCanceladas,
          reformasEncerradas,
        };
      }),
  );
}

export async function setCenterLevel(
  villageId: VillageId,
  level: number,
  motivo: string,
  actorDiscordId: string,
) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CENTER_LEVEL) {
    return { ok: false as const, error: `O nível do Centro precisa ficar entre 1 e ${MAX_CENTER_LEVEL}.` };
  }

  return runEconomy(
    async (): Promise<LevelSetOutcome> =>
      prisma.$transaction(async (tx) => {
        const atual = await tx.villageCenter.upsert({
          where: { villageId },
          create: { villageId, level: 1 },
          update: {},
        });

        const obrasCanceladas = await limparObraPendente(
          tx,
          villageId,
          CENTER.buildingKey,
          motivo,
          actorDiscordId,
        );
        const reformasEncerradas = await limparReformaSemObjeto(
          tx,
          villageId,
          CENTER.buildingKey,
          level >= 2,
        );

        await tx.villageCenter.update({
          where: { villageId },
          data: { level, constructingTo: null, status: reformasEncerradas > 0 ? "OK" : atual.status },
        });

        await recordLedger(tx, {
          type: "ADMIN_ADJUSTMENT",
          villageId,
          actorDiscordId,
          reason: motivo,
          meta: {
            field: "centerLevel",
            from: atual.level,
            to: level,
            obrasCanceladas,
            reformasEncerradas,
          },
        });

        return {
          name: CENTER.name,
          de: atual.level,
          para: level,
          obrasCanceladas,
          reformasEncerradas,
        };
      }),
  );
}

// Fixa (ou solta) a populacao ativa da vila. `null` volta a apuracao real dos
// ultimos 14 dias.
export async function setPopulationOverride(
  villageId: VillageId,
  ativos: number | null,
  motivo: string,
  actorDiscordId: string,
) {
  if (ativos !== null && (!Number.isInteger(ativos) || ativos < 0)) {
    return { ok: false as const, error: "Informe um número inteiro não negativo, ou -1 para remover." };
  }
  return runEconomy(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.village.update({ where: { id: villageId }, data: { populationOverride: ativos } });
      await recordLedger(tx, {
        type: "ADMIN_ADJUSTMENT",
        villageId,
        actorDiscordId,
        reason: motivo,
        meta: { field: "populationOverride", to: ativos },
      });
    });
    return { ativos };
  });
}

export function isSectorLevelValid(level: number): boolean {
  return Number.isInteger(level) && level >= 0 && level <= MAX_SECTOR_LEVEL;
}

export { EconomyError };
