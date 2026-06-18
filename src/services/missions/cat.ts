import type { ScenarioDef } from "../../data/types.js";
import type { RenderEntity } from "../maps/renderer.js";
import { allCells, parseCell, toCell, distance, type Coord } from "../../utils/grid.js";
import { pick, randInt, chance } from "../../utils/random.js";

export interface CatMissionData {
  catMoveMin: number;
  catMoveMax: number;
  fleeMin: number;
  fleeMax: number;
  captureBaseChance: number;
}

export interface CatState {
  catCell: string;
  playerCell: string;
  turns: number;
}

interface CatPlayer {
  discordId: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  resources?: { chakra: number; energia: number } | null;
}

function validCells(scenario: ScenarioDef): string[] {
  const blocked = new Set([
    ...(scenario.cells.obstacles ?? []),
    ...(scenario.cells.water ?? []),
  ]);
  return allCells(scenario.rows, scenario.cols).filter((c) => !blocked.has(c));
}

export function spawnCat(scenario: ScenarioDef, playerCell: string): string {
  const cells = validCells(scenario).filter((c) => c !== playerCell);
  // longe do jogador
  const pc = parseCell(playerCell)!;
  const far = cells.filter((c) => distance(parseCell(c)!, pc) >= 3);
  return pick(far.length ? far : cells) ?? cells[0]!;
}

// Move o gato afastando-se do jogador, ate `steps` casas.
// A cada passo escolhe a célula vizinha (8 direções) que MAXIMIZA a distância
// até o jogador. Assim ele sempre corre pro lado contrário e não fica preso.
export function catFlee(
  scenario: ScenarioDef,
  catCell: string,
  playerCell: string,
  steps: number,
): string {
  const valid = new Set(validCells(scenario));
  let cur = parseCell(catCell)!;
  const player = parseCell(playerCell)!;

  for (let i = 0; i < steps; i++) {
    const options = neighbors8(cur, scenario).filter((c) => {
      const cell = toCell(c);
      return valid.has(cell) && cell !== playerCell;
    });
    if (options.length === 0) break;

    const curDist = distance(cur, player);
    // melhor distância entre as opções
    let bestDist = -1;
    for (const o of options) bestDist = Math.max(bestDist, distance(o, player));
    // não anda pra mais perto do jogador se já está bom; só anda se >= distância atual
    if (bestDist < curDist) break;
    // entre as de maior distância, escolhe aleatória (desempate)
    const best = options.filter((o) => distance(o, player) === bestDist);
    cur = best[Math.floor(Math.random() * best.length)]!;
  }
  return toCell(cur);
}

function neighbors8(c: Coord, scenario: ScenarioDef): Coord[] {
  const out: Coord[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const row = c.row + dr;
      const col = c.col + dc;
      if (row >= 0 && row < scenario.rows && col >= 1 && col <= scenario.cols) {
        out.push({ row, col });
      }
    }
  }
  return out;
}

export interface CatStepResult {
  state: CatState;
  captured: boolean;
  logs: string[];
}

// Um turno: jogador vai para playerDest; checa captura; senao gato foge.
export function catMissionStep(
  state: CatState,
  playerDest: string,
  scenario: ScenarioDef,
  data: CatMissionData,
): CatStepResult {
  const logs: string[] = [];
  const next: CatState = { ...state, playerCell: playerDest, turns: state.turns + 1 };

  if (playerDest === state.catCell) {
    if (chance(data.captureBaseChance)) {
      logs.push("🎉 Você agarrou o gato Tora! Missão concluída.");
      return { state: next, captured: true, logs };
    }
    // falha: gato foge varias casas
    const fleeSteps = randInt(data.fleeMin, data.fleeMax);
    next.catCell = catFlee(scenario, state.catCell, playerDest, fleeSteps);
    logs.push(`🐱 O gato escapou e correu ${fleeSteps} casas para ${next.catCell}!`);
    return { state: next, captured: false, logs };
  }

  // gato se move 1-2 casas se afastando
  const moveSteps = randInt(data.catMoveMin, data.catMoveMax);
  next.catCell = catFlee(scenario, state.catCell, playerDest, moveSteps);
  logs.push(`🐱 O gato se moveu para ${next.catCell}.`);
  return { state: next, captured: false, logs };
}

// Renderiza o mapa da missao do gato: jogador com aparencia + gato.
export async function renderCatMission(
  scenario: ScenarioDef,
  state: CatState,
  player: CatPlayer,
  guildId: string,
): Promise<Buffer> {
  const [{ getAppearance }, { MapRenderer }] = await Promise.all([
    import("../appearance/appearance-service.js"),
    import("../maps/renderer.js"),
  ]);
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
  if (state.catCell) entities.push({ cell: state.catCell, label: "\u{1F431}", color: "#ffffff", kind: "CAT" });
  return MapRenderer.renderScenario({ scenario, entities });
}
