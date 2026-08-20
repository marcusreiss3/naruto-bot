import { prisma } from "../../db/client.js";
import { log } from "../../utils/logger.js";

// Regeneracao passiva de vida fora de combate: silenciosa, sem aviso no
// Discord. Combate le/escreve em CombatParticipant, nao em UserCharacter, entao
// este tick nunca interfere numa luta em andamento — o hpCurrent aqui so' volta
// a valer quando persistResources() sincroniza de volta ao fim do combate
// (src/commands/combate.ts).
const REGEN_INTERVAL_MS = 60_000;
const REGEN_AMOUNT = 2;

let regenTimer: NodeJS.Timeout | null = null;

async function regenTick(): Promise<void> {
  await prisma.$executeRaw`UPDATE "UserCharacter" SET "hpCurrent" = MIN("hpMax", "hpCurrent" + ${REGEN_AMOUNT}) WHERE "hpCurrent" < "hpMax"`;
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
