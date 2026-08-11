// Aceites da etapa 02 que só o banco prova: idempotência do fechamento, saldo
// que fica negativo, taxa congelada e recuperação após reinício.
// Mesmo padrão de tests/economy-db.test.ts: SQLite descartável, nada de src/
// importado estaticamente (DATABASE_URL precisa apontar para o temporário antes).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

const dir = mkdtempSync(join(tmpdir(), "naruto-tax-"));
const dbPath = join(dir, "tax.db");
process.env.DATABASE_URL = `file:${dbPath}`;

let prisma: PrismaClient;
let weeklyTax: typeof import("../src/services/economy/weekly-tax.js");
let scheduler: typeof import("../src/services/economy/tax-scheduler.js");
let villageEconomy: typeof import("../src/services/economy/village-economy.js");
let weekKeyFor: typeof import("../src/services/economy/week.js").weekKeyFor;

// Quarta dentro da competência que abre no domingo 2026-08-09 22:00 (SP).
const DENTRO_DA_SEMANA = new Date("2026-08-12T15:00:00.000Z");
// Depois do corte seguinte: a competência acima já venceu.
const APOS_O_CORTE = new Date("2026-08-17T02:00:00.000Z");
const WEEK = "2026-08-09";

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
async function criarNinja(opts: { ryo?: number; rank?: string; villageId?: string } = {}) {
  seq += 1;
  return prisma.userCharacter.create({
    data: {
      discordId: `u${seq}`,
      guildId: "g",
      name: `Ninja ${seq}`,
      ryo: opts.ryo ?? 0,
      ninjaRank: opts.rank ?? "GENIN",
      villageId: opts.villageId ?? "KONOHA",
    },
  });
}

async function darAtividade(charId: string, villageId: string, xp: number, ryo: number) {
  await prisma.weeklyTaxActivity.create({
    data: { weekKey: WEEK, charId, villageId, rankAtEarn: "GENIN", taxableXp: xp, taxableMissionRyo: ryo },
  });
}

beforeAll(async () => {
  pushSchema();
  prisma = (await import("../src/db/client.js")).prisma;
  weeklyTax = await import("../src/services/economy/weekly-tax.js");
  scheduler = await import("../src/services/economy/tax-scheduler.js");
  villageEconomy = await import("../src/services/economy/village-economy.js");
  weekKeyFor = (await import("../src/services/economy/week.js")).weekKeyFor;
  await villageEconomy.ensureVillages();
}, 180_000);

afterAll(async () => {
  scheduler.stopTaxScheduler();
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

// Cada teste começa com a competência da semana aberta e cofres zerados.
beforeEach(async () => {
  await prisma.weeklyTaxCharge.deleteMany();
  await prisma.weeklyTaxActivity.deleteMany();
  await prisma.villageLedger.deleteMany();
  await prisma.villageTaxPeriod.deleteMany();
  await prisma.village.updateMany({ data: { treasuryRyo: 0, taxRate: 0.05 } });
  await villageEconomy.ensureCurrentTaxPeriods(DENTRO_DA_SEMANA);
});

describe("acumulação de atividade tributável", () => {
  it("acumula somando na mesma linha da semana em vez de criar duas", async () => {
    const char = await criarNinja();

    await prisma.$transaction((tx) =>
      weeklyTax.accumulateMissionActivity(tx, {
        charId: char.id,
        ninjaRank: "GENIN",
        villageId: "KONOHA",
        xp: 500,
        ryo: 400,
        at: DENTRO_DA_SEMANA,
      }),
    );
    await prisma.$transaction((tx) =>
      weeklyTax.accumulateMissionActivity(tx, {
        charId: char.id,
        ninjaRank: "GENIN",
        villageId: "KONOHA",
        xp: 300,
        ryo: 200,
        at: DENTRO_DA_SEMANA,
      }),
    );

    const linhas = await prisma.weeklyTaxActivity.findMany({ where: { charId: char.id } });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ taxableXp: 800, taxableMissionRyo: 600, weekKey: WEEK });
  });

  it("não acumula nada para Academia", async () => {
    const char = await criarNinja({ rank: "ACADEMIA" });

    const acumulou = await prisma.$transaction((tx) =>
      weeklyTax.accumulateMissionActivity(tx, {
        charId: char.id,
        ninjaRank: "ACADEMIA",
        villageId: "KONOHA",
        xp: 5000,
        ryo: 5000,
        at: DENTRO_DA_SEMANA,
      }),
    );

    expect(acumulou).toBe(false);
    expect(await prisma.weeklyTaxActivity.count({ where: { charId: char.id } })).toBe(0);
  });

  it("não acumula em Konoha por acidente quando o personagem não tem vila", async () => {
    const char = await criarNinja();

    const acumulou = await prisma.$transaction((tx) =>
      weeklyTax.accumulateMissionActivity(tx, {
        charId: char.id,
        ninjaRank: "JONIN",
        villageId: null,
        xp: 2000,
        ryo: 2000,
        at: DENTRO_DA_SEMANA,
      }),
    );

    expect(acumulou).toBe(false);
    expect(await prisma.weeklyTaxActivity.count()).toBe(0);
  });
});

describe("fechamento da competência", () => {
  it("fecha isento abaixo da meta sem tocar em Ryō nem no cofre", async () => {
    const char = await criarNinja({ ryo: 500 });
    await darAtividade(char.id, "KONOHA", 1599, 1400);

    const r = await weeklyTax.closeWeek(WEEK);

    expect(r.charactersExempt).toBe(1);
    expect(r.totalCharged).toBe(0);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(500);
    expect((await prisma.village.findUniqueOrThrow({ where: { id: "KONOHA" } })).treasuryRyo).toBe(0);
    expect(await prisma.weeklyTaxCharge.count()).toBe(0);
    expect(
      (await prisma.weeklyTaxActivity.findFirstOrThrow({ where: { charId: char.id } })).status,
    ).toBe("ISENTO_INATIVO");
  });

  it("cobra 70 Ryō e credita o cofre a partir da meta", async () => {
    const char = await criarNinja({ ryo: 1400 });
    await darAtividade(char.id, "KONOHA", 1600, 1400);

    await weeklyTax.closeWeek(WEEK);

    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(1330);
    expect((await prisma.village.findUniqueOrThrow({ where: { id: "KONOHA" } })).treasuryRyo).toBe(70);
    const lancamentos = await prisma.villageLedger.findMany({ where: { type: "WEEKLY_ACTIVITY_TAX" } });
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0]).toMatchObject({ villageId: "KONOHA", ryoDelta: 70, charId: char.id });
  });

  it("deixa o saldo negativo: 30 Ryō devendo 70 termina em −40 e o cofre recebe 70", async () => {
    const char = await criarNinja({ ryo: 30 });
    await darAtividade(char.id, "KONOHA", 1600, 1400);

    await weeklyTax.closeWeek(WEEK);

    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(-40);
    expect((await prisma.village.findUniqueOrThrow({ where: { id: "KONOHA" } })).treasuryRyo).toBe(70);
    const recibo = await prisma.weeklyTaxCharge.findFirstOrThrow({ where: { charId: char.id } });
    expect(recibo).toMatchObject({ balanceBefore: 30, balanceAfter: -40, taxRyo: 70 });
  });

  it("reparte entre duas vilas conforme o Ryō registrado em cada uma", async () => {
    const char = await criarNinja({ ryo: 1000 });
    await prisma.village.update({ where: { id: "SUNA" }, data: { taxRate: 0.07 } });
    await prisma.villageTaxPeriod.deleteMany({ where: { villageId: "SUNA" } });
    await villageEconomy.ensureCurrentTaxPeriods(DENTRO_DA_SEMANA);
    await darAtividade(char.id, "KONOHA", 1400, 1000);
    await darAtividade(char.id, "SUNA", 600, 600);

    await weeklyTax.closeWeek(WEEK);

    expect((await prisma.village.findUniqueOrThrow({ where: { id: "KONOHA" } })).treasuryRyo).toBe(50);
    expect((await prisma.village.findUniqueOrThrow({ where: { id: "SUNA" } })).treasuryRyo).toBe(42);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(908);
  });

  it("executar o fechamento duas vezes produz uma cobrança e um crédito só", async () => {
    const char = await criarNinja({ ryo: 1400 });
    await darAtividade(char.id, "KONOHA", 1600, 1400);

    await weeklyTax.closeWeek(WEEK);
    await weeklyTax.closeWeek(WEEK);

    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(1330);
    expect((await prisma.village.findUniqueOrThrow({ where: { id: "KONOHA" } })).treasuryRyo).toBe(70);
    expect(await prisma.weeklyTaxCharge.count()).toBe(1);
    expect(await prisma.villageLedger.count({ where: { type: "WEEKLY_ACTIVITY_TAX" } })).toBe(1);
  });

  it("abre a competência seguinte zerada sem apagar a anterior", async () => {
    const char = await criarNinja({ ryo: 100 });
    await darAtividade(char.id, "KONOHA", 1600, 1000);

    await weeklyTax.closeWeek(WEEK);

    const anterior = await prisma.villageTaxPeriod.findFirstOrThrow({
      where: { villageId: "KONOHA", weekKey: WEEK },
    });
    expect(anterior.status).toBe("CLOSED");
    expect(anterior.closedAt).not.toBeNull();
    // A competência corrente (relógio real) foi aberta e é outra.
    const atual = weekKeyFor(new Date());
    if (atual !== WEEK) {
      expect(
        await prisma.villageTaxPeriod.count({ where: { villageId: "KONOHA", weekKey: atual } }),
      ).toBe(1);
    }
  });
});

describe("taxa congelada", () => {
  it("mudar de 5% para 10% no meio da semana não muda a cobrança da competência aberta", async () => {
    const char = await criarNinja({ ryo: 2000 });
    await darAtividade(char.id, "KONOHA", 1600, 1000);

    // Kage sobe a taxa depois da competência já aberta.
    await prisma.village.update({ where: { id: "KONOHA" }, data: { taxRate: 0.1 } });
    await villageEconomy.ensureCurrentTaxPeriods(DENTRO_DA_SEMANA); // não re-congela

    await weeklyTax.closeWeek(WEEK);

    // 5% de 1000 = 50, não 100.
    expect((await prisma.village.findUniqueOrThrow({ where: { id: "KONOHA" } })).treasuryRyo).toBe(50);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(1950);
  });
});

describe("recuperação após reinício", () => {
  it("processa a competência atrasada uma única vez", async () => {
    const char = await criarNinja({ ryo: 1400 });
    await darAtividade(char.id, "KONOHA", 1600, 1400);

    // Bot volta depois do domingo 22:00: dois boots seguidos.
    const primeiro = await scheduler.runPendingClosures(undefined, APOS_O_CORTE);
    const segundo = await scheduler.runPendingClosures(undefined, APOS_O_CORTE);

    expect(primeiro).toBeGreaterThan(0);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(1330);
    expect((await prisma.village.findUniqueOrThrow({ where: { id: "KONOHA" } })).treasuryRyo).toBe(70);
    expect(await prisma.weeklyTaxCharge.count()).toBe(1);
    expect(segundo).toBe(0);
  });

  it("não fecha competência que ainda está correndo", async () => {
    const char = await criarNinja({ ryo: 1400 });
    await darAtividade(char.id, "KONOHA", 1600, 1400);

    const fechadas = await scheduler.runPendingClosures(undefined, DENTRO_DA_SEMANA);

    expect(fechadas).toBe(0);
    expect((await prisma.userCharacter.findUniqueOrThrow({ where: { id: char.id } })).ryo).toBe(1400);
    expect(await prisma.weeklyTaxCharge.count()).toBe(0);
  });
});

describe("recibo", () => {
  it("registra a entrega da DM sem apagar o recibo salvo", async () => {
    const char = await criarNinja({ ryo: 1400 });
    await darAtividade(char.id, "KONOHA", 1600, 1400);

    const r = await weeklyTax.closeWeek(WEEK);
    const recibo = r.receipts.find((x) => x.charId === char.id)!;

    expect(weeklyTax.formatReceipt(recibo)).toContain("70 Ryō");
    expect(await prisma.weeklyTaxCharge.findFirstOrThrow({ where: { charId: char.id } })).toMatchObject(
      { receiptSentAt: null },
    );

    await weeklyTax.markReceiptSent(char.id, WEEK);
    expect(
      (await prisma.weeklyTaxCharge.findFirstOrThrow({ where: { charId: char.id } })).receiptSentAt,
    ).not.toBeNull();
  });

  it("mostra dívida em vez de saldo negativo no recibo", async () => {
    const char = await criarNinja({ ryo: 30 });
    await darAtividade(char.id, "KONOHA", 1600, 1400);

    const r = await weeklyTax.closeWeek(WEEK);
    const texto = weeklyTax.formatReceipt(r.receipts.find((x) => x.charId === char.id)!);

    expect(texto).toContain("Dívida de 40 Ryō");
    expect(texto).not.toContain("-40");
    // A meta é oculta: o recibo não pode revelar contador de XP.
    expect(texto).not.toContain("1600");
    expect(texto).not.toMatch(/XP/i);
  });
});
