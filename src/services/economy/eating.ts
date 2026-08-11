import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem } from "../../data/items.js";
import { removeInventoryItem } from "../characters/inventory.js";
import { EconomyError, runEconomy } from "./errors.js";

// Saciedade nova depois de comer. Puro e limitado ao teto — comer com a barra
// cheia nao desperdica silenciosamente porque o comando recusa antes.
export function satietyAfterEating(atual: number, porUnidade: number, quantidade: number): number {
  return Math.min(ECONOMY.satietyMax, atual + porUnidade * quantidade);
}

export interface EatResult {
  itemName: string;
  quantidade: number;
  ganho: number;
  satiety: number;
}

// Come fora de combate. Nesta etapa a saciedade so' SOBE: nao existe queda,
// dano nem debuff de fome (secao 5.3).
export async function eatFood(
  charId: string,
  itemId: string,
  quantidade = 1,
): Promise<{ ok: true; result: EatResult } | { ok: false; error: string }> {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return { ok: false, error: "Quantidade inválida." };
  }
  const item = getItem(itemId);
  if (!item || typeof item.satiety !== "number") {
    return { ok: false, error: "Isso não é comida." };
  }

  const outcome = await runEconomy(async () =>
    prisma.$transaction(async (tx) => {
      const estado = await tx.characterEconomyState.upsert({
        where: { charId },
        create: { charId },
        update: {},
        select: { satiety: true },
      });
      if (estado.satiety >= ECONOMY.satietyMax) {
        throw new EconomyError("Você está sem fome.");
      }

      await removeInventoryItem(
        tx,
        charId,
        itemId,
        quantidade,
        `Você não possui ${quantidade}x ${item.name}.`,
      );

      const satiety = satietyAfterEating(estado.satiety, item.satiety!, quantidade);
      await tx.characterEconomyState.update({ where: { charId }, data: { satiety } });
      await tx.economyActionLog.create({
        data: {
          charId,
          action: "COMER",
          detailsJson: JSON.stringify({ itemId, quantidade, satiety }),
        },
      });

      return {
        itemName: item.name,
        quantidade,
        ganho: satiety - estado.satiety,
        satiety,
      };
    }),
  );

  if (!outcome.ok) return { ok: false, error: outcome.error };
  const { ok: _ok, ...result } = outcome;
  return { ok: true, result };
}
