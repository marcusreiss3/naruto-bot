// Migration de dados: consolida pilhas duplicadas de InventoryItem.
//
// RODE ANTES de `npm run prisma:push` na primeira subida da etapa 01 — o
// indice @@unique([charId, itemId]) nao consegue ser criado enquanto existir
// duplicata, e o push falha inteiro.
//
//   npm run migrate:inventory-dedup
//   npm run prisma:push
//
// Idempotente: rodar de novo depois da unicidade existir nao acha nada e sai.
// Usa SQL cru de proposito, para funcionar tanto no schema antigo quanto no
// novo (nao depende do client regenerado).

import { PrismaClient } from "@prisma/client";
import {
  planInventoryConsolidation,
  type InventoryRow,
} from "../src/services/economy/inventory-migration.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<InventoryRow[]>`
    SELECT id, charId, itemId, name, qty FROM InventoryItem
  `;
  const plans = planInventoryConsolidation(rows);

  if (plans.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`Dedup: ${rows.length} linha(s) verificada(s), nenhuma duplicata.`);
    return;
  }

  // Uma transacao por pilha: curta e reentrante. Se cair no meio, o que ja
  // consolidou fica consolidado e rodar de novo termina o resto.
  for (const plan of plans) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE InventoryItem SET qty = ${plan.totalQty}, name = ${plan.name}
        WHERE id = ${plan.keepId}
      `;
      for (const id of plan.deleteIds) {
        await tx.$executeRaw`DELETE FROM InventoryItem WHERE id = ${id}`;
      }
    });
    // eslint-disable-next-line no-console
    console.log(
      `  ${plan.charId} / ${plan.itemId}: ${plan.deleteIds.length + 1} pilhas -> ${plan.totalQty}x ${plan.name}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Dedup: ${plans.length} pilha(s) consolidada(s). Agora rode: npm run prisma:push`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
