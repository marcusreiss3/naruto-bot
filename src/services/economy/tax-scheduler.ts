import { log } from "../../utils/logger.js";
import { ensureCurrentTaxPeriods } from "./village-economy.js";
import { weekEndFor } from "./week.js";
import {
  closeWeek,
  formatReceipt,
  markReceiptSent,
  pendingWeekKeys,
  type CharacterReceipt,
} from "./weekly-tax.js";

// Relogio do imposto semanal: domingo 22:00 America/Sao_Paulo.
//
// O estado que importa vive no banco (VillageTaxPeriod.status), nao no timer.
// O timer so' decide QUANDO acordar; quem decide SE cobra e' closeWeek(), que
// e' idempotente. Por isso reiniciar o bot no meio do domingo nao cobra duas
// vezes, e ficar fora do ar por um domingo inteiro nao pula a cobranca.

export type ReceiptSender = (receipt: CharacterReceipt) => Promise<boolean>;

let timer: NodeJS.Timeout | null = null;

export function stopTaxScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

// Roda todas as competencias vencidas, da mais antiga para a mais nova.
export async function runPendingClosures(sendReceipt?: ReceiptSender, now = new Date()): Promise<number> {
  const pendentes = await pendingWeekKeys(now);
  for (const weekKey of pendentes) {
    const resultado = await closeWeek(weekKey);
    log.info(
      `Imposto ${weekKey}: ${resultado.charactersProcessed} personagem(ns), ` +
        `${resultado.charactersExempt} isento(s), ${resultado.totalCharged} Ryō cobrados.`,
    );
    if (sendReceipt) await deliverReceipts(resultado.receipts, sendReceipt);
  }
  return pendentes.length;
}

// A DM fica FORA da transacao de cobranca de proposito: rede lenta nao pode
// segurar escrita no SQLite. Se a DM falhar, a WeeklyTaxCharge continua no
// banco e serve de recibo para consulta privada (aba Relatorios de /vila).
async function deliverReceipts(receipts: CharacterReceipt[], send: ReceiptSender): Promise<void> {
  for (const receipt of receipts) {
    if (receipt.exempt || receipt.totalRyo <= 0) continue;
    const entregue = await send(receipt).catch(() => false);
    if (entregue) await markReceiptSent(receipt.charId, receipt.weekKey).catch(() => undefined);
    else log.warn(`Recibo de ${receipt.weekKey} não entregue a ${receipt.discordId}; fica salvo no banco.`);
  }
}

// Proximo corte a partir de `now`. weekEndFor ja devolve o domingo 22:00
// seguinte no fuso certo.
export function nextRunAt(now = new Date()): Date {
  return weekEndFor(now);
}

function scheduleNext(sendReceipt?: ReceiptSender): void {
  const alvo = nextRunAt();
  // Uma semana (604.800.000 ms) cabe no limite de setTimeout (~24,8 dias),
  // entao nao precisa de timer fatiado.
  const delay = Math.max(1_000, alvo.getTime() - Date.now());
  stopTaxScheduler();
  timer = setTimeout(() => {
    void tick(sendReceipt);
  }, delay);
  timer.unref?.();
  log.info(`Imposto semanal: próxima apuração em ${alvo.toISOString()}.`);
}

async function tick(sendReceipt?: ReceiptSender): Promise<void> {
  try {
    await runPendingClosures(sendReceipt);
  } catch (err) {
    log.error("Falha na apuração do imposto semanal:", err);
  } finally {
    // Reagenda mesmo depois de erro: perder o relogio seria pior que perder
    // uma apuracao, que a recuperacao do proximo boot pegaria de qualquer jeito.
    scheduleNext(sendReceipt);
  }
}

// Chamado no boot. Garante que existe competencia aberta, processa o que
// venceu enquanto o bot estava fora e arma o proximo domingo.
export async function startTaxScheduler(sendReceipt?: ReceiptSender): Promise<void> {
  await ensureCurrentTaxPeriods();
  await runPendingClosures(sendReceipt);
  await ensureCurrentTaxPeriods();
  scheduleNext(sendReceipt);
}
