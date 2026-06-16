import type { ScenarioDef } from "../types.js";

// Channel IDs do enunciado.
export const FLORESTA_CHANNEL_ID = "1515881109878214746";
export const RIO_CHANNEL_ID = "1515881122179842113";
export const PRACA_VILA_DA_FOLHA_CHANNEL_ID = "1515893592818978957";
export const CENTRO_COMERCIAL_CHANNEL_ID = "1516183249712582657";

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "floresta",
    name: "Floresta",
    channelId: FLORESTA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Floresta densa. Árvores dão altura e bloqueiam linha.",
    terrain: "grass",
    image: "forest.png",
    cells: {
      trees: ["A3", "A6", "C8", "B10", "D2"],
      obstacles: ["D3", "D5", "D6", "F5", "F7"],
    },
  },
  {
    id: "rio",
    name: "Rio",
    channelId: RIO_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Rio largo. Água reduz deslocamento; ande sobre a água gastando chakra.",
    terrain: "sand",
    image: "river.png",
    cells: {
      trees: ["B1", "E7"],
      water: ["A8", "A9", "A10", "B7", "B8", "C6", "C7", "C8", "D3", "D4", "D5", "D6", "E2", "E3", "E4", "E5", "F1", "F2"],
      obstacles: ["A5", "A7", "E9", "E10"],
    },
    elementModifiers: {
      AGUA: { costMult: 0.8, dmgMult: 1.15 },
      RAIO: { dmgMult: 1.2 },
    },
  },
  {
    id: "praca_folha",
    name: "Praça da Vila da Folha",
    channelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Praça movimentada com bancos e feira.",
    terrain: "grass",
    image: "square_konoha.png",
    cells: {
      height: ["A1", "A2", "C1", "F1", "F2", "F5", "F9", "F10", "C10"],
      obstacles: ["C4", "C7", "D4", "E6"],
    },
  },
  {
    id: "centro_comercial",
    name: "Centro Comercial de Konoha",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Lojas, barracas e gente passando. Bom lugar pra colher informações.",
    terrain: "grass",
    image: "comercial-square-konoha.png",
    cells: {},
  },
];

const BY_CHANNEL = new Map<string, ScenarioDef>(SCENARIOS.map((s) => [s.channelId, s]));
const BY_ID = new Map<string, ScenarioDef>(SCENARIOS.map((s) => [s.id, s]));

export function getScenarioByChannel(channelId: string): ScenarioDef | undefined {
  return BY_CHANNEL.get(channelId);
}

export function getScenarioById(id: string): ScenarioDef | undefined {
  return BY_ID.get(id);
}
