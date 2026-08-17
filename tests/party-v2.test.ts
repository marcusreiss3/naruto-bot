import { describe, expect, it } from "vitest";
import { invitePanel, party, partyHomePanel, partyPanel } from "../src/commands/party.js";

describe("interface V2 de /party", () => {
  it("expõe apenas /party, sem subcomandos", () => {
    const json = party.data.toJSON();

    expect(json.options).toEqual([]);
  });

  it("monta convite público em container com botões de aceitar e recusar", () => {
    const [container] = invitePanel("lider", "convidado", "invite-id").map((component) => component.toJSON());
    const serialized = JSON.stringify(container);

    expect(container?.type).toBe(17);
    expect(serialized).toContain("party:invite:accept:invite-id");
    expect(serialized).toContain("party:invite:decline:invite-id");
    expect(serialized).toContain("1538718124847923220");
    expect(container && "components" in container ? container.components.length : 0).toBeLessThanOrEqual(10);
  });

  it("destaca líder e integrantes no painel da party", () => {
    const [container] = partyPanel({
      id: "party-id",
      leaderId: "lider",
      memberIds: ["lider", "membro"],
      members: [
        { discordId: "lider", role: "MEMBER" },
        { discordId: "membro", role: "MEMBER" },
      ],
    }).map((component) => component.toJSON());
    const serialized = JSON.stringify(container);

    expect(container?.type).toBe(17);
    expect(serialized).toContain("<@lider>");
    expect(serialized).toContain("<@membro>");
    expect(serialized).toContain("1538717783209148587");
  });

  it("oferece o botão de sair com o emoji customizado para membros", () => {
    const [container] = partyHomePanel({
      id: "party-id",
      leaderId: "lider",
      memberIds: ["lider", "membro"],
      members: [
        { discordId: "lider", role: "MEMBER" },
        { discordId: "membro", role: "MEMBER" },
      ],
    }, "lider").map((component) => component.toJSON());
    const serialized = JSON.stringify(container);

    expect(serialized).toContain("party:leave");
    expect(serialized).toContain("1538718426162405457");
    expect(serialized).toContain("party:manage:remove");
    expect(serialized).toContain("party:manage:promote");
  });

  it("não oferece convite para integrantes que não são líderes", () => {
    const [container] = partyHomePanel({
      id: "party-id",
      leaderId: "lider",
      memberIds: ["lider", "membro"],
      members: [
        { discordId: "lider", role: "MEMBER" },
        { discordId: "membro", role: "MEMBER" },
      ],
    }, "membro").map((component) => component.toJSON());
    const serialized = JSON.stringify(container);

    expect(serialized).not.toContain("party:invite:select");
    expect(serialized).not.toContain("party:manage:remove");
    expect(serialized).not.toContain("party:manage:promote");
    expect(serialized).toContain("party:leave");
  });

  it("dá ao sub-líder convite e remoção, mas não promoção", () => {
    const [container] = partyHomePanel({
      id: "party-id",
      leaderId: "lider",
      memberIds: ["lider", "sub-lider", "membro"],
      members: [
        { discordId: "lider", role: "MEMBER" },
        { discordId: "sub-lider", role: "SUB_LEADER" },
        { discordId: "membro", role: "MEMBER" },
      ],
    }, "sub-lider").map((component) => component.toJSON());
    const serialized = JSON.stringify(container);

    expect(serialized).toContain("party:invite:select");
    expect(serialized).toContain("party:manage:remove");
    expect(serialized).not.toContain("party:manage:promote");
  });
});
