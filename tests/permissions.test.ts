import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { isAdmin } from "../src/utils/permissions.js";

describe("permissão de /admin", () => {
  it("nega sem permissão nem cargo", () => {
    const fake = {
      member: {
        permissions: { has: () => false },
        roles: { cache: { has: () => false } },
      },
    } as any;
    expect(isAdmin(fake)).toBe(false);
  });

  it("permite com Administrator", () => {
    const fake = {
      member: {
        permissions: { has: (p: bigint) => p === PermissionFlagsBits.Administrator },
        roles: { cache: { has: () => false } },
      },
    } as any;
    expect(isAdmin(fake)).toBe(true);
  });

  it("nega quando member é null", () => {
    expect(isAdmin({ member: null } as any)).toBe(false);
  });
});
