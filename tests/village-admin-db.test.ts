// Aceites da etapa 04: doação, cofre do Kage, estoque e ordens de coleta.
// Mesmo padrão dos outros testes de integração: SQLite descartável.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

const dir = mkdtempSync(join(tmpdir(), "naruto-vila-"));
const dbPath = join(dir, "vila.db");
process.env.DATABASE_URL = `file:${dbPath}`;

const MONTANHA = "1515881137170546852";

let prisma: PrismaClient;
let treasury: typeof import("../src/services/economy/treasury.js");
let orders: typeof import("../src/services/economy/collection-orders.js");
let villageEconomy: typeof import("../src/services/economy/village-economy.js");
let gathering: typeof import("../src/services/economy/gathering.js");
let inventory: typeof import("../src/services/characters/inventory.js");
let population: typeof import("../src/services/economy/population.js");

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
async function novoNinja(opts: { ryo?: number; villageId?: string | null } = {}) {
  seq += 1;
  const char = await prisma.userCharacter.create({
    data: {
      discordId: `u${seq}`,
      guildId: "g",
      name: `Ninja ${seq}`,
      ryo: opts.ryo ?? 0,
      villageId: opts.villageId === undefined ? "KONOHA" : opts.villageId,
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
async function cofreDe(villageId: string) {
  return prisma.village.findUniqueOrThrow({ where: { id: villageId } });
}

beforeAll(async () => {
  pushSchema();
  prisma = (await import("../src/db/client.js")).prisma;
  treasury = await import("../src/services/economy/treasury.js");
  orders = await import("../src/services/economy/collection-orders.js");
  villageEconomy = await import("../src/services/economy/village-economy.js");
  gathering = await import("../src/services/economy/gathering.js");
  inventory = await import("../src/services/characters/inventory.js");
  population = await import("../src/services/economy/population.js");
  await villageEconomy.ensureVillages();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

// Estado zerado a cada teste. Personagens saem junto: a contagem de população
// ativa é por vila, então sobra de teste anterior falsearia o número.
// `collectionOrderMember` e `villageLedger` guardam charId como string solta
// (sem FK), então o cascade de UserCharacter não os alcança — vão à mão.
beforeEach(async () => {
  await prisma.collectionOrderMember.deleteMany();
  await prisma.collectionOrder.deleteMany();
  await prisma.villageLedger.deleteMany();
  await prisma.villageStock.deleteMany();
  await prisma.userCharacter.deleteMany();
  await prisma.village.updateMany({ data: { treasuryRyo: 0, reservedRyo: 0, withdrawalsLocked: false } });
});

describe("doação", () => {
  it("move item pessoal para o estoque numa transação e registra DONATION_ITEM", async () => {
    const char = await novoNinja();
    await dar(char.id, "madeira", 10);

    const r = await treasury.donateItem(char.id, "KONOHA", "madeira", 4, "u1");

    expect(r.ok).toBe(true);
    expect(await qtd(char.id, "madeira")).toBe(6);
    expect(
      await prisma.$transaction((tx) => villageEconomy.getVillageStockQty(tx, "KONOHA", "madeira")),
    ).toBe(4);
    expect(await prisma.villageLedger.count({ where: { type: "DONATION_ITEM" } })).toBe(1);
  });

  it("falha sem itens e não altera nada", async () => {
    const char = await novoNinja();
    await dar(char.id, "madeira", 2);

    const r = await treasury.donateItem(char.id, "KONOHA", "madeira", 5, "u1");

    expect(r.ok).toBe(false);
    expect(await qtd(char.id, "madeira")).toBe(2);
    expect(
      await prisma.$transaction((tx) => villageEconomy.getVillageStockQty(tx, "KONOHA", "madeira")),
    ).toBe(0);
    expect(await prisma.villageLedger.count()).toBe(0);
  });

  it("doa Ryō e credita o cofre", async () => {
    const char = await novoNinja({ ryo: 500 });

    const r = await treasury.donateRyo(char.id, "KONOHA", 200, "u1");

    expect(r.ok).toBe(true);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(300);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(200);
  });

  it("recusa doação de quem está em dívida", async () => {
    const char = await novoNinja({ ryo: -50 });

    const r = await treasury.donateRyo(char.id, "KONOHA", 10, "u1");

    expect(r.ok).toBe(false);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(0);
  });
});

describe("cofre do Kage", () => {
  it("depósito reduz exatamente o Ryō pessoal e aumenta exatamente o cofre", async () => {
    const char = await novoNinja({ ryo: 1000 });

    const r = await treasury.kageDeposit(char.id, "KONOHA", 400, "u1");

    expect(r.ok).toBe(true);
    if (r.ok) expect([r.cofreAntes, r.cofreDepois]).toEqual([0, 400]);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(600);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(400);
    expect(await prisma.villageLedger.count({ where: { type: "KAGE_DEPOSIT" } })).toBe(1);
  });

  it("depósito acima do saldo, zero ou negativo não altera nenhum dos dois", async () => {
    const char = await novoNinja({ ryo: 100 });

    for (const valor of [101, 0, -5]) {
      expect((await treasury.kageDeposit(char.id, "KONOHA", valor, "u1")).ok, `${valor}`).toBe(false);
    }
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(100);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(0);
  });

  it("saque acima do limite semanal falha", async () => {
    const char = await novoNinja();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    // Limite = 10% de 1000 = 100.
    const r = await treasury.kageWithdraw(char.id, "KONOHA", 101, "comprar suprimentos para a vila", "u1");

    expect(r.ok).toBe(false);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(1000);
  });

  it("saque válido move o Ryō e exige motivo auditável", async () => {
    const char = await novoNinja();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    const r = await treasury.kageWithdraw(char.id, "KONOHA", 100, "comprar suprimentos para a vila", "u1");

    expect(r.ok).toBe(true);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(900);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(100);
    const lanc = await prisma.villageLedger.findFirstOrThrow({ where: { type: "KAGE_WITHDRAWAL", ryoDelta: { lt: 0 } } });
    expect(lanc.reason).toBe("comprar suprimentos para a vila");
  });

  it("recusa motivo curto demais", async () => {
    const char = await novoNinja();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    expect((await treasury.kageWithdraw(char.id, "KONOHA", 50, "curto", "u1")).ok).toBe(false);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(1000);
  });

  it("não deixa sacar Ryō reservado", async () => {
    const char = await novoNinja();
    // Cofre 1000, mas 950 reservados: disponível 50, limite 5.
    await prisma.village.update({
      where: { id: "KONOHA" },
      data: { treasuryRyo: 1000, reservedRyo: 950 },
    });

    expect((await treasury.kageWithdraw(char.id, "KONOHA", 100, "motivo suficientemente longo", "u1")).ok).toBe(false);
    expect((await treasury.kageWithdraw(char.id, "KONOHA", 5, "motivo suficientemente longo", "u1")).ok).toBe(true);
  });

  it("respeita o bloqueio de saque da staff", async () => {
    const char = await novoNinja();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });
    await treasury.setWithdrawalsLocked("KONOHA", true, "investigação", "staff");

    const r = await treasury.kageWithdraw(char.id, "KONOHA", 50, "motivo suficientemente longo", "u1");

    expect(r.ok).toBe(false);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(1000);
  });

  it("dois saques concorrentes não furam o limite semanal", async () => {
    const char = await novoNinja();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 1000 } });

    const saque = () =>
      treasury
        .kageWithdraw(char.id, "KONOHA", 100, "motivo suficientemente longo", "u1")
        .then((r) => r.ok);

    const [a, b] = await Promise.all([saque(), saque()]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((await cofreDe("KONOHA")).treasuryRyo).toBe(900);
  });
});

describe("ajuste de Ryō pessoal pela staff", () => {
  it("set define o saldo exato e grava o delta no livro-caixa", async () => {
    const char = await novoNinja({ ryo: 300 });
    const economy = await import("../src/services/economy/character-economy.js");

    const r = await economy.adminSetCharacterRyo(char.id, 5000, "teste", "staff1");

    expect(r).toEqual({ antes: 300, depois: 5000 });
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(5000);
    const linha = await prisma.villageLedger.findFirstOrThrow({
      where: { charId: char.id },
      orderBy: { createdAt: "desc" },
    });
    expect(linha.ryoDelta).toBe(4700);
    expect(linha.reason).toBe("teste");
    expect(linha.actorDiscordId).toBe("staff1");
  });

  it("add soma sem sobrescrever quando dois ajustes chegam juntos", async () => {
    const char = await novoNinja({ ryo: 0 });
    const economy = await import("../src/services/economy/character-economy.js");

    await Promise.all([
      economy.adminAddCharacterRyo(char.id, 100, "a", "staff1"),
      economy.adminAddCharacterRyo(char.id, 250, "b", "staff1"),
    ]);

    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(350);
  });

  it("permite deixar negativo, e a dívida continua bloqueando gasto", async () => {
    const char = await novoNinja({ ryo: 100 });
    const economy = await import("../src/services/economy/character-economy.js");

    await economy.adminSetCharacterRyo(char.id, -62, "simular dívida", "staff1");

    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(-62);
    // Nenhum caminho de jogo ganhou permissão nova: doar continua recusando.
    const doacao = await treasury.donateRyo(char.id, "KONOHA", 10, "u1");
    expect(doacao.ok).toBe(false);
  });

  it("recusa valor não inteiro e delta zero", async () => {
    const char = await novoNinja({ ryo: 100 });
    const economy = await import("../src/services/economy/character-economy.js");

    await expect(economy.adminSetCharacterRyo(char.id, 1.5, "x", "s")).rejects.toThrow();
    await expect(economy.adminAddCharacterRyo(char.id, 0, "x", "s")).rejects.toThrow();
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(100);
  });
});

describe("estoque", () => {
  it("retirada entrega ao ninja e gera STOCK_WITHDRAWAL", async () => {
    const char = await novoNinja();
    await prisma.$transaction((tx) =>
      villageEconomy.addVillageStock(tx, {
        villageId: "KONOHA", itemId: "pedra", qty: 20, type: "DONATION_ITEM", reason: "seed",
      }),
    );

    const r = await treasury.withdrawStockToCharacter("KONOHA", "pedra", 5, char.id, "u1");

    expect(r.ok).toBe(true);
    expect(await qtd(char.id, "pedra")).toBe(5);
    expect(await prisma.villageLedger.count({ where: { type: "STOCK_WITHDRAWAL" } })).toBe(1);
  });

  it("recusa retirada acima do estoque sem entregar nada", async () => {
    const char = await novoNinja();
    await prisma.$transaction((tx) =>
      villageEconomy.addVillageStock(tx, {
        villageId: "KONOHA", itemId: "pedra", qty: 3, type: "DONATION_ITEM", reason: "seed",
      }),
    );

    const r = await treasury.withdrawStockToCharacter("KONOHA", "pedra", 4, char.id, "u1");

    expect(r.ok).toBe(false);
    expect(await qtd(char.id, "pedra")).toBe(0);
  });
});

describe("ordens de coleta", () => {
  async function ordemPadrao(over: Partial<Parameters<typeof orders.createOrder>[0]> = {}) {
    return orders.createOrder({
      villageId: "KONOHA",
      itemId: "pedra",
      targetQty: 10,
      rewardPerUnit: 5,
      budgetMax: 50,
      durationMs: 24 * 3_600_000,
      audience: "OPEN",
      createdByDiscordId: "kage",
      ...over,
    });
  }

  it("reserva o orçamento do cofre na criação", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });

    const r = await ordemPadrao();

    expect(r.ok).toBe(true);
    const vila = await cofreDe("KONOHA");
    expect(vila.treasuryRyo).toBe(500); // ainda não saiu
    expect(vila.reservedRyo).toBe(50); // mas está preso
  });

  it("não deixa prometer mais Ryō do que a vila tem livre", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 40 } });

    const r = await ordemPadrao();

    expect(r.ok).toBe(false);
    expect((await cofreDe("KONOHA")).reservedRyo).toBe(0);
  });

  it("não deixa duas ordens reservarem o mesmo Ryō", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 60 } });

    const [a, b] = await Promise.all([ordemPadrao(), ordemPadrao()]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await cofreDe("KONOHA")).reservedRyo).toBe(50);
  });

  it("recusa recurso raro como alvo", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });

    const r = await ordemPadrao({ itemId: "minerio_raro" });

    expect(r.ok).toBe(false);
  });

  it("recusa prazo fora de 1 hora a 7 dias", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });

    expect((await ordemPadrao({ durationMs: 60_000 })).ok).toBe(false);
    expect((await ordemPadrao({ durationMs: 8 * 24 * 3_600_000 })).ok).toBe(false);
  });

  it("recusa convite para quem não tem personagem da vila", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao();
    if (!r.ok) throw new Error("ordem não criada");
    const forasteiro = await novoNinja({ villageId: "SUNA" });

    const aceite = await orders.acceptOrder(forasteiro.id, r.order.id);

    expect(aceite.ok).toBe(false);
  });

  it("deixa o ninja aceitar só uma ordem por vez", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const a = await ordemPadrao();
    const b = await ordemPadrao({ itemId: "madeira" });
    if (!a.ok || !b.ok) throw new Error("ordens não criadas");
    const char = await novoNinja();

    expect((await orders.acceptOrder(char.id, a.order.id)).ok).toBe(true);
    expect((await orders.acceptOrder(char.id, b.order.id)).ok).toBe(false);
  });

  it("dois aceites simultâneos não prendem o ninja em duas ordens", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const a = await ordemPadrao();
    const b = await ordemPadrao({ itemId: "madeira" });
    if (!a.ok || !b.ok) throw new Error("ordens não criadas");
    const char = await novoNinja();

    const [x, y] = await Promise.all([
      orders.acceptOrder(char.id, a.order.id),
      orders.acceptOrder(char.id, b.order.id),
    ]);

    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
  });

  it("desvia o recurso-alvo da coleta para o estoque e paga na hora", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao();
    if (!r.ok) throw new Error("ordem não criada");
    const char = await novoNinja();
    await orders.acceptOrder(char.id, r.order.id);

    // RNG cravado: mineração na Montanha, 3 unidades, todas de `pedra` (índice 0),
    // e o último valor evita o raro.
    const rng = (() => {
      const vals = [0, 0, 0, 0, 1];
      let i = 0;
      return () => vals[Math.min(i++, vals.length - 1)]!;
    })();
    const outcome = await gathering.performGathering(char.id, MONTANHA, "MINERAR", { rng });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.delivery).toMatchObject({ itemId: "pedra", entregue: 3, pago: 15 });
    // Pedra foi para a vila, não para a mochila.
    expect(await qtd(char.id, "pedra")).toBe(0);
    expect(
      await prisma.$transaction((tx) => villageEconomy.getVillageStockQty(tx, "KONOHA", "pedra")),
    ).toBe(3);
    // Pagamento saiu da reserva: cofre e reserva caem juntos.
    const vila = await cofreDe("KONOHA");
    expect(vila.treasuryRyo).toBe(485);
    expect(vila.reservedRyo).toBe(35);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(15);
  });

  it("mantém item raro no inventário mesmo com ordem ativa", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao({ itemId: "minerio_ferro" });
    if (!r.ok) throw new Error("ordem não criada");
    const char = await novoNinja();
    await orders.acceptOrder(char.id, r.order.id);

    // Último valor 0 força o raro a sair.
    const rng = (() => {
      const vals = [0, 0, 0, 0, 0];
      let i = 0;
      return () => vals[Math.min(i++, vals.length - 1)]!;
    })();
    await gathering.performGathering(char.id, MONTANHA, "MINERAR", { rng });

    // O raro nunca é capturado pela ordem.
    expect(await qtd(char.id, "minerio_raro")).toBe(1);
    expect(
      await prisma.$transaction((tx) => villageEconomy.getVillageStockQty(tx, "KONOHA", "minerio_raro")),
    ).toBe(0);
  });

  it("não entrega para ordem vencida", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao();
    if (!r.ok) throw new Error("ordem não criada");
    const char = await novoNinja();
    await orders.acceptOrder(char.id, r.order.id);
    await prisma.collectionOrder.update({
      where: { id: r.order.id },
      data: { deadline: new Date(Date.now() - 1000) },
    });

    const rng = (() => {
      const vals = [0, 0, 0, 0, 1];
      let i = 0;
      return () => vals[Math.min(i++, vals.length - 1)]!;
    })();
    const outcome = await gathering.performGathering(char.id, MONTANHA, "MINERAR", { rng });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.delivery).toBeUndefined();
    // Ficou tudo com o ninja.
    expect(await qtd(char.id, "pedra")).toBe(3);
  });

  it("não ultrapassa a meta nem o orçamento", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    // Meta 2, orçamento 10 (2 unidades a 5).
    const r = await ordemPadrao({ targetQty: 2, budgetMax: 10 });
    if (!r.ok) throw new Error("ordem não criada");
    const char = await novoNinja();
    await orders.acceptOrder(char.id, r.order.id);

    const rng = (() => {
      const vals = [0, 0, 0, 0, 1];
      let i = 0;
      return () => vals[Math.min(i++, vals.length - 1)]!;
    })();
    const outcome = await gathering.performGathering(char.id, MONTANHA, "MINERAR", { rng });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.delivery?.entregue).toBe(2);
    // A 3ª pedra sobrou para o inventário.
    expect(await qtd(char.id, "pedra")).toBe(1);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(10);
  });

  it("fecha ao bater a meta e devolve a reserva não usada", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao({ targetQty: 2, budgetMax: 50 });
    if (!r.ok) throw new Error("ordem não criada");
    const char = await novoNinja();
    await orders.acceptOrder(char.id, r.order.id);

    const rng = (() => {
      const vals = [0, 0, 0, 0, 1];
      let i = 0;
      return () => vals[Math.min(i++, vals.length - 1)]!;
    })();
    await gathering.performGathering(char.id, MONTANHA, "MINERAR", { rng });

    const fechada = await prisma.collectionOrder.findUniqueOrThrow({ where: { id: r.order.id } });
    expect(fechada.status).toBe("COMPLETED");
    // Pagou 10, devolveu os 40 restantes: reserva zerada.
    const vila = await cofreDe("KONOHA");
    expect(vila.reservedRyo).toBe(0);
    expect(vila.treasuryRyo).toBe(490);
    // E o ninja voltou a ficar livre para outra ordem.
    const estado = await prisma.characterEconomyState.findUniqueOrThrow({ where: { charId: char.id } });
    expect(estado.activeOrderId).toBeNull();
  });

  it("cancelar devolve só a reserva não usada, sem reverter pagamento", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao();
    if (!r.ok) throw new Error("ordem não criada");
    const char = await novoNinja();
    await orders.acceptOrder(char.id, r.order.id);

    const rng = (() => {
      const vals = [0, 0, 0, 0, 1];
      let i = 0;
      return () => vals[Math.min(i++, vals.length - 1)]!;
    })();
    await gathering.performGathering(char.id, MONTANHA, "MINERAR", { rng }); // paga 15

    const cancel = await orders.closeOrder(r.order.id, "CANCELLED", "kage");

    expect(cancel.ok).toBe(true);
    if (cancel.ok) expect(cancel.devolvido).toBe(35);
    const vila = await cofreDe("KONOHA");
    expect(vila.reservedRyo).toBe(0);
    expect(vila.treasuryRyo).toBe(485); // pagamento não voltou
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(15);
    // Material entregue continua no estoque.
    expect(
      await prisma.$transaction((tx) => villageEconomy.getVillageStockQty(tx, "KONOHA", "pedra")),
    ).toBe(3);
  });

  it("fecha uma vez só, mesmo chamando duas vezes", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao();
    if (!r.ok) throw new Error("ordem não criada");

    const a = await orders.closeOrder(r.order.id, "CANCELLED");
    const b = await orders.closeOrder(r.order.id, "CANCELLED");

    if (a.ok) expect(a.devolvido).toBe(50);
    if (b.ok) expect(b.devolvido).toBe(0);
    expect((await cofreDe("KONOHA")).reservedRyo).toBe(0);
  });

  it("expira a ordem vencida e devolve a reserva", async () => {
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500 } });
    const r = await ordemPadrao();
    if (!r.ok) throw new Error("ordem não criada");
    await prisma.collectionOrder.update({
      where: { id: r.order.id },
      data: { deadline: new Date(Date.now() - 1000) },
    });

    expect(await orders.closeFinishedOrders()).toBe(1);

    const fechada = await prisma.collectionOrder.findUniqueOrThrow({ where: { id: r.order.id } });
    expect(fechada.status).toBe("EXPIRED");
    expect((await cofreDe("KONOHA")).reservedRyo).toBe(0);
  });
});

describe("população ativa", () => {
  it("conta personagem único da vila, não ação", async () => {
    const a = await novoNinja();
    const b = await novoNinja();
    await novoNinja({ villageId: "SUNA" });

    // 'a' age três vezes, 'b' uma. Konoha deve contar 2.
    for (let i = 0; i < 3; i += 1) {
      await prisma.economyActionLog.create({ data: { charId: a.id, action: "COLETAR" } });
    }
    await prisma.economyActionLog.create({ data: { charId: b.id, action: "CRAFT" } });

    const pop = await population.activePopulation("KONOHA");

    expect(pop.ativos).toBe(2);
  });

  it("ignora atividade fora da janela de 14 dias", async () => {
    const char = await novoNinja();
    await prisma.economyActionLog.create({
      data: { charId: char.id, action: "COLETAR", createdAt: new Date(Date.now() - 20 * 24 * 3_600_000) },
    });

    expect((await population.activePopulation("KONOHA")).ativos).toBe(0);
  });
});
