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
export const HOSPITAL_KONOHA_CHANNEL_ID = "1516825458765987980";
export const CAVERNA_CHANNEL_ID = "1521879431168131132";
export const CAMPO_ABERTO_CHANNEL_ID = "1522249926845923339";
export const CENTRO_COMERCIAL_SUNA_CHANNEL_ID = "1523372488292302958";
export const CENTRO_COMERCIAL_KIRI_CHANNEL_ID = "1523372437398487151";
export const PRACA_SUNA_CHANNEL_ID = "1523370437919244309";
export const MANSAO_KAZEKAGE_CHANNEL_ID = "1523371643102167234";
export const MANSAO_RAIKAGE_CHANNEL_ID = "1523371661074763850";
export const MANSAO_TSUCHIKAGE_CHANNEL_ID = "1523371687721177270";
export const MANSAO_MIZUKAGE_CHANNEL_ID = "1523374733448577024";

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
      trees: ["E1", "F10", "A6", "A4", "A7", "A8"],
      obstacles: ["C5", "C6", "D5", "D6", "F4", "D8", "C3"],
      height: ["A2"],
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
      obstacles: ["D4", "E7", "B6", "B7", "B8", "A1", "A10"],
      height: ["B1", "C1", "D1", "B2", "C2", "D2", "B9", "B10", "C9", "C10", "D9", "D10", "A3", "A4", "A5", "A6", "A7", "A8", "F1", "F10"],
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
      obstacles: ["B5", "B6", "B7"],
    },
  },
  {
    id: "hospital_konoha",
    name: "Hospital de Konoha",
    channelId: HOSPITAL_KONOHA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Ala movimentada do hospital, com ninjas medicos preparando remedios e curativos.",
    terrain: "grass",
    image: "hospital-konoha.png",
    cells: {
      obstacles: ["D4", "D7", "F1", "F2", "F3", "F8", "F9", "F10", "E10", "D10", "C10", "B10", "A10", "A1", "B1", "C1", "D1", "E1"],
    },
  },
  {
    id: "caverna",
    name: "Caverna",
    channelId: CAVERNA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Galeria escura de uma mina antiga. Rochas soltas bloqueiam caminhos e ecoam qualquer movimento.",
    terrain: "sand",
    image: "cave.png",
    cells: {
      water: ["A6", "A7", "B6", "E1", "E2", "E3"],
      obstacles: ["A1", "A2", "A10", "B1", "B4", "B10", "C1", "C4", "C7", "C10", "D1", "D2", "D4", "D8", "D9", "E6", "E7", "E10", "F1", "F3", "F4", "F6", "F7", "F9", "F10"],
      height: ["B2", "B5", "B9", "E4", "F8"],
    },
  },
  {
    id: "campo_aberto",
    name: "Campo Aberto",
    channelId: CAMPO_ABERTO_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Terreno amplo fora das vilas, usado para deslocamento, emboscadas e combates em area aberta.",
    terrain: "grass",
    image: "open-field.png",
    cells: {
      trees: ["A1", "A2", "A9", "B1", "B5", "B10", "D1", "E7", "F1", "F8", "F10"],
      obstacles: ["A5", "C3", "C7", "D8", "F4", "F6"],
      height: ["A8", "B2", "B8", "B9", "E2", "E3", "E8", "E9", "F2", "F9"],
    },
  },
  {
    id: "centro_comercial_suna",
    name: "Centro Comercial de Sunagakure",
    channelId: CENTRO_COMERCIAL_SUNA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Mercado coberto por lonas e corredores de areia compactada, com mercadores vindos do deserto.",
    terrain: "sand",
    image: "commercial-suna.png",
    cells: {
      obstacles: ["B3", "B8", "E3", "E8"],
      height: ["A1", "A10", "F1", "F10"],
    },
  },
  {
    id: "centro_comercial_kiri",
    name: "Centro Comercial de Kirigakure",
    channelId: CENTRO_COMERCIAL_KIRI_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Ruas estreitas, vitrines umidas e nevoa baixa entre barracas de peixe, vidro e metal.",
    terrain: "grass",
    image: "commercial-kiri.png",
    cells: {
      water: ["A9", "B9", "C9", "D9", "E9", "F9"],
      obstacles: ["C4", "C5", "D4", "D5"],
    },
    elementModifiers: {
      AGUA: { costMult: 0.8, dmgMult: 1.15 },
    },
  },
  {
    id: "praca_suna",
    name: "Praca de Sunagakure",
    channelId: PRACA_SUNA_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Praca aberta de pedra clara, marcada por vento seco, colunas baixas e po de areia.",
    terrain: "sand",
    image: "square-suna.png",
    cells: {
      height: ["B2", "B9", "E2", "E9"],
      obstacles: ["C5", "D5"],
    },
  },
  {
    id: "mansao_kazekage",
    name: "Mansao do Kazekage",
    channelId: MANSAO_KAZEKAGE_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Sala administrativa de Sunagakure, com mapas de rotas, selos de areia e relatorios de fronteira.",
    terrain: "sand",
    image: "kazekage-mansion.png",
    cells: { obstacles: ["B5", "B6", "E5", "E6"] },
  },
  {
    id: "mansao_raikage",
    name: "Mansao do Raikage",
    channelId: MANSAO_RAIKAGE_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Sala de comando de Kumogakure, com mapas montanhosos e linhas de mensageiros rapidos.",
    terrain: "grass",
    image: "raikage-mansion.png",
    cells: { height: ["A3", "A8", "F3", "F8"], obstacles: ["C5", "D5"] },
  },
  {
    id: "mansao_tsuchikage",
    name: "Mansao do Tsuchikage",
    channelId: MANSAO_TSUCHIKAGE_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Arquivo pesado de Iwagakure, cheio de laudos de fronteira, pedra polida e selos de seguranca.",
    terrain: "sand",
    image: "tsuchikage-mansion.png",
    cells: { obstacles: ["B4", "B7", "E4", "E7"], height: ["C2", "D9"] },
  },
  {
    id: "mansao_mizukage",
    name: "Mansao da Mizukage",
    channelId: MANSAO_MIZUKAGE_CHANNEL_ID,
    rows: 6,
    cols: 10,
    description: "Gabinete frio de Kirigakure, onde informes da nevoa chegam lacrados com cera azul.",
    terrain: "grass",
    image: "mizukage-mansion.png",
    cells: { water: ["A1", "A2", "F9", "F10"], obstacles: ["C5", "D5"] },
  },
  {
    id: "yuki_mirror_field",
    name: "Campo de Espelhos de Gelo",
    channelId: "mission:yuki_mirror_field",
    rows: 6,
    cols: 10,
    description: "Um patio congelado tomado por espelhos de gelo, refens suspensos e clones que surgem pela nevoa.",
    terrain: "grass",
    image: "yuki-mirror-field.png",
    cells: {
      water: ["A1", "A2", "B1", "E10", "F9", "F10"],
      obstacles: ["C4", "C7", "D4", "D7"],
      height: ["B5", "B6", "E5", "E6"],
    },
    elementModifiers: {
      AGUA: { costMult: 0.8, dmgMult: 1.2 },
      FOGO: { dmgMult: 1.1 },
    },
  },
  {
    id: "posto_inimigo",
    name: "Posto Inimigo",
    channelId: "mission:posto_inimigo",
    rows: 6,
    cols: 10,
    description: "Um posto avancado inimigo montado no campo aberto, com barricadas, torres baixas e rotas de fuga estreitas.",
    terrain: "grass",
    image: "enemy-outpost.png",
    cells: {
      obstacles: ["B5", "B6", "C5", "D6", "E5", "E6"],
      height: ["A8", "A9", "B8", "F2", "F3"],
      trees: ["A1", "C10", "F10"],
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
