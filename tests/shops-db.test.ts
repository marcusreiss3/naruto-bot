// Aceites da etapa 05: compra, venda, abastecimento, produção municipal,
// contrato de atacado, obra do Ichiraku e criação do canal de RP.
// Mesmo padrão dos outros testes de integração: SQLite descartável.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Client } from "discord.js";
import { ICHIRAKU_CATEGORY_BY_VILLAGE, ICHIRAKU_CHANNEL_NAME } from "../src/data/villages.js";

const dir = mkdtempSync(join(tmpdir(), "naruto-loja-"));
const dbPath = join(dir, "loja.db");
process.env.DATABASE_URL = `file:${dbPath}`;

let prisma: PrismaClient;
let shops: typeof import("../src/services/economy/shop-service.js");
let constructions: typeof import("../src/services/economy/constructions.js");
let canal: typeof import("../src/services/economy/ichiraku-channel.js");
let villageEconomy: typeof import("../src/services/economy/village-economy.js");
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
async function novoNinja(opts: { ryo?: number; villageId?: string } = {}) {
  seq += 1;
  const char = await prisma.userCharacter.create({
    data: {
      discordId: `u${seq}`,
      guildId: "g",
      name: `Ninja ${seq}`,
      ryo: opts.ryo ?? 0,
      villageId: opts.villageId ?? "KONOHA",
    },
  });
  await prisma.characterEconomyState.create({ data: { charId: char.id } });
  return char;
}

async function dar(charId: string, itemId: string, qty: number) {
  await prisma.$transaction((tx) => inventory.addInventoryItem(tx, charId, itemId, qty));
}
async function qtd(charId: string, itemId: string) {
  return prisma.$transaction((tx) => inventory.getInventoryQty(tx, charId, itemId));
}
async function cofreDe(villageId = "KONOHA") {
  return prisma.village.findUniqueOrThrow({ where: { id: villageId } });
}
async function lojaDe(shopType: string, villageId = "KONOHA") {
  return prisma.villageShop.findUniqueOrThrow({
    where: { villageId_shopType: { villageId, shopType } },
  });
}
async function estoqueLoja(shopType: string, itemId: string, villageId = "KONOHA") {
  const shop = await lojaDe(shopType, villageId);
  const row = await prisma.villageShopStock.findUnique({
    where: { shopId_itemId: { shopId: shop.id, itemId } },
  });
  return row?.qty ?? 0;
}
// Coloca produto no estoque da loja sem passar pelo fluxo de compra/produção.
async function semear(shopType: string, itemId: string, qty: number, villageId = "KONOHA") {
  const shop = await lojaDe(shopType, villageId);
  await prisma.villageShopStock.upsert({
    where: { shopId_itemId: { shopId: shop.id, itemId } },
    create: { shopId: shop.id, itemId, name: itemId, qty },
    update: { qty },
  });
  const total = await prisma.villageShopStock.aggregate({
    where: { shopId: shop.id },
    _sum: { qty: true },
  });
  await prisma.villageShop.update({
    where: { id: shop.id },
    data: { stockUnits: total._sum.qty ?? 0 },
  });
}
async function centralPor(itemId: string, qty: number, villageId = "KONOHA") {
  await prisma.villageStock.upsert({
    where: { villageId_itemId: { villageId, itemId } },
    create: { villageId, itemId, name: itemId, qty },
    update: { qty },
  });
}

beforeAll(async () => {
  pushSchema();
  prisma = (await import("../src/db/client.js")).prisma;
  shops = await import("../src/services/economy/shop-service.js");
  constructions = await import("../src/services/economy/constructions.js");
  canal = await import("../src/services/economy/ichiraku-channel.js");
  villageEconomy = await import("../src/services/economy/village-economy.js");
  inventory = await import("../src/services/characters/inventory.js");
  await villageEconomy.ensureVillages();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Zera tudo que uma etapa anterior pode ter deixado. A população ativa sai de
  // consultas nestas tabelas, então sobras vazam de um teste para outro.
  await prisma.villageShopStock.deleteMany();
  await prisma.villageShop.deleteMany();
  await prisma.villageConstruction.deleteMany();
  await prisma.villageStock.deleteMany();
  await prisma.villageLedger.deleteMany();
  await prisma.discordUiSession.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.characterEconomyState.deleteMany();
  await prisma.userCharacter.deleteMany();
  await prisma.village.updateMany({
    data: { treasuryRyo: 0, reservedRyo: 0, constructionSlotsUsed: 0, taxRate: 0.05 },
  });
  await shops.ensureVillageShops();
});

// ---------------- Fundação ----------------

describe("seed das lojas", () => {
  it("cria seis lojas por vila, só o Ichiraku bloqueado", async () => {
    const konoha = await prisma.villageShop.findMany({ where: { villageId: "KONOHA" } });
    expect(konoha).toHaveLength(6);
    expect(konoha.filter((s) => s.status === "LOCKED").map((s) => s.shopType)).toEqual(["ICHIRAKU"]);
    expect(await prisma.villageShop.count()).toBe(30);
  });

  it("é idempotente e não devolve um Ichiraku aberto para bloqueado", async () => {
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE", discordChannelId: "c1" },
    });

    const criadas = await shops.ensureVillageShops();

    expect(criadas).toBe(0);
    const ichiraku = await lojaDe("ICHIRAKU");
    expect(ichiraku.status).toBe("ACTIVE");
    expect(ichiraku.discordChannelId).toBe("c1");
  });
});

// ---------------- Compra do jogador ----------------

describe("compra comum", () => {
  it("comprar um Lámen reduz estoque e Ryō do jogador, mas o cofre não muda", async () => {
    const char = await novoNinja({ ryo: 100 });
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE" },
    });
    await semear("ICHIRAKU", "lamen", 3);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 5000 } });

    const r = await shops.buyFromShop(char.id, "KONOHA", "ICHIRAKU", "lamen", 1, "u1");

    expect(r.ok && r.total).toBe(51); // teto(48 × 1,05)
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(49);
    expect(await estoqueLoja("ICHIRAKU", "lamen")).toBe(2);
    expect(await qtd(char.id, "lamen")).toBe(1);
    // O acréscimo do imposto some da circulação; não é receita da vila.
    expect((await cofreDe()).treasuryRyo).toBe(5000);
  });

  it("dois cliques para comprar o último item não vendem duas unidades", async () => {
    const char = await novoNinja({ ryo: 1000 });
    await semear("FUNDICAO", "kunai", 1);

    const comprar = () =>
      shops.buyFromShop(char.id, "KONOHA", "FUNDICAO", "kunai", 1, "u1").then((r) => r.ok);
    const [a, b] = await Promise.all([comprar(), comprar()]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await estoqueLoja("FUNDICAO", "kunai")).toBe(0);
    expect(await qtd(char.id, "kunai")).toBe(1);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(963);
  });

  it("sem Ryō suficiente não tira o item do estoque", async () => {
    const char = await novoNinja({ ryo: 10 });
    await semear("FUNDICAO", "kunai", 5);

    const r = await shops.buyFromShop(char.id, "KONOHA", "FUNDICAO", "kunai", 1, "u1");

    expect(r.ok).toBe(false);
    expect(await estoqueLoja("FUNDICAO", "kunai")).toBe(5);
  });

  it("dívida não compra", async () => {
    const char = await novoNinja({ ryo: -62 });
    await semear("FUNDICAO", "kunai", 5);

    const r = await shops.buyFromShop(char.id, "KONOHA", "FUNDICAO", "kunai", 1, "u1");

    expect(r.ok).toBe(false);
  });

  it("loja errada não vende, nem com o item em estoque", async () => {
    const char = await novoNinja({ ryo: 1000 });
    // Estoque forjado: alguém abasteceu a Marcenaria com kunai.
    await semear("MARCENARIA", "kunai", 5);

    const r = await shops.buyFromShop(char.id, "KONOHA", "MARCENARIA", "kunai", 1, "u1");

    expect(r.ok).toBe(false);
    expect(await estoqueLoja("MARCENARIA", "kunai")).toBe(5);
  });

  it("loja bloqueada não vende", async () => {
    const char = await novoNinja({ ryo: 1000 });
    await semear("ICHIRAKU", "lamen", 5);

    const r = await shops.buyFromShop(char.id, "KONOHA", "ICHIRAKU", "lamen", 1, "u1");

    expect(r.ok).toBe(false);
    expect(await estoqueLoja("ICHIRAKU", "lamen")).toBe(5);
  });
});

// ---------------- Venda do jogador ----------------

describe("venda de ingrediente à loja", () => {
  it("três Carnes ao Ichiraku com 5% pagam 8 Ryō cada", async () => {
    const char = await novoNinja();
    await dar(char.id, "carne_crua", 3);
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE" },
    });
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    const r = await shops.sellToShop(char.id, "KONOHA", "ICHIRAKU", "carne_crua", 3, "u1");

    expect(r.ok && r.precoUnitario).toBe(8);
    expect(r.ok && r.total).toBe(24);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(24);
    expect(await qtd(char.id, "carne_crua")).toBe(0);
    expect(await estoqueLoja("ICHIRAKU", "carne_crua")).toBe(3);
    // O Ryō sai do cofre: a loja compra com dinheiro da vila.
    expect((await cofreDe()).treasuryRyo).toBe(976);
  });

  it("cofre sem Ryō livre recusa e não tira o item do ninja", async () => {
    const char = await novoNinja();
    await dar(char.id, "madeira", 5);
    await prisma.village.update({
      where: { id: "KONOHA" },
      // 100 no cofre, 100 reservados para uma obra: nada livre.
      data: { treasuryRyo: 100, reservedRyo: 100 },
    });

    const r = await shops.sellToShop(char.id, "KONOHA", "MARCENARIA", "madeira", 5, "u1");

    expect(r.ok).toBe(false);
    expect(await qtd(char.id, "madeira")).toBe(5);
    expect((await cofreDe()).treasuryRyo).toBe(100);
  });

  it("orçamento diário esgotado recusa a venda seguinte", async () => {
    const char = await novoNinja();
    await dar(char.id, "madeira", 500);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 100_000 } });
    // Vila sem população ativa: fator mínimo 0,30 -> orçamento de 150 Ryō/dia.
    const primeira = await shops.sellToShop(char.id, "KONOHA", "MARCENARIA", "madeira", 37, "u1");
    expect(primeira.ok && primeira.total).toBe(148);

    const segunda = await shops.sellToShop(char.id, "KONOHA", "MARCENARIA", "madeira", 5, "u1");

    expect(segunda.ok).toBe(false);
    expect((await lojaDe("MARCENARIA")).dailyBudgetSpent).toBe(148);
  });

  it("capacidade da loja recusa o que não cabe", async () => {
    const char = await novoNinja();
    await dar(char.id, "madeira", 20);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 100_000 } });
    const shop = await lojaDe("MARCENARIA");
    await prisma.villageShop.update({
      where: { id: shop.id },
      data: { capacity: 500, stockUnits: 495 },
    });

    const r = await shops.sellToShop(char.id, "KONOHA", "MARCENARIA", "madeira", 20, "u1");

    expect(r.ok).toBe(false);
    expect(await qtd(char.id, "madeira")).toBe(20);
  });

  it("a loja não compra o que não está na tabela dela", async () => {
    const char = await novoNinja();
    await dar(char.id, "carne_crua", 5);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    const r = await shops.sellToShop(char.id, "KONOHA", "MARCENARIA", "carne_crua", 1, "u1");

    expect(r.ok).toBe(false);
    expect(await qtd(char.id, "carne_crua")).toBe(5);
  });

  it("recompra de emergência do Mercado Geral paga 30% e não toca o cofre", async () => {
    const char = await novoNinja();
    await dar(char.id, "madeira_reforcada", 1);
    await dar(char.id, "carne_crua", 4);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    const raro = await shops.sellToGeneralMarket(char.id, "madeira_reforcada", 1);
    const comum = await shops.sellToGeneralMarket(char.id, "carne_crua", 4);

    expect(raro.ok).toBe(false); // raro nunca é comprado por loja
    expect(comum.ok && comum.precoUnitario).toBe(2); // piso(9 × 0,30)
    expect((await cofreDe()).treasuryRyo).toBe(1000);
  });
});

// ---------------- Abastecimento e retirada ----------------

describe("abastecimento pelo Kage", () => {
  it("move do estoque central para o da loja sem pagar ninguém", async () => {
    await centralPor("carne_crua", 36);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    const r = await shops.restockShop("KONOHA", "EMPORIO", "carne_crua", 12, "kage1");

    expect(r.ok && r.central).toBe(24);
    expect(r.ok && r.loja).toBe(12);
    expect((await cofreDe()).treasuryRyo).toBe(1000);
    const lancamento = await prisma.villageLedger.findFirst({ where: { type: "SHOP_RESTOCK" } });
    expect(lancamento?.ryoDelta).toBe(0);
  });

  it("retirada devolve ao central e exige motivo", async () => {
    await semear("EMPORIO", "pao", 10);

    const curto = await shops.withdrawShopProduct("KONOHA", "EMPORIO", "pao", 2, "eve", "kage1");
    const ok = await shops.withdrawShopProduct(
      "KONOHA",
      "EMPORIO",
      "pao",
      2,
      "distribuição no festival da vila",
      "kage1",
    );

    expect(curto.ok).toBe(false);
    expect(ok.ok && ok.loja).toBe(8);
    expect(ok.ok && ok.central).toBe(2);
  });
});

// ---------------- Produção municipal ----------------

describe("produção municipal", () => {
  it("o Ichiraku produz Lámen consumindo o estoque da loja", async () => {
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE" },
    });
    for (const [itemId, q] of Object.entries({
      farinha: 3,
      caldo: 3,
      carne_crua: 3,
      agua_limpa: 3,
      tempero: 3,
    })) {
      await semear("ICHIRAKU", itemId, q);
    }

    const r = await shops.shopCraft({
      villageId: "KONOHA",
      shopType: "ICHIRAKU",
      recipeId: "lamen",
      vezes: 3,
      origem: "SHOP",
      actorDiscordId: "kage1",
    });

    expect(r.ok && r.produzido).toBe(3);
    expect(await estoqueLoja("ICHIRAKU", "lamen")).toBe(3);
    expect(await estoqueLoja("ICHIRAKU", "farinha")).toBe(0);
    expect(await estoqueLoja("ICHIRAKU", "carne_crua")).toBe(0);
  });

  it("usa o estoque central quando o Kage escolhe, e respeita a preferência", async () => {
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE" },
    });
    for (const [itemId, q] of Object.entries({
      farinha: 2,
      caldo: 2,
      carne_crua: 2,
      peixe_cru: 2,
      agua_limpa: 2,
      tempero: 2,
    })) {
      await centralPor(itemId, q);
    }

    const r = await shops.shopCraft({
      villageId: "KONOHA",
      shopType: "ICHIRAKU",
      recipeId: "lamen",
      vezes: 1,
      origem: "CENTRAL",
      actorDiscordId: "kage1",
      preferido: "peixe_cru",
    });

    expect(r.ok && r.consumido.map((i) => i.itemId)).toContain("peixe_cru");
    expect(await estoqueLoja("ICHIRAKU", "lamen")).toBe(1);
    // O produto entra na loja; o insumo saiu do central.
    const central = await prisma.villageStock.findUnique({
      where: { villageId_itemId: { villageId: "KONOHA", itemId: "peixe_cru" } },
    });
    expect(central?.qty).toBe(1);
  });

  it("faltando um insumo não consome nada", async () => {
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE" },
    });
    for (const itemId of ["farinha", "caldo", "carne_crua", "agua_limpa"]) {
      await semear("ICHIRAKU", itemId, 1);
    }
    // Sem tempero.
    const r = await shops.shopCraft({
      villageId: "KONOHA",
      shopType: "ICHIRAKU",
      recipeId: "lamen",
      vezes: 1,
      origem: "SHOP",
      actorDiscordId: "kage1",
    });

    expect(r.ok).toBe(false);
    expect(await estoqueLoja("ICHIRAKU", "farinha")).toBe(1);
    expect(await estoqueLoja("ICHIRAKU", "caldo")).toBe(1);
  });

  it("receita de outra loja não é produzida nem com id forjado", async () => {
    for (const itemId of ["farinha", "caldo", "carne_crua", "agua_limpa", "tempero"]) {
      await semear("MARCENARIA", itemId, 5);
    }

    const lamenNaMarcenaria = await shops.shopCraft({
      villageId: "KONOHA",
      shopType: "MARCENARIA",
      recipeId: "lamen",
      vezes: 1,
      origem: "SHOP",
      actorDiscordId: "kage1",
    });
    const pessoalNaFundicao = await shops.shopCraft({
      villageId: "KONOHA",
      shopType: "FUNDICAO",
      recipeId: "lingote_ferro", // receita de /craft pessoal
      vezes: 1,
      origem: "SHOP",
      actorDiscordId: "kage1",
    });

    expect(lamenNaMarcenaria.ok).toBe(false);
    expect(pessoalNaFundicao.ok).toBe(false);
    expect(await estoqueLoja("MARCENARIA", "farinha")).toBe(5);
  });

  it("/craft pessoal continua sem enxergar receita municipal", async () => {
    const crafting = await import("../src/services/economy/crafting.js");
    const char = await novoNinja();
    for (const [itemId, q] of Object.entries({
      farinha: 5,
      caldo: 5,
      carne_crua: 5,
      agua_limpa: 5,
      tempero: 5,
    })) {
      await dar(char.id, itemId, q);
    }

    const r = await crafting.craftPersonal(char.id, "lamen", 1);

    expect(r.ok).toBe(false);
    expect(await qtd(char.id, "farinha")).toBe(5);
  });
});

// ---------------- Oficina de Selos ----------------

describe("escassez do Pergaminho de Arsenal", () => {
  async function abastecerOficina(vezes: number) {
    await semear("OFICINA_SELOS", "papel", 8 * vezes);
    await semear("OFICINA_SELOS", "tinta_de_selo", 2 * vezes);
    await semear("OFICINA_SELOS", "madeira_reforcada", vezes);
    await semear("OFICINA_SELOS", "erva_medicinal", vezes);
  }
  const produzir = (vezes = 1, now?: Date) =>
    shops.shopCraft({
      villageId: "KONOHA",
      shopType: "OFICINA_SELOS",
      recipeId: "pergaminho_arsenal",
      vezes,
      origem: "SHOP",
      actorDiscordId: "kage1",
      now,
    });

  it("sem Madeira Reforçada não produz", async () => {
    await semear("OFICINA_SELOS", "papel", 8);
    await semear("OFICINA_SELOS", "tinta_de_selo", 2);
    await semear("OFICINA_SELOS", "erva_medicinal", 1);

    const r = await produzir();

    expect(r.ok).toBe(false);
    expect(await estoqueLoja("OFICINA_SELOS", "papel")).toBe(8);
  });

  it("para no terceiro da competência e volta a permitir depois do reset", async () => {
    await abastecerOficina(4);
    const semanaA = new Date("2026-08-11T12:00:00Z");
    const semanaB = new Date("2026-08-19T12:00:00Z");

    const tres = await produzir(3, semanaA);
    const quarto = await produzir(1, semanaA);
    const depoisDoReset = await produzir(1, semanaB);

    expect(tres.ok && tres.produzido).toBe(3);
    expect(tres.ok && tres.restanteNaSemana).toBe(0);
    expect(quarto.ok).toBe(false);
    expect(depoisDoReset.ok).toBe(true);
    expect(await estoqueLoja("OFICINA_SELOS", "pergaminho_arsenal")).toBe(4);
  });

  it("o contador sobrevive a reinício: fica no banco, não no processo", async () => {
    await abastecerOficina(3);
    const agora = new Date("2026-08-11T12:00:00Z");
    await produzir(2, agora);

    const shop = await lojaDe("OFICINA_SELOS");

    expect(shop.weeklyCraftCount).toBe(2);
    expect(shop.weeklyCraftKey).toBe("2026-08-09");
    expect((await shops.sealScrollsLeft("KONOHA", agora)).feitos).toBe(2);
  });

  it("dois pedidos simultâneos não passam do limite", async () => {
    await abastecerOficina(4);
    const agora = new Date("2026-08-11T12:00:00Z");
    await produzir(2, agora);

    const [a, b] = await Promise.all([produzir(1, agora), produzir(1, agora)]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await lojaDe("OFICINA_SELOS")).weeklyCraftCount).toBe(3);
  });
});

// ---------------- Contrato de atacado ----------------

describe("contrato de empreendedor NPC", () => {
  beforeEach(async () => {
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE" },
    });
  });

  it("só conclui com o lote completo", async () => {
    await semear("ICHIRAKU", "lamen", 9);

    const r = await shops.acceptWholesaleContract("KONOHA", "ichiraku_lamen", "kage1");

    expect(r.ok).toBe(false);
    expect(await estoqueLoja("ICHIRAKU", "lamen")).toBe(9);
    expect((await cofreDe()).treasuryRyo).toBe(0);
  });

  it("entra 420 Ryō uma vez e não repete antes do reset diário", async () => {
    await semear("ICHIRAKU", "lamen", 20);
    const dia = new Date("2026-08-11T12:00:00Z");

    const primeiro = await shops.acceptWholesaleContract("KONOHA", "ichiraku_lamen", "kage1", dia);
    const segundo = await shops.acceptWholesaleContract("KONOHA", "ichiraku_lamen", "kage1", dia);
    const amanha = await shops.acceptWholesaleContract(
      "KONOHA",
      "ichiraku_lamen",
      "kage1",
      new Date("2026-08-12T12:00:00Z"),
    );

    expect(primeiro.ok && primeiro.valor).toBe(420);
    expect(segundo.ok).toBe(false);
    expect(amanha.ok).toBe(true);
    expect((await cofreDe()).treasuryRyo).toBe(840);
    expect(await estoqueLoja("ICHIRAKU", "lamen")).toBe(0);
  });

  it("credita o cofre exatamente uma vez por contrato", async () => {
    await semear("ICHIRAKU", "lamen", 10);

    await shops.acceptWholesaleContract("KONOHA", "ichiraku_lamen", "kage1");

    const lancamentos = await prisma.villageLedger.findMany({
      where: { type: "SHOP_WHOLESALE_CONTRACT" },
    });
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0]?.ryoDelta).toBe(420);
  });

  it("dois cliques simultâneos vendem um lote só", async () => {
    await semear("ICHIRAKU", "lamen", 20);
    const dia = new Date("2026-08-11T12:00:00Z");

    const [a, b] = await Promise.all([
      shops.acceptWholesaleContract("KONOHA", "ichiraku_lamen", "kage1", dia),
      shops.acceptWholesaleContract("KONOHA", "ichiraku_lamen", "kage1", dia),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await cofreDe()).treasuryRyo).toBe(420);
    expect(await estoqueLoja("ICHIRAKU", "lamen")).toBe(10);
  });
});

// ---------------- Obra do Ichiraku ----------------

describe("construção do Ichiraku", () => {
  async function prepararObra() {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 10_000 } });
    // Vila vazia: fator 0,30 -> 2.250 Ryō, 90 madeira, 54 pedra, 48 grão.
    await centralPor("madeira", 200);
    await centralPor("pedra", 200);
    await centralPor("grao", 200);
  }

  it("desconta cofre e estoque uma vez e trava a loja em obras", async () => {
    await prepararObra();

    const r = await constructions.startIchiraku("KONOHA", "kage1");

    expect(r.ok).toBe(true);
    expect(r.ok && r.custo.ryo).toBe(2250);
    expect((await cofreDe()).treasuryRyo).toBe(7750);
    expect((await lojaDe("ICHIRAKU")).status).toBe("CONSTRUCTING");
    expect((await cofreDe()).constructionSlotsUsed).toBe(1);
  });

  it("dois cliques iniciam só uma obra e descontam uma vez", async () => {
    await prepararObra();

    const [a, b] = await Promise.all([
      constructions.startIchiraku("KONOHA", "kage1"),
      constructions.startIchiraku("KONOHA", "kage1"),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await prisma.villageConstruction.count({ where: { villageId: "KONOHA" } })).toBe(1);
    expect((await cofreDe()).treasuryRyo).toBe(7750);
    expect((await cofreDe()).constructionSlotsUsed).toBe(1);
  });

  it("cofre insuficiente não deixa a loja em obras nem ocupa vaga", async () => {
    await centralPor("madeira", 200);
    await centralPor("pedra", 200);
    await centralPor("grao", 200);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 10 } });

    const r = await constructions.startIchiraku("KONOHA", "kage1");

    expect(r.ok).toBe(false);
    expect((await lojaDe("ICHIRAKU")).status).toBe("LOCKED");
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
  });

  it("estoque insuficiente devolve tudo, inclusive o Ryō já debitado", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 10_000 } });
    await centralPor("madeira", 200);
    await centralPor("pedra", 200);
    // Sem grão.
    const r = await constructions.startIchiraku("KONOHA", "kage1");

    expect(r.ok).toBe(false);
    expect((await cofreDe()).treasuryRyo).toBe(10_000);
    expect((await lojaDe("ICHIRAKU")).status).toBe("LOCKED");
  });

  it("conclui uma vez, libera a vaga e deixa a loja aguardando canal", async () => {
    await prepararObra();
    await constructions.startIchiraku("KONOHA", "kage1");
    const depois = new Date(Date.now() + 6 * 24 * 3_600_000);

    const primeira = await constructions.completeFinishedConstructions(depois);
    const segunda = await constructions.completeFinishedConstructions(depois);

    expect(primeira).toHaveLength(1);
    expect(segunda).toHaveLength(0);
    expect((await lojaDe("ICHIRAKU")).status).toBe("AWAITING_CHANNEL");
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
  });

  it("não conclui antes do prazo", async () => {
    await prepararObra();
    await constructions.startIchiraku("KONOHA", "kage1");

    expect(await constructions.completeFinishedConstructions(new Date())).toHaveLength(0);
    expect((await lojaDe("ICHIRAKU")).status).toBe("CONSTRUCTING");
  });
});

// ---------------- Canal de RP do Ichiraku ----------------

// Cliente falso: só o suficiente para syncIchirakuChannel. Guarda os canais
// criados para o teste conferir que não houve duplicata.
function clienteFalso(opts: { falhaAoCriar?: string } = {}) {
  const categoriaId = ICHIRAKU_CATEGORY_BY_VILLAGE.KONOHA;
  const canais = new Map<string, Record<string, unknown>>();
  const criados: string[] = [];

  const guild: Record<string, unknown> = {
    channels: {
      cache: { find: (fn: (c: unknown) => boolean) => [...canais.values()].find(fn) },
      create: async (data: { name: string; parent: string }) => {
        if (opts.falhaAoCriar) throw new Error(opts.falhaAoCriar);
        const id = `canal${canais.size + 1}`;
        const canalNovo = { id, name: data.name, parentId: data.parent, type: 0, guild };
        canais.set(id, canalNovo);
        criados.push(id);
        return canalNovo;
      },
    },
  };
  const categoria = {
    id: categoriaId,
    type: 4, // ChannelType.GuildCategory
    guild,
    permissionOverwrites: { cache: { map: () => [] } },
  };

  const client = {
    channels: {
      fetch: async (id: string) => (id === categoriaId ? categoria : (canais.get(id) ?? null)),
    },
  } as unknown as Client;

  return { client, criados, canais };
}

describe("canal de RP do Ichiraku", () => {
  beforeEach(async () => {
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "AWAITING_CHANNEL", discordChannelId: null },
    });
  });

  it("cria um canal com o nome exato, persiste o id e só então abre a loja", async () => {
    const fake = clienteFalso();

    const r = await canal.syncIchirakuChannel(fake.client, "KONOHA");

    expect(r.status).toBe("CREATED");
    expect(fake.criados).toHaveLength(1);
    expect(fake.canais.get(r.channelId!)?.name).toBe(ICHIRAKU_CHANNEL_NAME);
    const shop = await lojaDe("ICHIRAKU");
    expect(shop.status).toBe("ACTIVE");
    expect(shop.discordChannelId).toBe(r.channelId);
  });

  it("rodar de novo não cria um segundo canal", async () => {
    const fake = clienteFalso();
    await canal.syncIchirakuChannel(fake.client, "KONOHA");

    const segunda = await canal.syncIchirakuChannel(fake.client, "KONOHA");

    expect(segunda.status).toBe("ALREADY_ACTIVE");
    expect(fake.criados).toHaveLength(1);
  });

  it("reaproveita o canal existente quando o id se perdeu do banco", async () => {
    const fake = clienteFalso();
    const primeira = await canal.syncIchirakuChannel(fake.client, "KONOHA");
    // Simula banco restaurado sem o id, com o canal ainda vivo no Discord.
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { discordChannelId: null, status: "AWAITING_CHANNEL" },
    });

    const segunda = await canal.syncIchirakuChannel(fake.client, "KONOHA");

    expect(segunda.status).toBe("REUSED");
    expect(segunda.channelId).toBe(primeira.channelId);
    expect(fake.criados).toHaveLength(1);
  });

  it("falta de permissão deixa AWAITING_CHANNEL, não cobra de novo e pode ser retomada", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 5000 } });
    const semPermissao = clienteFalso({ falhaAoCriar: "Missing Permissions" });

    const falhou = await canal.syncIchirakuChannel(semPermissao.client, "KONOHA");

    expect(falhou.status).toBe("NO_PERMISSION");
    expect((await lojaDe("ICHIRAKU")).status).toBe("AWAITING_CHANNEL");
    expect((await cofreDe()).treasuryRyo).toBe(5000);

    const comPermissao = clienteFalso();
    const retomada = await canal.syncIchirakuChannel(comPermissao.client, "KONOHA");

    expect(retomada.status).toBe("CREATED");
    expect((await lojaDe("ICHIRAKU")).status).toBe("ACTIVE");
  });

  it("loja bloqueada não tenta criar canal nenhum", async () => {
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "LOCKED" },
    });
    const fake = clienteFalso();

    const r = await canal.syncIchirakuChannel(fake.client, "KONOHA");

    expect(r.status).toBe("NOT_PENDING");
    expect(fake.criados).toHaveLength(0);
  });

  it("o canal criado vira local válido de /loja para a vila certa", async () => {
    const fake = clienteFalso();
    const r = await canal.syncIchirakuChannel(fake.client, "KONOHA");

    expect(await canal.villageFromIchirakuChannel(r.channelId!)).toBe("KONOHA");
    expect(await canal.villageFromIchirakuChannel("outro")).toBeNull();
    expect(await canal.ichirakuChannelOf("KONOHA")).toBe(r.channelId);
    expect(await canal.ichirakuChannelOf("SUNA")).toBeNull();
  });
});

// ---------------- Roteamento dos componentes ----------------

describe("roteamento do painel", () => {
  it("o customId de /loja chega ao handler de /loja", async () => {
    const { commandMap } = await import("../src/commands/index.js");
    // O dispatcher global usa o primeiro trecho do customId como nome.
    const nome = "loja:v1:buy:abc123".split(":")[0];

    const cmd = commandMap.get(nome!);

    expect(cmd).toBeDefined();
    expect(cmd?.handleButton).toBeTypeOf("function");
    expect(cmd?.handleSelect).toBeTypeOf("function");
    expect(cmd?.handleModal).toBeTypeOf("function");
  });

  it("prefixo errado não chega a comando nenhum", async () => {
    const { commandMap } = await import("../src/commands/index.js");
    for (const forjado of ["shop:v1:buy:abc", "store:buy", "loja2:v1:buy"]) {
      expect(commandMap.get(forjado.split(":")[0]!), forjado).toBeUndefined();
    }
  });

  it("a aba Comércio de /vila responde pelo mesmo comando /vila", async () => {
    const { commandMap } = await import("../src/commands/index.js");
    expect(commandMap.get("vila:com:abastecer:EMPORIO".split(":")[0]!)).toBeDefined();
  });
});

// ---------------- Sessão do painel ----------------

describe("sessão do painel", () => {
  it("recusa painel de outra pessoa e painel vencido", async () => {
    const sessions = await import("../src/services/economy/ui-session.js");
    const char = await novoNinja();
    const agora = new Date("2026-08-11T12:00:00Z");
    const s = await sessions.createSession(
      {
        ownerDiscordId: "dono",
        guildId: "g",
        channelId: "c",
        villageId: "KONOHA",
        charId: char.id,
      },
      agora,
    );

    await expect(sessions.requireSession(s.id, "intruso", agora)).rejects.toThrow();
    await expect(
      sessions.requireSession(s.id, "dono", new Date(agora.getTime() + 16 * 60_000)),
    ).rejects.toThrow();
    await expect(sessions.requireSession(s.id, "dono", agora)).resolves.toBeTruthy();
  });

  it("não guarda saldo, preço nem permissão", async () => {
    const sessions = await import("../src/services/economy/ui-session.js");
    const char = await novoNinja({ ryo: 999 });
    const s = await sessions.createSession({
      ownerDiscordId: "dono",
      guildId: "g",
      channelId: "c",
      villageId: "KONOHA",
      charId: char.id,
    });

    const gravado = await prisma.discordUiSession.findUniqueOrThrow({ where: { id: s.id } });

    expect(gravado.dataJson).toBe("{}");
    expect(JSON.stringify(gravado)).not.toContain("999");
    // Não existe campo de permissão na sessão: quem pode administrar loja é
    // decidido a cada clique, nunca lido de um dado guardado.
    expect(Object.keys(gravado)).not.toContain("admin");
    expect(Object.keys(gravado).some((k) => /kage|admin|perm/i.test(k))).toBe(false);
  });
});
