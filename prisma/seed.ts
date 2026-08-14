import "../src/db/tls-bootstrap.js";
import { PrismaClient } from "@prisma/client";
import { MISSIONS } from "../src/data/missions/index.js";
import { ECONOMY } from "../src/config/balance.js";
import { VILLAGE_IDS, VILLAGE_NAMES } from "../src/data/villages.js";
import { weekKeyFor } from "../src/services/economy/week.js";
import { SHOPS } from "../src/data/shops.js";
import { SECTORS } from "../src/data/sectors.js";

const prisma = new PrismaClient();

// Cria as cinco vilas com cofre e estoque vazios e abre a competencia semanal
// corrente com a taxa congelada. Idempotente: nao zera cofre, taxa nem Kage ja
// definidos, e nao re-congela a taxa de uma competencia ja aberta.
//
// Nao usa services/economy/village-economy.ts porque aquele modulo importa o
// client compartilhado; aqui o seed e' dono da propria conexao.
async function seedVillages(): Promise<void> {
  const weekKey = weekKeyFor(new Date());
  for (const id of VILLAGE_IDS) {
    const village = await prisma.village.upsert({
      where: { id },
      create: { id, name: VILLAGE_NAMES[id], taxRate: ECONOMY.defaultTaxRate },
      update: { name: VILLAGE_NAMES[id] },
    });
    await prisma.villageTaxPeriod.upsert({
      where: { villageId_weekKey: { villageId: id, weekKey } },
      create: { villageId: id, weekKey, taxRateFrozen: village.taxRate },
      update: {},
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seed: ${VILLAGE_IDS.length} vilas e competência ${weekKey} garantidas.`);
}

// Personagens criados antes desta etapa nao tem CharacterEconomyState. O
// getOrCreateCharacter faz o backfill sozinho no primeiro acesso, mas deixar
// pendente significa banco em dois estados; o seed resolve todos de uma vez.
async function backfillEconomyState(): Promise<void> {
  const semEstado = await prisma.userCharacter.findMany({
    where: { economy: { is: null } },
    select: { id: true },
  });
  if (semEstado.length === 0) return;
  await prisma.characterEconomyState.createMany({
    data: semEstado.map((char) => ({ charId: char.id })),
  });
  // eslint-disable-next-line no-console
  console.log(`Seed: estado econômico criado para ${semEstado.length} personagem(ns) antigo(s).`);
}

// As seis lojas de cada vila (secao 7.2). Empório, Marcenaria, Fundição e
// Oficina nascem ATIVAS com estoque vazio; so' o Ichiraku nasce LOCKED.
//
// Idempotente e NAO-DESTRUTIVO: usa `create` so' quando a linha nao existe, e
// nunca `update`. Um redeploy nao pode devolver um Ichiraku ja construido para
// LOCKED, nem zerar estoque, orcamento ou o canal de RP ja gravado.
async function seedVillageShops(): Promise<void> {
  const villages = await prisma.village.findMany({ select: { id: true } });
  let criadas = 0;
  for (const village of villages) {
    for (const shop of SHOPS) {
      const existente = await prisma.villageShop.findUnique({
        where: { villageId_shopType: { villageId: village.id, shopType: shop.type } },
        select: { id: true },
      });
      if (existente) continue;
      await prisma.villageShop.create({
        data: { villageId: village.id, shopType: shop.type, status: shop.initialStatus },
      });
      criadas += 1;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Seed: ${criadas} loja(s) criada(s); ${villages.length * SHOPS.length} no total.`);
}

// Os quatro setores no nivel 0 e o Centro no nivel 1 (secao 6). Mesma regra do
// seed de lojas: so' `create` quando falta, nunca `update` — um redeploy nao
// pode rebaixar setor evoluido nem apagar pendencia de reforma.
async function seedVillageBuildings(): Promise<void> {
  const villages = await prisma.village.findMany({ select: { id: true } });
  let criados = 0;
  for (const village of villages) {
    for (const sector of SECTORS) {
      const existente = await prisma.villageUpgrade.findUnique({
        where: { villageId_sectorKey: { villageId: village.id, sectorKey: sector.key } },
        select: { id: true },
      });
      if (existente) continue;
      await prisma.villageUpgrade.create({ data: { villageId: village.id, sectorKey: sector.key } });
      criados += 1;
    }
    const centro = await prisma.villageCenter.findUnique({
      where: { villageId: village.id },
      select: { id: true },
    });
    if (!centro) {
      await prisma.villageCenter.create({ data: { villageId: village.id, level: 1 } });
      criados += 1;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Seed: ${criados} prédio(s) criado(s); ${villages.length * (SECTORS.length + 1)} no total.`);
}

async function main(): Promise<void> {
  await seedVillages();
  await seedVillageShops();
  await seedVillageBuildings();
  await backfillEconomyState();
  for (const m of MISSIONS) {
    await prisma.missionDefinition.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        name: m.name,
        rank: m.rank,
        description: m.description,
        channelId: m.channelId,
        dataJson: JSON.stringify(m.data ?? {}),
      },
      update: {
        name: m.name,
        rank: m.rank,
        description: m.description,
        channelId: m.channelId,
        dataJson: JSON.stringify(m.data ?? {}),
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seed: ${MISSIONS.length} missões gravadas.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
