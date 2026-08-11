// Competencia semanal do imposto pessoal (secao 3.2 de docs/economia-vilas.md).
//
// A semana vai de domingo 22:00 a domingo 22:00, no fuso America/Sao_Paulo.
// Puro de proposito: a etapa 2 agenda o job em cima disto, mas o calculo da
// competencia precisa ser testavel sem relogio nem banco.

// America/Sao_Paulo esta em UTC-3 o ano todo desde 2019 (horario de verao
// abolido). Se voltar a existir DST, este offset vira uma consulta ao Intl.
const SAO_PAULO_OFFSET_HOURS = -3;
const WEEK_CUTOFF_HOUR = 22; // domingo, hora local

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Instante do corte da semana que CONTEM `at` (o domingo 22:00 que a abriu).
export function weekStartFor(at: Date): Date {
  // Desloca para "hora local" para achar o domingo certo, opera em UTC e volta.
  const local = new Date(at.getTime() + SAO_PAULO_OFFSET_HOURS * HOUR_MS);
  const shifted = new Date(local.getTime() - WEEK_CUTOFF_HOUR * HOUR_MS);
  // getUTCDay em `shifted`: 0 = domingo pos-corte.
  const daysSinceCutoff = shifted.getUTCDay();
  const startLocal = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceCutoff,
  ) + WEEK_CUTOFF_HOUR * HOUR_MS;
  return new Date(startLocal - SAO_PAULO_OFFSET_HOURS * HOUR_MS);
}

export function weekEndFor(at: Date): Date {
  return new Date(weekStartFor(at).getTime() + 7 * DAY_MS);
}

// Chave estavel da competencia, derivada do inicio: `AAAA-MM-DD` do domingo
// local que a abriu. E' a parte da unicidade que impede dupla cobranca.
export function weekKeyFor(at: Date): string {
  const start = weekStartFor(at);
  const local = new Date(start.getTime() + SAO_PAULO_OFFSET_HOURS * HOUR_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Volta da chave para os instantes da competencia. A recuperacao de boot precisa
// disto: o prazo de uma competencia vem da competencia em si, NAO de quando a
// linha foi gravada — uma competencia criada com atraso teria `openedAt` fora
// do proprio periodo e o vencimento sairia errado.
export function weekStartFromKey(weekKey: string): Date {
  const [y, m, d] = weekKey.split("-").map(Number);
  const localMs = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + WEEK_CUTOFF_HOUR * HOUR_MS;
  return new Date(localMs - SAO_PAULO_OFFSET_HOURS * HOUR_MS);
}

export function weekEndFromKey(weekKey: string): Date {
  return new Date(weekStartFromKey(weekKey).getTime() + 7 * DAY_MS);
}

// Dia local `AAAA-MM-DD`, no mesmo fuso da competencia. E' a chave dos
// contadores diarios das lojas (orcamento de compra e contrato de atacado):
// guardar a chave junto do numero faz o reset ser a comparacao com o dia de
// hoje, e nao um job que pode nao ter rodado.
export function dayKeyFor(at: Date): string {
  return localDateKey(new Date(at.getTime() + SAO_PAULO_OFFSET_HOURS * HOUR_MS));
}

function localDateKey(local: Date): string {
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Instante UTC de uma hora LOCAL num dia local. Base dos dois agendamentos da
// etapa 06 (producao 00:05, reforma segunda 00:15).
function localTimeToUtc(local: Date, hour: number, minute: number): Date {
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(base + hour * HOUR_MS + minute * 60_000 - SAO_PAULO_OFFSET_HOURS * HOUR_MS);
}

// Proxima ocorrencia de `hh:mm` local, estritamente depois de `at`.
export function nextDailyAt(at: Date, hour: number, minute: number): Date {
  const local = new Date(at.getTime() + SAO_PAULO_OFFSET_HOURS * HOUR_MS);
  const hoje = localTimeToUtc(local, hour, minute);
  return hoje.getTime() > at.getTime() ? hoje : new Date(hoje.getTime() + DAY_MS);
}

// ---------------- Ciclo de reforma (secao 6.4) ----------------
//
// A reforma tem ancora PROPRIA: segunda-feira 00:15 local. Nao reaproveita a
// competencia do imposto (domingo 22:00) de proposito — sao dois calendarios
// diferentes no spec, e fundir os dois faria uma mudanca num quebrar o outro.

// Segunda-feira 00:15 que abriu o ciclo que CONTEM `at`.
export function maintenanceCycleStart(at: Date, weekday = 1, hour = 0, minute = 15): Date {
  const local = new Date(at.getTime() + SAO_PAULO_OFFSET_HOURS * HOUR_MS);
  const marcoHoje = localTimeToUtc(local, hour, minute);
  // Dias desde o ultimo `weekday`, considerando que antes do horario ainda
  // pertencemos ao ciclo anterior.
  let dias = (local.getUTCDay() - weekday + 7) % 7;
  if (dias === 0 && at.getTime() < marcoHoje.getTime()) dias = 7;
  return new Date(marcoHoje.getTime() - dias * DAY_MS);
}

export function maintenanceCycleKey(at: Date, weekday = 1, hour = 0, minute = 15): string {
  const inicio = maintenanceCycleStart(at, weekday, hour, minute);
  return localDateKey(new Date(inicio.getTime() + SAO_PAULO_OFFSET_HOURS * HOUR_MS));
}

export function nextMaintenanceCycle(at: Date, weekday = 1, hour = 0, minute = 15): Date {
  return new Date(maintenanceCycleStart(at, weekday, hour, minute).getTime() + 7 * DAY_MS);
}
