// Relogios da vila: obras, produção diária e reforma semanal.
//
// Mesmo desenho dos relogios das etapas 02 e 05, e pela mesma razao: o estado
// que importa vive no BANCO, nao no `setTimeout`.
//
//   obras     — `VillageConstruction.status` + UPDATE condicional
//   produção  — unicidade (vila, prédio, dia) em `VillageProductionRun`
//   reforma   — unicidade (vila, prédio, ciclo) em `VillageMaintenanceCharge`
//   caravana  — unicidade (vila, dia, item) em `GeneralMarketOffer`
//
// Consequencia: o boot roda uma passada de cada um e recupera tudo que venceu
// offline, exatamente uma vez. Perder o timer atrasa, nunca duplica nem pula.

import type { Client } from "discord.js";
import { ECONOMY } from "../../config/balance.js";
import { VILLAGE_ANNOUNCE_CHANNELS, VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import { log } from "../../utils/logger.js";
import {
  buildingName,
  completeFinishedConstructions,
  nextConstructionDeadline,
} from "./constructions.js";
import { runGeneralMarketPass } from "./general-market.js";
import { runShopPurchaseOfferPass } from "./shop-purchase-offers.js";
import { syncPendingIchirakuChannels, type ChannelSyncResult } from "./ichiraku-channel.js";
import { runMaintenancePass } from "./maintenance.js";
import { runPendingProduction } from "./production.js";
import { nextDailyAt, nextMaintenanceCycle } from "./week.js";

export type ConstructionAnnouncer = (result: ChannelSyncResult) => Promise<void>;

let obrasTimer: NodeJS.Timeout | null = null;
let diarioTimer: NodeJS.Timeout | null = null;
let reformaTimer: NodeJS.Timeout | null = null;
let caravanaTimer: NodeJS.Timeout | null = null;

export function stopVillageSchedulers(): void {
  for (const timer of [obrasTimer, diarioTimer, reformaTimer, caravanaTimer]) {
    if (timer) clearTimeout(timer);
  }
  obrasTimer = null;
  diarioTimer = null;
  reformaTimer = null;
  caravanaTimer = null;
}

// Mantido com o nome da etapa 05 para nao quebrar quem ja chamava.
export const stopConstructionScheduler = stopVillageSchedulers;

// ---------------- Obras ----------------

export async function runConstructionPass(
  client: Client,
  announce?: ConstructionAnnouncer,
  anunciarObra?: (obra: { villageId: VillageId; buildingType: string; buildingKey: string; targetLevel: number | null }) => Promise<void>,
): Promise<number> {
  const concluidas = await completeFinishedConstructions();
  for (const obra of concluidas) {
    log.info(
      `Obra concluída em ${obra.villageId}: ${obra.buildingKey}` +
        (obra.targetLevel ? ` nível ${obra.targetLevel}` : "") +
        ".",
    );
    if (anunciarObra) await anunciarObra(obra).catch(() => undefined);
  }

  // Roda sempre, nao so' depois de concluir: recupera vilas que ficaram em
  // AWAITING_CHANNEL por falta de permissao numa tentativa anterior.
  const canais = await syncPendingIchirakuChannels(client);
  let abertas = 0;
  for (const resultado of canais) {
    if (resultado.status === "CREATED" || resultado.status === "REUSED") {
      abertas += 1;
      if (announce) await announce(resultado).catch(() => undefined);
    } else if (resultado.status !== "ALREADY_ACTIVE" && resultado.status !== "NOT_PENDING") {
      log.warn(
        `Ichiraku de ${resultado.villageId} continua aguardando canal (${resultado.status}). ` +
          "A obra NAO sera cobrada de novo; use /admin-vila ichiraku canal.",
      );
    }
  }
  return abertas;
}

// ---------------- Anúncios ----------------

async function enviarAviso(client: Client, villageId: VillageId, texto: string): Promise<void> {
  const canal = await client.channels.fetch(VILLAGE_ANNOUNCE_CHANNELS[villageId]).catch(() => null);
  if (!canal?.isTextBased() || !("send" in canal)) return;
  await canal.send(texto).catch(() => null);
}

export function defaultAnnouncer(client: Client): ConstructionAnnouncer {
  return async (resultado) => {
    const villageId = resultado.villageId as VillageId;
    await enviarAviso(
      client,
      villageId,
      `🍜 **O Ichiraku de ${VILLAGE_NAMES[villageId]} abriu as portas!** ` +
        `Passe em <#${resultado.channelId}> ou use \`/loja\` no centro comercial.`,
    );
  };
}

function defaultBuildAnnouncer(client: Client) {
  return async (obra: {
    villageId: VillageId;
    buildingType: string;
    buildingKey: string;
    targetLevel: number | null;
  }) => {
    // O Ichiraku tem anúncio próprio, quando o canal abre.
    if (obra.buildingType === "SHOP") return;
    const nome = buildingName(obra.buildingType, obra.buildingKey);
    await enviarAviso(
      client,
      obra.villageId,
      `🏗️ **Obra concluída em ${VILLAGE_NAMES[obra.villageId]}:** ${nome} chegou ao **nível ${obra.targetLevel}**.`,
    );
  };
}

// ---------------- Agendamento ----------------

function armar(quando: Date, tetoMs: number, tarefa: () => void): NodeJS.Timeout {
  const delay = Math.min(tetoMs, Math.max(1_000, quando.getTime() - Date.now()));
  const timer = setTimeout(tarefa, delay);
  timer.unref?.();
  return timer;
}

async function agendarObras(client: Client, announce: ConstructionAnnouncer): Promise<void> {
  if (obrasTimer) clearTimeout(obrasTimer);
  obrasTimer = null;
  const proxima = await nextConstructionDeadline().catch(() => null);
  if (!proxima) return;
  // Teto de 24 h: uma obra de 15 dias acorda algumas vezes antes de concluir, o
  // que tambem serve de retentativa para canal de Ichiraku pendente.
  obrasTimer = armar(proxima, 24 * 3_600_000, () => {
    void (async () => {
      try {
        await runConstructionPass(client, announce, defaultBuildAnnouncer(client));
      } catch (err) {
        log.error("Falha ao processar obras vencidas:", err);
      } finally {
        await agendarObras(client, announce);
      }
    })();
  });
}

function agendarProducao(client: Client): void {
  if (diarioTimer) clearTimeout(diarioTimer);
  const alvo = nextDailyAt(
    new Date(),
    ECONOMY.dailyProductionHour,
    ECONOMY.dailyProductionMinute,
  );
  log.info(`Produção diária: próxima apuração em ${alvo.toISOString()}.`);
  diarioTimer = armar(alvo, 24 * 3_600_000 + 60_000, () => {
    void (async () => {
      try {
        const saidas = await runPendingProduction();
        for (const saida of saidas) {
          log.info(
            `Produção de ${saida.villageId} em ${saida.dayKey}: ${saida.totalItens} unidade(s).`,
          );
        }
      } catch (err) {
        log.error("Falha na produção diária:", err);
      } finally {
        agendarProducao(client);
      }
    })();
  });
}

// Caravana do Mercado Geral: 00:05 local, junto da producao diaria mas com
// timer proprio, porque a recuperacao delas e' independente — perder a virada
// da caravana nao pode depender de a producao ter rodado.
function agendarCaravana(): void {
  if (caravanaTimer) clearTimeout(caravanaTimer);
  const alvo = nextDailyAt(new Date(), ECONOMY.generalMarketHour, ECONOMY.generalMarketMinute);
  log.info(`Mercado Geral: próxima caravana em ${alvo.toISOString()}.`);
  caravanaTimer = armar(alvo, 24 * 3_600_000 + 60_000, () => {
    void (async () => {
      try {
        const [viradas, cotas] = await Promise.all([runGeneralMarketPass(), runShopPurchaseOfferPass()]);
        if (viradas) log.info(`Mercado Geral: ${viradas} vila(s) receberam ofertas novas.`);
        if (cotas) log.info(`Lojas municipais: ${cotas} balcão(ões) receberam cotas de compra.`);
      } catch (err) {
        log.error("Falha na virada do Mercado Geral:", err);
      } finally {
        agendarCaravana();
      }
    })();
  });
}

function agendarReforma(client: Client): void {
  if (reformaTimer) clearTimeout(reformaTimer);
  const alvo = nextMaintenanceCycle(
    new Date(),
    ECONOMY.maintenanceWeekday,
    ECONOMY.maintenanceHour,
    ECONOMY.maintenanceMinute,
  );
  log.info(`Reforma semanal: próximo ciclo em ${alvo.toISOString()}.`);
  // Teto de 12 h: as 72 h de graca precisam vencer no meio da semana, entao o
  // relogio nao pode dormir ate a proxima segunda.
  reformaTimer = armar(alvo, 12 * 3_600_000, () => {
    void (async () => {
      try {
        const { criadas, vencidas } = await runMaintenancePass();
        for (const vencida of vencidas) {
          await enviarAviso(
            client,
            vencida.villageId,
            `⚠️ **${buildingName(vencida.buildingType, vencida.buildingKey)}** de ` +
              `${VILLAGE_NAMES[vencida.villageId]} está sem reforma e foi suspenso. ` +
              "O nível não foi perdido; pague em `/vila` → Obras para reativar.",
          );
        }
        if (criadas.length) log.info(`Reforma: ${criadas.length} cobrança(s) aberta(s).`);
      } catch (err) {
        log.error("Falha no ciclo de reforma:", err);
      } finally {
        agendarReforma(client);
      }
    })();
  });
}

// Chamado no boot e sempre que uma obra nova comeca — sem isso a primeira obra
// de uma sessao ficaria sem timer armado ate o proximo boot.
export async function startVillageSchedulers(
  client: Client,
  announce: ConstructionAnnouncer = defaultAnnouncer(client),
): Promise<void> {
  await runConstructionPass(client, announce, defaultBuildAnnouncer(client));
  await runPendingProduction().catch((err) => log.error("Falha na produção pendente:", err));
  await runMaintenancePass().catch((err) => log.error("Falha na reforma pendente:", err));
  await runGeneralMarketPass().catch((err) => log.error("Falha na caravana pendente:", err));
  await runShopPurchaseOfferPass().catch((err) => log.error("Falha nas cotas de compra pendentes:", err));
  await agendarObras(client, announce);
  agendarProducao(client);
  agendarReforma(client);
  agendarCaravana();
}

// Nome da etapa 05, mantido para os chamadores existentes.
export const startConstructionScheduler = startVillageSchedulers;
