import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { isKekkeiGenkai } from "../src/config/enums.js";

const IDS = ["gelo_agulhas", "gelo_espelho", "gelo_domo", "gelo_chuva_agulhas", "gelo_agulhas_mil"] as const;

describe("Gelo: integridade da arvore (ex-clã Yuki, migrado pra kekkei genkai)", () => {
  it("liga os cinco jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "GELO" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Gelo e compra manual (não clanId)", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "GELO", manualOnly: true });
      expect(ability!.requirements?.clanId).toBeUndefined();
    }
  });

  it("Gelo é kekkei genkai", () => {
    expect(isKekkeiGenkai("GELO")).toBe(true);
  });

  it("as quatro passivas têm definição em PASSIVES (não mais em CLAN_PASSIVES)", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "GELO")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
    expect(allNodes().filter((n) => n.kind === "PASSIVE" && n.element === "GELO")).toHaveLength(4);
  });

  it("a ramificação de defesa (Domo + Reflexos) sai das Agulhas de Gelo e termina em beco sem saída", () => {
    const domo = allNodes().find((n) => n.id === "gelo_domo")!;
    const reflexos = allNodes().find((n) => n.id === "gelo_reflexos")!;
    expect(domo.requires).toEqual(["gelo_agulhas"]);
    expect(reflexos.requires).toEqual(["gelo_domo"]);
    expect(allNodes().filter((n) => n.requires.includes("gelo_reflexos"))).toEqual([]);
  });
});

describe("Gelo: passiva de dano — balanceado no nível de Vapor/Calor/Lava", () => {
  const agulhas = getAbility("gelo_agulhas")!;

  it("Sangue de Gelo (raiz) sozinha dá +35% — mesmo nível do Vapor/Calor/Lava", () => {
    const gelo = passiveMods(["gelo_raiz"], agulhas).damageMult;
    const vapor = passiveMods(["vapor_raiz"], getAbility("vapor_nevoa_qualificada")!).damageMult;
    expect(gelo).toBeCloseTo(vapor, 5);
    expect(gelo).toBeCloseTo(1.35, 3);
  });

  it("raiz + Domínio do Espelho de Gelo (ápice) fecham em 2.025x", () => {
    const mods = passiveMods(["gelo_raiz", "gelo_apice"], agulhas);
    expect(mods.damageMult).toBeCloseTo(2.025, 3);
  });

  it("ápice é só dano (formato padrão dos outros KKG) — utilidade ficou na Presença", () => {
    const presenca = passiveMods(["gelo_presenca"], agulhas);
    expect(presenca.effectChanceBonus.DEFENSE_DOWN).toBeCloseTo(0.15);
    expect(presenca.effectDurationBonus.SLOW).toBe(1);

    const apice = passiveMods(["gelo_apice"], agulhas);
    expect(apice.effectChanceBonus.DEFENSE_DOWN).toBeUndefined();
  });

  it("Reflexos Gélidos soma esquiva de Ninjutsu e corta custo", () => {
    const reflexos = passiveMods(["gelo_reflexos"], agulhas);
    expect(reflexos.costMult).toBeCloseTo(0.9);
    const p = PASSIVES.find((x) => x.nodeId === "gelo_reflexos")!;
    expect(p.ninjutsuDodgeBonus).toBeCloseTo(0.08);
  });

  it("passiva de Gelo não afeta jutsu de Água nem de Fogo", () => {
    const water = getAbility("suiton_suiryuudan")!;
    const fire = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["gelo_raiz"], water).damageMult).toBe(1);
    expect(passiveMods(["gelo_raiz"], fire).damageMult).toBe(1);
  });
});

describe("Domo de Iceberg: defesa pura, sem dano, prende quem está corpo a corpo", () => {
  const domo = getAbility("gelo_domo")!;

  it("não tem baseDamage e é SELF — dá Barreira", () => {
    expect(domo.baseDamage).toBeUndefined();
    expect(domo.shape).toBe("SELF");
    expect(domo.effects).toEqual([{ effectId: "SHIELD", stacks: 16, duration: 3 }]);
  });

  it("trapField prende inimigos adjacentes (ROOT, raio 1) até a Barreira quebrar", () => {
    expect(domo.trapField).toEqual({ effectId: "ROOT", radius: 1, duration: 3 });
  });
});

describe("Mil Agulhas Voadoras de Água da Morte: finalizador indefensável", () => {
  const mil = getAbility("gelo_agulhas_mil")!;

  it("não pode ser esquivada e é o jutsu de maior dano da árvore", () => {
    expect(mil.undodgeable).toBe(true);
    for (const id of IDS.filter((i) => i !== "gelo_agulhas_mil")) {
      expect(mil.baseDamage!).toBeGreaterThan(getAbility(id)!.baseDamage ?? 0);
    }
  });

  it("exige só o tronco principal (o ápice), não a ramificação de defesa", () => {
    const node = allNodes().find((n) => n.id === "gelo_agulhas_mil")!;
    expect(node.requires).toEqual(["gelo_apice"]);
  });
});
