import { prisma } from "../../db/client.js";
import { log } from "../../utils/logger.js";

// Regeneracao passiva de vida fora de combate: silenciosa, sem aviso no
// Discord. Personagens com um CombatParticipant em sessao ACTIVE ficam de
// fora do UPDATE — a vida deles so' se move via applyDamage/heal do combate
// ate' persistResources() sincronizar de volta ao fim da luta
// (src/commands/combate.ts).
const REGEN_INTERVAL_MS = 60_000;
const REGEN_AMOUNT = 2;

let regenTimer: NodeJS.Timeout | null = null;

async function regenTick(): Promise<void> {
  // PostgreSQL usa bigint para parametros bindados pelo Prisma; os campos de
  // vida sao integer. LEAST + cast explicito evita o erro de tipos 42883 e
  // preserva o teto de vida máxima.
  await prisma.$executeRaw`UPDATE "UserCharacter" SET "hpCurrent" = LEAST("hpMax", "hpCurrent" + CAST(${REGEN_AMOUNT} AS integer)) WHERE "hpCurrent" < "hpMax" AND NOT EXISTS (
    SELECT 1 FROM "CombatParticipant" cp
    JOIN "CombatSession" cs ON cs.id = cp."sessionId"
    WHERE cp."charId" = "UserCharacter".id AND cs.status = 'ACTIVE'
  )`;
}

export function startHpRegenScheduler(): void {
  if (regenTimer) clearInterval(regenTimer);
  regenTimer = setInterval(
    () => void regenTick().catch((error) => log.error("[hp-regen] falha na regeneracao passiva:", error)),
    REGEN_INTERVAL_MS,
  );
  regenTimer.unref?.();
}

export function stopHpRegenScheduler(): void {
  if (regenTimer) clearInterval(regenTimer);
  regenTimer = null;
}
