// Aceites da etapa 03 que dependem do banco: cooldown atômico, craft sem
// consumo parcial, saciedade e a garantia de que nada disso mexe no imposto.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

const dir = mkdtempSync(join(tmpdir(), "naruto-gather-"));
const dbPath = join(dir, "gather.db");
process.env.DATABASE_URL = `file:${dbPath}`;

const MONTANHA = "1515881137170546852";
const FLORESTA = "1515881109878214746";

let prisma: PrismaClient;
let gathering: typeof import("../src/services/economy/gathering.js");
let crafting: typeof import("../src/services/economy/crafting.js");
let eating: typeof import("../src/services/economy/eating.js");
let inventory: typeof import("../src/services/characters/inventory.js");

function pushSchema(): void {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8").replace(
    'env("DATABASE_URL")',
    JSON.stringify(`file:${dbPath}`),
  );
  const schemaPath = join(dir, "schema.prisma");
  writeFileSync(schemaPath, schema);
  const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [cli, "db", "push", "--schema", schemaPath, "--skip-generate"], {
    stdio: "pipe",
  });
}

let seq = 0;
async function novoNinja() {
  seq += 1;
  return prisma.userCharacter.create({
    data: { discordId: `u${seq}`, guildId: "g", name: `Ninja ${seq}`, villageId: "KONOHA" },
  });
}

async function dar(charId: string, itemId: string, qty: number) {
  await prisma.$transaction((tx) => inventory.addInventoryItem(tx, charId, itemId, qty));
}

async function qtd(charId: string, itemId: string) {
  return prisma.$transaction((tx) => inventory.getInventoryQty(tx, charId, itemId));
}

beforeAll(async () => {
  pushSchema();
  prisma = (await import("../src/db/client.js")).prisma;
  gathering = await import("../src/services/economy/gathering.js");
  crafting = await import("../src/services/economy/crafting.js");
  eating = await import("../src/services/economy/eating.js");
  inventory = await import("../src/services/characters/inventory.js");
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("canal e cooldown", () => {
  it("recusa a ação fora do canal correto sem gastar o cooldown", async () => {
    const char = await novoNinja();

    const fora = await gathering.performGathering(char.id, "999", "MINERAR");
    expect(fora.ok).toBe(false);

    // Canal existe, mas a área não permite minerar.
    const errado = await gathering.performGathering(char.id, FLORESTA, "MINERAR");
    expect(errado.ok).toBe(false);

    expect(await prisma.gatheringCooldown.count({ where: { charId: char.id } })).toBe(0);
    // Dentro do canal certo, funciona.
    const certo = await gathering.performGathering(char.id, MONTANHA, "MINERAR");
    expect(certo.ok).toBe(true);
  });

  it("bloqueia a segunda tentativa dentro dos 15 minutos", async () => {
    const char = await novoNinja();

    expect((await gathering.performGathering(char.id, MONTANHA, "MINERAR")).ok).toBe(true);
    const segunda = await gathering.performGathering(char.id, MONTANHA, "MINERAR");

    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error).toMatch(/min/);
  });

  it("mantém cooldown separado por tipo de ação", async () => {
    const char = await novoNinja();

    expect((await gathering.performGathering(char.id, MONTANHA, "MINERAR")).ok).toBe(true);
    // Coletar é outra ação: não herda o cooldown da mineração.
    expect((await gathering.performGathering(char.id, MONTANHA, "COLETAR")).ok).toBe(true);
  });

  it("libera de novo depois que o cooldown vence", async () => {
    const char = await novoNinja();
    const agora = new Date();

    expect((await gathering.performGathering(char.id, MONTANHA, "MINERAR", { now: agora })).ok).toBe(true);
    const depois = new Date(agora.getTime() + 15 * 60_000 + 1_000);
    expect((await gathering.performGathering(char.id, MONTANHA, "MINERAR", { now: depois })).ok).toBe(true);
  });

  it("duas execuções concorrentes da mesma ação geram uma recompensa só", async () => {
    const char = await novoNinja();

    const [a, b] = await Promise.all([
      gathering.performGathering(char.id, MONTANHA, "MINERAR"),
      gathering.performGathering(char.id, MONTANHA, "MINERAR"),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await prisma.economyActionLog.count({ where: { charId: char.id, action: "MINERAR" } })).toBe(1);
  });

  it("registra canal, vila e itens na trilha", async () => {
    const char = await novoNinja();
    await gathering.performGathering(char.id, MONTANHA, "MINERAR", { villageId: "KONOHA" });

    const log = await prisma.economyActionLog.findFirstOrThrow({ where: { charId: char.id } });
    expect(log).toMatchObject({ action: "MINERAR", channelId: MONTANHA, villageId: "KONOHA" });
    expect(JSON.parse(log.detailsJson).areaId).toBe("MONTANHA");
  });

  it("põe o resultado no inventário pessoal", async () => {
    const char = await novoNinja();
    const outcome = await gathering.performGathering(char.id, MONTANHA, "MINERAR");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const entry of outcome.result.loot) {
      expect(await qtd(char.id, entry.itemId)).toBe(entry.qty);
    }
  });
});

describe("craft pessoal", () => {
  it("consome exatamente os ingredientes e cria o produto", async () => {
    const char = await novoNinja();
    await dar(char.id, "minerio_ferro", 2);
    await dar(char.id, "carvao", 1);

    const outcome = await crafting.craftPersonal(char.id, "lingote_ferro");

    expect(outcome.ok).toBe(true);
    expect(await qtd(char.id, "minerio_ferro")).toBe(0);
    expect(await qtd(char.id, "carvao")).toBe(0);
    expect(await qtd(char.id, "lingote_ferro")).toBe(1);
  });

  it("falha sem todos os ingredientes e não consome nada", async () => {
    const char = await novoNinja();
    await dar(char.id, "minerio_ferro", 2); // falta o carvão

    const outcome = await crafting.craftPersonal(char.id, "lingote_ferro");

    expect(outcome.ok).toBe(false);
    expect(await qtd(char.id, "minerio_ferro")).toBe(2);
    expect(await qtd(char.id, "lingote_ferro")).toBe(0);
  });

  it("faz Pão com 2 Farinhas, 1 Água Limpa e 1 Lenha", async () => {
    const char = await novoNinja();
    await dar(char.id, "farinha", 2);
    await dar(char.id, "agua_limpa", 1);
    await dar(char.id, "lenha", 1);

    expect((await crafting.craftPersonal(char.id, "pao")).ok).toBe(true);
    expect(await qtd(char.id, "pao")).toBe(1);
    expect(await qtd(char.id, "farinha")).toBe(0);
  });

  it("multiplica ingredientes e produto pela quantidade pedida", async () => {
    const char = await novoNinja();
    await dar(char.id, "lingote_ferro", 2);

    expect((await crafting.craftPersonal(char.id, "senbon", 2)).ok).toBe(true);
    expect(await qtd(char.id, "senbon")).toBe(6);
    expect(await qtd(char.id, "lingote_ferro")).toBe(0);
  });

  it("recusa receita municipal mesmo com o inventário cheio dos ingredientes", async () => {
    const char = await novoNinja();
    await dar(char.id, "lingote_ferro", 20);
    await dar(char.id, "carvao", 20);
    await dar(char.id, "erva_medicinal", 20);
    await dar(char.id, "agua_limpa", 20);
    await dar(char.id, "papel", 20);
    await dar(char.id, "tinta_de_selo", 20);
    await dar(char.id, "madeira_reforcada", 20);

    for (const id of ["aco", "tinta_de_selo", "pergaminho_arsenal", "lamen"]) {
      const outcome = await crafting.craftPersonal(char.id, id);
      expect(outcome.ok, id).toBe(false);
    }
    // Nada foi consumido nem produzido.
    expect(await qtd(char.id, "lingote_ferro")).toBe(20);
    expect(await qtd(char.id, "aco")).toBe(0);
    expect(await qtd(char.id, "pergaminho_arsenal")).toBe(0);
  });

  it("recusa quantidade inválida", async () => {
    const char = await novoNinja();
    expect((await crafting.craftPersonal(char.id, "papel", 0)).ok).toBe(false);
    expect((await crafting.craftPersonal(char.id, "papel", -1)).ok).toBe(false);
  });
});

describe("comer", () => {
  it("consome o alimento e sobe a saciedade, limitada a 100", async () => {
    const char = await novoNinja();
    await prisma.characterEconomyState.create({ data: { charId: char.id, satiety: 50 } });
    await dar(char.id, "pao", 2);

    const outcome = await eating.eatFood(char.id, "pao", 1);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.satiety).toBe(66);
    expect(await qtd(char.id, "pao")).toBe(1);
  });

  it("não passa de 100 mesmo comendo demais", async () => {
    const char = await novoNinja();
    await prisma.characterEconomyState.create({ data: { charId: char.id, satiety: 90 } });
    await dar(char.id, "lamen", 1);

    const outcome = await eating.eatFood(char.id, "lamen", 1);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.satiety).toBe(100);
  });

  it("recusa item que não é comida e não consome nada", async () => {
    const char = await novoNinja();
    await dar(char.id, "kunai", 1);

    expect((await eating.eatFood(char.id, "kunai")).ok).toBe(false);
    expect(await qtd(char.id, "kunai")).toBe(1);
  });

  it("recusa comer sem ter o alimento", async () => {
    const char = await novoNinja();
    await prisma.characterEconomyState.create({ data: { charId: char.id, satiety: 10 } });

    expect((await eating.eatFood(char.id, "pao")).ok).toBe(false);
  });
});

describe("isolamento do imposto semanal", () => {
  it("coleta, craft e comida não aumentam o acumulador tributável", async () => {
    const char = await novoNinja();
    await prisma.characterEconomyState.create({ data: { charId: char.id, satiety: 10 } });

    await gathering.performGathering(char.id, MONTANHA, "MINERAR", { villageId: "KONOHA" });
    await dar(char.id, "grao", 2);
    await crafting.craftPersonal(char.id, "farinha");
    await dar(char.id, "fruta", 1);
    await eating.eatFood(char.id, "fruta");

    expect(await prisma.weeklyTaxActivity.count({ where: { charId: char.id } })).toBe(0);
    // E nada disso move Ryō nem entra no livro-caixa.
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(0);
    expect(await prisma.villageLedger.count({ where: { charId: char.id } })).toBe(0);
  });
});
