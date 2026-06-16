import type { MissionDef } from "../types.js";
import {
  FLORESTA_CHANNEL_ID,
  PRACA_VILA_DA_FOLHA_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  DESERTO_CHANNEL_ID,
  BECO_KONOHA_CHANNEL_ID,
  ACADEMIA_GENIN_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
} from "../scenarios/index.js";

export const MISSIONS: MissionDef[] = [
  {
    id: "gato_perdido",
    name: "Recuperar o Gato (Tora)",
    rank: "D",
    description:
      "A esposa do Daimyo perdeu o gato Tora. Encontre-o na Praça da Vila da Folha e capture-o.",
    channelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
    type: "FETCH_CAT",
    objectives: [{ id: "capturar_gato", description: "Capturar o gato Tora" }],
    rewards: { xp: 80, ryo: 50 },
    data: { catMoveMin: 1, catMoveMax: 2, fleeMin: 2, fleeMax: 4, captureBaseChance: 0.45 },
  },
  {
    id: "limpar_vila",
    name: "Limpar a Vila",
    rank: "D",
    description:
      "A Vila da Folha esta cheia de lixo na Praca e no Centro Comercial. Recolha tudo e mantenha a vila limpa.",
    channelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
    type: "CLEAN_VILLAGE",
    objectives: [
      { id: "limpar_praca", description: "Recolher o lixo na Praca da Vila da Folha" },
      { id: "limpar_centro", description: "Recolher o lixo no Centro Comercial de Konoha" },
      { id: "espantar_adolescente", description: "Espantar o adolescente que joga lixo no chao" },
    ],
    rewards: { xp: 90, ryo: 60 },
    data: {
      pracaChannelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
      centroChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
    },
  },
  {
    id: "ladrao_de_bolsas",
    name: "Ladrao de Bolsas",
    rank: "D",
    description:
      "Uma senhora teve a bolsa roubada na Praca da Vila da Folha. Descubra para onde o ladrao fugiu, recupere a bolsa e devolva para ela.",
    channelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
    type: "PURSE_THIEF",
    objectives: [
      { id: "falar_velinha", description: "Ouvir a senhora na Praca da Vila da Folha" },
      { id: "ir_beco", description: "Ir ao Beco de Konoha e encontrar o ladrao" },
      { id: "derrotar_ladrao", description: "Derrotar o ladrao de bolsas" },
      { id: "devolver_bolsa", description: "Devolver a bolsa para a senhora" },
    ],
    rewards: { xp: 110, ryo: 75, items: [{ itemId: "agradecimento_velinha", name: "Agradecimento da Senhora", qty: 1 }] },
    data: {
      plazaChannelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
      alleyChannelId: BECO_KONOHA_CHANNEL_ID,
      reportTurns: 3,
      thiefTurns: 3,
      thanksTurns: 2,
      thiefTemplate: "purse_thief",
    },
  },
  {
    id: "peca_comedia_genin",
    name: "Peca de Comedia da Academia",
    rank: "D",
    description:
      "A Academia Genin precisa de um protagonista para entreter tres criancas em uma peca de comedia. Descubra o gosto de cada uma e conquiste a plateia.",
    channelId: ACADEMIA_GENIN_CHANNEL_ID,
    type: "GENIN_COMEDY",
    objectives: [
      { id: "ir_academia", description: "Ir ate a Academia Genin e usar /mapa" },
      { id: "agradar_hana", description: "Fazer Hana gostar da peca" },
      { id: "agradar_ren", description: "Fazer Ren gostar da peca" },
      { id: "agradar_mika", description: "Fazer Mika gostar da peca" },
    ],
    rewards: { xp: 95, ryo: 65 },
    data: {
      academyChannelId: ACADEMIA_GENIN_CHANNEL_ID,
      maxActions: 15,
      maxChildActions: 5,
    },
  },
  {
    id: "bolinhos_horario_pico",
    name: "Bolinhos no Horario de Pico",
    rank: "D",
    description:
      "Um comerciante do Centro Comercial precisa de ajuda para preparar bolinhos durante o horario de pico. Aprenda o ritmo da cozinha e nao perca o ponto.",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    type: "DANGO_RUSH",
    objectives: [
      { id: "falar_comerciante", description: "Falar com o comerciante de bolinhos no Centro Comercial" },
      { id: "preparar_primeira_leva", description: "Preparar a primeira leva de bolinhos" },
      { id: "preparar_segunda_leva", description: "Preparar a segunda leva de bolinhos" },
      { id: "preparar_terceira_leva", description: "Preparar a terceira leva de bolinhos" },
    ],
    rewards: { xp: 85, ryo: 70, items: [{ itemId: "bolinho_konoha", name: "Bolinho de Konoha", qty: 2 }] },
    data: {
      commercialChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
      explainTurns: 3,
      cookingRounds: 3,
      buttonDelayMs: 2400,
      buttonWindowMs: 3000,
    },
  },
  {
    id: "limpar_telhado_academia",
    name: "Limpar o Telhado da Academia",
    rank: "D",
    description:
      "O telhado da Academia Genin esta cheio de sujeira. Limpe os pontos marcados e afaste os pombos que aparecerem.",
    channelId: ACADEMIA_GENIN_CHANNEL_ID,
    type: "ROOF_CLEANUP",
    objectives: [
      { id: "limpar_b1", description: "Limpar a sujeira em B1" },
      { id: "limpar_c1", description: "Limpar a sujeira em C1" },
      { id: "limpar_d1", description: "Limpar a sujeira em D1" },
      { id: "derrotar_pombos", description: "Derrotar os tres pombos do telhado" },
    ],
    rewards: { xp: 100, ryo: 70 },
    data: {
      academyChannelId: ACADEMIA_GENIN_CHANNEL_ID,
      pigeonTemplate: "roof_pigeon",
      pigeons: 3,
    },
  },
  {
    id: "organizar_arquivos_hokage",
    name: "Arquivos da Mansao do Hokage",
    rank: "D",
    description:
      "Os arquivos da Mansao do Hokage estao fora de ordem. Organize os pergaminhos nas prateleiras corretas antes que a papelada se perca.",
    channelId: MANSAO_HOKAGE_CHANNEL_ID,
    type: "ARCHIVE_SCROLLS",
    objectives: [
      { id: "chegar_mansao", description: "Ir ate a Mansao do Hokage e usar /mapa" },
      { id: "organizar_pergaminhos", description: "Organizar os pergaminhos dos arquivos" },
    ],
    rewards: { xp: 90, ryo: 80, items: [{ itemId: "selo_arquivo_hokage", name: "Selo dos Arquivos do Hokage", qty: 1 }] },
    data: {
      mansionChannelId: MANSAO_HOKAGE_CHANNEL_ID,
      maxMistakes: 3,
      stepTimeoutMs: 60_000,
    },
  },
  {
    id: "lider_bandidos",
    name: "Líder dos Bandidos",
    rank: "C",
    description:
      "Roubos atormentam Konoha. Vá ao Centro Comercial, investigue com o mercador e a criança, e depois enfrente os bandidos na Floresta.",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    type: "BANDIT_FIGHT",
    objectives: [
      { id: "ir_centro", description: "Ir ao Centro Comercial de Konoha (use /mapa lá)" },
      { id: "pista_mercador", description: "Descobrir onde os roubos acontecem (Mercador)" },
      { id: "pista_crianca", description: "Descobrir quem são os ladrões (Criança)" },
      { id: "derrotar_lider", description: "Derrotar o líder e os capangas na Floresta" },
    ],
    rewards: { xp: 220, ryo: 180, items: [{ itemId: "katana_bandida", name: "Katana Bandida", qty: 1 }] },
    data: { thugs: 3, maxDialogue: 3, forestChannelId: FLORESTA_CHANNEL_ID, npcMaxTurns: 3 },
  },
  {
    id: "escolta_comerciante",
    name: "Escolta do Comerciante de Tecidos",
    rank: "C",
    description:
      "Um comerciante leva tecidos valiosos de Konoha até a rota mercante de Sunagakure. Encontre-o na Rota Comercial de Konoha e o proteja durante toda a viagem até o deserto.",
    channelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
    type: "ESCORT",
    objectives: [
      { id: "encontrar_comerciante", description: "Encontrar o comerciante na Rota Comercial de Konoha (use /interagir npc)" },
      { id: "derrotar_tronco", description: "Remover o tronco que bloqueia a estrada" },
      { id: "chegar_deserto", description: "Atravessar até o Deserto (use /mapa lá)" },
      { id: "derrotar_bandido", description: "Derrotar o bandido do deserto" },
      { id: "escoltar_suna", description: "Levar o comerciante em segurança até a rota de Sunagakure" },
    ],
    rewards: { xp: 260, ryo: 210, items: [{ itemId: "tecido_suna", name: "Tecido Fino de Suna", qty: 1 }] },
    data: {
      desertChannelId: DESERTO_CHANNEL_ID,
      logTemplate: "tronco",
      banditTemplate: "escort_bandit",
      // nº de interações com o comerciante até cada gatilho
      meetTalks: 3, // apresentação -> avisa do tronco e começa o combate
      afterLogTalks: 1, // depois do tronco -> manda ir ao deserto
      desertTalks: 3, // no deserto -> emboscada do bandido
      afterBanditTalks: 2, // depois do bandido -> chegada a Suna (fim)
    },
  },
];

const MISSION_MAP = new Map<string, MissionDef>(MISSIONS.map((m) => [m.id, m]));

export function getMission(id: string): MissionDef | undefined {
  return MISSION_MAP.get(id);
}
