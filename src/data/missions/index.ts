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
  HOSPITAL_KONOHA_CHANNEL_ID,
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
    id: "ervas_medicinais_hospital",
    name: "Ervas Medicinais do Hospital",
    rank: "D",
    description:
      "Um ninja medico do Hospital de Konoha precisa de ervas frescas da Floresta para preparar remedios urgentes.",
    channelId: HOSPITAL_KONOHA_CHANNEL_ID,
    type: "MEDICINAL_HERBS",
    objectives: [
      { id: "falar_medico", description: "Falar com o ninja medico no Hospital de Konoha" },
      { id: "coletar_ervas", description: "Coletar as ervas medicinais na Floresta" },
      { id: "entregar_ervas", description: "Entregar as ervas ao ninja medico" },
    ],
    rewards: { xp: 95, ryo: 75, items: [{ itemId: "kit_ervas_medicinais", name: "Kit de Ervas Medicinais", qty: 1 }] },
    data: {
      hospitalChannelId: HOSPITAL_KONOHA_CHANNEL_ID,
      forestChannelId: FLORESTA_CHANNEL_ID,
      introTurns: 3,
      thanksTurns: 2,
      neededHerbs: 3,
      maxMistakes: 3,
      stepTimeoutMs: 60_000,
    },
  },
  {
    id: "preparar_festival_vila",
    name: "Preparacao do Festival da Vila",
    rank: "D",
    description:
      "Ajude no festival do Centro Comercial de Konoha: monte barracas, pendure lanternas e fiscalize os jogos para impedir trapaças com jutsu.",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    type: "FESTIVAL_PREP",
    objectives: [
      { id: "falar_organizadora", description: "Falar com a organizadora do festival" },
      { id: "montar_barracas", description: "Montar as barracas do festival" },
      { id: "pendurar_lanternas", description: "Pendurar as lanternas na ordem correta" },
      { id: "impedir_trapaca", description: "Impedir que usem jutsu para trapacear nos jogos" },
      { id: "confirmar_festival", description: "Confirmar com a organizadora que tudo esta pronto" },
    ],
    rewards: { xp: 105, ryo: 85, items: [{ itemId: "vale_festival_konoha", name: "Vale do Festival de Konoha", qty: 1 }] },
    data: {
      commercialChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
      briefingTurns: 3,
      thanksTurns: 2,
      maxMistakes: 5,
      stepTimeoutMs: 60_000,
      cheaterMaxActions: 5,
    },
  },
  {
    id: "ninken_em_treinamento",
    name: "Ninken em Treinamento",
    rank: "D",
    description:
      "Um ninken jovem fugiu durante o treino na Rota Comercial de Konoha. Siga o rastro verdadeiro, ignore cheiros falsos e traga-o de volta em seguranca.",
    channelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
    type: "NINKEN_TRACKING",
    objectives: [
      { id: "falar_treinador", description: "Falar com o treinador na Rota Comercial de Konoha" },
      { id: "rastrear_rota", description: "Separar o rastro verdadeiro dos cheiros falsos na rota" },
      { id: "rastrear_floresta", description: "Encontrar a trilha do ninken na Floresta" },
      { id: "acalmar_ninken", description: "Acalmar o ninken jovem sem assustar ele" },
      { id: "entregar_ninken", description: "Levar o ninken de volta ao treinador" },
    ],
    rewards: { xp: 100, ryo: 80, items: [{ itemId: "apito_ninken_treino", name: "Apito de Treino Ninken", qty: 1 }] },
    data: {
      routeChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
      forestChannelId: FLORESTA_CHANNEL_ID,
      introTurns: 3,
      thanksTurns: 2,
      maxMistakes: 4,
      stepTimeoutMs: 60_000,
      ninkenMaxActions: 6,
    },
  },
  {
    id: "separar_briga_vendedores",
    name: "Briga no Mercado",
    rank: "D",
    description:
      "Dois vendedores do Centro Comercial acusam um ao outro de roubo. Ouça os dois lados e resolva a confusão apenas na conversa.",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    type: "MARKET_MEDIATION",
    objectives: [
      { id: "chegar_mercado", description: "Ir ao Centro Comercial de Konoha e usar /mapa" },
      { id: "ouvir_hina", description: "Ouvir a versao de Hina, a vendedora de frutas" },
      { id: "ouvir_aya", description: "Ouvir a versao de Aya, a vendedora de tecidos" },
      { id: "resolver_conversa", description: "Resolver a briga sem agressao" },
    ],
    rewards: { xp: 95, ryo: 75, items: [{ itemId: "cupom_mercado_konoha", name: "Cupom do Mercado de Konoha", qty: 1 }] },
    data: {
      commercialChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
      vendorTurns: 2,
      maxMediationActions: 5,
    },
  },
  {
    id: "treino_substituicao_bonecos",
    name: "Treino de Substituicao com Bonecos",
    rank: "D",
    description:
      "A Academia Genin precisa consertar bonecos de treino danificados e testar se ainda servem para aulas basicas de substituicao.",
    channelId: ACADEMIA_GENIN_CHANNEL_ID,
    type: "DUMMY_SUBSTITUTION",
    objectives: [
      { id: "falar_instrutor", description: "Falar com o instrutor da Academia Genin" },
      { id: "consertar_bonecos", description: "Consertar os bonecos de treino danificados" },
      { id: "testar_substituicao", description: "Testar os bonecos em uma aula basica de substituicao" },
      { id: "confirmar_treino", description: "Confirmar com o instrutor que os bonecos servem para a aula" },
    ],
    rewards: { xp: 95, ryo: 70, items: [{ itemId: "fita_reparo_academia", name: "Fita de Reparo da Academia", qty: 1 }] },
    data: {
      academyChannelId: ACADEMIA_GENIN_CHANNEL_ID,
      introTurns: 3,
      thanksTurns: 2,
      maxMistakes: 4,
      stepTimeoutMs: 60_000,
    },
  },
  {
    id: "remover_ninhos_vespas",
    name: "Remover Ninhos de Vespas",
    rank: "D",
    description:
      "A Academia Genin esta com ninhos de vespas perto da parede. Remova tudo com cuidado para nao machucar alunos nem danificar o predio.",
    channelId: ACADEMIA_GENIN_CHANNEL_ID,
    type: "WASP_NESTS",
    objectives: [
      { id: "falar_instrutor", description: "Falar com Yori Umino sobre os ninhos da Academia" },
      { id: "isolar_area", description: "Isolar a area para proteger os alunos" },
      { id: "remover_ninho_b2", description: "Remover o ninho baixo em B2 sem usar fogo forte" },
      { id: "remover_ninho_c8", description: "Remover o ninho da marquise em C8 sem quebrar a parede" },
      { id: "remover_ninho_e6", description: "Remover o ninho alto em E6 sem espalhar o enxame" },
      { id: "derrotar_enxame", description: "Derrotar o enxame de vespas que escapou" },
    ],
    rewards: { xp: 105, ryo: 75, items: [{ itemId: "cera_de_vespa", name: "Cera de Vespa", qty: 1 }] },
    data: {
      academyChannelId: ACADEMIA_GENIN_CHANNEL_ID,
      introTurns: 3,
      maxMistakes: 3,
      stepTimeoutMs: 60_000,
      waspTemplate: "wasp_swarm",
    },
  },
  {
    id: "entrega_urgente_ichiraku",
    name: "Entrega Urgente do Ichiraku",
    rank: "D",
    description:
      "O Ichiraku ficou lotado e precisa de um ninja para levar pedidos quentes pela vila antes que o caldo esfrie.",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    type: "ICHIRAKU_DELIVERY",
    objectives: [
      { id: "falar_ichiraku", description: "Falar com Ayame no Centro Comercial" },
      { id: "entregar_academia", description: "Entregar o pedido da Academia Genin" },
      { id: "entregar_hospital", description: "Entregar o pedido do Hospital de Konoha" },
      { id: "entregar_mansao", description: "Entregar o pedido da Mansao do Hokage" },
      { id: "voltar_ichiraku", description: "Voltar ao Ichiraku para confirmar as entregas" },
    ],
    rewards: { xp: 90, ryo: 70, items: [{ itemId: "cupom_ichiraku", name: "Cupom do Ichiraku", qty: 1 }] },
    data: {
      commercialChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
      academyChannelId: ACADEMIA_GENIN_CHANNEL_ID,
      hospitalChannelId: HOSPITAL_KONOHA_CHANNEL_ID,
      mansionChannelId: MANSAO_HOKAGE_CHANNEL_ID,
      introTurns: 2,
      thanksTurns: 2,
      maxMistakes: 3,
      stepTimeoutMs: 60_000,
    },
  },
  {
    id: "coleta_agua_limpa",
    name: "Coleta de Agua Limpa",
    rank: "D",
    description:
      "O Hospital de Konoha precisa de agua limpa para preparar soro e lavar instrumentos. Analise pontos de coleta na Floresta e na Rota Comercial antes de levar as amostras.",
    channelId: HOSPITAL_KONOHA_CHANNEL_ID,
    type: "CLEAN_WATER",
    objectives: [
      { id: "falar_haru", description: "Falar com Haru no Hospital de Konoha" },
      { id: "coletar_floresta", description: "Coletar agua limpa na Floresta" },
      { id: "coletar_rota", description: "Coletar agua limpa na Rota Comercial de Konoha" },
      { id: "entregar_agua", description: "Entregar as amostras limpas no Hospital de Konoha" },
    ],
    rewards: { xp: 100, ryo: 75, items: [{ itemId: "frasco_agua_purificada", name: "Frasco de Agua Purificada", qty: 1 }] },
    data: {
      hospitalChannelId: HOSPITAL_KONOHA_CHANNEL_ID,
      forestChannelId: FLORESTA_CHANNEL_ID,
      routeChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
      introTurns: 2,
      thanksTurns: 2,
      maxMistakes: 3,
      stepTimeoutMs: 60_000,
    },
  },
  {
    id: "patrulha_noturna_beco",
    name: "Patrulha Noturna no Beco",
    rank: "D",
    description:
      "Moradores ouviram barulhos estranhos no Beco de Konoha. Patrulhe a area, diferencie civis assustados de suspeitos e contenha qualquer arruaceiro.",
    channelId: BECO_KONOHA_CHANNEL_ID,
    type: "NIGHT_PATROL",
    objectives: [
      { id: "chegar_beco", description: "Ir ao Beco de Konoha e usar /mapa" },
      { id: "investigar_barulhos", description: "Investigar os barulhos sem assustar moradores" },
      { id: "acalmar_civil", description: "Identificar e acalmar o civil assustado" },
      { id: "confrontar_arruaceiro", description: "Confrontar o arruaceiro escondido" },
      { id: "derrotar_arruaceiro", description: "Derrotar o arruaceiro do beco" },
    ],
    rewards: { xp: 100, ryo: 75, items: [{ itemId: "relatorio_patrulha_beco", name: "Relatorio de Patrulha do Beco", qty: 1 }] },
    data: {
      alleyChannelId: BECO_KONOHA_CHANNEL_ID,
      thugTemplate: "alley_troublemaker",
      thugTurns: 2,
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
