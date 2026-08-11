// Regras puras da etapa 06: tabela mestre de setores e Centro, custo acumulado,
// reforma semanal, produção diária, bônus de coleta e as âncoras de horário.

import { describe, expect, it } from "vitest";
import { ECONOMY } from "../src/config/balance.js";
import { isRareResource } from "../src/data/items.js";
import {
  CENTER,
  MAX_CENTER_LEVEL,
  MAX_SECTOR_LEVEL,
  SECTORS,
  SECTOR_KEYS,
  centerCapacity,
  centerLevelCost,
  centerMaintenanceDiscount,
  sectorLevelCost,
  sectorProductionBase,
} from "../src/data/sectors.js";
import {
  accumulatedCost,
  bonusUnits,
  dailyProduction,
  distributeBonus,
  effectiveCapacity,
  effectiveCenterDiscount,
  maintenanceDue,
  nextLevelCost,
  scaleCost,
  sectorGatherBonus,
} from "../src/services/economy/sector-math.js";
import {
  dayKeyFor,
  maintenanceCycleKey,
  maintenanceCycleStart,
  nextDailyAt,
  nextMaintenanceCycle,
} from "../src/services/economy/week.js";
import { populationFactor } from "../src/services/economy/population.js";

describe("tabela mestre dos setores", () => {
  it("custo comum bate linha a linha com a seção 6.3", () => {
    const esperado = [
      { nivel: 1, ryo: 1200, madeira: 80, pedra: 80, ferro: 20, horas: 3 },
      { nivel: 2, ryo: 2100, madeira: 140, pedra: 130, ferro: 40, horas: 24 },
      { nivel: 3, ryo: 3600, madeira: 240, pedra: 220, ferro: 70, horas: 72 },
      { nivel: 4, ryo: 5800, madeira: 380, pedra: 350, ferro: 120, horas: 168 },
      { nivel: 5, ryo: 9000, madeira: 600, pedra: 550, ferro: 200, horas: 360 },
    ];
    for (const linha of esperado) {
      const custo = sectorLevelCost("MINAS_FUNDICOES", linha.nivel)!;
      expect(custo.ryo, `nível ${linha.nivel}`).toBe(linha.ryo);
      expect(custo.items.madeira).toBe(linha.madeira);
      expect(custo.items.pedra).toBe(linha.pedra);
      expect(custo.items.minerio_ferro).toBe(linha.ferro);
      expect(custo.durationMs).toBe(linha.horas * 3_600_000);
    }
  });

  it("materiais específicos por setor", () => {
    expect(sectorLevelCost("CRIACAO_HORTAS", 3)!.items).toMatchObject({ grao: 100, couro: 40 });
    expect(sectorLevelCost("MINAS_FUNDICOES", 4)!.items).toMatchObject({ carvao: 120 });
    expect(sectorLevelCost("SILVICULTURA_COLETA", 2)!.items).toMatchObject({ fibra_vegetal: 45 });
    expect(sectorLevelCost("POCOS_RESERVATORIOS", 1)!.items).toMatchObject({
      argila: 20,
      fibra_vegetal: 10,
    });
  });

  it("o nível 5 exige o material raro certo", () => {
    expect(sectorLevelCost("MINAS_FUNDICOES", 5)!.items.minerio_raro).toBe(1);
    expect(sectorLevelCost("SILVICULTURA_COLETA", 5)!.items.madeira_reforcada).toBe(1);
    expect(sectorLevelCost("CRIACAO_HORTAS", 5)!.items).toMatchObject({
      grao: 240,
      couro: 100,
      agua_limpa: 80,
    });
  });

  it("um setor completo custa 26 dias e 3 horas de obra", () => {
    const total = [1, 2, 3, 4, 5]
      .map((nivel) => sectorLevelCost("MINAS_FUNDICOES", nivel)!.durationMs)
      .reduce((soma, ms) => soma + ms, 0);
    expect(total).toBe(26 * 24 * 3_600_000 + 3 * 3_600_000);
  });

  it("não existe nível acima do 5", () => {
    expect(sectorLevelCost("MINAS_FUNDICOES", 6)).toBeUndefined();
    expect(nextLevelCost("SECTOR", "MINAS_FUNDICOES", MAX_SECTOR_LEVEL)).toBeUndefined();
  });

  it("cada setor bonifica a ação certa e só Poços tem item exclusivo", () => {
    const porAcao = Object.fromEntries(SECTORS.map((s) => [s.key, s.bonusAction]));
    expect(porAcao).toEqual({
      CRIACAO_HORTAS: "CACAR",
      MINAS_FUNDICOES: "MINERAR",
      SILVICULTURA_COLETA: "COLETAR",
      POCOS_RESERVATORIOS: "COLETAR_AGUA",
    });
    expect(SECTORS.filter((s) => s.bonusOnlyItemId).map((s) => s.key)).toEqual([
      "POCOS_RESERVATORIOS",
    ]);
    expect(SECTORS.find((s) => s.key === "POCOS_RESERVATORIOS")?.bonusOnlyItemId).toBe("agua_limpa");
  });
});

describe("Centro da Vila", () => {
  it("custos e tempos da seção 6.1", () => {
    expect(centerLevelCost(2)).toMatchObject({
      ryo: 5000,
      items: { madeira: 300, pedra: 260, minerio_ferro: 100 },
      durationMs: 3 * 24 * 3_600_000,
    });
    expect(centerLevelCost(3)).toMatchObject({
      ryo: 11000,
      items: { madeira: 650, pedra: 550, minerio_ferro: 220 },
      durationMs: 10 * 24 * 3_600_000,
    });
  });

  it("nível 1 é gratuito e não há nível 4", () => {
    expect(centerLevelCost(1)).toBeUndefined();
    expect(centerLevelCost(4)).toBeUndefined();
    expect(nextLevelCost("CENTER", CENTER.buildingKey, MAX_CENTER_LEVEL)).toBeUndefined();
  });

  it("capacidade é 1 / 2 / 3", () => {
    expect(centerCapacity(1)).toBe(1);
    expect(centerCapacity(2)).toBe(2);
    expect(centerCapacity(3)).toBe(3);
  });

  it("desconto de manutenção é 0% / 10% / 20%", () => {
    expect(centerMaintenanceDiscount(1)).toBe(1);
    expect(centerMaintenanceDiscount(2)).toBe(0.9);
    expect(centerMaintenanceDiscount(3)).toBe(0.8);
  });

  it("Centro em reforma perde o desconto e trava a fila em uma vaga", () => {
    expect(effectiveCenterDiscount(3, "OK")).toBe(0.8);
    expect(effectiveCenterDiscount(3, "NECESSITA_REFORMA")).toBe(1);
    expect(effectiveCapacity(3, "OK")).toBe(3);
    expect(effectiveCapacity(3, "NECESSITA_REFORMA")).toBe(1);
    expect(effectiveCapacity(1, "OK")).toBe(1);
  });
});

describe("fator de população no custo", () => {
  it("arredonda para cima", () => {
    const custo = scaleCost({ ryo: 3600, items: { madeira: 240, pedra: 220 } }, 0.3);
    expect(custo.ryo).toBe(1080);
    expect(custo.items).toEqual({ madeira: 72, pedra: 66 });
  });

  it("nunca zera material por fator baixo", () => {
    const custo = scaleCost({ ryo: 10, items: { minerio_raro: 1 } }, ECONOMY.populationFactorMin);
    expect(custo.items.minerio_raro).toBe(1);
    expect(custo.ryo).toBeGreaterThan(0);
  });

  it("o fator segue preso entre 0,30 e 1,50", () => {
    expect(populationFactor(10)).toBeCloseTo(0.5);
    expect(populationFactor(20)).toBe(1);
    expect(populationFactor(2)).toBe(0.3);
    expect(populationFactor(100)).toBe(1.5);
  });
});

describe("custo acumulado (base da reforma)", () => {
  it("soma todos os níveis já investidos no setor", () => {
    const total = accumulatedCost("SECTOR", "MINAS_FUNDICOES", 3);
    expect(total.ryo).toBe(1200 + 2100 + 3600);
    expect(total.items.madeira).toBe(80 + 140 + 240);
    expect(total.items.carvao).toBe(25 + 45 + 75);
  });

  it("o Centro começa a somar no nível 2, porque o 1 é grátis", () => {
    expect(accumulatedCost("CENTER", CENTER.buildingKey, 1).ryo).toBe(0);
    expect(accumulatedCost("CENTER", CENTER.buildingKey, 2).ryo).toBe(5000);
    expect(accumulatedCost("CENTER", CENTER.buildingKey, 3).ryo).toBe(16000);
  });

  it("setor nível 0 não acumula nada", () => {
    expect(accumulatedCost("SECTOR", "CRIACAO_HORTAS", 0)).toEqual({ ryo: 0, items: {} });
  });

  it("só o Ichiraku acumula entre as lojas", () => {
    expect(accumulatedCost("SHOP", "ICHIRAKU", 1).ryo).toBe(7500);
    // Empório, Marcenaria, Fundição e Oficina são infraestrutura inicial.
    expect(accumulatedCost("SHOP", "EMPORIO", 1)).toEqual({ ryo: 0, items: {} });
  });
});

describe("reforma semanal", () => {
  const setorNivel3 = accumulatedCost("SECTOR", "SILVICULTURA_COLETA", 3);

  it("reproduz os 104 / 94 / 84 Ryō do exemplo da seção 6.4", () => {
    expect(maintenanceDue(setorNivel3, 0.5, 1).ryo).toBe(104);
    expect(maintenanceDue(setorNivel3, 0.5, 0.9).ryo).toBe(94);
    expect(maintenanceDue(setorNivel3, 0.5, 0.8).ryo).toBe(84);
  });

  it("o desconto do Centro não toca material", () => {
    const semDesconto = maintenanceDue(setorNivel3, 0.5, 1).items;
    const comDesconto = maintenanceDue(setorNivel3, 0.5, 0.8).items;
    expect(comDesconto).toEqual(semDesconto);
  });

  it("cobra 1% de cada material acumulado, arredondando para cima", () => {
    const devido = maintenanceDue(setorNivel3, 0.5, 1);
    // madeira acumulada 460 -> teto(1% × 460 × 0,5) = 3
    expect(devido.items.madeira).toBe(3);
    expect(devido.items.minerio_ferro).toBe(1);
  });

  it("cresce com o nível", () => {
    const n1 = maintenanceDue(accumulatedCost("SECTOR", "MINAS_FUNDICOES", 1), 0.5, 1).ryo;
    const n5 = maintenanceDue(accumulatedCost("SECTOR", "MINAS_FUNDICOES", 5), 0.5, 1).ryo;
    expect(n5).toBeGreaterThan(n1 * 5);
  });

  it("é bem menor que uma obra", () => {
    const obra = sectorLevelCost("MINAS_FUNDICOES", 3)!.ryo;
    expect(maintenanceDue(setorNivel3, 0.5, 1).ryo).toBeLessThan(obra / 10);
  });

  it("prédio sem custo acumulado não gera cobrança", () => {
    expect(maintenanceDue({ ryo: 0, items: {} }, 1, 1)).toEqual({ ryo: 0, items: {} });
  });
});

describe("produção diária", () => {
  it("nível 0 não produz", () => {
    for (const key of SECTOR_KEYS) {
      expect(sectorProductionBase(key, 0), key).toEqual({});
      expect(dailyProduction(key, 0, 1), key).toEqual({});
    }
  });

  it("bate com a tabela da seção 6.3 no fator 1", () => {
    expect(dailyProduction("CRIACAO_HORTAS", 1, 1)).toEqual({ carne_crua: 8, grao: 4, couro: 2 });
    expect(dailyProduction("MINAS_FUNDICOES", 3, 1)).toEqual({
      pedra: 28,
      minerio_ferro: 13,
      carvao: 10,
    });
    expect(dailyProduction("POCOS_RESERVATORIOS", 5, 1)).toEqual({ agua_limpa: 55 });
  });

  it("aplica o fator arredondando para cima", () => {
    expect(dailyProduction("POCOS_RESERVATORIOS", 1, 0.3)).toEqual({ agua_limpa: 3 });
    expect(dailyProduction("POCOS_RESERVATORIOS", 1, 1.5)).toEqual({ agua_limpa: 15 });
  });

  it("Poços produzem SOMENTE água limpa", () => {
    for (let nivel = 1; nivel <= MAX_SECTOR_LEVEL; nivel += 1) {
      expect(Object.keys(dailyProduction("POCOS_RESERVATORIOS", nivel, 1)), `nível ${nivel}`).toEqual([
        "agua_limpa",
      ]);
    }
  });

  it("NUNCA produz Minério Raro nem Madeira Reforçada", () => {
    for (const key of SECTOR_KEYS) {
      for (let nivel = 1; nivel <= MAX_SECTOR_LEVEL; nivel += 1) {
        for (const itemId of Object.keys(dailyProduction(key, nivel, 1.5))) {
          expect(isRareResource(itemId), `${key} nível ${nivel}: ${itemId}`).toBe(false);
        }
      }
    }
  });

  it("a produção sobe monotonicamente com o nível", () => {
    for (const key of SECTOR_KEYS) {
      let anterior = 0;
      for (let nivel = 1; nivel <= MAX_SECTOR_LEVEL; nivel += 1) {
        const total = Object.values(dailyProduction(key, nivel, 1)).reduce((s, q) => s + q, 0);
        expect(total, `${key} nível ${nivel}`).toBeGreaterThan(anterior);
        anterior = total;
      }
    }
  });
});

describe("bônus de coleta", () => {
  it("+5% por nível a partir do 2, até +20%", () => {
    expect(sectorGatherBonus(0)).toBe(0);
    expect(sectorGatherBonus(1)).toBe(0);
    expect(sectorGatherBonus(2)).toBeCloseTo(0.05);
    expect(sectorGatherBonus(3)).toBeCloseTo(0.1);
    expect(sectorGatherBonus(4)).toBeCloseTo(0.15);
    expect(sectorGatherBonus(5)).toBeCloseTo(0.2);
  });

  it("setor em reforma não bonifica", () => {
    expect(sectorGatherBonus(5, "NECESSITA_REFORMA")).toBe(0);
  });

  it("a fração vira chance, não arredondamento", () => {
    // 5 unidades a +5% = 0,25 exato: 25% de chance de +1, senão 0.
    expect(bonusUnits(5, 0.05, 0.2)).toBe(1);
    expect(bonusUnits(5, 0.05, 0.9)).toBe(0);
    // 10 unidades a +20% = 2 exatos: sempre 2, qualquer que seja o dado.
    expect(bonusUnits(10, 0.2, 0.0)).toBe(2);
    expect(bonusUnits(10, 0.2, 0.99)).toBe(2);
  });

  it("sem bônus ou sem loot comum, não há extra", () => {
    expect(bonusUnits(7, 0, 0)).toBe(0);
    expect(bonusUnits(0, 0.2, 0)).toBe(0);
  });

  it("distribui do maior monte para o menor, em rodízio", () => {
    const loot = [
      { itemId: "madeira", qty: 4 },
      { itemId: "fibra_vegetal", qty: 2 },
    ];
    expect(distributeBonus(loot, 3, () => true)).toEqual([
      { itemId: "madeira", qty: 6 },
      { itemId: "fibra_vegetal", qty: 3 },
    ]);
  });

  it("NUNCA soma em recurso raro", () => {
    const loot = [
      { itemId: "minerio_raro", qty: 1 },
      { itemId: "pedra", qty: 3 },
    ];
    const saida = distributeBonus(loot, 5, () => true);
    expect(saida.find((e) => e.itemId === "minerio_raro")?.qty).toBe(1);
    expect(saida.find((e) => e.itemId === "pedra")?.qty).toBe(8);
  });

  it("Poços só somam em água limpa", () => {
    const loot = [
      { itemId: "agua_limpa", qty: 5 },
      { itemId: "argila", qty: 3 },
    ];
    const saida = distributeBonus(loot, 2, (id) => id === "agua_limpa");
    expect(saida).toEqual([
      { itemId: "agua_limpa", qty: 7 },
      { itemId: "argila", qty: 3 },
    ]);
  });

  it("loot só de raro não recebe nada", () => {
    const loot = [{ itemId: "madeira_reforcada", qty: 1 }];
    expect(distributeBonus(loot, 3, () => true)).toEqual(loot);
  });
});

describe("âncoras de horário dos jobs", () => {
  it("a produção diária acorda às 00:05 de São Paulo", () => {
    // 12/08 15:00 UTC = 12:00 local -> próxima 00:05 é 13/08 local = 03:05 UTC.
    const alvo = nextDailyAt(new Date("2026-08-12T15:00:00Z"), 0, 5);
    expect(alvo.toISOString()).toBe("2026-08-13T03:05:00.000Z");
    expect(dayKeyFor(alvo)).toBe("2026-08-13");
  });

  it("não pula o horário quando ainda falta chegar nele", () => {
    // 13/08 02:00 UTC = 12/08 23:00 local: a próxima 00:05 é daqui a 1h05.
    const alvo = nextDailyAt(new Date("2026-08-13T02:00:00Z"), 0, 5);
    expect(alvo.toISOString()).toBe("2026-08-13T03:05:00.000Z");
  });

  it("o ciclo de reforma abre na segunda 00:15 local", () => {
    // 2026-08-10 é uma segunda-feira.
    const meioDaSemana = new Date("2026-08-13T15:00:00Z"); // quinta 12:00 local
    const inicio = maintenanceCycleStart(meioDaSemana);
    expect(inicio.toISOString()).toBe("2026-08-10T03:15:00.000Z");
    expect(maintenanceCycleKey(meioDaSemana)).toBe("2026-08-10");
    expect(nextMaintenanceCycle(meioDaSemana).toISOString()).toBe("2026-08-17T03:15:00.000Z");
  });

  it("segunda antes das 00:15 ainda pertence ao ciclo anterior", () => {
    // 2026-08-17 03:00 UTC = segunda 00:00 local, quinze minutos antes do corte.
    expect(maintenanceCycleKey(new Date("2026-08-17T03:00:00Z"))).toBe("2026-08-10");
    expect(maintenanceCycleKey(new Date("2026-08-17T03:20:00Z"))).toBe("2026-08-17");
  });

  it("o ciclo de reforma tem âncora própria, diferente da competência do imposto", () => {
    // Imposto fecha domingo 22:00; reforma abre segunda 00:15. Domingo 23:00
    // local já é competência nova, mas ainda é o ciclo de reforma antigo.
    const domingoTarde = new Date("2026-08-17T02:00:00Z"); // domingo 23:00 local
    expect(maintenanceCycleKey(domingoTarde)).toBe("2026-08-10");
  });

  it("as 72 h de graça são o prazo da seção 6.4", () => {
    expect(ECONOMY.maintenanceGraceMs).toBe(72 * 3_600_000);
    expect(ECONOMY.maintenanceRyoRate).toBe(0.03);
    expect(ECONOMY.maintenanceItemRate).toBe(0.01);
  });
});
