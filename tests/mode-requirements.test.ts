import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance.js";
import { getAbility } from "../src/data/index.js";
import { hasActiveEffectFromAbility, type EffectState } from "../src/services/combat/effects.js";

describe("modos obrigatórios para finalizadores", () => {
  it("mantém as exigências explícitas nos três golpes", () => {
    expect(getAbility("tai_guy_noturno")!.requiresActiveGate).toBe(8);
    expect(getAbility("akimichi_bombardeio")!.requiresActiveEffectFromAbilityId)
      .toBe("akimichi_modo_borboleta");
    expect(getAbility("inuzuka_cauda_perseguidora")!.requiresActiveEffectFromAbilityId)
      .toBe("inuzuka_lobo_tres_cabecas");
    expect(getAbility("inuzuka_presa_de_lobo")!.requiresActiveEffectFromAbilityId)
      .toBe("inuzuka_lobo_duas_cabecas");
  });

  it("Tanque da Bala Humana e Super Bofetada agora exigem a forma correspondente ativa, como a descrição sempre prometeu", () => {
    expect(getAbility("akimichi_tanque")!.requiresActiveEffectFromAbilityId).toBe("akimichi_baika");
    expect(getAbility("akimichi_bofetada")!.requiresActiveEffectFromAbilityId).toBe("akimichi_super_baika");
  });

  it("só aceita o efeito ativo gerado pelo modo correto", () => {
    const effects: EffectState[] = [
      {
        effectId: "SHIELD",
        stacks: 20,
        duration: 2,
        dataJson: JSON.stringify({ sourceAbilityId: "akimichi_modo_borboleta" }),
      },
      {
        effectId: "EMPOWERED",
        stacks: 1,
        duration: 0,
        dataJson: JSON.stringify({ sourceAbilityId: "inuzuka_lobo_tres_cabecas" }),
      },
    ];
    expect(hasActiveEffectFromAbility(effects, "akimichi_modo_borboleta")).toBe(true);
    expect(hasActiveEffectFromAbility(effects, "inuzuka_lobo_tres_cabecas")).toBe(false);
  });

  it("eleva o 8º Portão a 2,50x em troca da irreversibilidade e do desgaste", () => {
    expect(BALANCE.punhoForteGates[8]).toEqual({ taijutsuDamageMult: 2.5, selfDamagePerTurn: 80 });
  });
});
