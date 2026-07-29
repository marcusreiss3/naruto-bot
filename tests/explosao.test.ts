import { describe, expect, it } from "vitest";
import { getAbility } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { PASSIVES } from "../src/data/element-trees/passives.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { minadoExplosionDamage, tickEffect } from "../src/services/combat/effects.js";
import { BALANCE } from "../src/config/balance.js";
import { isKekkeiGenkai } from "../src/config/enums.js";

const IDS = [
  "explosao_defensiva",
  "explosao_cortina_fumaca",
  "explosao_estilhacos",
  "explosao_carga_dupla",
  "explosao_impacto",
  "explosao_reacao_em_cadeia",
  "explosao_carga_final",
  "explosao_punho_mina",
] as const;

describe("Explosão: integridade da arvore", () => {
  it("liga os quatro jutsus aos nos da arvore", () => {
    const concedidos = allNodes()
      .filter((n) => n.element === "EXPLOSAO" && n.kind === "JUTSU")
      .map((n) => n.grantsAbilityId);
    expect(new Set(concedidos)).toEqual(new Set(IDS));
  });

  it("todos exigem afinidade de Explosão e compra manual", () => {
    for (const id of IDS) {
      const ability = getAbility(id);
      expect(ability, id).toBeTruthy();
      expect(ability!.requirements).toMatchObject({ element: "EXPLOSAO", manualOnly: true });
    }
  });

  it("EXPLOSAO e' kekkei genkai", () => {
    expect(isKekkeiGenkai("EXPLOSAO")).toBe(true);
    expect(isKekkeiGenkai("FOGO")).toBe(false);
  });

  it("os dois nós PASSIVE (raiz e ápice) têm definição", () => {
    const semDef = allNodes()
      .filter((n) => n.kind === "PASSIVE" && n.element === "EXPLOSAO")
      .filter((n) => !PASSIVES.some((p) => p.nodeId === n.id))
      .map((n) => n.id);
    expect(semDef).toEqual([]);
  });

  it("Punho de Mina Terrestre (S) exige o ápice comprado antes", () => {
    const mina = allNodes().find((n) => n.id === "explosao_mina")!;
    expect(mina.requires).toEqual(["explosao_apice"]);
  });
});

describe("Explosão: passiva de dano — mesmo nível do Lava e do Cristal", () => {
  it("raiz + ápice fecham em 2.025x, igual a Lava", () => {
    const mina = getAbility("explosao_punho_mina")!;
    const explosao = passiveMods(["explosao_raiz", "explosao_apice"], mina).damageMult;
    const lava = passiveMods(["lava_raiz", "lava_apice"], getAbility("lava_tecnica_balas")!).damageMult;
    expect(explosao).toBeCloseTo(2.025, 3);
    expect(explosao).toBeCloseTo(lava, 5);
  });

  it("passiva de Explosão não afeta jutsu de Fogo", () => {
    const bola = getAbility("katon_goukakyuu")!;
    expect(passiveMods(["explosao_raiz", "explosao_apice"], bola).damageMult).toBe(1);
  });
});

describe("Explosão Defensiva: reflete projétil", () => {
  it("é reação PARRY com reflectsProjectiles", () => {
    const ab = getAbility("explosao_defensiva")!;
    expect(ab.actionType).toBe("REACAO");
    expect(ab.reactionKind).toBe("PARRY");
    expect(ab.reflectsProjectiles).toBe(true);
  });

  it("não causa dano próprio — é puramente reativa", () => {
    const ab = getAbility("explosao_defensiva")!;
    expect(ab.baseDamage).toBeUndefined();
  });
});

describe("Explosão: Cortina de Fumaça", () => {
  it("deixa terreno SMOKE e não causa dano", () => {
    const ab = getAbility("explosao_cortina_fumaca")!;
    expect(ab.terrain).toEqual({ kind: "SMOKE", duration: 3 });
    expect(ab.baseDamage).toBeUndefined();
  });
});

describe("Explosão: Impacto", () => {
  it("aplica DEFENSE_DOWN (desequilíbrio) e empurra", () => {
    const ab = getAbility("explosao_impacto")!;
    expect(ab.effects).toEqual([{ effectId: "DEFENSE_DOWN", duration: 2 }]);
    expect(ab.push).toBe(1);
  });
});

describe("Minado", () => {
  it("não causa dano enquanto o pavio queima", () => {
    expect(minadoExplosionDamage(2, 3)).toBe(0);
    expect(minadoExplosionDamage(2, 2)).toBe(0);
  });

  it("estoura tudo de uma vez no último tick (duration chegando a 0)", () => {
    expect(minadoExplosionDamage(2, 1)).toBe(2 * BALANCE.effects.MINADO.explodeDamagePerStack);
  });

  it("tickEffect delega pra minadoExplosionDamage", () => {
    expect(tickEffect({ effectId: "MINADO", stacks: 2, duration: 1 }).damage).toBe(
      minadoExplosionDamage(2, 1),
    );
    expect(tickEffect({ effectId: "MINADO", stacks: 2, duration: 1 }).expired).toBe(true);
  });

  it("Punho de Mina Terrestre crava 2 acúmulos de Minado, duração 2", () => {
    const mina = getAbility("explosao_punho_mina")!;
    expect(mina.effects).toEqual([{ effectId: "MINADO", stacks: 2, duration: 2 }]);
  });
});
