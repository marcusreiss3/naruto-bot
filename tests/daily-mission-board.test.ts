import { describe, expect, it } from "vitest";
import { MISSIONS } from "../src/data/missions/index.js";
import { canClaimDailyMissionRank } from "../src/services/missions/daily-mission-board.js";
import { renderMissionBoardCard } from "../src/ui/mission-board-card.js";
import { isVillageMansionChannel, VILLAGE_MANSIONS } from "../src/services/village-service.js";

describe("mural diário de missões", () => {
  it("não oferece mestres de artes marciais", () => {
    const missionBoardMissions = MISSIONS.filter((mission) => ["D", "C", "B"].includes(mission.rank) && mission.type !== "MESTRE_ESTILO");
    expect(missionBoardMissions).not.toHaveLength(0);
    expect(missionBoardMissions.some((mission) => mission.type === "MESTRE_ESTILO")).toBe(false);
  });

  it("respeita os ranks permitidos para as ofertas", () => {
    expect(canClaimDailyMissionRank("GENIN", "D")).toBe(true);
    expect(canClaimDailyMissionRank("GENIN", "C")).toBe(true);
    expect(canClaimDailyMissionRank("GENIN", "B")).toBe(false);
    expect(canClaimDailyMissionRank("CHUNIN", "B")).toBe(true);
    expect(canClaimDailyMissionRank("JONIN", "B")).toBe(true);
  });

  it("reconhece somente a mansão da vila do personagem", () => {
    expect(isVillageMansionChannel("KONOHA", VILLAGE_MANSIONS.KONOHA)).toBe(true);
    expect(isVillageMansionChannel("KONOHA", VILLAGE_MANSIONS.SUNA)).toBe(false);
    expect(isVillageMansionChannel("SEM_VILA", VILLAGE_MANSIONS.KONOHA)).toBe(false);
  });

  it("renderiza as três ofertas no card pessoal", async () => {
    const card = await renderMissionBoardCard({
      dayKey: "2026-08-20",
      offers: [
        { rank: "D", name: "Entrega de teste", description: "Leve o relatório ao mensageiro da vila.", locked: false, claimed: false },
        { rank: "C", name: "Patrulha de teste", description: "Investigue os ruídos da rota comercial.", locked: false, claimed: false },
        { rank: "B", name: "Resgate de teste", description: "Proteja a equipe durante uma missão difícil.", locked: true, claimed: false },
      ],
    });
    expect(card.subarray(1, 4).toString()).toBe("PNG");
    expect(card.length).toBeGreaterThan(10_000);
  });
});
