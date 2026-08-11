// Testes de integracao da fundacao economica.
//
// O resto da suite e' puro (ver CLAUDE.md), mas as garantias desta etapa SAO o
// banco: unicidade da pilha, retirada que nao passa do saldo, ledger append-only.
// Testar isso com mock provaria so' que o mock funciona. Entao aqui subimos um
// SQLite descartavel e falamos com ele de verdade.
//
// Nada e' importado estaticamente de src/: DATABASE_URL precisa estar apontando
// para o banco temporario ANTES de src/db/client.js ser avaliado.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

const dir = mkdtempSync(join(tmpdir(), "naruto-economy-"));
const dbPath = join(dir, "economy.db");
process.env.DATABASE_URL = `file:${dbPath}`;

type Inventory = typeof import("../src/services/characters/inventory.js");
type CharEconomy = typeof import("../src/services/economy/character-economy.js");
type VillageEconomy = typeof import("../src/services/economy/village-economy.js");

let prisma: PrismaClient;
let inventory: Inventory;
let charEconomy: CharEconomy;
let villageEconomy: VillageEconomy;
let getOrCreateCharacter: typeof import("../src/services/characters/character-service.js").getOrCreateCharacter;
let EconomyError: typeof import("../src/services/economy/errors.js").EconomyError;

// `prisma db push` le a URL do datasource; passar por env nao vence o .env do
// projeto, entao escrevemos um schema temporario com a URL literal.
function pushSchema(): void {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8").replace(
    'env("DATABASE_URL")',
    JSON.stringify(`file:${dbPath}`),
  );
  const schemaPath = join(dir, "schema.prisma");
  writeFileSync(schemaPath, schema);
  // Chama o entrypoint do CLI com `node` em vez de `npx`: no Windows, spawn de
  // .cmd sem shell da EINVAL.
  const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [cli, "db", "push", "--schema", schemaPath, "--skip-generate"], {
    stdio: "pipe",
  });
}

let charSeq = 0;
async function novoPersonagem() {
  charSeq += 1;
  return getOrCreateCharacter(`user-${charSeq}`, "guild-teste", `Ninja ${charSeq}`);
}

beforeAll(async () => {
  pushSchema();
  prisma = (await import("../src/db/client.js")).prisma;
  inventory = await import("../src/services/characters/inventory.js");
  charEconomy = await import("../src/services/economy/character-economy.js");
  villageEconomy = await import("../src/services/economy/village-economy.js");
  getOrCreateCharacter = (await import("../src/services/characters/character-service.js"))
    .getOrCreateCharacter;
  EconomyError = (await import("../src/services/economy/errors.js")).EconomyError;
  await villageEconomy.ensureVillages();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("personagem novo", () => {
  it("nasce Academia, com 100 de saciedade e 0 Ryō", async () => {
    const char = await novoPersonagem();
    expect(char.ninjaRank).toBe("ACADEMIA");
    expect(char.ryo).toBe(0);
    expect(char.economy?.satiety).toBe(100);
  });

  it("ganha estado econômico no primeiro acesso mesmo tendo sido criado antes da etapa", async () => {
    const char = await novoPersonagem();
    await prisma.characterEconomyState.delete({ where: { charId: char.id } });

    const recarregado = await getOrCreateCharacter(char.discordId, char.guildId, char.name);
    expect(recarregado.economy?.satiety).toBe(100);
  });
});

describe("unicidade da pilha de inventário", () => {
  it("impede uma segunda pilha do mesmo item para o mesmo personagem", async () => {
    const char = await novoPersonagem();
    await prisma.inventoryItem.create({ data: { charId: char.id, itemId: "kunai", name: "Kunai", qty: 2 } });

    await expect(
      prisma.inventoryItem.create({ data: { charId: char.id, itemId: "kunai", name: "Kunai", qty: 5 } }),
    ).rejects.toMatchObject({ code: "P2002" });

    const pilhas = await prisma.inventoryItem.findMany({ where: { charId: char.id, itemId: "kunai" } });
    expect(pilhas).toHaveLength(1);
  });

  it("acumula na mesma pilha em vez de criar outra", async () => {
    const char = await novoPersonagem();
    await prisma.$transaction((tx) => inventory.addInventoryItem(tx, char.id, "shuriken", 3));
    const total = await prisma.$transaction((tx) => inventory.addInventoryItem(tx, char.id, "shuriken", 4));

    expect(total).toBe(7);
    expect(await prisma.inventoryItem.count({ where: { charId: char.id, itemId: "shuriken" } })).toBe(1);
  });
});

describe("retirada de inventário", () => {
  it("recusa retirada maior que a quantidade e não altera nada", async () => {
    const char = await novoPersonagem();
    await prisma.$transaction((tx) => inventory.addInventoryItem(tx, char.id, "senbon", 2));

    const resultado = await inventory.consumeInventoryItem(char.id, "senbon", 3);
    expect(resultado.ok).toBe(false);
    expect(await prisma.$transaction((tx) => inventory.getInventoryQty(tx, char.id, "senbon"))).toBe(2);
  });

  it("duas retiradas concorrentes não consomem mais itens do que existem", async () => {
    const char = await novoPersonagem();
    await prisma.$transaction((tx) => inventory.addInventoryItem(tx, char.id, "papel_bomba", 3));

    const [a, b] = await Promise.all([
      inventory.consumeInventoryItem(char.id, "papel_bomba", 2),
      inventory.consumeInventoryItem(char.id, "papel_bomba", 2),
    ]);

    // Uma passa, a outra falha: 2 + 2 nao cabem em 3.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await prisma.$transaction((tx) => inventory.getInventoryQty(tx, char.id, "papel_bomba"))).toBe(1);
  });

  it("desequipa a arma quando a pilha zera", async () => {
    const char = await novoPersonagem();
    await prisma.$transaction((tx) => inventory.addInventoryItem(tx, char.id, "katana", 1));
    await inventory.equipInventoryItem(char.id, "katana");

    await inventory.consumeInventoryItem(char.id, "katana", 1);

    const depois = await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } });
    expect(depois.equippedItemId).toBeNull();
  });

  it("desfaz a transação inteira quando uma das retiradas falha", async () => {
    const char = await novoPersonagem();
    await prisma.$transaction((tx) => inventory.addInventoryItem(tx, char.id, "kunai", 1));
    // Sem papel bomba: a segunda retirada de prepareExplosiveKunai derruba tudo.

    const resultado = await inventory.prepareExplosiveKunai(char.id);

    expect(resultado.ok).toBe(false);
    expect(await prisma.$transaction((tx) => inventory.getInventoryQty(tx, char.id, "kunai"))).toBe(1);
    expect(
      await prisma.$transaction((tx) => inventory.getInventoryQty(tx, char.id, "kunai_explosiva")),
    ).toBe(0);
  });
});

describe("Ryō do personagem", () => {
  it("credita e debita com lançamento no livro-caixa", async () => {
    const char = await novoPersonagem();

    await prisma.$transaction((tx) =>
      charEconomy.grantCharacterRyo(tx, { charId: char.id, amount: 500, type: "MISSION_REWARD", reason: "teste" }),
    );
    const saldo = await prisma.$transaction((tx) =>
      charEconomy.spendCharacterRyo(tx, { charId: char.id, amount: 200, type: "NPC_SALE", reason: "teste" }),
    );

    expect(saldo).toBe(300);
    const lancamentos = await prisma.villageLedger.findMany({
      where: { charId: char.id },
      orderBy: { createdAt: "asc" },
    });
    expect(lancamentos.map((l) => l.ryoDelta)).toEqual([500, -200]);
  });

  it("recusa gasto sem saldo e não deixa o Ryō negativo", async () => {
    const char = await novoPersonagem();
    await prisma.$transaction((tx) =>
      charEconomy.grantCharacterRyo(tx, { charId: char.id, amount: 50, type: "MISSION_REWARD", reason: "teste" }),
    );

    await expect(
      prisma.$transaction((tx) =>
        charEconomy.spendCharacterRyo(tx, { charId: char.id, amount: 80, type: "NPC_SALE", reason: "teste" }),
      ),
    ).rejects.toBeInstanceOf(EconomyError);

    const depois = await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } });
    expect(depois.ryo).toBe(50);
  });

  it("impede gasto de quem está em dívida", async () => {
    const char = await novoPersonagem();
    // Divida so' pode nascer da cobranca tributaria (etapa 2); aqui simulamos
    // o estado final direto no banco para provar o bloqueio do helper.
    await prisma.userCharacter.update({ where: { id: char.id }, data: { ryo: -62 } });

    await expect(
      prisma.$transaction((tx) =>
        charEconomy.spendCharacterRyo(tx, { charId: char.id, amount: 1, type: "NPC_SALE", reason: "teste" }),
      ),
    ).rejects.toBeInstanceOf(EconomyError);
  });
});

describe("cofre da vila", () => {
  it("cria as cinco vilas com cofre e estoque vazios, de forma idempotente", async () => {
    await villageEconomy.ensureVillages();
    const vilas = await prisma.village.findMany({ orderBy: { id: "asc" } });

    expect(vilas.map((v) => v.id).sort()).toEqual(["IWA", "KIRI", "KONOHA", "KUMO", "SUNA"]);
    expect(vilas.every((v) => v.treasuryRyo === 0)).toBe(true);
    expect(await prisma.villageStock.count()).toBe(0);
  });

  it("gera lançamento a cada crédito e débito do cofre", async () => {
    await prisma.$transaction((tx) =>
      villageEconomy.creditTreasury(tx, {
        villageId: "SUNA",
        amount: 1000,
        type: "DONATION_RYO",
        reason: "doação de teste",
      }),
    );
    const saldo = await prisma.$transaction((tx) =>
      villageEconomy.debitTreasury(tx, {
        villageId: "SUNA",
        amount: 400,
        type: "CONSTRUCTION_COST",
        reason: "obra de teste",
      }),
    );

    expect(saldo).toBe(600);
    const lancamentos = await prisma.villageLedger.findMany({
      where: { villageId: "SUNA" },
      orderBy: { createdAt: "asc" },
    });
    expect(lancamentos.map((l) => [l.type, l.ryoDelta])).toEqual([
      ["DONATION_RYO", 1000],
      ["CONSTRUCTION_COST", -400],
    ]);
  });

  it("recusa saque maior que o cofre sem gravar lançamento", async () => {
    await prisma.$transaction((tx) =>
      villageEconomy.creditTreasury(tx, {
        villageId: "IWA",
        amount: 100,
        type: "DONATION_RYO",
        reason: "doação de teste",
      }),
    );
    const antes = await prisma.villageLedger.count({ where: { villageId: "IWA" } });

    await expect(
      prisma.$transaction((tx) =>
        villageEconomy.debitTreasury(tx, {
          villageId: "IWA",
          amount: 101,
          type: "KAGE_WITHDRAWAL",
          reason: "saque de teste",
        }),
      ),
    ).rejects.toBeInstanceOf(EconomyError);

    const vila = await prisma.village.findUniqueOrThrow({ where: { id: "IWA" } });
    expect(vila.treasuryRyo).toBe(100);
    expect(await prisma.villageLedger.count({ where: { villageId: "IWA" } })).toBe(antes);
  });

  it("dois saques concorrentes não estouram o cofre", async () => {
    await prisma.$transaction((tx) =>
      villageEconomy.creditTreasury(tx, {
        villageId: "KUMO",
        amount: 300,
        type: "DONATION_RYO",
        reason: "doação de teste",
      }),
    );

    const saque = () =>
      prisma
        .$transaction((tx) =>
          villageEconomy.debitTreasury(tx, {
            villageId: "KUMO",
            amount: 200,
            type: "KAGE_WITHDRAWAL",
            reason: "saque concorrente",
          }),
        )
        .then(() => true)
        .catch(() => false);

    const resultados = await Promise.all([saque(), saque()]);

    expect(resultados.filter(Boolean)).toHaveLength(1);
    const vila = await prisma.village.findUniqueOrThrow({ where: { id: "KUMO" } });
    expect(vila.treasuryRyo).toBe(100);
  });
});

describe("estoque central", () => {
  it("mantém uma linha por vila/item e some com a duplicata", async () => {
    await prisma.$transaction((tx) =>
      villageEconomy.addVillageStock(tx, {
        villageId: "KIRI",
        itemId: "kunai",
        qty: 10,
        type: "DONATION_ITEM",
        reason: "doação de teste",
      }),
    );
    await prisma.$transaction((tx) =>
      villageEconomy.addVillageStock(tx, {
        villageId: "KIRI",
        itemId: "kunai",
        qty: 5,
        type: "DONATION_ITEM",
        reason: "doação de teste",
      }),
    );

    expect(await prisma.villageStock.count({ where: { villageId: "KIRI", itemId: "kunai" } })).toBe(1);
    await expect(
      prisma.villageStock.create({ data: { villageId: "KIRI", itemId: "kunai", name: "Kunai", qty: 1 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("recusa retirada acima do estoque", async () => {
    await prisma.$transaction((tx) =>
      villageEconomy.addVillageStock(tx, {
        villageId: "KONOHA",
        itemId: "senbon",
        qty: 4,
        type: "DONATION_ITEM",
        reason: "doação de teste",
      }),
    );

    await expect(
      prisma.$transaction((tx) =>
        villageEconomy.removeVillageStock(tx, {
          villageId: "KONOHA",
          itemId: "senbon",
          qty: 5,
          type: "STOCK_WITHDRAWAL",
          reason: "retirada de teste",
        }),
      ),
    ).rejects.toBeInstanceOf(EconomyError);

    expect(
      await prisma.$transaction((tx) => villageEconomy.getVillageStockQty(tx, "KONOHA", "senbon")),
    ).toBe(4);
  });
});

describe("competência semanal", () => {
  it("congela a taxa na abertura e não re-congela na mesma semana", async () => {
    const agora = new Date("2026-08-12T15:00:00.000Z");
    const weekKey = await villageEconomy.ensureCurrentTaxPeriods(agora);

    await prisma.village.update({ where: { id: "KONOHA" }, data: { taxRate: 0.12 } });
    await villageEconomy.ensureCurrentTaxPeriods(agora);

    const periodo = await prisma.villageTaxPeriod.findUniqueOrThrow({
      where: { villageId_weekKey: { villageId: "KONOHA", weekKey } },
    });
    expect(periodo.taxRateFrozen).toBe(0.05);
    expect(periodo.status).toBe("OPEN");
  });
});
