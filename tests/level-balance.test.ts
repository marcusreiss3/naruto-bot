import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance.js";
import { isRoleplayChannel } from "../src/services/characters/roleplay-xp-service.js";

describe("balanceamento de nível", () => {
  it("exige 95.550 XP do nível 1 ao 50", () => {
    const total = Array.from({ length: BALANCE.maxLevel - 1 }, (_, index) => BALANCE.xpPerLevel(index + 1))
      .reduce((sum, xp) => sum + xp, 0);
    expect(total).toBe(95_550);
  });

  it("mantém RP muito abaixo de uma missão rank D", () => {
    expect(BALANCE.xp.roleplay.rewardMax).toBeLessThan(5);
    expect(BALANCE.xp.roleplay.cooldownMinMs).toBe(20_000);
    expect(BALANCE.xp.roleplay.cooldownMaxMs).toBe(180_000);
  });

  it("permite qualquer canal normal e bloqueia as exceções", () => {
    expect(isRoleplayChannel("1537470138851401840")).toBe(true);
    expect(isRoleplayChannel("1529259778864316608")).toBe(true);
    expect(isRoleplayChannel("1537492104819900427")).toBe(false);
    expect(isRoleplayChannel("1539984596584632430")).toBe(false);
  });
});
