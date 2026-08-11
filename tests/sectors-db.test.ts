// Aceites da etapa 06: fila de obras pelo Centro, congelamento do fator,
// conclusão após bot desligado, produção diária idempotente, reforma semanal e
// os comandos de nível da staff.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CENTER } from "../src/data/sectors.js";

const dir = mkdtempSync(join(tmpdir(), "naruto-obras-"));
const dbPath = join(dir, "obras.db");
process.env.DATABASE_URL = `file:${dbPath}`;

let prisma: PrismaClient;
let constructions: typeof import("../src/services/economy/constructions.js");
let production: typeof import("../src/services/economy/production.js");
let maintenance: typeof import("../src/services/economy/maintenance.js");
let adminLevels: typeof import("../src/services/economy/admin-levels.js");
let shops: typeof import("../src/services/economy/shop-service.js");
let villageEconomy: typeof import("../src/services/economy/village-economy.js");
let gathering: typeof import("../src/services/economy/gathering.js");
let inventory: typeof import("../src/services/characters/inventory.js");

const MONTANHA = "1515881137170546852";

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

async function cofreDe(villageId = "KONOHA") {
  return prisma.village.findUniqueOrThrow({ where: { id: villageId } });
}
async function setorDe(sectorKey: string, villageId = "KONOHA") {
  return prisma.villageUpgrade.findUniqueOrThrow({
    where: { villageId_sectorKey: { villageId, sectorKey } },
  });
}
async function centroDe(villageId = "KONOHA") {
  return prisma.villageCenter.findUniqueOrThrow({ where: { villageId } });
}
async function central(itemId: string, villageId = "KONOHA") {
  const row = await prisma.villageStock.findUnique({
    where: { villageId_itemId: { villageId, itemId } },
  });
  return row?.qty ?? 0;
}
async function encherEstoque(qty = 5000, villageId = "KONOHA") {
  for (const itemId of [
    "madeira",
    "pedra",
    "minerio_ferro",
    "carvao",
    "grao",
    "couro",
    "fibra_vegetal",
    "argila",
    "agua_limpa",
  ]) {
    await prisma.villageStock.upsert({
      where: { villageId_itemId: { villageId, itemId } },
      create: { villageId, itemId, name: itemId, qty },
      update: { qty },
    });
  }
}
// Fixa a população para o fator ficar determinístico nos testes.
async function fixarPopulacao(ativos: number | null, villageId = "KONOHA") {
  await prisma.village.update({ where: { id: villageId }, data: { populationOverride: ativos } });
}

beforeAll(async () => {
  pushSchema();
  prisma = (await import("../src/db/client.js")).prisma;
  constructions = await import("../src/services/economy/constructions.js");
  production = await import("../src/services/economy/production.js");
  maintenance = await import("../src/services/economy/maintenance.js");
  adminLevels = await import("../src/services/economy/admin-levels.js");
  shops = await import("../src/services/economy/shop-service.js");
  villageEconomy = await import("../src/services/economy/village-economy.js");
  gathering = await import("../src/services/economy/gathering.js");
  inventory = await import("../src/services/characters/inventory.js");
  await villageEconomy.ensureVillages();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.villageMaintenanceCharge.deleteMany();
  await prisma.villageProductionRun.deleteMany();
  await prisma.villageConstruction.deleteMany();
  await prisma.villageUpgrade.deleteMany();
  await prisma.villageCenter.deleteMany();
  await prisma.villageShopStock.deleteMany();
  await prisma.villageShop.deleteMany();
  await prisma.villageStock.deleteMany();
  await prisma.villageLedger.deleteMany();
  await prisma.gatheringCooldown.deleteMany();
  await prisma.economyActionLog.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.characterEconomyState.deleteMany();
  await prisma.userCharacter.deleteMany();
  await prisma.village.updateMany({
    data: {
      treasuryRyo: 0,
      reservedRyo: 0,
      constructionSlotsUsed: 0,
      taxRate: 0.05,
      populationOverride: null,
    },
  });
  await shops.ensureVillageShops();
  await constructions.ensureVillageBuildings();
});

// ---------------- Fundação ----------------

describe("estado inicial dos prédios", () => {
  it("quatro setores no nível 0 e Centro no nível 1, por vila", async () => {
    expect(await prisma.villageUpgrade.count({ where: { villageId: "KONOHA" } })).toBe(4);
    expect((await centroDe()).level).toBe(1);
    expect(await prisma.villageUpgrade.count({ where: { level: { not: 0 } } })).toBe(0);
    expect(await prisma.villageCenter.count()).toBe(5);
  });

  it("é idempotente e não rebaixa setor já evoluído", async () => {
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 4, "teste", "staff");

    const criados = await constructions.ensureVillageBuildings();

    expect(criados).toBe(0);
    expect((await setorDe("MINAS_FUNDICOES")).level).toBe(4);
  });
});

// ---------------- Custo e congelamento ----------------

describe("custo da obra", () => {
  it("nível 3 usa custo e tempo da tabela e congela o fator", async () => {
    await fixarPopulacao(20); // fator 1,00
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 50_000 } });
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 2, "preparo", "staff");

    const r = await constructions.startConstruction(
      "KONOHA",
      "SECTOR",
      "MINAS_FUNDICOES",
      "kage1",
    );

    expect(r.ok && r.targetLevel).toBe(3);
    expect(r.ok && r.custo.ryo).toBe(3600);
    expect(r.ok && r.obra.populationFactor).toBe(1);
    expect((await cofreDe()).treasuryRyo).toBe(46_400);
    expect(await central("madeira")).toBe(5000 - 240);
    expect(await central("carvao")).toBe(5000 - 75);
    const obra = await prisma.villageConstruction.findFirstOrThrow({ where: { villageId: "KONOHA" } });
    expect(obra.finishesAt.getTime() - obra.startedAt.getTime()).toBeCloseTo(3 * 24 * 3_600_000, -3);
  });

  it("o custo congelado não muda se a população variar depois", async () => {
    await fixarPopulacao(10); // fator 0,50
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 50_000 } });

    const r = await constructions.startConstruction("KONOHA", "SECTOR", "CRIACAO_HORTAS", "kage1");
    expect(r.ok && r.custo.ryo).toBe(600); // teto(1200 × 0,50)

    // A vila triplica no meio da obra.
    await fixarPopulacao(60);
    await constructions.completeFinishedConstructions(new Date(Date.now() + 4 * 3_600_000));

    const obra = await prisma.villageConstruction.findFirstOrThrow({ where: { villageId: "KONOHA" } });
    expect(obra.costRyo).toBe(600);
    expect(obra.populationFactor).toBe(0.5);
    expect((await cofreDe()).treasuryRyo).toBe(49_400);
    expect((await setorDe("CRIACAO_HORTAS")).level).toBe(1);
  });

  it("cofre ou estoque insuficiente não deixa nada pela metade", async () => {
    await fixarPopulacao(20);
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 50_000 } });
    // Sem estoque nenhum.
    const r = await constructions.startConstruction("KONOHA", "SECTOR", "MINAS_FUNDICOES", "kage1");

    expect(r.ok).toBe(false);
    expect((await cofreDe()).treasuryRyo).toBe(50_000);
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
    expect((await setorDe("MINAS_FUNDICOES")).constructingTo).toBeNull();
  });

  it("setor no nível 5 não tem para onde evoluir", async () => {
    await fixarPopulacao(20);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500_000 } });
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 5, "teto", "staff");

    const r = await constructions.startConstruction(
      "KONOHA",
      "SECTOR",
      "POCOS_RESERVATORIOS",
      "kage1",
    );

    expect(r.ok).toBe(false);
  });
});

// ---------------- Fila global ----------------

describe("fila global de obras", () => {
  async function vilaRica() {
    await fixarPopulacao(20);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500_000 } });
  }
  const iniciar = (setor: string) =>
    constructions.startConstruction("KONOHA", "SECTOR", setor, "kage1");

  it("Centro nível 1 impede iniciar a segunda obra", async () => {
    await vilaRica();

    const primeira = await iniciar("MINAS_FUNDICOES");
    const segunda = await iniciar("CRIACAO_HORTAS");

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    expect((await cofreDe()).constructionSlotsUsed).toBe(1);
  });

  it("Centro nível 2 permite exatamente duas, mesmo com cliques concorrentes", async () => {
    await vilaRica();
    await adminLevels.setCenterLevel("KONOHA", 2, "teste", "staff");

    const resultados = await Promise.all([
      iniciar("MINAS_FUNDICOES"),
      iniciar("CRIACAO_HORTAS"),
      iniciar("SILVICULTURA_COLETA"),
      iniciar("POCOS_RESERVATORIOS"),
    ]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(2);
    expect((await cofreDe()).constructionSlotsUsed).toBe(2);
    expect(await prisma.villageConstruction.count({ where: { status: "IN_PROGRESS" } })).toBe(2);
  });

  it("Centro nível 3 permite exatamente três", async () => {
    await vilaRica();
    await adminLevels.setCenterLevel("KONOHA", 3, "teste", "staff");

    const resultados = await Promise.all([
      iniciar("MINAS_FUNDICOES"),
      iniciar("CRIACAO_HORTAS"),
      iniciar("SILVICULTURA_COLETA"),
      iniciar("POCOS_RESERVATORIOS"),
    ]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(3);
    expect((await cofreDe()).constructionSlotsUsed).toBe(3);
  });

  it("a vaga conta Ichiraku e setor juntos", async () => {
    await vilaRica();
    await adminLevels.setCenterLevel("KONOHA", 2, "teste", "staff");

    const ichiraku = await constructions.startIchiraku("KONOHA", "kage1");
    const setor = await iniciar("MINAS_FUNDICOES");
    const terceira = await iniciar("CRIACAO_HORTAS");

    expect(ichiraku.ok).toBe(true);
    expect(setor.ok).toBe(true);
    expect(terceira.ok).toBe(false);
    expect((await cofreDe()).constructionSlotsUsed).toBe(2);
  });

  it("evoluir o Centro ocupa a vaga e só libera ao terminar", async () => {
    await vilaRica();

    const centro = await constructions.startConstruction("KONOHA", "CENTER", CENTER.buildingKey, "kage1");
    const setor = await iniciar("MINAS_FUNDICOES");

    expect(centro.ok).toBe(true);
    expect(setor.ok).toBe(false);

    await constructions.completeFinishedConstructions(new Date(Date.now() + 4 * 24 * 3_600_000));

    expect((await centroDe()).level).toBe(2);
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
    expect((await constructions.capacityView("KONOHA")).total).toBe(2);
  });

  it("nunca empilha dois níveis do mesmo prédio", async () => {
    await vilaRica();
    await adminLevels.setCenterLevel("KONOHA", 3, "teste", "staff");

    const resultados = await Promise.all([
      iniciar("MINAS_FUNDICOES"),
      iniciar("MINAS_FUNDICOES"),
      iniciar("MINAS_FUNDICOES"),
    ]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect((await cofreDe()).constructionSlotsUsed).toBe(1);
  });

  it("o contador de vagas bate com a contagem real de obras", async () => {
    await vilaRica();
    await adminLevels.setCenterLevel("KONOHA", 3, "teste", "staff");
    await iniciar("MINAS_FUNDICOES");
    await iniciar("CRIACAO_HORTAS");

    const emAndamento = await prisma.villageConstruction.count({
      where: { villageId: "KONOHA", status: "IN_PROGRESS" },
    });
    expect((await cofreDe()).constructionSlotsUsed).toBe(emAndamento);
  });

  it("cancelar libera a vaga uma vez só e destrava o prédio", async () => {
    await vilaRica();
    const r = await iniciar("MINAS_FUNDICOES");
    const obraId = r.ok ? r.obra.id : "";

    const primeira = await constructions.cancelConstruction(obraId, "motivo", "staff");
    const segunda = await constructions.cancelConstruction(obraId, "motivo", "staff");

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
    expect((await setorDe("MINAS_FUNDICOES")).constructingTo).toBeNull();
    // Sem reembolso: o custo já foi consumido.
    expect((await cofreDe()).treasuryRyo).toBe(500_000 - 1200);
  });
});

// ---------------- Conclusão ----------------

describe("conclusão de obra", () => {
  it("obra vencida com o bot desligado é concluída uma única vez", async () => {
    await fixarPopulacao(20);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 50_000 } });
    await constructions.startConstruction("KONOHA", "SECTOR", "MINAS_FUNDICOES", "kage1");
    const depois = new Date(Date.now() + 10 * 24 * 3_600_000);

    const primeiroBoot = await constructions.completeFinishedConstructions(depois);
    const segundoBoot = await constructions.completeFinishedConstructions(depois);

    expect(primeiroBoot).toHaveLength(1);
    expect(segundoBoot).toHaveLength(0);
    expect((await setorDe("MINAS_FUNDICOES")).level).toBe(1);
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
  });

  it("não conclui antes do prazo", async () => {
    await fixarPopulacao(20);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 50_000 } });
    await constructions.startConstruction("KONOHA", "SECTOR", "MINAS_FUNDICOES", "kage1");

    expect(await constructions.completeFinishedConstructions(new Date())).toHaveLength(0);
    expect((await setorDe("MINAS_FUNDICOES")).level).toBe(0);
  });
});

// ---------------- Produção diária ----------------

describe("produção diária", () => {
  it("deposita no estoque central e nunca duas vezes no mesmo dia", async () => {
    await fixarPopulacao(20); // fator 1,00
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 1, "teste", "staff");

    const primeira = await production.runVillageProduction("KONOHA", "2026-08-12");
    const segunda = await production.runVillageProduction("KONOHA", "2026-08-12");

    expect(primeira?.totalItens).toBe(10);
    expect(segunda).toBeNull();
    expect(await central("agua_limpa")).toBe(10);
  });

  it("dois processamentos concorrentes do mesmo dia não duplicam estoque", async () => {
    await fixarPopulacao(20);
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 3, "teste", "staff");

    await Promise.all([
      production.runVillageProduction("KONOHA", "2026-08-12"),
      production.runVillageProduction("KONOHA", "2026-08-12"),
    ]);

    expect(await central("agua_limpa")).toBe(28);
    expect(
      await prisma.villageProductionRun.count({
        where: { villageId: "KONOHA", dayKey: "2026-08-12" },
      }),
    ).toBe(1);
  });

  it("dias diferentes rendem de novo", async () => {
    await fixarPopulacao(20);
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 1, "teste", "staff");

    await production.runVillageProduction("KONOHA", "2026-08-12");
    await production.runVillageProduction("KONOHA", "2026-08-13");

    expect(await central("agua_limpa")).toBe(20);
  });

  it("setor nível 0 não produz", async () => {
    await fixarPopulacao(20);
    expect(await production.runVillageProduction("KONOHA", "2026-08-12")).toBeNull();
    expect(await central("agua_limpa")).toBe(0);
  });

  it("aplica o fator de população", async () => {
    await fixarPopulacao(10); // fator 0,50
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 2, "teste", "staff");

    await production.runVillageProduction("KONOHA", "2026-08-12");

    expect(await central("agua_limpa")).toBe(9); // teto(18 × 0,50)
  });

  it("nunca deposita recurso raro", async () => {
    await fixarPopulacao(30);
    for (const key of ["CRIACAO_HORTAS", "MINAS_FUNDICOES", "SILVICULTURA_COLETA"] as const) {
      await adminLevels.setSectorLevel("KONOHA", key, 5, "teste", "staff");
    }

    await production.runVillageProduction("KONOHA", "2026-08-12");

    expect(await central("minerio_raro")).toBe(0);
    expect(await central("madeira_reforcada")).toBe(0);
  });

  it("a recuperação de boot processa cada dia em aberto uma vez só", async () => {
    await fixarPopulacao(20);
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 1, "teste", "staff");
    const agora = new Date("2026-08-12T15:00:00Z");

    const primeiro = await production.runPendingProduction(agora, 2);
    const segundo = await production.runPendingProduction(agora, 2);

    // 3 dias em aberto (hoje e dois para trás), 5 vilas — só Konoha produz.
    expect(primeiro).toHaveLength(3);
    expect(segundo).toHaveLength(0);
    expect(await central("agua_limpa")).toBe(30);
  });
});

// ---------------- Reforma semanal ----------------

describe("reforma semanal", () => {
  const segunda = new Date("2026-08-10T03:20:00Z"); // segunda 00:20 local

  async function comSetorNivel3() {
    await fixarPopulacao(10); // fator 0,50
    await adminLevels.setSectorLevel("KONOHA", "SILVICULTURA_COLETA", 3, "teste", "staff");
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 10_000 } });
  }

  it("cobra 104 Ryō de um setor nível 3 com fator 0,50 e Centro 1", async () => {
    await comSetorNivel3();

    const criadas = await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);

    expect(criadas).toHaveLength(1);
    expect(criadas[0]!.ryoDue).toBe(104);
    expect(criadas[0]!.dueAt.getTime() - segunda.getTime()).toBe(72 * 3_600_000);
  });

  it("Centro nível 3 desconta 20% do Ryō e nada do material", async () => {
    await comSetorNivel3();
    await adminLevels.setCenterLevel("KONOHA", 3, "teste", "staff");

    const criadas = await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    const setor = criadas.find((c) => c.buildingKey === "SILVICULTURA_COLETA")!;
    const centro = criadas.find((c) => c.buildingKey === CENTER.buildingKey)!;

    expect(setor.ryoDue).toBe(84);
    expect(setor.items.madeira).toBe(3); // igual ao caso sem desconto
    expect(centro).toBeDefined(); // Centro nível 2+ também paga
  });

  it("setor nível 0 e Centro nível 1 não pagam nada", async () => {
    await fixarPopulacao(10);

    const criadas = await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);

    expect(criadas).toHaveLength(0);
  });

  it("as quatro lojas iniciais são isentas; só o Ichiraku ativo paga", async () => {
    await fixarPopulacao(10);
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE", discordChannelId: "c1" },
    });

    const criadas = await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);

    expect(criadas.map((c) => c.buildingKey)).toEqual(["ICHIRAKU"]);
  });

  it("não acumula semanas: a pendência aberta bloqueia a cobrança seguinte", async () => {
    await comSetorNivel3();
    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);

    const proximaSemana = await maintenance.openMaintenanceCycle(
      new Date("2026-08-17T03:20:00Z"),
      ["KONOHA"],
    );

    expect(proximaSemana).toHaveLength(0);
    expect(
      await prisma.villageMaintenanceCharge.count({
        where: { villageId: "KONOHA", status: { in: ["PENDING", "OVERDUE"] } },
      }),
    ).toBe(1);
  });

  it("abrir o mesmo ciclo duas vezes não cria cobrança dobrada", async () => {
    await comSetorNivel3();

    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    const denovo = await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);

    expect(denovo).toHaveLength(0);
    expect(await prisma.villageMaintenanceCharge.count()).toBe(1);
  });

  it("depois de 72 h suspende SÓ o prédio afetado, sem perder nível", async () => {
    await comSetorNivel3();
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 2, "teste", "staff");
    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    // Só a cobrança da Silvicultura vence; a das Minas é paga antes.
    const minas = await prisma.villageMaintenanceCharge.findFirstOrThrow({
      where: { buildingKey: "MINAS_FUNDICOES" },
    });
    await maintenance.payMaintenance(minas.id, "kage1");

    const vencidas = await maintenance.applyOverdueMaintenance(
      new Date(segunda.getTime() + 73 * 3_600_000),
    );

    expect(vencidas.map((v) => v.buildingKey)).toEqual(["SILVICULTURA_COLETA"]);
    const silvicultura = await setorDe("SILVICULTURA_COLETA");
    expect(silvicultura.status).toBe("NECESSITA_REFORMA");
    expect(silvicultura.level).toBe(3); // nível preservado
    expect((await setorDe("MINAS_FUNDICOES")).status).toBe("OK");
  });

  it("setor suspenso para de produzir e volta ao pagar", async () => {
    await comSetorNivel3();
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 2, "teste", "staff");
    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    await maintenance.applyOverdueMaintenance(new Date(segunda.getTime() + 73 * 3_600_000));
    const antes = await central("agua_limpa");

    await production.runVillageProduction("KONOHA", "2026-08-14");
    expect(await central("agua_limpa")).toBe(antes); // suspenso: nada produzido

    const cobranca = await prisma.villageMaintenanceCharge.findFirstOrThrow({
      where: { buildingKey: "POCOS_RESERVATORIOS" },
    });
    const pago = await maintenance.payMaintenance(cobranca.id, "kage1");

    expect(pago.ok && pago.reativado).toBe(true);
    expect((await setorDe("POCOS_RESERVATORIOS")).status).toBe("OK");
    await production.runVillageProduction("KONOHA", "2026-08-15");
    expect(await central("agua_limpa")).toBeGreaterThan(antes);
  });

  it("pagar debita cofre e estoque e não pode ser pago duas vezes", async () => {
    await comSetorNivel3();
    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    const cobranca = await prisma.villageMaintenanceCharge.findFirstOrThrow({});
    const madeiraAntes = await central("madeira");

    const [a, b] = await Promise.all([
      maintenance.payMaintenance(cobranca.id, "kage1"),
      maintenance.payMaintenance(cobranca.id, "kage1"),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await cofreDe()).treasuryRyo).toBe(10_000 - 104);
    expect(await central("madeira")).toBe(madeiraAntes - 3);
  });

  it("Centro em reforma não cancela obras, mas limita novos inícios a uma e perde o desconto", async () => {
    await fixarPopulacao(10);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500_000 } });
    await adminLevels.setCenterLevel("KONOHA", 3, "teste", "staff");
    // Duas obras já rolando com a capacidade cheia.
    await constructions.startConstruction("KONOHA", "SECTOR", "MINAS_FUNDICOES", "kage1");
    await constructions.startConstruction("KONOHA", "SECTOR", "CRIACAO_HORTAS", "kage1");

    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    await maintenance.applyOverdueMaintenance(new Date(segunda.getTime() + 73 * 3_600_000));

    expect((await centroDe()).status).toBe("NECESSITA_REFORMA");
    expect((await centroDe()).level).toBe(3); // nível preservado
    // As obras já iniciadas continuam.
    expect(await prisma.villageConstruction.count({ where: { status: "IN_PROGRESS" } })).toBe(2);
    const capacidade = await constructions.capacityView("KONOHA");
    expect(capacidade.total).toBe(1);
    expect(capacidade.limitadaPorReforma).toBe(true);
    // Novo início é recusado: já há 2 ocupadas contra o teto de 1.
    const terceira = await constructions.startConstruction(
      "KONOHA",
      "SECTOR",
      "SILVICULTURA_COLETA",
      "kage1",
    );
    expect(terceira.ok).toBe(false);
  });

  it("obra não começa com reforma pendente no próprio prédio", async () => {
    await comSetorNivel3();
    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    await maintenance.applyOverdueMaintenance(new Date(segunda.getTime() + 73 * 3_600_000));

    const r = await constructions.startConstruction(
      "KONOHA",
      "SECTOR",
      "SILVICULTURA_COLETA",
      "kage1",
    );

    expect(r.ok).toBe(false);
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
  });

  it("Ichiraku suspenso não vende e volta ao pagar", async () => {
    await fixarPopulacao(10);
    // A reforma cobra Ryō E material: sem estoque, o pagamento falha inteiro.
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 10_000 } });
    await prisma.villageShop.updateMany({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
      data: { status: "ACTIVE", discordChannelId: "c1" },
    });
    const shop = await prisma.villageShop.findFirstOrThrow({
      where: { villageId: "KONOHA", shopType: "ICHIRAKU" },
    });
    await prisma.villageShopStock.create({
      data: { shopId: shop.id, itemId: "lamen", name: "Lámen", qty: 5 },
    });
    await prisma.villageShop.update({ where: { id: shop.id }, data: { stockUnits: 5 } });
    const char = await novoNinja({ ryo: 1000 });

    await maintenance.openMaintenanceCycle(segunda, ["KONOHA"]);
    await maintenance.applyOverdueMaintenance(new Date(segunda.getTime() + 73 * 3_600_000));

    const bloqueada = await shops.buyFromShop(char.id, "KONOHA", "ICHIRAKU", "lamen", 1, "u1");
    expect(bloqueada.ok).toBe(false);

    const cobranca = await prisma.villageMaintenanceCharge.findFirstOrThrow({
      where: { buildingKey: "ICHIRAKU" },
    });
    const pago = await maintenance.payMaintenance(cobranca.id, "kage1");

    expect(pago.ok).toBe(true);
    expect((await prisma.villageShop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe(
      "ACTIVE",
    );
    const liberada = await shops.buyFromShop(char.id, "KONOHA", "ICHIRAKU", "lamen", 1, "u1");
    expect(liberada.ok).toBe(true);
  });
});

// ---------------- Bônus de coleta ----------------

describe("bônus de coleta do setor", () => {
  // A ordem de rng() é contrato: [total] [um por unidade] [raro] [bônus].
  const seq = (valores: number[]) => {
    let i = 0;
    return () => valores[Math.min(i++, valores.length - 1)]!;
  };

  it("setor nível 5 rende unidades extras só em recurso comum", async () => {
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 5, "teste", "staff");
    const char = await novoNinja();

    // total = 7 (0,99), sete sorteios em `pedra` (0), raro não sai (0,99),
    // bônus: 7 × 0,20 = 1,4 -> 1 garantido + 40% de chance; 0,1 acerta.
    const r = await gathering.performGathering(char.id, MONTANHA, "MINERAR", {
      rng: seq([0.99, 0, 0, 0, 0, 0, 0, 0, 0.99, 0.1]),
      villageId: "KONOHA",
    });

    expect(r.ok && r.result.loot).toEqual([{ itemId: "pedra", qty: 9 }]);
  });

  it("sem setor evoluído a coleta não muda", async () => {
    const char = await novoNinja();

    const r = await gathering.performGathering(char.id, MONTANHA, "MINERAR", {
      rng: seq([0.99, 0, 0, 0, 0, 0, 0, 0, 0.99]),
      villageId: "KONOHA",
    });

    expect(r.ok && r.result.loot).toEqual([{ itemId: "pedra", qty: 7 }]);
  });

  it("o bônus nunca soma no recurso raro", async () => {
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 5, "teste", "staff");
    const char = await novoNinja();

    // O raro sai (0,01 < 5%) e o bônus rende extras: eles vão para a pedra.
    const r = await gathering.performGathering(char.id, MONTANHA, "MINERAR", {
      rng: seq([0.99, 0, 0, 0, 0, 0, 0, 0, 0.01, 0.0]),
      villageId: "KONOHA",
    });

    // 7 pedras × 20% = 1,4 -> 1 garantido + 40% de chance; o dado 0,0 acerta.
    // O raro está no loot mas não conta na base nem recebe extra.
    const loot = r.ok ? r.result.loot : [];
    expect(loot.find((e) => e.itemId === "minerio_raro")?.qty).toBe(1);
    expect(loot.find((e) => e.itemId === "pedra")?.qty).toBe(9);
  });

  it("setor em reforma não bonifica", async () => {
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 5, "teste", "staff");
    await prisma.villageUpgrade.updateMany({
      where: { villageId: "KONOHA", sectorKey: "MINAS_FUNDICOES" },
      data: { status: "NECESSITA_REFORMA" },
    });
    const char = await novoNinja();

    const r = await gathering.performGathering(char.id, MONTANHA, "MINERAR", {
      rng: seq([0.99, 0, 0, 0, 0, 0, 0, 0, 0.99]),
      villageId: "KONOHA",
    });

    expect(r.ok && r.result.loot).toEqual([{ itemId: "pedra", qty: 7 }]);
  });

  it("o setor errado não bonifica a ação", async () => {
    // Poços é nível 5, mas mineração é bonificada por Minas.
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 5, "teste", "staff");
    const char = await novoNinja();

    const r = await gathering.performGathering(char.id, MONTANHA, "MINERAR", {
      rng: seq([0.99, 0, 0, 0, 0, 0, 0, 0, 0.99]),
      villageId: "KONOHA",
    });

    expect(r.ok && r.result.loot).toEqual([{ itemId: "pedra", qty: 7 }]);
  });

  it("ninja sem vila não recebe bônus de vila nenhuma", async () => {
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 5, "teste", "staff");
    const char = await novoNinja();

    const r = await gathering.performGathering(char.id, MONTANHA, "MINERAR", {
      rng: seq([0.99, 0, 0, 0, 0, 0, 0, 0, 0.99]),
      villageId: null,
    });

    expect(r.ok && r.result.loot).toEqual([{ itemId: "pedra", qty: 7 }]);
  });
});

// ---------------- Comandos da staff ----------------

describe("ajuste de nível pela staff", () => {
  it("nivel set fica consistente e não deixa obra fantasma", async () => {
    await fixarPopulacao(20);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500_000 } });
    await constructions.startConstruction("KONOHA", "SECTOR", "MINAS_FUNDICOES", "kage1");

    const r = await adminLevels.setSectorLevel(
      "KONOHA",
      "MINAS_FUNDICOES",
      3,
      "pedido da staff: Minas de Iwa nível 3",
      "staff1",
    );

    expect(r.ok && r.para).toBe(3);
    expect(r.ok && r.obrasCanceladas).toBe(1);
    const setor = await setorDe("MINAS_FUNDICOES");
    expect(setor.level).toBe(3);
    expect(setor.constructingTo).toBeNull();
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
    expect(await prisma.villageConstruction.count({ where: { status: "IN_PROGRESS" } })).toBe(0);
    // A vaga liberada permite iniciar de novo, agora rumo ao 4.
    const denovo = await constructions.startConstruction(
      "KONOHA",
      "SECTOR",
      "MINAS_FUNDICOES",
      "kage1",
    );
    expect(denovo.ok && denovo.targetLevel).toBe(4);
  });

  it("gera lançamento com o motivo", async () => {
    await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 3, "motivo auditável", "staff1");

    const lancamento = await prisma.villageLedger.findFirstOrThrow({
      where: { villageId: "KONOHA", type: "ADMIN_ADJUSTMENT" },
      orderBy: { createdAt: "desc" },
    });
    expect(lancamento.reason).toBe("motivo auditável");
    expect(lancamento.actorDiscordId).toBe("staff1");
    expect(JSON.parse(lancamento.metaJson)).toMatchObject({ field: "sectorLevel", to: 3 });
  });

  it("rebaixar a 0 encerra a reforma que perdeu o objeto", async () => {
    await fixarPopulacao(10);
    await adminLevels.setSectorLevel("KONOHA", "SILVICULTURA_COLETA", 3, "teste", "staff");
    await maintenance.openMaintenanceCycle(new Date("2026-08-10T03:20:00Z"), ["KONOHA"]);
    await maintenance.applyOverdueMaintenance(new Date("2026-08-13T05:00:00Z"));
    expect((await setorDe("SILVICULTURA_COLETA")).status).toBe("NECESSITA_REFORMA");

    const r = await adminLevels.setSectorLevel("KONOHA", "SILVICULTURA_COLETA", 0, "zerar", "staff");

    expect(r.ok && r.reformasEncerradas).toBe(1);
    expect((await setorDe("SILVICULTURA_COLETA")).status).toBe("OK");
    expect(
      await prisma.villageMaintenanceCharge.count({ where: { status: { in: ["PENDING", "OVERDUE"] } } }),
    ).toBe(0);
  });

  it("centro set atualiza capacidade e limpa obra do próprio Centro", async () => {
    await fixarPopulacao(20);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500_000 } });
    await constructions.startConstruction("KONOHA", "CENTER", CENTER.buildingKey, "kage1");

    const r = await adminLevels.setCenterLevel("KONOHA", 3, "correção", "staff1");

    expect(r.ok && r.obrasCanceladas).toBe(1);
    expect((await centroDe()).level).toBe(3);
    expect((await centroDe()).constructingTo).toBeNull();
    expect((await constructions.capacityView("KONOHA")).total).toBe(3);
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
  });

  it("recusa nível fora da faixa", async () => {
    expect((await adminLevels.setSectorLevel("KONOHA", "MINAS_FUNDICOES", 6, "x", "s")).ok).toBe(false);
    expect((await adminLevels.setCenterLevel("KONOHA", 0, "x", "s")).ok).toBe(false);
    expect((await adminLevels.setCenterLevel("KONOHA", 4, "x", "s")).ok).toBe(false);
  });

  it("manutencao resolver perdoa a pendência e reativa", async () => {
    await fixarPopulacao(10);
    await adminLevels.setSectorLevel("KONOHA", "SILVICULTURA_COLETA", 3, "teste", "staff");
    await maintenance.openMaintenanceCycle(new Date("2026-08-10T03:20:00Z"), ["KONOHA"]);
    await maintenance.applyOverdueMaintenance(new Date("2026-08-13T05:00:00Z"));

    const r = await maintenance.resolveMaintenance(
      "KONOHA",
      "SILVICULTURA_COLETA",
      "perdão da staff",
      "staff1",
    );

    expect(r.ok && r.resolvidas).toBe(1);
    expect((await setorDe("SILVICULTURA_COLETA")).status).toBe("OK");
    expect((await setorDe("SILVICULTURA_COLETA")).level).toBe(3);
    // Nada foi cobrado do cofre.
    expect((await cofreDe()).treasuryRyo).toBe(0);
  });

  it("populacao override muda o fator e -1 volta à apuração real", async () => {
    const { activePopulation } = await import("../src/services/economy/population.js");

    await adminLevels.setPopulationOverride("KONOHA", 30, "vila nova", "staff1");
    const fixado = await activePopulation("KONOHA");
    expect(fixado.ativos).toBe(30);
    expect(fixado.factor).toBe(1.5);
    expect(fixado.override).toBe(true);

    await adminLevels.setPopulationOverride("KONOHA", null, "solta", "staff1");
    const real = await activePopulation("KONOHA");
    expect(real.override).toBe(false);
    expect(real.ativos).toBe(0);
  });

  it("obra concluir força o fechamento pelo mesmo caminho do job", async () => {
    await fixarPopulacao(20);
    await encherEstoque();
    await prisma.village.update({ where: { id: "KONOHA" }, data: { treasuryRyo: 500_000 } });
    const r = await constructions.startConstruction("KONOHA", "SECTOR", "MINAS_FUNDICOES", "kage1");

    const forcada = await constructions.forceFinishConstruction(
      r.ok ? r.obra.id : "",
      "evento",
      "staff1",
    );

    expect(forcada.ok && forcada.concluidas).toHaveLength(1);
    expect((await setorDe("MINAS_FUNDICOES")).level).toBe(1);
    expect((await cofreDe()).constructionSlotsUsed).toBe(0);
  });
});

// ---------------- Inventário do ninja não é tocado ----------------

describe("limites da etapa", () => {
  it("produção passiva vai para o estoque central, nunca para um personagem", async () => {
    await fixarPopulacao(20);
    const char = await novoNinja();
    await adminLevels.setSectorLevel("KONOHA", "POCOS_RESERVATORIOS", 3, "teste", "staff");

    await production.runVillageProduction("KONOHA", "2026-08-12");

    expect(await central("agua_limpa")).toBe(28);
    expect(await prisma.$transaction((tx) => inventory.getInventoryQty(tx, char.id, "agua_limpa"))).toBe(0);
  });

  it("a chance de recurso raro continua em 5%", async () => {
    const { ECONOMY } = await import("../src/config/balance.js");
    expect(ECONOMY.rareResourceChance).toBe(0.05);
  });
});
