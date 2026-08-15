import { log } from "./logger.js";

// Telemetria deliberadamente leve: o caminho normal não escreve logs nem
// mantém métricas em memória. Os limites deixam visíveis somente operações que
// podem afetar a experiência no Discord.
export const PERFORMANCE_LIMITS = {
  queryMs: 200,
  handlerMs: 750,
} as const;

export function warnIfSlow(
  operation: string,
  startedAt: number,
  limitMs: number,
  details?: Record<string, string | number>,
): number {
  const elapsedMs = performance.now() - startedAt;
  if (elapsedMs >= limitMs) {
    const suffix = details
      ? ` | ${Object.entries(details).map(([key, value]) => `${key}=${value}`).join(" ")}`
      : "";
    log.warn(`[performance] ${operation}: ${elapsedMs.toFixed(0)} ms${suffix}`);
  }
  return elapsedMs;
}
