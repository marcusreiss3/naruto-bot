import type { ScenarioDef } from "../types.js";

// Channel IDs do enunciado.
export const FLORESTA_CHANNEL_ID = "1515881109878214746";
export const RIO_CHANNEL_ID = "1515881122179842113";
export const PRACA_VILA_DA_FOLHA_CHANNEL_ID = "1515893592818978957";
export const CENTRO_COMERCIAL_CHANNEL_ID = "1516183249712582657";
export const ROTA_COMERCIAL_KONOHA_CHANNEL_ID = "1516425270481915995";
export const DESERTO_CHANNEL_ID = "1516428050063954152";
export const BECO_KONOHA_CHANNEL_ID = "1516452197976772679";
export const ACADEMIA_GENIN_CHANNEL_ID = "1516456751099285564";
export const MANSAO_HOKAGE_CHANNEL_ID = "1516470677962494084";

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
  {
    id: "rota_comercial_konoha",
    name: "Rota Comercial de Konoha",
    channelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Estrada de terra batida que liga Konoha às rotas mercantes. Carroças e mercadores cruzam por aqui.",
    terrain: "grass",
    image: "trade-route-konoha.png",
    cells: {
      trees: ["A2", "A8", "F3", "F9"],
      obstacles: ["C5", "D5"],
    },
  },
  {
    id: "deserto",
    name: "Deserto de Sunagakure",
    channelId: DESERTO_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Dunas escaldantes a caminho da Vila da Areia. Pouca cobertura — fácil de emboscar.",
    terrain: "sand",
    image: "desert.png",
    cells: {
      height: ["A1", "F1", "A10", "F10"],
      obstacles: ["C6", "D4"],
    },
  },
  {
    id: "beco_konoha",
    name: "Beco de Konoha",
    channelId: BECO_KONOHA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Um beco estreito entre lojas e muros da Vila da Folha.",
    terrain: "grass",
    image: "konoha-alley.png",
    cells: {
      obstacles: ["A1", "A10", "B1", "B10", "E1", "E10", "F1", "F10", "C5", "D5"],
      height: ["A2", "A3", "A8", "A9", "F2", "F3", "F8", "F9"],
    },
  },
  {
    id: "academia_genin",
    name: "Academia Genin",
    channelId: ACADEMIA_GENIN_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Sala de treino da academia, cheia de alunos genin curiosos.",
    terrain: "grass",
    image: "academy-genin.png",
    cells: {
      obstacles: ["A1", "A10", "F1", "F10", "C5", "D5"],
      height: ["A4", "A5", "A6", "A7"],
    },
  },
  {
    id: "mansao_hokage",
    name: "Mansao do Hokage",
    channelId: MANSAO_HOKAGE_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Arquivos administrativos da Mansao do Hokage, com estantes cheias de pergaminhos.",
    terrain: "grass",
    image: "hokage-mansion.png",
    cells: {
      obstacles: ["A1", "A10", "F1", "F10", "B5", "C5", "D5", "E5"],
      height: ["A3", "A4", "A7", "A8"],
    },
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
