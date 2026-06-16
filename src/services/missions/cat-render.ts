import { getAppearance } from "../appearance/appearance-service.js";
import { MapRenderer, type RenderEntity } from "../maps/renderer.js";
import type { ScenarioDef } from "../../data/types.js";
import type { CatState } from "./cat.js";

interface CatPlayer {
  discordId: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  resources?: { chakra: number; energia: number } | null;
}

// Renderiza o mapa da missão do gato: jogador (com aparência) + gato 🐱.
export async function renderCatMission(
  scenario: ScenarioDef,
  state: CatState,
  player: CatPlayer,
  guildId: string,
): Promise<Buffer> {
  const entities: RenderEntity[] = [];
  const p: RenderEntity = {
    cell: state.playerCell,
    label: player.name.slice(0, 3),
    name: player.name,
    color: "#3498db",
    kind: "PLAYER",
    hp: player.hpCurrent,
    hpMax: player.hpMax,
    chakra: player.resources?.chakra,
    energia: player.resources?.energia,
  };
  const ap = await getAppearance(player.discordId, guildId);
  if (ap) p.imageUrl = ap.imageUrl;
  entities.push(p);
  if (state.catCell) entities.push({ cell: state.catCell, label: "🐱", color: "#ffffff", kind: "CAT" });
  return MapRenderer.renderScenario({ scenario, entities });
}
