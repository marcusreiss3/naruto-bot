import { PrismaClient } from "@prisma/client";
import { MISSIONS } from "../src/data/missions/index.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
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
