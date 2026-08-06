import { describe, it, expect } from "vitest";
import type { ActionRowBuilder, ButtonBuilder } from "discord.js";
import { movementBudget, movementUsed, type SessionFull } from "../src/services/combat/combat-engine.js";
import { BALANCE } from "../src/config/balance.js";
import {
  turnPhase,
  combatRows,
  buildCombatEmbed,
  buildStatusEmbed,
} from "../src/services/combat/combat-view.js";

type Participant = SessionFull["participants"][number];

// O JSON de botao e' uma uniao: a variante de SKU (botao de loja) nao tem
// custom_id. Como aqui so' geramos botoes normais, basta ler o campo quando
// ele existe em vez de estreitar a uniao inteira.
function customIds(row: ActionRowBuilder<ButtonBuilder>): (string | undefined)[] {
  return row.components.map((c) => {
    const json = c.toJSON() as { custom_id?: string };
    return json.custom_id;
  });
}

// Participante minimo: so' os campos que o orcamento de movimento e o painel
// de acoes leem.
function participant(over: Partial<Participant> = {}): Participant {
  return {
    id: "p1",
    name: "Naruto",
    cell: "C3",
    isNpc: false,
    charId: "c1",
    npcTemplate: null,
    controlledById: null,
    teamId: 1,
    hpCurrent: 100,
    hpMax: 100,
    chakra: 100,
    energia: 100,
    actedMove: false,
    actedCommon: false,
    actedBonus: false,
    effects: [],
    flags: {},
    ...over,
  } as unknown as Participant;
}

function session(over: Partial<SessionFull> = {}): SessionFull {
  return {
    id: "s1",
    scenarioId: "floresta",
    status: "ACTIVE",
    round: 1,
    activeIndex: 0,
    turnOrder: ["p1"],
    terrain: [],
    missionInstanceId: null,
    participants: [participant()],
    drops: [],
    ...over,
  } as unknown as SessionFull;
}

describe("orçamento de movimento", () => {
  it("sem efeito nem passiva, vale o moveBase do balance", () => {
    const s = session();
    expect(movementBudget(s, s.participants[0]!)).toBe(BALANCE.moveBase);
  });

  it("começa a rodada com zero passo gasto", () => {
    expect(movementUsed(participant())).toBe(0);
  });

  it("lê o passo já andado de flags.moveStepsUsed", () => {
    expect(movementUsed(participant({ flags: { moveStepsUsed: 2 } }))).toBe(2);
  });

  it("ignora moveStepsUsed inválido em vez de quebrar", () => {
    expect(movementUsed(participant({ flags: { moveStepsUsed: "dois" } }))).toBe(0);
  });
});

describe("fases do turno", () => {
  it("jogador que ainda não andou está na fase de MOVIMENTO", () => {
    expect(turnPhase(participant())).toBe("MOVIMENTO");
  });

  it("depois de fechar o deslocamento vai pra fase de AÇÃO", () => {
    expect(turnPhase(participant({ actedMove: true }))).toBe("ACAO");
  });

  it("NPC não controlado é fase de NPC", () => {
    expect(turnPhase(participant({ isNpc: true, controlledById: null }))).toBe("NPC");
  });

  it("NPC pilotado por jogador (Shintenshin) age como jogador", () => {
    expect(turnPhase(participant({ isNpc: true, controlledById: "p9" }))).toBe("MOVIMENTO");
  });

  it("sem participante ativo é NEUTRO", () => {
    expect(turnPhase(null)).toBe("NEUTRO");
  });
});

describe("botões do turno", () => {
  it("na fase de movimento mostra só o D-pad 3x3, sem botão de encerrar turno", () => {
    const rows = combatRows({ phase: "MOVIMENTO", stepsLeft: 2 });
    expect(rows).toHaveLength(3);
    const ids = rows.flatMap(customIds);
    for (const dir of ["noroeste", "cima", "nordeste", "esquerda", "direita", "sudoeste", "baixo", "sudeste"]) {
      expect(ids).toContain(`combate:movimento:${dir}`);
    }
    expect(ids).toContain("combate:movimento:concluir");
    expect(ids).not.toContain("combate:turno:fim");
  });

  it("a linha do meio fica ← concluir →, nessa ordem", () => {
    const rows = combatRows({ phase: "MOVIMENTO", stepsLeft: 2 });
    const middle = customIds(rows[1]!);
    expect(middle).toEqual([
      "combate:movimento:esquerda",
      "combate:movimento:concluir",
      "combate:movimento:direita",
    ]);
  });

  it("o botão do centro é só o emoji de check, sem rótulo", () => {
    const rows = combatRows({ phase: "MOVIMENTO", stepsLeft: 2 });
    const center = rows[1]!.components[1]!.toJSON() as {
      label?: string;
      emoji?: { name?: string };
    };
    expect(center.label).toBeUndefined();
    expect(center.emoji?.name).toBe("✅");
  });

  it("sem passo restante as setas ficam desabilitadas mas o check continua ativo", () => {
    const rows = combatRows({ phase: "MOVIMENTO", stepsLeft: 0 });
    const arrow = rows[0]!.components[0]!.toJSON() as { disabled?: boolean };
    expect(arrow.disabled).toBe(true);
    const center = rows[1]!.components[1]!.toJSON() as { disabled?: boolean };
    expect(center.disabled).toBeFalsy();
  });

  it("fora da fase de movimento não sobra botão nenhum", () => {
    expect(combatRows({ phase: "ACAO", stepsLeft: 0 })).toEqual([]);
    expect(combatRows({ phase: "NPC", stepsLeft: 0 })).toEqual([]);
  });
});

describe("painel de status", () => {
  it("lista vida de todos e recurso só de jogador", () => {
    const s = session({
      participants: [
        participant({ id: "p1", name: "Naruto", hpCurrent: 84, hpMax: 120, chakra: 70, energia: 55 }),
        participant({ id: "p2", name: "Bandido", isNpc: true, charId: null, hpCurrent: 30, hpMax: 60 }),
      ],
    });
    const desc = buildStatusEmbed(s)!.toJSON().description!;
    expect(desc.startsWith("```")).toBe(true);

    const naruto = desc.split("\n").find((l) => l.startsWith("Naruto"))!;
    expect(naruto).toContain("84/120");
    expect(naruto).toContain("CK  70");
    expect(naruto).toContain("EN  55");

    // NPC nao gasta chakra/energia, entao nao mostra os dois
    const bandido = desc.split("\n").find((l) => l.startsWith("Bandido"))!;
    expect(bandido).toContain("30/60");
    expect(bandido).not.toContain("CK");
  });

  it("alinha as colunas entre nomes de tamanhos diferentes", () => {
    const s = session({
      participants: [
        participant({ id: "p1", name: "Lee", hpCurrent: 50, hpMax: 100 }),
        participant({ id: "p2", name: "Kakashi Hatake", hpCurrent: 50, hpMax: 100 }),
      ],
    });
    const linhas = buildStatusEmbed(s)!.toJSON().description!.split("\n").filter((l) => l && !l.startsWith("```"));
    expect(linhas).toHaveLength(2);
    expect(linhas[0]!.indexOf("50/100")).toBe(linhas[1]!.indexOf("50/100"));
  });

  it("marca quem foi derrotado", () => {
    const s = session({
      participants: [participant({ name: "Naruto", hpCurrent: 0, hpMax: 120 })],
    });
    expect(buildStatusEmbed(s)!.toJSON().description).toContain("derrotado");
  });
});

describe("embed do turno", () => {
  it("anuncia de quem é a vez e a rodada", () => {
    const s = session({ round: 3 });
    const embed = buildCombatEmbed({
      session: s,
      active: s.participants[0]!,
      logs: [],
      phase: "MOVIMENTO",
      moveBudget: 2,
      moveUsed: 0,
    }).toJSON();
    expect(embed.title).toBe("Vez de Naruto · Rodada 3");
  });

  it("mostra o painel de ações com o deslocamento restante", () => {
    const s = session();
    const embed = buildCombatEmbed({
      session: s,
      active: s.participants[0]!,
      logs: [],
      phase: "MOVIMENTO",
      moveBudget: 2,
      moveUsed: 1,
    }).toJSON();
    const fields = embed.fields ?? [];
    expect(fields.find((f) => f.name === "Movimento")?.value).toBe("1 de 2 células");
    expect(fields.find((f) => f.name === "Ação comum")?.value).toBe("Disponível");
    expect(fields.find((f) => f.name === "Ação bônus")?.value).toBe("Disponível");
  });

  it("marca movimento como concluído e as ações gastas", () => {
    const p = participant({ actedMove: true, actedCommon: true, actedBonus: true });
    const s = session({ participants: [p] });
    const embed = buildCombatEmbed({
      session: s,
      active: p,
      logs: [],
      phase: "ACAO",
      moveBudget: 2,
      moveUsed: 2,
    }).toJSON();
    const fields = embed.fields ?? [];
    expect(fields.find((f) => f.name === "Movimento")?.value).toBe("Concluído");
    expect(fields.find((f) => f.name === "Ação comum")?.value).toBe("Usada");
    expect(fields.find((f) => f.name === "Ação bônus")?.value).toBe("Usada");
  });

  it("não repete vida/chakra no embed principal — isso vive no painel de baixo", () => {
    const s = session();
    const embed = buildCombatEmbed({
      session: s,
      active: s.participants[0]!,
      logs: [],
      phase: "MOVIMENTO",
      moveBudget: 2,
      moveUsed: 0,
    }).toJSON();
    const names = (embed.fields ?? []).map((f) => f.name);
    expect(names).toEqual(["Movimento", "Ação comum", "Ação bônus"]);
  });

  it("turno de NPC não mostra painel de ação do jogador", () => {
    const p = participant({ isNpc: true, name: "Bandido" });
    const s = session({ participants: [p] });
    const embed = buildCombatEmbed({ session: s, active: p, logs: [], phase: "NPC" }).toJSON();
    expect(embed.title).toBe("Turno de Bandido · Rodada 1");
    expect(embed.fields ?? []).toHaveLength(0);
  });
});
