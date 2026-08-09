import { describe, expect, it } from "vitest";
import { getAbility, getNpc } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import {
  applyCrystalStacks,
  applyCrystalToMove,
  crystalDodgePenalty,
  isPrismed,
  refractDamage,
  type EffectState,
} from "../src/services/combat/effects.js";
import { BALANCE } from "../src/config/balance.js";
import { isKekkeiGenkai } from "../src/config/enums.js";

const IDS = [
  "shouton_shuriken_cristal",
  "shouton_espinhos_crescentes",
  "shouton_prisao_jade",
  "shouton_clone_jade",
  "shouton_barragem_jade",
  "shouton_danca_hexagonal",
  "shouton_shuriken_gigante",
  "shouton_dragao_cadente",
  "shouton_fio_luz",
  "shouton_oito_paredes",
] as const;

const ef = (effectId: string, stacks = 1, duration = 3): EffectState =>
  ({ effectId, stacks, duration }) as EffectState;

describe("Cristal: integridade da arvore", () => {
  it("liga todos os dez jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "CRISTAL" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Cristal e compra manual", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "CRISTAL", manualOnly: true });
    }
  });

  it("todo no PASSIVE de Cristal tem definicao", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "CRISTAL")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("o corpo do Clone Cristal de Jade existe e tem jutsu valido", () => {
    const clone = getAbility("shouton_clone_jade")!;
    const tpl = getNpc(clone.summon!.templateId);
    expect(tpl, "template do clone de cristal").toBeTruthy();
    expect(tpl!.hpMax).toBeGreaterThan(0);
    for (const abId of tpl!.abilityIds) expect(getAbility(abId), abId).toBeTruthy();
  });

  it("CRISTAL e' kekkei genkai", () => {
    expect(isKekkeiGenkai("CRISTAL")).toBe(true);
    expect(isKekkeiGenkai("FOGO")).toBe(false);
  });
});

describe("Cristal: passivas", () => {
  const nodes = ["cristal_raiz", "cristal_faceta", "cristal_estilhaco", "cristal_rede"];
  const shuriken = getAbility("shouton_shuriken_cristal")!;

  it("raiz e Faceta Perfeita fecham em 2.025x", () => {
    const mods = passiveMods(["cristal_raiz", "cristal_faceta"], shuriken);
    expect(mods.damageMult).toBeCloseTo(2.025, 3);
    expect(mods.damageMult).toBeGreaterThan(2.015);
  });

  it("Faceta Cortante crava 1 acumulo a mais", () => {
    expect(passiveMods(nodes, shuriken).extraCrystalStacks).toBe(1);
  });

  it("Rede Cristalina estende terreno e Cristalizado", () => {
    const mods = passiveMods(nodes, shuriken);
    expect(mods.terrainDurationBonus).toBe(1);
    expect(mods.effectDurationBonus.CRYSTALLIZED).toBe(1);
  });

  it("passiva de Cristal nao afeta jutsu de Fogo", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(nodes, bola).damageMult).toBe(1);
  });
});

describe("Cristalizado", () => {
  const C = BALANCE.effects.CRYSTALLIZED;

  it("acumula sem selar abaixo do gatilho", () => {
    expect(applyCrystalStacks(1, 1)).toEqual({ stacks: 2, sealed: false });
  });

  it("sela e zera os acumulos ao bater no gatilho", () => {
    expect(applyCrystalStacks(3, 1)).toEqual({ stacks: 0, sealed: true });
    expect(applyCrystalStacks(0, C.sealAtStacks)).toEqual({ stacks: 0, sealed: true });
  });

  it("NAO causa dano por turno — o payoff e' controle, nao dano", () => {
    // diferenca central para a Queimadura: BURN explode em dano, Cristal sela.
    expect(C).not.toHaveProperty("dmgPerTurn");
  });

  it("cada acumulo tira esquiva", () => {
    expect(crystalDodgePenalty([ef("CRYSTALLIZED", 3)])).toBeCloseTo(0.24, 5);
    expect(crystalDodgePenalty([ef("BURN", 3)])).toBe(0);
  });

  it("cada acumulo tira movimento e pode zerar", () => {
    expect(applyCrystalToMove(4, [ef("CRYSTALLIZED", 1)])).toBe(3);
    expect(applyCrystalToMove(2, [ef("CRYSTALLIZED", 3)])).toBe(0);
  });

  it("acumulo expirado nao conta", () => {
    expect(applyCrystalToMove(4, [ef("CRYSTALLIZED", 2, 0)])).toBe(4);
  });

  it("Oito Paredes crava 2 — sela quem ja tem cristal, mas nunca do zero", () => {
    const paredes = getAbility("shouton_oito_paredes")!;
    const stacks = paredes.effects!.find((e) => e.effectId === "CRYSTALLIZED")!.stacks!;
    expect(stacks).toBe(2);
    // com 1 cristal ja' no corpo -> sela, exatamente o que a descricao promete
    expect(applyCrystalStacks(1, stacks + 1).sealed).toBe(true);
    // do zero, mesmo com a Faceta Cortante (+1), NAO sela num uso so'
    expect(applyCrystalStacks(0, stacks + 1).sealed).toBe(false);
  });
});

describe("Prisma (Fio de Luz)", () => {
  const prisma = [ef("PRISM", 1, 2)];

  it("corta o ninjutsu recebido e reflete parte no atacante", () => {
    const { damageTaken, reflected } = refractDamage(100, true, prisma);
    expect(damageTaken).toBe(40); // -60%
    expect(reflected).toBe(18); // 30% dos 60 barrados
  });

  it("NAO protege de Taijutsu/Bukijutsu — quem chega perto ganha a troca", () => {
    expect(refractDamage(100, false, prisma)).toEqual({ damageTaken: 100, reflected: 0 });
  });

  it("sem Prisma ativo o dano passa inteiro", () => {
    expect(refractDamage(100, true, [])).toEqual({ damageTaken: 100, reflected: 0 });
    expect(refractDamage(100, true, [ef("PRISM", 1, 0)])).toEqual({
      damageTaken: 100,
      reflected: 0,
    });
  });

  it("isPrismed reconhece so o efeito ativo", () => {
    expect(isPrismed(prisma)).toBe(true);
    expect(isPrismed([ef("PRISM", 1, 0)])).toBe(false);
  });

  it("Fio de Luz e' acao bonus, SELF e nao causa dano", () => {
    const fio = getAbility("shouton_fio_luz")!;
    expect(fio.actionType).toBe("BONUS");
    expect(fio.shape).toBe("SELF");
    expect(fio.baseDamage).toBeUndefined();
    expect(fio.effects).toEqual([{ effectId: "PRISM", duration: 2 }]);
  });
});
