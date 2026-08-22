// ============================================================================
// Árvores de habilidade por CLÃ — mesma mecânica das árvores de elemento
// (src/data/element-trees/index.ts), mas o gate é `clanId` em vez de
// `element`. O front usa o mesmo componente de árvore; só troca o que
// desbloqueia a aba (ver lockReason em services/characters/skill-tree.ts).
//
// Orçamento: continua saindo do MESMO pool (atributo Ninjutsu) — comprar um
// nó de clã consome os mesmos pontos que comprar um nó elemental. Faz
// sentido aqui porque a categoria CLA das habilidades do Nara ainda é
// chakra manipulado como ninjutsu (não é uma linhagem ocular/física à parte).
//
// Nota: as habilidades de clã são conteúdo REAL — balanceie normalmente. (Até
// 09/08/2026 este comentário dizia que eram placeholder, herança de quando o
// projeto tinha 39 abilities no total; o único arquivo descartável era o
// `jutsus/support.ts`, já apagado.) Ids de NÓ são estáveis porque vão pro
// banco em CharacterSkillNode; id de ability pode mudar, a ponte é o
// grantsAbilityId.
// ============================================================================
import type { Attribute } from "../../config/enums.js";
import type { NodeRank, SkillNodeDef } from "../element-trees/index.js";

const COST: Record<string, number> = { ROOT: 1, PASSIVE: 2, D: 1, C: 3, B: 4, A: 6, S: 10 };

// Fábrica compacta espelhando make() de element-trees/index.ts, trocando
// `element` por `clanId` e recebendo o POOL PADRAO do clã.
//
// `defaultPool` e' o atributo que banca a espinha do clã — o que aquele clã
// "e'" na pratica (Hyuuga/Kaguya = taijutsu, Nara/Aburame = ninjutsu,
// Uzumaki = fuinjutsu...). Nos que fogem disso passam `pool` no ultimo
// argumento: e' assim que uma tecnica de espada dentro de um clã de soco
// (ex: Camélias do Kaguya) passa a custar kenjutsu, e nao taijutsu.
function makeClan(clanId: string, defaultPool: Attribute) {
  const jutsu = (
    id: string,
    name: string,
    icon: string,
    rank: NodeRank,
    branch: string,
    col: number,
    row: number,
    requires: string[],
    reqLevel: number,
    reqPool: number,
    desc: string,
    // gate num atributo DIFERENTE do pool. Depois da migracao pra pools por
    // atributo nenhum no usa isto (o gate virou o proprio reqPool); fica como
    // escape hatch pra exigencia cruzada de verdade.
    reqAttribute?: { attribute: Attribute; value: number },
    pool: Attribute = defaultPool,
    cost: number = COST[rank]!,
  ): SkillNodeDef => ({
    id,
    clanId,
    name,
    kind: "JUTSU",
    rank,
    icon,
    pool,
    cost,
    branch,
    col,
    row,
    requires,
    reqLevel,
    reqPool,
    reqAttribute,
    grantsAbilityId: id,
    desc,
  });
  const pass = (
    id: string,
    name: string,
    icon: string,
    branch: string,
    col: number,
    row: number,
    requires: string[],
    reqLevel: number,
    reqPool: number,
    desc: string,
    root = false,
    reqAttribute?: { attribute: Attribute; value: number },
    pool: Attribute = defaultPool,
  ): SkillNodeDef => ({
    id,
    clanId,
    name,
    kind: "PASSIVE",
    icon,
    pool,
    cost: root ? COST.ROOT! : COST.PASSIVE!,
    branch,
    col,
    row,
    requires,
    reqLevel,
    reqPool,
    reqAttribute,
    desc,
  });
  return { jutsu, pass };
}

// -------------------------------------------------------------- UCHIHA
// Árvore curta e exclusivamente ocular: cada nó substitui o estágio anterior
// quando ativado. O custo da árvore é pago no pool de Dōjutsu; o custo de
// manutenção em combate é chakra por turno.
const UC = makeClan("uchiha", "dojutsu");
const UCHIHA: SkillNodeDef[] = [
  UC.jutsu(
    "uchiha_sharingan_1_tomoe",
    "Sharingan: Primeiro Tomoe",
    "🔴",
    "C",
    "Sharingan",
    0,
    0,
    [],
    1,
    1,
    "Ativa o Sharingan de um tomoe. Concede +3% de esquiva e consome 5% de chakra por turno enquanto estiver ativo.",
  ),
  UC.pass(
    "uchiha_controle_ocular",
    "Controle Ocular",
    "👁️",
    "Sharingan",
    0,
    1,
    ["uchiha_sharingan_1_tomoe"],
    5,
    4,
    "Passiva: o controle do fluxo de chakra nos olhos reduz em 15% o custo de manutenção do Sharingan.",
  ),
  UC.jutsu(
    "uchiha_sharingan_2_tomoe",
    "Sharingan: Segundo Tomoe",
    "🔴",
    "B",
    "Sharingan",
    0,
    2,
    ["uchiha_controle_ocular"],
    10,
    8,
    "Ativa o Sharingan de dois tomoe. Concede +5% de esquiva e consome 7% de chakra por turno enquanto estiver ativo.",
  ),
  UC.pass(
    "uchiha_economia_visual",
    "Economia Visual",
    "🩸",
    "Sharingan",
    0,
    3,
    ["uchiha_sharingan_2_tomoe"],
    15,
    11,
    "Passiva: a adaptação ao Sharingan reduz em mais 15% o custo de manutenção. O bônus acumula com Controle Ocular.",
  ),
  UC.jutsu(
    "uchiha_sharingan_3_tomoe",
    "Sharingan: Terceiro Tomoe",
    "🔴",
    "A",
    "Sharingan",
    0,
    4,
    ["uchiha_economia_visual"],
    20,
    15,
    "Ativa o Sharingan de três tomoe. Concede +10% de esquiva, consome 9% de chakra por turno e aprende permanentemente apenas Ninjutsus de Fogo, Água, Vento, Terra e Raio, além dos jutsus ativos de Punho Forte, Arhat e Adamantino observados. Não copia passivas. Cada cópia exige nível e pontos no atributo da árvore; Ninjutsu elemental também exige afinidade.",
  ),
  UC.jutsu(
    "uchiha_coercao_sharingan",
    "Coerção Sharingan",
    "👁️",
    "B",
    "Genjutsu Ocular",
    -1.25,
    5,
    ["uchiha_sharingan_3_tomoe"],
    22,
    18,
    "Com contato visual, arrasta a mente do alvo para um pesadelo opressivo que pode deixá-lo confuso e preso no lugar. Exige o Sharingan de três tomoe ativo.",
  ),
  UC.jutsu(
    "uchiha_repressao_estacas",
    "Ilusão Demoníaca: Repressão com Estacas",
    "🗡️",
    "A",
    "Genjutsu Ocular",
    1.25,
    5,
    ["uchiha_sharingan_3_tomoe"],
    26,
    22,
    "O olhar arrasta o alvo para uma ilusão de tortura, onde estacas atravessam seus membros e podem paralisá-lo por um instante. Exige o Sharingan de três tomoe ativo.",
  ),
  UC.jutsu(
    "uchiha_genjutsu_sharingan",
    "Genjutsu do Sharingan",
    "🔴",
    "A",
    "Genjutsu Ocular",
    0,
    6,
    ["uchiha_coercao_sharingan", "uchiha_repressao_estacas"],
    30,
    26,
    "Projeta uma ilusão aterrorizante através do Sharingan de três tomoe, alcançando vários inimigos que possam ser vistos e deixando-os vulneráveis a ataques posteriores.",
  ),
  {
    ...UC.jutsu(
      "uchiha_mangekyo_sharingan",
      "Mangekyō Sharingan",
      "👁️",
      "S",
      "Mangekyō",
      0,
      7,
      ["uchiha_sharingan_3_tomoe"],
      45,
      32,
      "O despertar do Mangekyō exige Trauma. Ao comprar este único nó, você recebe aleatoriamente uma das variações: Itachi, Sasuke, Shisui, Obito ou Madara. Os caminhos exclusivos de cada variação serão desbloqueados futuramente.",
    ),
    requiresCondition: "TRAUMA",
    concealUntilOwned: true,
  },
];

// ---------------------------------------------------------------- NARA
// Clã das sombras: controle, não dano em rajada. O tronco sobe pela técnica
// assinatura (Possessão da Sombra) e se ramifica em dois acabamentos —
// Enforcamento (finalizador de controle) e Costura (área/perfuração) — antes
// de retomar o tronco central rumo à versão em arma (Shuriken), à versão em
// rede (multi-alvo) e ao ápice, que puxa os presos pra dentro de outra jogada
// (Lírio da Aranha Negra). As duas passivas (raiz/ápice) NÃO dão dano: dão
// custo menor e imobilização mais confiável/duradoura — a curva de poder do
// clã é toda em controle, coerente com o material de origem.
const N = makeClan("nara", "ninjutsu");
const NARA: SkillNodeDef[] = [
  N.pass(
    "nara_raiz",
    "Conluio das Sombras",
    "🌑",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: seus jutsus de clã custam 15% menos chakra e têm +15 pontos percentuais de chance de imobilizar o alvo.",
    true,
  ),
  N.jutsu(
    "nara_possessao",
    "Técnica de Possessão da Sombra",
    "👤",
    "C",
    "Vínculo",
    0,
    1,
    ["nara_raiz"],
    1,
    4,
    "A técnica assinatura do clã. Estende a própria sombra pelo chão em linha reta; se ela tocar a sombra do alvo, os dois ficam conectados e o inimigo entra em Vínculo de Sombra — sem dano, mas incapaz de se mover ou reagir.",
  ),
  N.jutsu(
    "nara_enforcamento",
    "Técnica de Enforcamento pela Sombra",
    "✋",
    "B",
    "Estrangulamento",
    -1,
    2,
    ["nara_possessao"],
    9,
    9,
    "Depois de capturar um alvo com a Possessão da Sombra, ela assume a forma de mãos que apertam o pescoço e o corpo: mais um acúmulo de imobilização e o alvo fica atordoado tentando se soltar.",
  ),
  N.jutsu(
    "nara_costura",
    "Técnica da Costura das Sombras",
    "🪡",
    "B",
    "Perfuração",
    1,
    2,
    ["nara_possessao"],
    10,
    9,
    "A sombra se divide em agulhas afiadas que avançam pelo chão em leque, perfurando quem estiver na área e podendo prender os pés de quem for atingido.",
  ),
  N.jutsu(
    "nara_shuriken",
    "Técnica de Imitação de Shuriken pela Sombra",
    "🗡️",
    "A",
    "Arsenal",
    0,
    3,
    ["nara_possessao"],
    17,
    15,
    "Uma lâmina de chakra absorve a própria sombra do usuário. Ao perfurar a sombra do alvo (não o corpo), ele entra em Vínculo de Sombra quase sem perceber o que aconteceu — difícil de esquivar.",
  ),
  N.jutsu(
    "nara_rede",
    "Rede de Imitação pela Sombra",
    "🕸️",
    "A",
    "Arsenal",
    0,
    4,
    ["nara_shuriken"],
    21,
    18,
    "Divide a sombra em vários filamentos que se espalham pelo chão, prendendo todos os inimigos numa área em Vínculo de Sombra de uma só vez.",
  ),
  N.pass(
    "nara_apice",
    "Sombra Absoluta",
    "🌘",
    "Ápice",
    0,
    5,
    ["nara_rede"],
    25,
    20,
    "Passiva: sua sombra alcança mais longe (+2 casas em jutsus de linha ou de alvo único) e o Vínculo de Sombra que você aplica dura 1 rodada a mais.",
  ),
  N.jutsu(
    "nara_lirio",
    "Lírio da Aranha Negra",
    "🕷️",
    "S",
    "Ápice",
    0,
    6,
    ["nara_apice"],
    30,
    24,
    "Faz o selo de mão e dispara tentáculos de sombra que alcançam o inimigo rápido e o prendem com a Rede de Imitação (Vínculo de Sombra), puxando todos os capturados até um ponto — ótimo para arrastar o inimigo para dentro do alcance de outra técnica.",
  ),
];

// ---------------------------------------------------------------- HYUUGA
// Clã do Byakugan: percepção e Punho Suave (Jyuuken). Tronco: Byakugan
// (pede Dojutsu) -> Punho Suave. Dali a árvore se ramifica — pedido
// explícito de "uma ramificação mais ofensiva e outra mais defensiva":
//   Ofensivo (col -1): Palma de Vácuo -> 64 Palmas -> 128 Palmas — a
//     progressão de barragem/controle (Bloqueio de Ninjutsu, Atordoar,
//     Lentidão), 3 nós.
//   Defensivo (col +1): Palma Rotativa (a ÚNICA técnica do clã que dá
//     Barreira) -> Guarda Perpétua, a passiva que fecha o ramo: a postura
//     da Palma Rotativa nunca se desfaz de verdade, então soma esquiva
//     permanente contra Ninjutsu e estende a duração da própria Barreira.
// Os dois convergem na Rede de Tenketsu (ápice) antes dos Punhos dos Leões
// Gêmeos — mesmo padrão do Aburame/Hatake (apice.requires com os dois
// finalizadores de ramo).
// Todo o resto do kit (a partir de Punho Suave) pede Taijutsu em vez de
// Dojutsu — reqAttribute modela literalmente "desbloqueia upando X" do
// pedido original.
// As duas passivas (raiz/ápice) empurram a identidade real do clã: não é
// dano bruto, é ATRAVESSAR defesa (perfura Bloqueio/Barreira, ignora escudo)
// e SELAR chakra (Bloqueio de Ninjutsu) — o mesmo golpe físico dobra como
// controle, igual no material de origem.
const H = makeClan("hyuuga", "taijutsu");
const HYUUGA: SkillNodeDef[] = [
  H.pass(
    "hyuuga_raiz",
    "Olhos Brancos",
    "🧬",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: mesmo sem o Byakugan ativado, a visão periférica quase total do clã já ajuda a mirar nos tenketsu certos. Seus jutsus de clã causam +10% de dano, custam 10% menos recurso e têm +10 pontos percentuais de chance de aplicar o Selo dos Tenketsu.",
    true,
    undefined,
    // a porta de entrada do clã e' o OLHO, nao o punho: raiz e Byakugan saem
    // de Dojutsu. Do Punho Suave em diante a arvore vira taijutsu puro.
    "dojutsu",
  ),
  H.jutsu(
    "hyuuga_byakugan",
    "Byakugan",
    "👁️",
    "D",
    "Despertar",
    0,
    1,
    ["hyuuga_raiz"],
    1,
    3,
    "O dōjutsu do clã. Ative e desative a qualquer momento com /combate byakugan: enquanto ligado, dá +10% de chance de esquiva contra qualquer ataque, gasta 5% de chakra por rodada (desliga sozinho se o chakra acabar) e enxerga através de clones/substituição — corta pela metade o bônus de esquiva de quem tentar escapar de você com esses truques.",
    undefined,
    "dojutsu",
  ),
  H.jutsu(
    "hyuuga_punho_suave",
    "Punho Suave",
    "🤚",
    "C",
    "Punho Suave",
    0,
    2,
    ["hyuuga_byakugan"],
    1,
    4,
    "Estilo de combate básico dos Hyūga: injeta chakra no golpe para ferir órgãos internos e a rede de chakra do adversário, em vez de só o corpo. 40% de chance de selar os tenketsu do alvo por 1 rodada. Exige o Byakugan ativo.",
  ),
  H.jutsu(
    "hyuuga_palma_vacuo",
    "Oito Trigramas: Palma de Vácuo",
    "🌬️",
    "B",
    "Ofensivo",
    -1,
    3,
    ["hyuuga_punho_suave"],
    9,
    9,
    "Usando o Byakugan como mira, identifica os pontos vitais do oponente e dispara uma 'bala de vácuo' comprimida à distância — não pode ser esquivada e empurra o alvo 3 casas para trás antes mesmo dele perceber o que aconteceu. Exige o Byakugan ativo.",
  ),
  H.jutsu(
    "hyuuga_palma_rotativa",
    "Palma Rotativa",
    "🌀",
    "B",
    "Defensivo",
    1,
    3,
    ["hyuuga_punho_suave"],
    10,
    9,
    "Gira rapidamente enquanto libera chakra por todos os tenketsu, criando uma esfera defensiva quase impenetrável. Ganha uma Barreira que cresce com sua vida máxima por 3 rodadas e livra você de ficar preso ao chão. Exige o Byakugan ativo.",
  ),
  H.pass(
    "hyuuga_guarda_perpetua",
    "Guarda Perpétua",
    "🛡️",
    "Defensivo",
    1,
    4,
    ["hyuuga_palma_rotativa"],
    13,
    11,
    "Passiva sempre ativa: a postura da Palma Rotativa nunca se desfaz de verdade — o corpo mantém um fluxo de chakra pronto pra desviar qualquer Ninjutsu. +8 pontos percentuais de chance de esquivar de jutsu de Ninjutsu, e a Barreira que você aplicar dura 1 rodada a mais.",
  ),
  H.jutsu(
    "hyuuga_64_palmas",
    "Oito Trigramas: 64 Palmas",
    "🖐️",
    "B",
    "Ofensivo",
    -1,
    4,
    ["hyuuga_palma_vacuo"],
    12,
    12,
    "Sequência de 64 golpes extremamente rápidos que bloqueiam dezenas de tenketsu de uma vez: 75% de chance de selar os tenketsu do alvo por 1 rodada, e 30% de chance de Atordoar por 1 rodada. Exige o Byakugan ativo.",
  ),
  H.jutsu(
    "hyuuga_128_palmas",
    "Oito Trigramas: 128 Palmas",
    "💥",
    "A",
    "Ofensivo",
    -1,
    5,
    ["hyuuga_64_palmas"],
    19,
    19,
    "O usuário dobra a contagem das 64 Palmas sem perder o ritmo: as mãos somem no ar e cada par de golpes fecha um novo ponto de chakra antes que o adversário registre o anterior. Exige o Byakugan ativo.",
  ),
  H.pass(
    "hyuuga_apice",
    "Rede de Tenketsu",
    "🧿",
    "Ápice",
    0,
    6,
    ["hyuuga_128_palmas", "hyuuga_guarda_perpetua"],
    24,
    20,
    "Passiva: todo golpe do seu clã mira direto nos órgãos internos. Seus jutsus de clã causam mais 20% de dano e ignoram a Barreira. Contra quem estiver abaixo de 30% de vida, causam mais 25%. O Selo dos Tenketsu que aplicarem dura 1 rodada a mais.",
  ),
  H.jutsu(
    "hyuuga_leoes_gemeos",
    "Punhos dos Leões Gêmeos",
    "🦁",
    "S",
    "Ápice",
    0,
    7,
    ["hyuuga_apice"],
    30,
    28,
    "Libera uma grande quantidade de chakra pelos punhos, moldado em duas cabeças de leão. Não pode ser esquivado. Ao acertar, destroça por completo os meridianos do alvo: sela os tenketsu dele por 2 rodadas e reduz a defesa dele por 2 rodadas. Exige o Byakugan ativo.",
  ),
];

// ----------------------------------------------------------------- LEE
// Clã de Taijutsu puro: não concede jutsus próprios. A árvore compra somente
// passivas e se divide entre o refinamento do Punho Forte e o condicionamento
// físico que sustenta esse estilo de luta.
const L = makeClan("lee", "taijutsu");
const LEE: SkillNodeDef[] = [
  L.pass("lee_raiz", "Espírito da Juventude", "🔥", "Fundamento", 0, 0, [], 1, 1, "Passiva sempre ativa: +5% de dano em Taijutsu e +5% de vida máxima.", true),

  L.pass("lee_folha_furacao", "Ritmo da Folha", "🌀", "Punho Forte", -1.25, 1, ["lee_raiz"], 5, 5, "Passiva: Furacão da Folha, Vendaval da Folha e Grande Furacão da Folha causam 10% mais dano."),
  L.pass("lee_entrada_dinamica", "Entrada Demolidora", "💥", "Punho Forte", -1.25, 2, ["lee_folha_furacao"], 10, 10, "Passiva: Entrada Dinâmica, Ação Dinâmica e Vento Ascendente da Folha causam 10% mais dano."),
  L.pass("lee_pesos", "Pesos de Treino", "⛓️", "Punho Forte", -1.25, 3, ["lee_entrada_dinamica"], 16, 16, "Passiva: técnicas de Punho Forte custam 10% menos energia."),
  L.pass("lee_lotus", "Disciplina da Lótus", "🌸", "Punho Forte", -1.25, 4, ["lee_pesos"], 24, 24, "Passiva: Rajada de Leões, Lótus Frontal e Lótus Oculta causam 12% mais dano."),

  L.pass("lee_condicionamento", "Condicionamento Extremo", "❤️", "Corpo", 1.25, 1, ["lee_raiz"], 5, 5, "Passiva: +5% de vida máxima."),
  L.pass("lee_recuperacao", "Fôlego Inabalável", "💚", "Corpo", 1.25, 2, ["lee_condicionamento"], 10, 10, "Passiva: recupera 2 pontos de vida no início de cada turno."),
  L.pass("lee_passos", "Passos Acelerados", "💨", "Corpo", 1.25, 3, ["lee_recuperacao"], 16, 16, "Passiva: +1 casa na ação de movimento."),
  L.pass("lee_reflexos", "Reflexos de Treino", "⚡", "Corpo", 1.25, 4, ["lee_passos"], 24, 24, "Passiva: +3 pontos percentuais de chance de esquiva contra qualquer ataque."),
];

// -------------------------------------------------------------- AKIMICHI
// Cadeia LINEAR (sem ramos), na ordem exata do escalonamento pedido.
// Os jutsus de "crescer" (Parcial, Tamanho Múltiplo, Super Tamanho Múltiplo)
// pedem Ninjutsu — é a natureza real da técnica (manipulação de chakra pra
// mudar o próprio corpo). Os jutsus de "usar o corpo grande pra bater"
// (Tanque, Mergulho, Bofetada) pedem Taijutsu — é execução física. As duas
// últimas (Modo Borboleta e Bombardeio) não pedem atributo nenhum: o gate
// delas é o nó "Pílula Secreta" (ápice) — mapeia literalmente o "necessita
// utilizar das pílulas secretas do clã" do pedido original, sem precisar de
// um sistema de itens/consumíveis novo.
const K = makeClan("akimichi", "taijutsu");
const AKIMICHI: SkillNodeDef[] = [
  K.pass(
    "akimichi_raiz",
    "Fartura do Clã",
    "🍖",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: gerações de Akimichi acumulando calorias em força. Seus jutsus de clã causam +20% de dano e empurram o alvo 1 casa a mais.",
    true,
  ),
  K.jutsu(
    "akimichi_baika_parcial",
    "Técnica do Tamanho Múltiplo Parcial",
    "👊",
    "C",
    "Expansão",
    0,
    1,
    ["akimichi_raiz"],
    1,
    4,
    "Incha uma única parte do corpo — geralmente braço ou perna — e usa o peso extra pra golpear com muito mais força. Empurra o alvo 2 casas pra trás.",
    undefined,
    "ninjutsu",
  ),
  K.jutsu(
    "akimichi_baika",
    "Técnica do Tamanho Múltiplo",
    "🎈",
    "C",
    "Expansão",
    0,
    2,
    ["akimichi_baika_parcial"],
    6,
    7,
    "Altera livremente o próprio tamanho e consegue manter a forma por um período extenso — consome muitas calorias, mas o corpo maior absorve muito mais impacto. Ganha uma Barreira que cresce com sua vida máxima por 4 rodadas.",
    undefined,
    "ninjutsu",
  ),
  K.jutsu(
    "akimichi_tanque",
    "Tanque da Bala Humana",
    "🔴",
    "B",
    "Corpo a Corpo",
    0,
    3,
    ["akimichi_baika"],
    10,
    9,
    "Depois da Técnica do Tamanho Múltiplo, dobra os membros e usa chakra pra se impulsionar num rolo poderoso — a força de rotação é capaz de pulverizar o que estiver no caminho. Difícil de manter por muito tempo.",
  ),
  K.jutsu(
    "akimichi_super_baika",
    "Técnica do Super Tamanho Múltiplo",
    "🌕",
    "B",
    "Expansão",
    0,
    4,
    ["akimichi_tanque"],
    14,
    12,
    "A versão mais poderosa da Técnica do Tamanho Múltiplo: multiplica o corpo pra um tamanho inacreditável. Ganha uma Barreira maior, que cresce com sua vida máxima, por 4 rodadas.",
    undefined,
    "ninjutsu",
  ),
  K.pass(
    "akimichi_conversao_calorica",
    "Conversão Calórica",
    "🔥",
    "Expansão",
    1.25,
    4,
    ["akimichi_super_baika"],
    16,
    14,
    "Passiva: o corpo converte reservas de calorias em força com eficiência extrema. Seus jutsus de clã causam mais 25% de dano.",
  ),
  K.jutsu(
    "akimichi_mergulho",
    "Mergulho Gordinho",
    "💥",
    "A",
    "Corpo a Corpo",
    0,
    5,
    ["akimichi_super_baika"],
    18,
    15,
    "Depois da Técnica do Super Tamanho Múltiplo, pula de grande altura sobre uma área e a devasta com o próprio peso.",
  ),
  K.jutsu(
    "akimichi_bofetada",
    "Super Bofetada",
    "🖐️",
    "A",
    "Corpo a Corpo",
    0,
    6,
    ["akimichi_mergulho"],
    21,
    18,
    "Depois da Técnica do Super Tamanho Múltiplo, desfere um tapa mortal com as duas mãos: a concentração de chakra ativa os músculos e aumenta ainda mais a massa do golpe. Não pode ser esquivada.",
  ),
  K.jutsu(
    "akimichi_modo_borboleta",
    "Modo Borboleta",
    "🦋",
    "A",
    "Ápice",
    0,
    7,
    ["akimichi_bofetada"],
    28,
    21,
    "Converte calorias em chakra puro: fazem brotar borboletas de chakra nas costas, multiplicando a força bruta do usuário. Limpa Queimadura, Veneno, Sangramento e Lentidão, e ganha uma Barreira que cresce com sua vida máxima por 2 rodadas.",
    undefined,
    "ninjutsu",
  ),
  K.jutsu(
    "akimichi_bombardeio",
    "Bombardeio da Borboleta",
    "💢",
    "S",
    "Ápice",
    0,
    8,
    ["akimichi_modo_borboleta"],
    32,
    25,
    "Depois do Modo Borboleta, concentra todo o poder acumulado num único golpe de taijutsu devastador. Ignora Bloqueio e Aparo.",
  ),
];

// -------------------------------------------------------------- ABURAME
// Tronco central (Colônia -> Clones de Inseto -> Casulo) e' onde a raiz do
// clã mora — kikaichu genericos, nao venenosos. Casulo e' o ponto de
// ramificacao: dali em diante o clã se divide em dois ramos, exatamente
// como pedido ("ramificação diferente para as habilidades com insetos
// venenosos"):
//   Kikaichu  (col -1): Esfera -> Parede -> Mordida — controle/dreno/defesa,
//     os insetos "normais" do clã (canonicamente os do proprio Shino).
//   Rinkaichu (col +1): Nuvem de Veneno -> Jarro de Veneno — a linhagem
//     venenosa (canonicamente os insetos de Torune), area e status.
// O apice converge os dois ramos (requires os dois finalizadores) e nao e'
// um jutsu novo — so uma passiva, igual o padrao dos outros clas.
const AB = makeClan("aburame", "ninjutsu");
const ABURAME: SkillNodeDef[] = [
  AB.pass(
    "aburame_raiz",
    "Colônia Ancestral",
    "🪲",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: gerações inteiras hospedando kikaichū fazem do próprio corpo uma colmeia viva. Seus jutsus de clã custam 10% menos chakra e têm +15 pontos percentuais de chance de fazer o alvo perder 10% de chakra por turno.",
    true,
  ),
  AB.jutsu(
    "aburame_clone_inseto",
    "Técnica dos Clones de Inseto",
    "🪰",
    "C",
    "Enxame",
    0,
    1,
    ["aburame_raiz"],
    1,
    4,
    "Um clone formado por milhares de kikaichū assume o próprio lugar no instante do golpe. Como reação, dá +22% de chance de esquiva contra o ataque: se for atingido mesmo assim, o clone se desfaz num enxame que confunde o atacante, abrindo espaço pra fugir ou contra-atacar.",
  ),
  AB.jutsu(
    "aburame_casulo",
    "Casulo de Insetos",
    "🧵",
    "C",
    "Enxame",
    0,
    2,
    ["aburame_clone_inseto"],
    6,
    7,
    "Um casulo espesso, formado por seda e insetos, se fecha completamente ao redor do usuário.",
  ),
  AB.jutsu(
    "aburame_esfera",
    "Esfera de Insetos",
    "🌀",
    "B",
    "Kikaichū",
    -1,
    3,
    ["aburame_casulo"],
    10,
    9,
    "Os kikaichū cercam completamente o alvo, formando uma esfera viva: ele fica preso ao chão e não consegue fugir por 2 rodadas, com 85% de chance de perder 10% de chakra por turno por 3 rodadas.",
  ),
  AB.jutsu(
    "aburame_nuvem_veneno",
    "Técnica da Nuvem de Veneno",
    "🌫️",
    "B",
    "Rinkaichū",
    1,
    3,
    ["aburame_casulo"],
    10,
    9,
    "Explode uma esfera de rinkaichū numa cortina de veneno bem na frente do usuário: se dissipa rápido se não acertar ninguém, mas quem for tocado ou respirar a nuvem tem 70% de chance de ficar com Veneno por 3 rodadas.",
  ),
  AB.jutsu(
    "aburame_parede",
    "Parede de Insetos",
    "🧱",
    "B",
    "Kikaichū",
    -1,
    4,
    ["aburame_esfera"],
    13,
    11,
    "Um enxame denso forma uma parede viva de insetos, resistente o bastante pra aguentar entulho caindo ou fogo: dá uma Barreira que cresce com a vida máxima de quem recebe (você ou um aliado próximo) por 3 rodadas. Não segura gases, como uma cortina de veneno.",
  ),
  AB.jutsu(
    "aburame_jarro_veneno",
    "Técnica do Jarro de Veneno",
    "🏺",
    "A",
    "Rinkaichū",
    1,
    4,
    ["aburame_nuvem_veneno"],
    18,
    14,
    "O usuário concentra uma quantidade enorme de rinkaichū numa área fechada, até o ar dentro dela ficar escuro de inseto. Quem estiver lá dentro fica cercado por todos os lados enquanto o enxame trabalha.",
  ),
  AB.jutsu(
    "aburame_mordida",
    "Inseto Parasita Gigante — Mordida de Inseto",
    "🩸",
    "A",
    "Kikaichū",
    -1,
    5,
    ["aburame_parede"],
    21,
    16,
    "O usuário deposita um punhado de kidaichū na pele do alvo. Os insetos se enterram na hora e começam a devorar carne e chakra por dentro, engordando a cada mordida enquanto o hospedeiro é corroído de dentro para fora.",
  ),
  AB.pass(
    "aburame_apice",
    "Colmeia Completa",
    "🕸️",
    "Ápice",
    0,
    6,
    ["aburame_mordida", "aburame_jarro_veneno"],
    25,
    19,
    "Passiva: domina os dois ramos do clã ao mesmo tempo. O Dreno de Chakra que você aplica dura 1 rodada a mais, e seus jutsus com rinkaichū têm +15 pontos percentuais de chance de aplicar Veneno.",
  ),
];

// -------------------------------------------------------------- INUZUKA
// Cão Ninja vem de fábrica com o clã (concedido automaticamente por setClan,
// ver ClanDef.autoGrantedNodeIds em clans/index.ts e o hook em
// character-service.ts) — o Inuzuka NASCE com o cão, não desbloqueia ele
// upando. Por isso o nó fica ISOLADO na árvore: `requires: []`, e nada mais
// exige ele como pré-requisito (Quatro Patas/Clone da Besta agora saem
// direto da raiz). Ele continua aparecendo na árvore só pra referência —
// já nasce marcado como possuído.
// Metade das técnicas seguintes SÓ funciona com o cão vivo em campo
// (requiresPet na Ability, ver clans/index.ts) — se ele cair em combate,
// essas técnicas ficam bloqueadas até o fim da luta (ele volta saudável na
// próxima, porque é uma invocação nova a cada sessão de combate).
// Nós "upando Ninjutsu" do pedido original NÃO levam reqAttribute — o
// reqNinjutsu already lê o mesmo atributo, então duplicar o gate só faria
// "Ninjutsu" aparecer duas vezes no modal (mesmo problema já corrigido no
// Aburame). Só "upando Taijutsu" leva reqAttribute de verdade, porque é um
// atributo DIFERENTE do que o reqNinjutsu confere.
//
// Ramificação (pedido explícito: "não ficar tudo reto"): saindo da raiz, a
// árvore se abre em dois — Quatro Patas -> Sobre Presa (coluna -1, o
// usuário sozinho) e Clone da Besta Humana (coluna +1, já precisa do cão)
// — e os dois ramos CONVERGEM em Presa Sobre Presa, que exige os dois
// (`requires` com 2 ids). Isso não é só estética: bate com a própria
// descrição pedida ("usuário E seu cão utilizam a técnica juntos"), então a
// árvore passa a exigir de verdade que o jogador tenha as duas metades do
// combo antes de "juntá-las". Da fusão em diante (Lobo de Duas Cabeças ->
// Ápice -> Cauda Perseguidora) volta a ser tronco reto — não sobrou nome
// curto o bastante pra abrir outro ramo sem forçar a barra.
const IZ = makeClan("inuzuka", "taijutsu");
const INUZUKA: SkillNodeDef[] = [
  IZ.pass(
    "inuzuka_raiz",
    "Vínculo de Matilha",
    "🐾",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: o vínculo com o cão desde filhote apura os sentidos do usuário. Seus jutsus de clã causam +15% de dano e custam 10% menos recurso, e a invocação do seu cão ninja tem +30% de vida.",
    true,
  ),
  IZ.jutsu(
    "inuzuka_cao_ninja",
    "Cão Ninja",
    "🐕",
    "D",
    "Matilha",
    1,
    0,
    [],
    1,
    1,
    "Todo Inuzuka nasce com seu cão ninja: um companheiro treinado desde filhote — já vem desbloqueado, sem gastar ponto nenhum. Ele entra no mapa com 1/3 da sua vida máxima e ataca sozinho todo turno, como uma invocação comum. Só pode ser chamado uma vez por combate: se ele cair em combate, as técnicas que dependem dele ficam bloqueadas até o fim da luta — mas ele volta saudável na próxima.",
    undefined,
    "ninjutsu",
  ),
  IZ.jutsu(
    "inuzuka_quatro_patas",
    "Técnica das Quatro Patas",
    "💨",
    "C",
    "Instinto",
    -1,
    1,
    ["inuzuka_raiz"],
    5,
    5,
    "O usuário cai sobre as quatro patas numa postura animal: as unhas crescem e afinam, as pupilas se fecham numa fenda e o faro fica aguçado o bastante para rastrear o inimigo pelo cheiro.",
  ),
  IZ.jutsu(
    "inuzuka_clone_besta",
    "Clone da Besta Humana",
    "👥",
    "C",
    "Matilha",
    1,
    1,
    ["inuzuka_raiz"],
    5,
    5,
    "O cão ninja assume uma cópia física perfeita do usuário, e os dois avançam com movimentos espelhados.",
    undefined,
    "ninjutsu",
  ),
  IZ.jutsu(
    "inuzuka_sobre_presa",
    "Sobre Presa",
    "🌀",
    "B",
    "Instinto",
    -1,
    2,
    ["inuzuka_quatro_patas"],
    9,
    8,
    "Gira em altíssima velocidade, virando uma espécie de broca humana: avança em linha reta perfurando tudo no caminho e empurra o alvo 1 casa.",
  ),
  IZ.jutsu(
    "inuzuka_presa_sobre_presa",
    "Presa Sobre Presa",
    "🌪️",
    "B",
    "Presa",
    0,
    3,
    ["inuzuka_sobre_presa", "inuzuka_clone_besta"],
    13,
    11,
    "Usuário e cão giram lado a lado como duas brocas que se cruzam em alta velocidade.",
  ),
  IZ.jutsu(
    "inuzuka_lobo_duas_cabecas",
    "Transformação Combinada da Besta Humana: Lobo de Duas Cabeças",
    "🐺",
    "A",
    "Fusão",
    0,
    4,
    ["inuzuka_presa_sobre_presa"],
    17,
    14,
    "Usuário e cão se fundem, formando um enorme lobo branco de duas cabeças com garras e presas salientes.",
    undefined,
    "ninjutsu",
  ),
  IZ.jutsu(
    "inuzuka_presa_de_lobo",
    "Presa de Lobo Sobre Presa",
    "🦷",
    "A",
    "Fusão",
    0,
    5,
    ["inuzuka_lobo_duas_cabecas"],
    20,
    17,
    "O lobo de duas cabeças concentra o corpo numa enorme broca giratória e dispara em linha reta.",
  ),
  IZ.jutsu(
    "inuzuka_lobo_tres_cabecas",
    "Transformação Misturada da Besta Humana — Lobo de Três Cabeças",
    "🔱",
    "A",
    "Fusão",
    0,
    6,
    ["inuzuka_presa_de_lobo"],
    24,
    20,
    "O usuário, seu clone e o cão ninja se fundem num lobo branco gigantesco de três cabeças.",
    undefined,
    "ninjutsu",
  ),
  IZ.pass(
    "inuzuka_apice",
    "Instinto de Caçador",
    "👑",
    "Ápice",
    0,
    7,
    ["inuzuka_lobo_tres_cabecas"],
    27,
    22,
    "Passiva: a matilha aprende a atacar em perfeita sincronia. Seus jutsus de clã causam +20% de dano, causam mais 30% em quem estiver abaixo de 30% de vida e têm +15 pontos percentuais de chance de Atordoar.",
  ),
  IZ.jutsu(
    "inuzuka_cauda_perseguidora",
    "Cauda Perseguidora de Presa da Presa Giratória de Presa",
    "🔄",
    "S",
    "Ápice",
    0,
    8,
    ["inuzuka_apice"],
    30,
    25,
    "O lobo de três cabeças se enrola numa esfera e avança girando com violência pelo campo.",
  ),
];

// -------------------------------------------------------------- UZUMAKI
// So 2 jutsus foram pedidos (sem escalonamento explícito desta vez), então
// a árvore é curta: raiz -> Regeneração de Vigor -> passiva do meio ->
// Correntes Adamantinas -> ápice. 3 passivas (não as 2 de sempre) porque o
// pedido foi "vitalidade e chakra, mais de uma pra evolução" — cada uma
// soma um pouco mais de vida máxima/regeneração em cima da anterior (ver
// maxHpBonus/hpRegenPerTurn em clan-trees/passives.ts). Tronco reto: com só
// 5 nós não tem massa crítica pra abrir ramo sem forçar a barra.
const UZ = makeClan("uzumaki", "fuinjutsu");
const UZUMAKI: SkillNodeDef[] = [
  UZ.pass(
    "uzumaki_raiz",
    "Vitalidade do Redemoinho",
    "🌀",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: a vitalidade lendária do clã Uzumaki começa aqui. +8% de vida máxima, e seus jutsus de clã custam 8% menos recurso.",
    true,
  ),
  UZ.jutsu(
    "uzumaki_regeneracao",
    "Regeneração de Vigor",
    "❤️‍🩹",
    "C",
    "Vitalidade",
    0,
    1,
    ["uzumaki_raiz"],
    4,
    4,
    "Deixa um aliado morder sua pele e sugar um pouco do próprio chakra Uzumaki: em troca, fecha os ferimentos dele. Cura 30 de vida e devolve 15% de chakra — funciona até em ferimentos graves. Só em aliado, não cura o próprio usuário.",
    undefined,
    "iryoNinjutsu",
  ),
  UZ.pass(
    "uzumaki_reservas",
    "Reservas do Redemoinho",
    "💠",
    "Vitalidade",
    0,
    2,
    ["uzumaki_regeneracao"],
    10,
    9,
    "Passiva sempre ativa: o corpo aprende a se regenerar sozinho, e o chakra vasto do clã começa a se refletir na prática. Mais 5% de vida máxima, cura 5 de vida e restaura 6% de chakra no início de cada turno seu.",
  ),
  UZ.jutsu(
    "uzumaki_correntes",
    "Correntes de Selamento Adamantinas",
    "⛓️",
    "A",
    "Selamento",
    0,
    3,
    ["uzumaki_reservas"],
    16,
    14,
    "Correntes de chakra douradas brotam do corpo do usuário e se espalham pela área: prendem quem estiver no caminho por 3 rodadas, com 85% de chance de sugar 10% de chakra por turno pelo mesmo período, e ninguém consegue fugir enquanto durar. Não pode ser esquivado — as mesmas correntes que, na lenda do clã, já continham até Bestas com Cauda.",
  ),
  UZ.pass(
    "uzumaki_apice",
    "Selo do Redemoinho",
    "🔴",
    "Ápice",
    0,
    4,
    ["uzumaki_correntes"],
    22,
    18,
    "Passiva: o selo do clã amadurece por completo. Mais 7% de vida máxima, cura mais 7 de vida e restaura mais 4% de chakra no início do seu turno, além de +15 pontos percentuais de chance nos efeitos de prisão e dreno das suas Correntes.",
  ),
];

// -------------------------------------------------------------- HATAKE
// Só 2 jutsu foram pedidos ("Lâmina da Luz Branca" e "Invocação: Cão
// Ninja"), mas o pedido também foi "crie passivas e skills PARA OS CÃES"
// (plural) — por isso o Cerco da Matilha (skill nova) e a passiva do meio
// existem: dão corpo ao lado "matilha" do clã em vez de deixar a invocação
// sozinha. Ramificação: tronco (raiz -> Cães Ninja) abre em Matilha
// (coluna -1: Cerco -> Elo com a Matilha) e Lâmina (coluna +1: só a
// Lâmina, tier alto), convergindo no ápice — mesmo padrão do Aburame/
// Inuzuka. O ápice é o pedido explícito de dano de Kenjutsu.
const HK = makeClan("hatake", "ninjutsu");
const HATAKE: SkillNodeDef[] = [
  HK.pass(
    "hatake_raiz",
    "Vínculo com a Matilha",
    "🐾",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: o gênio versátil do clã Hatake começa pelo vínculo com os cães. Seus jutsus de clã custam 10% menos recurso, e a matilha invocada tem +25% de vida.",
    true,
  ),
  HK.jutsu(
    "hatake_caes_ninja",
    "Técnica de Invocação: Cão Ninja",
    "🐕",
    "D",
    "Matilha",
    0,
    1,
    ["hatake_raiz"],
    1,
    4,
    "Invoca três cães ninja da matilha: eles entram no mapa e atacam sozinhos todo turno, como invocações — servem tanto pra rastrear quanto pra imobilizar o alvo em combate. Só pode ser chamado uma vez por combate; se todos caírem, as técnicas que dependem da matilha ficam bloqueadas até o fim da luta, mas eles voltam saudáveis na próxima.",
  ),
  HK.jutsu(
    "hatake_cerco_matilha",
    "Cerco da Matilha",
    "🐺",
    "C",
    "Matilha",
    -1,
    2,
    ["hatake_caes_ninja"],
    9,
    8,
    "A matilha salta de vários ângulos ao mesmo tempo, derrubando e cercando o alvo com presas e patas.",
  ),
  HK.jutsu(
    "hatake_lamina",
    "Lâmina da Luz Branca",
    "⚔️",
    "A",
    "Lâmina",
    1,
    2,
    ["hatake_caes_ninja"],
    11,
    11,
    "Usando a Lâmina de Chakra de Luz Branca, desfere um corte diagonal descendente que deixa um rastro de chakra branco: um golpe rápido demais pra esquivar, que abre um corte profundo.",
    undefined,
    "kenjutsu",
  ),
  HK.pass(
    "hatake_elo_matilha",
    "Elo com a Matilha",
    "💠",
    "Matilha",
    -1,
    3,
    ["hatake_cerco_matilha"],
    13,
    10,
    "Passiva sempre ativa: anos de parceria com a matilha refinam o comando. +15 pontos percentuais de chance de imobilizar e de Atordoar nos jutsus da matilha.",
  ),
  HK.pass(
    "hatake_apice",
    "Corte Perfeito",
    "🌕",
    "Ápice",
    0,
    4,
    ["hatake_elo_matilha", "hatake_lamina"],
    19,
    15,
    "Passiva: o domínio da Lâmina de Luz Branca chega ao ápice. Seus golpes de Kenjutsu causam +15% de dano, e mais 25% em quem estiver abaixo de 30% de vida.",
    false,
    undefined,
    "kenjutsu",
  ),
];

// ------------------------------------------------------------ HOSHIGAKI
// Primeiro clã de Kirigakure. Tronco central com os 5 jutsu de tubarão
// pedidos (raiz -> Bomba -> Cinco Tubarões -> Fome Voraz -> Esfera
// Selvagem -> Mil Tubarões -> Grande Bomba), igual antes. A diferença: as
// passivas de Kenjutsu agora ficam numa RAMIFICAÇÃO própria (coluna +1),
// que sai de Cinco Tubarões e termina em beco sem saída — não gate nem é
// gateada pelo resto do tronco, porque o clã NÃO nasce com espada (não há
// jutsu de clã que escale por kenjutsu aqui de propósito; a passiva fica
// "adormecida" até o personagem pegar uma arma por outro caminho). Eram
// UMA passiva só (+30% dano, ignora Barreira, +25% execução); virou DUAS
// mais fracas (Fio Afiado: só o dano; Golpe Certeiro: só a perfuração) pra
// não ficar quebrado quando somadas, e pra custar 2 nós em vez de 1.
// Nós "upando Ninjutsu" NÃO levam reqAttribute — o reqNinjutsu já lê o
// mesmo atributo (mesma correção do Aburame/Inuzuka).
const HG = makeClan("hoshigaki", "ninjutsu");
const HOSHIGAKI: SkillNodeDef[] = [
  HG.pass(
    "hoshigaki_raiz",
    "Sangue de Tubarão",
    "🩸",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: o sangue predador do clã Hoshigaki potencializa cada golpe. Seus jutsus de clã causam +10% de dano e custam 10% menos recurso.",
    true,
  ),
  HG.jutsu(
    "hoshigaki_bomba_tubarao",
    "Técnica da Bomba do Tubarão de Água",
    "💦",
    "C",
    "Tubarão",
    0,
    1,
    ["hoshigaki_raiz"],
    6,
    5,
    "Concentra um grande volume de água e a dispara com um empurrão de mão: um jato compacto em forma de tubarão que avança em linha reta e empurra o alvo 2 casas.",
  ),
  HG.jutsu(
    "hoshigaki_cinco_tubaroes",
    "Técnica dos Cinco Tubarões Famintos",
    "🦈",
    "B",
    "Tubarão",
    0,
    2,
    ["hoshigaki_bomba_tubarao"],
    9,
    8,
    "Com a mão sobre uma superfície de água, os cinco dedos emitem chakra que ganha forma de cinco tubarões famintos: avançam em leque e mordem tudo pela frente. 60% de chance de Sangramento por 2 rodadas.",
  ),
  HG.pass(
    "hoshigaki_fome_voraz",
    "Fome Voraz",
    "🦷",
    "Tubarão",
    0,
    3,
    ["hoshigaki_cinco_tubaroes"],
    12,
    10,
    "Passiva sempre ativa: os tubarões do clã nunca param de caçar. Seus jutsus de clã causam mais 20% de dano, têm +15 pontos percentuais de chance de causar Sangramento, e os que atingem área ganham +1 casa de alcance.",
  ),
  HG.pass(
    "hoshigaki_fio_afiado",
    "Fio Afiado",
    "🗡️",
    "Kenjutsu",
    1,
    3,
    ["hoshigaki_cinco_tubaroes"],
    12,
    10,
    "Passiva sempre ativa: o clã afia os reflexos pra qualquer lâmina que empunhar, não só a Samehada. Seus golpes de Kenjutsu causam +15% de dano.",
    false,
    undefined,
    "kenjutsu",
  ),
  HG.jutsu(
    "hoshigaki_esfera_selvagem",
    "Técnica da Esfera Selvagem do Tubarão de Água",
    "🌊",
    "B",
    "Tubarão",
    0,
    4,
    ["hoshigaki_fome_voraz"],
    15,
    12,
    "Cria uma esfera de água ao seu redor: quem tentar se aproximar entra na área de ataque dos tubarões que nadam dentro dela. Dano em área e 70% de chance de deixar mais lento por 2 rodadas quem for atingido.",
  ),
  HG.pass(
    "hoshigaki_golpe_certeiro",
    "Golpe Certeiro",
    "🎯",
    "Kenjutsu",
    1,
    4,
    ["hoshigaki_fio_afiado"],
    15,
    12,
    "Passiva sempre ativa: a mira do clã encontra a brecha certa na guarda do alvo. Seus golpes de Kenjutsu ignoram a Barreira. Contra quem estiver abaixo de 30% de vida, causam mais 15%.",
    false,
    undefined,
    "kenjutsu",
  ),
  HG.jutsu(
    "hoshigaki_mil_tubaroes",
    "Técnica dos Mil Tubarões de Alimentação",
    "⛈️",
    "A",
    "Tubarão",
    0,
    5,
    ["hoshigaki_esfera_selvagem"],
    19,
    16,
    "Versão monumental do Cinco Tubarões Famintos: mil tubarões brotam de uma vasta fonte de água e caem como chuva sobre a área. 70% de chance de Sangramento por 3 rodadas.",
  ),
  HG.jutsu(
    "hoshigaki_grande_bomba",
    "Técnica da Grande Bomba do Tubarão de Água",
    "🐋",
    "S",
    "Tubarão",
    0,
    6,
    ["hoshigaki_mil_tubaroes"],
    24,
    20,
    "Cria um tubarão gigantesco fora da água e o arremessa com as duas mãos: ignora Bloqueio e Aparo, e absorve o chakra da técnica do adversário, crescendo ainda mais no impacto — sugando 10% de chakra por turno por 3 rodadas.",
  ),
];

// ---------------------------------------------------------------- HOZUKI
// Segundo clã de Kirigakure. Mesmo esquema do Hoshigaki: tronco com os 4
// jutsu pedidos (raiz -> Hidratação -> Grande Braço de Água -> fork),
// ramificação de Kenjutsu isolada (coluna +1, sem gate cruzado, sem jutsu
// de clã que escale por kenjutsu de propósito — Suigetsu carrega a
// Kubikiribōchō, mas o clã não nasce com espada), tronco de água volta pro
// centro (coluna 0) pro finalizador. Sem escalonamento explícito desta
// vez, então a ordem/tier é minha melhor leitura das 4 descrições: Hidratação
// (defesa reativa, cedo) -> Grande Braço de Água (buff) -> Revólver de
// Água (ataque à distância) -> Tate Eboshi (finalizador, onda gigante).
const HZ = makeClan("hozuki", "ninjutsu");
const HOZUKI: SkillNodeDef[] = [
  HZ.pass(
    "hozuki_raiz",
    "Corpo Líquido",
    "💧",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: a hidrificação do clã nunca desliga de vez. Seus jutsus de clã causam +5% de dano, custam 10% menos recurso, e você regenera 4 de vida no início de cada turno seu.",
    true,
  ),
  HZ.jutsu(
    "hozuki_hidratacao",
    "Hidratação",
    "🫧",
    "C",
    "Água",
    0,
    1,
    ["hozuki_raiz"],
    4,
    4,
    "Ao ser atingido por um golpe físico, a parte do corpo alcançada vira líquido na hora: o ataque atravessa sem te machucar. Como reação, dá +30% de chance de esquiva contra qualquer ataque.",
  ),
  HZ.jutsu(
    "hozuki_braco_agua",
    "Grande Braço de Água",
    "💪",
    "C",
    "Água",
    0,
    2,
    ["hozuki_hidratacao"],
    9,
    8,
    "O braço do usuário absorve uma grande massa de água e cresce de forma desproporcional, coberto por músculos líquidos.",
  ),
  HZ.jutsu(
    "hozuki_revolver_agua",
    "Revólver de Água",
    "🔫",
    "B",
    "Água",
    -1,
    3,
    ["hozuki_braco_agua"],
    11,
    11,
    "Imita uma arma de fogo com a mão e comprime água no dedo indicador: dispara uma bala de água com força e velocidade de tiro de verdade. Não pode ser esquivado, e 70% de chance de deixar o alvo Encharcado por 2 rodadas.",
  ),
  HZ.pass(
    "hozuki_lamina_liquida",
    "Lâmina Líquida",
    "🗡️",
    "Kenjutsu",
    1,
    3,
    ["hozuki_braco_agua"],
    13,
    11,
    "Passiva sempre ativa: a água nas veias infunde a lâmina, mantendo o fio sempre afiado. Seus golpes de Kenjutsu causam +15% de dano.",
    false,
    undefined,
    "kenjutsu",
  ),
  HZ.pass(
    "hozuki_fluidez",
    "Fluidez",
    "🩵",
    "Água",
    -1,
    4,
    ["hozuki_revolver_agua"],
    17,
    14,
    "Passiva sempre ativa: a água do corpo se conecta com a água do ambiente. Seus jutsus de clã causam mais 10% de dano, têm +20 pontos percentuais de chance de deixar o alvo Encharcado, e os que acertam à distância ganham +1 casa de alcance.",
  ),
  HZ.pass(
    "hozuki_corte_sem_peso",
    "Corte Sem Peso",
    "🪶",
    "Kenjutsu",
    1,
    4,
    ["hozuki_lamina_liquida"],
    17,
    14,
    "Passiva sempre ativa: o corpo líquido guia a lâmina pelos pontos fracos da guarda. Seus golpes de Kenjutsu ignoram a Barreira. Contra quem estiver abaixo de 30% de vida, causam mais 15%.",
    false,
    undefined,
    "kenjutsu",
  ),
  HZ.jutsu(
    "hozuki_tate_eboshi",
    "Tate Eboshi",
    "🌊",
    "S",
    "Água",
    0,
    5,
    ["hozuki_fluidez"],
    19,
    19,
    "Forma uma onda gigante em formato de peixe demoníaco: capaz de lutar contra adversários muito maiores, arrasando a área. Ignora Bloqueio e Aparo, empurra 3 casas quem for atingido e tem 75% de chance de deixar mais lento por 2 rodadas.",
  ),
];

// ---------------------------------------------------------------- KAGUYA
// Terceiro clã de Kirigakure. Tronco (raiz -> Dez Dedos Perfuradores ->
// Dança do Salgueiro) abre em dois ramos a partir do Salgueiro: Ossos
// (coluna -1: Dança do Lariço -> Armadura de Espinhos -> Impulso da Flor,
// 3 nós) e Kenjutsu (coluna +1: Dança das Camélias — a espada viva de osso
// — -> Fio de Osso, 2 nós), convergindo no ápice antes da Dança da Flor.
// Os 5 jutsu de osso pedem Taijutsu (não Ninjutsu) — reqAttribute de verdade
// aqui, porque e' um atributo DIFERENTE do que o reqNinjutsu (orçamento
// compartilhado) confere. A Dança das Camélias e' a exceção: já que ELA
// CRIA a espada, pede Kenjutsu pra liberar, não Taijutsu (mesmo padrão da
// Lâmina da Luz Branca do Hatake) — pedido original dizia Taijutsu pra
// todos, mas isso foi antes do atributo Kenjutsu existir/da Camélias virar
// uma técnica de Kenjutsu de verdade.
const KG = makeClan("kaguya", "taijutsu");
const KAGUYA: SkillNodeDef[] = [
  KG.pass(
    "kaguya_raiz",
    "Esqueleto Vivo",
    "🦴",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: o esqueleto do clã nunca para de se regenerar — cada osso quebrado volta mais forte que antes. Seus jutsus de clã causam +10% de dano, custam 10% menos recurso, e você regenera 5 de vida no início de cada turno seu.",
    true,
  ),
  KG.jutsu(
    "kaguya_dez_dedos",
    "Técnica dos Dez Dedos Perfuradores",
    "👉",
    "C",
    "Ossos",
    0,
    1,
    ["kaguya_raiz"],
    4,
    4,
    "Abre as pontas dos dedos, expondo os ossos endurecidos: atira uma rajada de balas de osso à distância, movimentando as mãos. 55% de chance de causar Sangramento por 2 rodadas.",
  ),
  KG.jutsu(
    "kaguya_salgueiro",
    "Técnica da Dança do Salgueiro",
    "🌿",
    "B",
    "Ossos",
    0,
    2,
    ["kaguya_dez_dedos"],
    9,
    8,
    "Ossos saem das palmas, cotovelos, joelhos e ombros ao mesmo tempo, golpeando o alvo de vários ângulos de uma vez: rápido demais e de direções demais pra esquivar. Não pode ser esquivado.",
  ),
  KG.jutsu(
    "kaguya_larico",
    "Técnica da Dança do Lariço",
    "🌵",
    "B",
    "Ossos",
    -1,
    3,
    ["kaguya_salgueiro"],
    13,
    11,
    "Inúmeros ossos brotam de dentro do próprio corpo de uma vez, formando espetos afiados que dilaceram qualquer um por perto. 75% de chance de causar Sangramento por 3 rodadas em quem estiver na área.",
  ),
  KG.jutsu(
    "kaguya_camelias",
    "Técnica da Dança das Camélias",
    "⚔️",
    "B",
    "Kenjutsu",
    1,
    3,
    ["kaguya_salgueiro"],
    13,
    11,
    "Modifica o osso do próprio braço numa espada viva e desfere uma sequência de estocadas furiosas, rápidas demais pra contar. 70% de chance de causar Sangramento por 3 rodadas.",
    undefined,
    "kenjutsu",
  ),
  KG.pass(
    "kaguya_armadura_espinhos",
    "Armadura de Espinhos",
    "🌹",
    "Ossos",
    -1,
    4,
    ["kaguya_larico"],
    16,
    13,
    "Passiva sempre ativa: espinhos de osso furam a pele por baixo, prontos pra qualquer contato. Quem acertar você com um golpe físico corpo a corpo sofre 10 de dano de volta.",
  ),
  KG.pass(
    "kaguya_fio_osso",
    "Fio de Osso",
    "🩶",
    "Kenjutsu",
    1,
    4,
    ["kaguya_camelias"],
    16,
    13,
    "Passiva sempre ativa: a espada viva de osso nunca cega. Seus golpes de Kenjutsu causam mais 25% de dano em quem estiver abaixo de 30% de vida.",
    false,
    undefined,
    "kenjutsu",
  ),
  KG.jutsu(
    "kaguya_impulso_flor",
    "Técnica do Impulso da Flor",
    "🏃",
    "A",
    "Ossos",
    -1,
    5,
    ["kaguya_armadura_espinhos"],
    20,
    16,
    "Corre em disparada até o alvo e golpeia com os ossos das próprias costas, empurrando-o 2 casas com o impacto.",
  ),
  KG.pass(
    "kaguya_apice",
    "Ossos Perfeitos",
    "💠",
    "Ápice",
    0,
    6,
    ["kaguya_impulso_flor", "kaguya_fio_osso"],
    24,
    19,
    "Passiva: séculos de mutação óssea perfeita. Seus jutsus de clã causam mais 15% de dano, têm +15 pontos percentuais de chance de causar Sangramento, e os que acertam à distância ganham +1 casa de alcance.",
  ),
  KG.jutsu(
    "kaguya_danca_flor",
    "Técnica da Dança da Flor",
    "🥀",
    "S",
    "Ápice",
    0,
    7,
    ["kaguya_apice"],
    29,
    23,
    "Concentra todo o poder do próprio corpo, projetando os ossos comprimidos em lanças rígidas ao extremo: uma arma de osso incrivelmente destrutiva. Ignora Bloqueio e Aparo. 85% de chance de causar Sangramento por 3 rodadas.",
  ),
];

// -------------------------------------------------------------------- YUKI
// Reconstruido do zero — pedido explicito do usuario: o Hyoton (Gelo) virou
// kekkei genkai de verdade (ver secao GELO em element-trees/index.ts, ids
// gelo_* migrados dos antigos yuki_*), e o clã Yuki passa a ser puramente de
// suporte, mesmo padrao do Onoki/Bakurei — sem jutsu proprio. Dual
// crossElement (Água + Gelo, 1.1x cada) igual o Onoki, com DOIS ramos
// simetricos de abilityIds (mesmo padrao do Yotsuki/Senju): Água mira
// Prisão de Água + Dragão de Água; Gelo mira Espelho Demoníaco + Chuva de
// Agulhas Geladas. Pedido explicito do usuario: +2 passivas de Gelo,
// -1 de Água pra compensar (Ondas Furiosas saiu, Prisão passa a sair
// direto de Domínio Suiton).
const YK = makeClan("yuki", "ninjutsu");
const YUKI: SkillNodeDef[] = [
  YK.pass("yuki_raiz", "Controle de Chakra Yuki", "❄️", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: o controle de chakra refinado do clã. Seus Ninjutsus gastam 8% menos chakra.", true),
  YK.pass("yuki_agua", "Domínio Suiton", "💧", "Água", -1, 1, ["yuki_raiz"], 10, 8, "Passiva: seus jutsus de Água causam +10% de dano."),
  YK.pass("yuki_hyoton", "Domínio Hyoton", "🧊", "Gelo", 1, 1, ["yuki_raiz"], 10, 8, "Passiva: seus jutsus de Gelo causam +10% de dano."),
  YK.pass("yuki_prisao", "Prisão Persistente", "🫧", "Água", -1, 2, ["yuki_agua"], 14, 10, "Passiva: a Prisão de Água custa 10% menos chakra e o Encharcado que ela aplica dura 1 rodada a mais."),
  YK.pass("yuki_dragao", "Dragão Ampliado", "🐉", "Água", -1, 3, ["yuki_prisao"], 20, 14, "Passiva: o Dragão de Água causa +15% de dano e alcança 1 casa a mais."),
  YK.pass("yuki_espelho_amplificado", "Espelho Amplificado", "🪞", "Gelo", 1, 2, ["yuki_hyoton"], 14, 10, "Passiva: o Espelho Demoníaco de Gelo Fino causa +15% de dano e tem +10 pontos percentuais de chance de deixar a guarda baixa (Defesa Reduzida)."),
  YK.pass("yuki_chuva_amplificada", "Nevasca Amplificada", "🌨️", "Gelo", 1, 3, ["yuki_espelho_amplificado"], 20, 14, "Passiva: a Chuva de Agulhas Geladas causa +15% de dano e a Lentidão que ela aplica dura 1 rodada a mais."),
];

// ----------------------------------------------------------- CHINOIKE
// Primeiro clã de Kumogakure. Tronco curto (raiz -> Chuva de Granizo) que
// se ramifica em dois caminhos: Doujutsu -> Genjutsu Ketsuryuugan (col -1,
// o olho de sangue que faz a ilusão doer de verdade) e Bolhas de Água
// (col +1, suiton explosivo, ramo mais curto — mesmo padrão assimétrico do
// Kaguya). O ápice converge os dois antes da Ascensão do Dragão de Sangue.
// Doujutsu Ketsuryuugan pede Dōjutsu (não Genjutsu); só a Genjutsu
// Ketsuryuugan em si pede Genjutsu — os dois gates do pedido do usuário,
// em sequência, iguais o Byakugan/Punho Suave do Hyuuga.
const CI = makeClan("chinoike", "ninjutsu");
const CHINOIKE: SkillNodeDef[] = [
  CI.pass(
    "chinoike_raiz",
    "Sangue Vivo",
    "🩸",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: o sangue do clã se regenera rápido demais pra qualquer ferimento pequeno atrapalhar. Seus jutsus de clã causam +10% de dano, custam 10% menos recurso, e você regenera 4 de vida no início de cada turno seu.",
    true,
  ),
  CI.jutsu(
    "chinoike_chuva_granizo",
    "Técnica Chuva de Granizo",
    "🧊",
    "C",
    "Suiton",
    0,
    1,
    ["chinoike_raiz"],
    4,
    4,
    "Molda o chakra em incontáveis pequenos projéteis de água e os dispara em leque na direção do oponente.",
  ),
  CI.jutsu(
    "chinoike_doujutsu",
    "Ketsuryuugan",
    "👁️",
    "D",
    "Despertar",
    -1,
    2,
    ["chinoike_chuva_granizo"],
    6,
    5,
    "O dōjutsu do clã: olhos avermelhados como sangue, capazes de ler o instante exato em que o corpo do oponente vai se mover. Ative e desative a qualquer momento com /combate ketsuryuugan: enquanto ligado, dá +10% de chance de esquiva contra qualquer ataque e gasta 5% de chakra por rodada — desliga sozinho se o chakra acabar.",
    undefined,
    "dojutsu",
  ),
  CI.jutsu(
    "chinoike_bolhas_agua",
    "Técnica das Bolhas de Água",
    "🫧",
    "B",
    "Suiton",
    1,
    2,
    ["chinoike_chuva_granizo"],
    8,
    7,
    "Cria bolhas de composição explosiva ao redor do alvo, capazes de estourar sozinhas ou sob comando. Dano em área com 65% de chance de causar Queimadura por 2 rodadas.",
    undefined,
    undefined,
    // rebalanceamento 06/08/2026: custo explicito de rank A (6, nao os 4 de
    // B) — o rank continua B porque o dano dela e' de B mesmo; so' o preco
    // sobe, pra puxar o PN total da arvore (29->33) e trazer o Pico/PN de
    // volta pra faixa do Hoshigaki/Raikage depois do buff do apice.
    6,
  ),
  CI.pass(
    "chinoike_olhos_sangue",
    "Olhos de Sangue",
    "🔴",
    "Despertar",
    -1,
    3,
    ["chinoike_doujutsu"],
    10,
    9,
    "Passiva sempre ativa: o Ketsuryuugan lê qualquer mente vacilando, não só a da própria vítima do clã. +10 pontos percentuais de chance de causar Confusão e Atordoamento em QUALQUER jutsu de Genjutsu que você usar, não só os do clã.",
    false,
    undefined,
    "dojutsu",
  ),
  CI.pass(
    "chinoike_sangue_fervente",
    "Sangue Fervente",
    "♨️",
    "Suiton",
    1,
    3,
    ["chinoike_bolhas_agua"],
    10,
    9,
    "Passiva sempre ativa: o calor do próprio sangue pressuriza ainda mais as bolhas explosivas. Seus jutsus de clã em área têm +15 pontos percentuais de chance de causar Queimadura e ganham +1 casa de alcance.",
  ),
  CI.jutsu(
    "chinoike_genjutsu_ketsuryuugan",
    "Genjutsu Ketsuryuugan",
    "🌹",
    "B",
    "Despertar",
    -1,
    4,
    ["chinoike_olhos_sangue"],
    13,
    11,
    "Prende o oponente numa ilusão sangrenta que o próprio corpo dele acredita ser real — a dor é real. Tem 60% de chance de causar Confusão por 2 rodadas e exige o Ketsuryuugan ativo (/combate ketsuryuugan).",
    undefined,
    "genjutsu",
    // rebalanceamento 06/08/2026: mesmo caso de chinoike_bolhas_agua — custo
    // explicito de rank A (6), rank continua B (dano de B).
    6,
  ),
  CI.pass(
    "chinoike_apice",
    "Sangue Desperto",
    "💠",
    "Ápice",
    0,
    5,
    ["chinoike_genjutsu_ketsuryuugan", "chinoike_sangue_fervente"],
    17,
    14,
    "Passiva: o domínio do sangue chega ao ápice. Seus jutsus de clã causam mais 20% de dano e mais 25% em quem estiver abaixo de 30% de vida.",
  ),
  CI.jutsu(
    "chinoike_dragao_sangue",
    "Técnica da Ascensão do Dragão de Sangue",
    "🐉",
    "S",
    "Ápice",
    0,
    6,
    ["chinoike_apice"],
    19,
    18,
    "Libera um grande dragão de sangue de 8 cabeças que avança sobre o alvo e libera vapor após morder. Não pode ser esquivado. 80% de chance de causar Sangramento por 3 rodadas.",
  ),
];

// ---------------------------------------------------------- KAMAITACHI
// Clã do vento de Suna (Temari): leque gigante, golpes de foice cortante.
// Fuuton na base — paga do pool ninjutsu, igual Hoshigaki/Hozuki/Yuki. Tronco
// reto (raiz -> Foice -> Grande Foice -> Corte Profundo -> Rede -> Lâmina
// Viva -> ápice -> Decapitação), sem ramificação — só 4 técnicas foram
// pedidas, então nada de inventar um ramo extra pra encher. Fica dentro do
// vocabulário já estabelecido de Vento (Sangramento, indefensável/
// imparável, perfuração de guarda). Custo total 30 PN — entre o Chinoike
// (29) e o Hoshigaki/Yuki (34), ver "Custo total da árvore vs dano" na
// skill jutsu-authoring.
const KM = makeClan("kamaitachi", "ninjutsu");
const KAMAITACHI: SkillNodeDef[] = [
  KM.pass(
    "kamaitachi_raiz",
    "Fio do Leque",
    "🌪️",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: a mestria do clã com o leque gigante refina cada golpe. Seus jutsus de clã custam 10% menos recurso.",
    true,
  ),
  KM.jutsu(
    "kamaitachi_foice",
    "Foice da Doninha",
    "🍃",
    "C",
    "Foice",
    0,
    1,
    ["kamaitachi_raiz"],
    4,
    4,
    "Técnica de Estilo Vento que cria lâminas cortantes de vento em cone à sua frente, dilacerando quem for atingido.",
  ),
  KM.jutsu(
    "kamaitachi_grande_foice",
    "Grande Foice da Doninha",
    "🌀",
    "B",
    "Foice",
    0,
    2,
    ["kamaitachi_foice"],
    9,
    8,
    "Usa o leque gigante para criar uma versão mais poderosa e em maior escala dos ventos cortantes: correntes de ar pesado se chocam em várias bolsas de vácuo que cortam tudo na área.",
  ),
  KM.pass(
    "kamaitachi_corte_profundo",
    "Corte Profundo",
    "🩸",
    "Foice",
    -1,
    3,
    ["kamaitachi_grande_foice"],
    13,
    11,
    "Passiva sempre ativa: os cortes de vento do clã vão fundo demais pra fechar rápido. O Sangramento que você aplica dura 1 rodada a mais.",
  ),
  KM.jutsu(
    "kamaitachi_rede",
    "Lançamento da Rede",
    "🕸️",
    "A",
    "Rede",
    -1,
    4,
    ["kamaitachi_corte_profundo"],
    18,
    15,
    "Cria várias correntes estreitas de vento que se entrelaçam numa grande rede de corte. Os fios são afiados e rápidos demais pra esquivar.",
  ),
  KM.pass(
    "kamaitachi_lamina_viva",
    "Lâmina Viva",
    "🛡️",
    "Perfuração",
    1,
    3,
    ["kamaitachi_grande_foice"],
    22,
    17,
    "Passiva sempre ativa: o fio do vento do clã encontra a brecha certa na guarda do alvo. Seus jutsus de clã causam mais 5% de dano e perfuram 20% da redução de quem bloqueia ou apara.",
  ),
  KM.pass(
    "kamaitachi_apice",
    "Domínio da Foice",
    "📏",
    "Ápice",
    0,
    5,
    ["kamaitachi_rede", "kamaitachi_lamina_viva"],
    26,
    20,
    "Passiva: o domínio total do leque chega ao ápice. Seus jutsus de clã em linha reta ganham +1 casa de alcance e têm +10 pontos percentuais a mais de chance de causar Sangramento.",
  ),
  KM.jutsu(
    "kamaitachi_decapitacao",
    "Dança da Decapitação Rápida",
    "⚔️",
    "S",
    "Ápice",
    0,
    6,
    ["kamaitachi_apice"],
    26,
    26,
    "O leque provoca um vendaval poderoso e Inevitável que corta através de tudo o que toca.",
    undefined,
    undefined,
    6,
  ),
];

// ------------------------------------------------------------- YAMANAKA
// Clã mental de Konoha: nenhuma das 4 habilidades causa dano de verdade
// (todas baseDamage: 0 ou buff SELF) — o poder inteiro é controle, não
// dano bruto, então não faz sentido copiar o damageMult de raiz dos outros
// clãs (ver "Custo total da árvore vs dano" na skill jutsu-authoring: clã
// sem dano de graça pode custar barato mesmo tendo uma finalização forte).
// Tronco (raiz -> Destruição de Mente, a confusão básica e barata) abre em
// dois ramos no fork pedido: Controle (col -1, Transferência de Mente -> Domínio
// Mental — upkeep mais barato) e Rede (col +1, Transmissão de Mentes -> Elo
// Telepático — Aceleração dura mais). Os dois convergem no ápice (que soma
// bônus de disputa + mais 1 corpo simultâneo) antes dos Clones de
// Transferência de Mente, o S final. 27 PN de custo total — perto do
// Hozuki (27), coerente com "zero dano de graça" no preço.
const YM = makeClan("yamanaka", "ninjutsu");
const YAMANAKA: SkillNodeDef[] = [
  YM.pass(
    "yamanaka_raiz",
    "Sintonia Mental",
    "🧠",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: gerações de leitura mental afinam o próprio chakra. Seus jutsus de clã custam 10% menos recurso, e a Confusão que você aplicar dura 1 rodada a mais.",
    true,
  ),
  YM.jutsu(
    "yamanaka_destruicao_mente",
    "Técnica de Destruição de Mente",
    "💫",
    "C",
    "Mente",
    0,
    1,
    ["yamanaka_raiz"],
    5,
    6,
    "Interfere na mente do alvo — se ele não esquivar, perde a noção de aliados e inimigos por um turno: o próximo ataque dele mira alguém aleatório, não importa quem ele escolher.",
  ),
  YM.jutsu(
    "yamanaka_shintenshin",
    "Técnica de Transferência de Mente",
    "👤",
    "B",
    "Controle",
    -1,
    2,
    ["yamanaka_destruicao_mente"],
    10,
    10,
    "Projeta a consciência para o corpo do alvo, assumindo o controle — só dá pra esquivar, bloqueio e aparo não adiantam contra um ataque mental. Enquanto durar, seu corpo original fica imóvel e vulnerável, e todo dano que o corpo tomado sofrer também atinge o seu.",
  ),
  YM.jutsu(
    "yamanaka_transmissao_mentes",
    "Técnica de Transmissão de Mentes",
    "📡",
    "C",
    "Rede",
    1,
    2,
    ["yamanaka_destruicao_mente"],
    10,
    8,
    "Cria uma rede telepática entre até 3 aliados (contando o usuário) — comunicação instantânea deixa o grupo mais ágil e reativo por um tempo (Aceleração).",
  ),
  YM.pass(
    "yamanaka_dominio_mental",
    "Domínio Mental",
    "🕹️",
    "Controle",
    -1,
    3,
    ["yamanaka_shintenshin"],
    14,
    13,
    "Passiva sempre ativa: décadas de prática tornam manter o controle mais barato. Enquanto estiver pilotando um corpo emprestado, o custo de chakra por turno pra manter o controle cai 20%.",
  ),
  YM.pass(
    "yamanaka_elo_telepatico",
    "Elo Telepático",
    "🔗",
    "Rede",
    1,
    3,
    ["yamanaka_transmissao_mentes"],
    14,
    12,
    "Passiva sempre ativa: o elo mental do clã se sustenta com menos esforço. A Aceleração da sua Transmissão de Mentes dura 1 rodada a mais.",
  ),
  YM.pass(
    "yamanaka_apice",
    "Domínio da Mente",
    "💠",
    "Ápice",
    0,
    4,
    ["yamanaka_dominio_mental", "yamanaka_elo_telepatico"],
    20,
    17,
    "Passiva: o domínio total das técnicas mentais do clã chega ao ápice. +6 de Ninjutsu efetivo em qualquer disputa de controle mental (tanto controlando quanto resistindo), e os Clones de Transferência de Mente conseguem manter mais 1 corpo simultâneo.",
  ),
  YM.jutsu(
    "yamanaka_clones_shintenshin",
    "Técnicas dos Clones de Transferência de Mente",
    "🧿",
    "S",
    "Ápice",
    0,
    5,
    ["yamanaka_apice"],
    25,
    20,
    "Divide a consciência em vários alvos ao mesmo tempo (até 3), tomando o controle total de cada corpo. É Inevitável — diferente da Técnica de Transferência de Mente, não dá pra resistir: o controle dura exatamente 1 turno por corpo e se desfaz sozinho depois.",
  ),
];

// ------------------------------------------------------------- RAIKAGE
// Linhagem dos Raikage de Kumo: raio + taijutsu bruto, não um clã de dojutsu
// nem de ninjutsu elemental de verdade — por isso o pool padrão é TAIJUTSU
// (os 5 golpes físicos), com override de pool pros 2 jutsus de chakra puro
// (Deslocamento/Armadura, que saem do pool NINJUTSU) — mesmo padrão de
// pool cruzado que o Ketsuryuugan do Chinoike usa pro dōjutsu. Tronco reto
// (raiz -> Deslocamento -> Armadura -> Relâmpago Reto) até o fork: Golpes
// (col -1, Lariat -> Corte Horizontal) e Queda (col +1, só a Guilhotina,
// ramo curto — mesmo padrão assimétrico do Kaguya/Chinoike). Os dois
// convergem no ápice antes da Bomba Liger, o finalizador de agarrão. 35 PN
// de custo total — entre o Nara (36) e o Aburame (33), coerente com um clã
// de dano bruto de verdade (ver "Custo total da árvore vs dano" na skill
// jutsu-authoring).
const RK = makeClan("raikage", "taijutsu");
const RAIKAGE: SkillNodeDef[] = [
  RK.pass(
    "raikage_raiz",
    "Sangue de Raikage",
    "⚡",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: a força descomunal da linhagem dos Raikage potencializa cada golpe. Seus jutsus de clã causam +10% de dano e custam 10% menos recurso.",
    true,
  ),
  RK.jutsu(
    "raikage_deslocamento",
    "Deslocamento Instantâneo do Estilo Raio",
    "💨",
    "D",
    "Velocidade",
    0,
    1,
    ["raikage_raiz"],
    1,
    3,
    "Jutsu básico de movimento em alta velocidade: o usuário se desloca de um ponto a outro numa velocidade quase indetectável, ficando Acelerado por um instante.",
    undefined,
    "ninjutsu",
  ),
  RK.jutsu(
    "raikage_armadura",
    "Armadura de Raio",
    "🛡️",
    "C",
    "Velocidade",
    0,
    2,
    ["raikage_deslocamento"],
    6,
    7,
    "Envolve o corpo numa camada de chakra relâmpago que estimula eletricamente o sistema nervoso: sinapses mais rápidas e destreza física no limite absoluto — fica Acelerado por um bom tempo.",
    undefined,
    "ninjutsu",
  ),
  RK.jutsu(
    "raikage_relampago_reto",
    "Relâmpago Reto",
    "⚡",
    "B",
    "Velocidade",
    0,
    3,
    ["raikage_armadura"],
    9,
    9,
    "Move-se em alta velocidade para desferir um ataque direto contra o alvo — rápido demais pra esquivar.",
  ),
  RK.jutsu(
    "raikage_lariat",
    "Lariat",
    "🦾",
    "B",
    "Golpes",
    -1,
    4,
    ["raikage_relampago_reto"],
    10,
    10,
    "Avança rapidamente e encaixa o braço flexionado no pescoço do inimigo, derrubando-o com um golpe forte.",
  ),
  RK.jutsu(
    "raikage_guilhotina",
    "Queda da Guilhotina",
    "🦵",
    "B",
    "Queda",
    1,
    4,
    ["raikage_relampago_reto"],
    11,
    10,
    "Salta no ar acima do oponente e executa um chute baixo, usando o impulso da queda pra aumentar o poder por trás do golpe e deixar a guarda dele aberta.",
  ),
  RK.jutsu(
    "raikage_corte_horizontal",
    "Corte Horizontal de Relâmpago Violento",
    "🔪",
    "A",
    "Golpes",
    -1,
    5,
    ["raikage_lariat"],
    16,
    14,
    "Golpeia o adversário com a lateral externa da mão, endurecida em forma de faca por chakra relâmpago — um corte fundo o bastante pra sangrar.",
  ),
  RK.pass(
    "raikage_apice",
    "Fúria do Raikage",
    "👑",
    "Ápice",
    0,
    6,
    ["raikage_corte_horizontal", "raikage_guilhotina"],
    20,
    17,
    "Passiva: a fúria da linhagem chega ao ápice. Seus jutsus de clã causam mais 10% de dano e causam mais 25% em quem estiver abaixo de 30% de vida.",
  ),
  RK.jutsu(
    "raikage_bomba_liger",
    "Bomba Liger",
    "💥",
    "S",
    "Ápice",
    0,
    7,
    ["raikage_apice"],
    25,
    21,
    "Agarra o oponente, levanta-o no ar e usa força extrema pra esmagá-lo de cabeça contra o chão. O golpe é Inevitável.",
  ),
];

// ------------------------------------------------------------- KAMIZURU
// Se baseia no Aburame (pedido explícito): clã de enxame/chakra, paga do
// pool ninjutsu como o Aburame, e ganha por DRENAR/IMOBILIZAR/ENVENENAR, não
// por rajada — só a Bomba de Abelha foge disso de propósito (a única técnica
// de dano real do clã). Só 5 técnicas foram pedidas (o Aburame tem 7), então
// a árvore é mais enxuta: raiz -> Abelha Gigante (invocação, cedo, mesmo
// padrão do Cão Ninja do Hatake/Inuzuka) -> fork em Enxame (col -1, Abelha
// do Mel -> Colmeia de Rocha) e Ataque (col +1, Bomba de Abelha -> Mil
// Ferrões) -> ápice convergindo os dois. Igual o Aburame, termina no ápice
// (passiva) — sem finalizador S separado. 24 PN de custo total — acima do
// Hatake (15) e do Uzumaki (14), mas ainda um dos mais baratos do jogo,
// coerente com "quase zero dano de graça" na tabela de "Custo total da
// árvore vs dano" da skill jutsu-authoring.
const KMZ = makeClan("kamizuru", "ninjutsu");
const KAMIZURU: SkillNodeDef[] = [
  KMZ.pass(
    "kamizuru_raiz",
    "Colônia de Iwa",
    "🐝",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa: gerações inteiras hospedando abelhas de chakra fazem do próprio corpo uma colmeia viva. Seus jutsus de clã custam 10% menos chakra e têm +15 pontos percentuais de chance de fazer o alvo perder 10% de chakra por turno.",
    true,
  ),
  KMZ.jutsu(
    "kamizuru_abelha_gigante",
    "Técnica de Invocação: Abelha Gigante",
    "🐝",
    "D",
    "Enxame",
    0,
    1,
    ["kamizuru_raiz"],
    1,
    3,
    "Invoca uma abelha gigante: mandíbula de dentes afiados, ferrão mortal e asas capazes de causar ventos fortes. Ataca sozinha todo turno, como uma invocação comum.",
  ),
  KMZ.jutsu(
    "kamizuru_abelha_mel",
    "Técnica da Abelha do Mel",
    "🍯",
    "B",
    "Enxame",
    -1,
    2,
    ["kamizuru_abelha_gigante"],
    8,
    8,
    "Conjura um enxame de abelhas feitas de chakra. Toda vez que uma abelha é ferida ou destruída, libera cera pegajosa sobre o adversário — forte o suficiente pra imobilizá-lo.",
  ),
  KMZ.jutsu(
    "kamizuru_bomba_abelha",
    "Bomba de Abelha",
    "💣",
    "B",
    "Ataque",
    1,
    2,
    ["kamizuru_abelha_gigante"],
    8,
    8,
    "Abelhas carregando amuletos explosivos atacam em enxame. Assim que entram em contato com o alvo, os selos explodem.",
  ),
  KMZ.jutsu(
    "kamizuru_colmeia_rocha",
    "Colmeia de Rocha",
    "🪨",
    "A",
    "Enxame",
    -1,
    3,
    ["kamizuru_abelha_mel"],
    16,
    14,
    "Cria uma caverna em forma de colmeia, abrigando larvas de abelha gigante que se alimentam de chakra e o drenam de cada centímetro das paredes — prendendo quem estiver lá dentro.",
  ),
  KMZ.jutsu(
    "kamizuru_mil_ferroes",
    "Mil Ferrões de Abelha",
    "🩸",
    "A",
    "Ataque",
    1,
    3,
    ["kamizuru_bomba_abelha"],
    16,
    14,
    "Invoca uma nuvem de abelhas que disparam seus ferrões venenosos contra tudo na área, cercando o alvo por dentro.",
  ),
  KMZ.pass(
    "kamizuru_apice",
    "Enxame Completo",
    "👑",
    "Ápice",
    0,
    4,
    ["kamizuru_colmeia_rocha", "kamizuru_mil_ferroes"],
    22,
    18,
    "Passiva: domina os dois ramos do clã ao mesmo tempo. Seus jutsus de clã têm +15 pontos percentuais de chance de Imobilizar, e o Veneno que você aplicar dura 1 rodada a mais.",
  ),
];

// ---------------------------------------------------------------- SENJU
// Tronco híbrido e dois ramos. Os aprimoramentos de Suiton exigem também o
// nó da técnica original na árvore de Água: o Senju melhora o que já aprendeu,
// em vez de receber uma segunda cópia da mesma técnica.
const SJ = makeClan("senju", "ninjutsu");
const SENJU: SkillNodeDef[] = [
  SJ.pass("senju_vitalidade", "Vitalidade Senju", "🌳", "Base", 0, 0, [], 1, 1,
    "Passiva sempre ativa: aumenta em 8% sua vida máxima e recupera 3 HP no início de cada turno.", true,
    { attribute: "iryoNinjutsu", value: 1 }, "taijutsu"),
  SJ.pass("senju_controle_chakra", "Controle de Chakra", "🌀", "Base", 0, 1, ["senju_vitalidade"], 4, 4,
    "Passiva: seus Ninjutsus gastam 8% menos chakra e recupera 3% do chakra no início de cada turno."),
  SJ.pass("senju_heranca", "Herança do Clã Senju", "🍃", "Base", 0, 2, ["senju_controle_chakra"], 8, 6,
    "Passiva: a herança vital do clã aumenta em 5% sua vida máxima e recupera 5 HP no início de cada turno."),

  SJ.pass("senju_dominio_suiton", "Domínio Suiton", "🌊", "Estilo Água", -1, 3, ["senju_heranca", "agua_raiz"], 10, 8,
    "Passiva: seus jutsus de Água causam 10% mais dano."),
  SJ.pass("senju_dragao_mare", "Dragão da Maré", "🐉", "Estilo Água", -1, 5, ["senju_dominio_suiton", "agua_dragao"], 14, 10,
    "Passiva: o Dragão de Água causa 15% mais dano e alcança 1 casa adicional."),
  SJ.pass("senju_muralha", "Muralha Inabalável", "🛡️", "Estilo Água", -2, 5, ["senju_dominio_suiton", "agua_muralha"], 14, 12,
    "Passiva: a Técnica da Muralha de Água concede 12 pontos adicionais de Barreira e gasta 10% menos chakra."),
  SJ.pass("senju_cachoeira", "Grande Cachoeira Devastadora", "🏞️", "Estilo Água", -1, 6, ["senju_dragao_mare", "agua_cachoeira"], 25, 18,
    "Passiva: a Grande Cachoeira Explosiva causa 15% mais dano, alcança 1 casa adicional e empurra os alvos 1 casa a mais."),
  SJ.pass("senju_chuva", "Chuva Celestial", "🌧️", "Estilo Água", -1, 4, ["senju_dominio_suiton", "agua_choro"], 12, 10,
    "Passiva: o Choro Celestial causa 15% mais dano, gasta 10% menos chakra e deixa o alvo Encharcado por 1 rodada a mais."),
  SJ.jutsu("senju_ondas_cortantes", "Ondas de Águas Cortantes", "🌊", "A", "Estilo Água", -1, 7,
    ["senju_cachoeira", "senju_chuva"], 28, 20,
    "Ondas finas e afiadas avançam em leque, cortando vários inimigos. Tem 70% de chance de causar Sangramento por 2 rodadas.",
    undefined, "ninjutsu", 6),

  SJ.pass("senju_diagnostico", "Diagnóstico Preciso", "🩺", "Iryō Ninjutsu", 1, 3, ["senju_heranca"], 10, 6,
    "Passiva: seus Ninjutsus Médicos gastam 10% menos chakra.", false, undefined, "iryoNinjutsu"),
  SJ.pass("senju_cirurgia", "Cirurgia de Emergência", "❤️‍🩹", "Iryō Ninjutsu", 1, 4, ["senju_diagnostico"], 14, 9,
    "Passiva: suas curas restauram 25% mais vida em alvos com 35% da vida máxima ou menos.", false, undefined, "iryoNinjutsu"),
  SJ.pass("senju_imunidade", "Imunidade Adaptativa", "🧬", "Iryō Ninjutsu", 1, 5, ["senju_cirurgia"], 18, 12,
    "Passiva: Veneno e Atordoamento recebidos duram 1 rodada a menos, respeitando a duração mínima de 1 rodada.", false, undefined, "iryoNinjutsu"),
  SJ.pass("senju_regenerativo", "Controle Regenerativo", "💚", "Iryō Ninjutsu", 1, 6, ["senju_imunidade"], 22, 15,
    "Passiva: seus Ninjutsus Médicos restauram 15% mais vida.", false, undefined, "iryoNinjutsu"),
  SJ.pass("senju_especialista", "Especialista Médico", "⚕️", "Iryō Ninjutsu", 1, 7, ["senju_regenerativo"], 28, 20,
    "Passiva: seus Ninjutsus Médicos restauram 15% mais vida e gastam 10% menos chakra.", false, undefined, "iryoNinjutsu"),
];

// ---------------------------------------------------------------- SARUTOBI
// O "Professor": Hiruzen e' canonicamente o unico shinobi a dominar as CINCO
// naturezas basicas de chakra. O clã nao tem jutsu proprio nenhum — o kit
// inteiro e' versatilidade elemental pura, entao a arvore vira 1 raiz +
// 5 ramos paralelos (1 por natureza), sem tronco/apice.
//
// A raiz ("Legado do Professor") NASCE COMPRADA (ver autoGrantedNodeIds em
// clans/index.ts, mesmo padrao do cao ninja do Inuzuka) e carrega o pedido
// explicito do usuario: comprar QUALQUER no ELEMENT da arvore de Fundamentos
// concede um segundo elemento basico aleatorio de graça junto (ver
// buyNode() em services/characters/skill-tree.ts — a raiz e' so' o
// marcador que a engine verifica por id, nao tem PassiveDef porque nao e'
// um modificador de combate).
//
// Os 5 ramos sao a passiva "que buffa cada elemento" pedida pelo usuario:
// cada um exige a raiz de clã E a raiz do proprio elemento (mesmo padrao de
// cross-tree que senju_dominio_suiton usa com agua_raiz) — o clã reforça
// naturezas que o personagem ja' desbloqueou, nao da' poder de graça sem
// nenhum investimento na arvore elemental. Cada no' rouba um MECANISMO
// diferente de outro lugar do jogo (nao "+X% de dano" repetido 5x — pedido
// explicito do usuario, "algo unico pra cada um, tipo a lâmina de chakra" do
// Hatake): Katon crava Queimadura extra, Fūton propaga fogo de graça
// (combo canonico do Hiruzen), Suiton corta custo, Raiton atordoa mais,
// Doton segura terreno mais tempo. Ver os numeros e o raciocinio de cada um
// em clan-trees/passives.ts.
const SR = makeClan("sarutobi", "ninjutsu");
const SARUTOBI: SkillNodeDef[] = [
  SR.pass(
    "sarutobi_raiz",
    "Legado do Professor",
    "🐒",
    "Raiz",
    0,
    0,
    [],
    1,
    1,
    "Passiva sempre ativa (já nasce concedida): domina as cinco naturezas básicas desde cedo. Sempre que você desbloquear um elemento na árvore de Ninjutsu (Fundamentos), um segundo elemento básico aleatório vem de graça junto — sempre que compra um, vem dois.",
    true,
  ),
  SR.pass(
    "sarutobi_katon",
    "Fogo do Professor",
    "🔥",
    "Naturezas",
    -1,
    1,
    ["sarutobi_raiz", "fogo_raiz"],
    5,
    4,
    "Passiva: todo acerto seu de Fogo crava 1 acúmulo de Queimadura a mais, aproximando a explosão.",
  ),
  SR.pass(
    "sarutobi_futon",
    "Vento que Aviva as Chamas",
    "🌪️",
    "Naturezas",
    0,
    1,
    ["sarutobi_raiz", "vento_raiz"],
    5,
    4,
    "Passiva: quando seu vento passa por chamas, ele espalha o fogo — causa dano extra e passa 1 acúmulo de Queimadura para quem estiver ao lado (Combo Fogo → Vento).",
  ),
  SR.pass(
    "sarutobi_raiton",
    "Trovão Certeiro",
    "⚡",
    "Naturezas",
    1,
    1,
    ["sarutobi_raiz", "raio_raiz"],
    5,
    4,
    "Passiva: seus jutsus de Raio têm +10 pontos percentuais de chance de Atordoar o alvo.",
  ),
  SR.pass(
    "sarutobi_suiton",
    "Correnteza Perene",
    "💧",
    "Naturezas",
    -1,
    2,
    ["sarutobi_raiz", "agua_raiz"],
    5,
    4,
    "Passiva: seus jutsus de Água custam 10% menos chakra.",
  ),
  SR.pass(
    "sarutobi_doton",
    "Muralha do Professor",
    "🪨",
    "Naturezas",
    1,
    2,
    ["sarutobi_raiz", "terra_raiz"],
    5,
    4,
    "Passiva: os muros, cúpulas e pântanos que você cria com Terra duram 2 rodadas a mais.",
  ),
];

// ---------------------------------------------------------------- ONOKI
// Linhagem dos Tsuchikage: pedido explicito do usuario, so' passiva — sem
// jutsu proprio (mesmo padrao do Sarutobi). Balanceamento COPIADO do ramo de
// Água do Senju (senju_dominio_suiton/senju_cachoeira/senju_muralha, ver
// clan-trees/passives.ts): crossElement damageMult 1.1, push/alcance +1,
// custo -10%, os MESMOS numeros, so' que espalhados em Terra E Poeira em vez
// de so' um elemento — nao dobra o valor (cada elemento recebe metade do que
// o Senju concentra num so), mantendo o total por elemento igual. Raiz
// tambem copiada do Senju (senju_vitalidade: +8% vida, +3 HP/turno) — a
// unica parte da arvore sem gate de elemento, igual o proprio Senju faz.
const ON = makeClan("onoki", "ninjutsu");
const ONOKI: SkillNodeDef[] = [
  ON.pass("onoki_raiz", "Legado do Tsuchikage", "🗿", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: a resistência lendária dos Tsuchikage. +8% de vida máxima e recupera 3 HP no início de cada turno.", true),
  ON.pass("onoki_doton", "Domínio Doton", "🪨", "Terra", -1, 1, ["onoki_raiz"], 10, 8, "Passiva: seus jutsus de Terra causam +10% de dano."),
  ON.pass("onoki_jinton", "Legado do Jinton", "🌫️", "Poeira", 1, 1, ["onoki_raiz"], 10, 8, "Passiva: seus jutsus de Poeira causam +10% de dano."),
  ON.pass("onoki_peso_montanha", "Peso da Montanha Verdadeira", "⛰️", "Terra", -1, 2, ["onoki_doton"], 14, 11, "Passiva: seus jutsus de Terra empurram o alvo 1 casa a mais e alcançam 1 casa a mais."),
  ON.pass("onoki_particula_primordial", "Partícula Primordial", "⚪", "Poeira", 1, 2, ["onoki_jinton"], 14, 11, "Passiva: seus jutsus de Poeira custam 10% menos chakra."),
];

// ---------------------------------------------------------------- YOTSUKI
// Clã de Killer Bee, em Kumo: pedido explicito do usuario, so' passiva — sem
// jutsu proprio (mesmo padrao do Onoki/Sarutobi). Balanceamento baseado no
// ramo de Água do Senju (ver clan-trees/passives.ts): raiz de vitalidade
// identica (+8% vida, +3 HP/turno), um crossElement RAIO generico (1.1x,
// "pode ser o elemento tambem" — pedido explicito) e QUATRO passivas
// abilityIds mirando tecnicas ESPECIFICAS de Raio (mesmo padrao de
// senju_dragao_mare/muralha/cachoeira/chuva, cada uma so' pra UMA ability),
// deliberadamente SEM tocar em raiton_kirin (pedido explicito: "não pode ser
// o Kirin" — o apice da arvore de Raio fica de fora). As quatro melhorias de
// Raio formam uma linha continua; o Kenjutsu permanece num ramo separado.
const YT = makeClan("yotsuki", "ninjutsu");
const YOTSUKI: SkillNodeDef[] = [
  YT.pass("yotsuki_raiz", "Vitalidade Yotsuki", "🐝", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: a resistência do clã de Kumo. +8% de vida máxima e recupera 3 HP no início de cada turno.", true),
  YT.pass("yotsuki_raiton", "Domínio Raiton", "⚡", "Raio", 0, 1, ["yotsuki_raiz"], 1, 8, "Passiva: seus jutsus de Raio causam +10% de dano."),
  YT.pass("yotsuki_esfera", "Reflexo Elétrico", "🔵", "Raio", -1, 2, ["yotsuki_raiton"], 3, 10, "Passiva: a Esfera de Relâmpago causa +15% de dano e tem +15 pontos percentuais de chance de Atordoar."),
  YT.pass("yotsuki_armadura", "Armadura Econômica", "🛡️", "Raio", -1, 3, ["yotsuki_esfera"], 14, 14, "Passiva: a Armadura do Ataque Relâmpago custa 10% menos chakra e a Aceleração que ela concede dura 1 rodada a mais."),
  YT.pass("yotsuki_assassinato", "Corrente Amplificada", "🧲", "Raio", -1, 4, ["yotsuki_armadura"], 18, 18, "Passiva: o Assassinato Eletromagnético causa +15% de dano e perfura 20% da redução de quem bloqueia ou apara."),
  YT.pass("yotsuki_pilares", "Prisão Amplificada", "🏛️", "Raio", -1, 5, ["yotsuki_assassinato"], 22, 22, "Passiva: a Prisão dos Quatro Pilares causa +15% de dano e alcança 1 casa a mais."),
  YT.pass("yotsuki_kenjutsu_1", "Estilo das Sete Lâminas", "⚔️", "Kenjutsu", 1, 2, ["yotsuki_raiton"], 14, 10, "Passiva sempre ativa: seus golpes de Kenjutsu causam +15% de dano."),
  YT.pass("yotsuki_kenjutsu_2", "Corte Fulminante", "🗲", "Kenjutsu", 1, 3, ["yotsuki_kenjutsu_1"], 20, 14, "Passiva sempre ativa: seus golpes de Kenjutsu ignoram a Barreira do alvo. Além disso, causam +15% de dano em quem estiver abaixo de 30% de vida."),
];

// ---------------------------------------------------------------- BAKUREI
// Clã de Iwagakure: pedido explicito do usuario, so' passiva — sem jutsu
// proprio (mesmo padrao do Onoki/Yotsuki/Sarutobi). Hibrido dos dois moldes
// recentes: dual crossElement como o Onoki (Terra E o kekkei genkai
// Explosão, cada um com seu proprio damageMult 1.1x) MAIS passivas
// abilityIds mirando tecnicas ESPECIFICAS de cada elemento (mesmo padrao do
// Yotsuki, baseado no ramo de Água do Senju) — nenhuma delas toca no apice
// de cada arvore (terra_golem/explosao_mina ficam de fora, mesma logica de
// nao empilhar ainda mais poder em cima do no' que ja e' o mais forte da
// propria arvore).
const BK = makeClan("bakurei", "ninjutsu");
const BAKUREI: SkillNodeDef[] = [
  BK.pass("bakurei_raiz", "Vigor de Iwa", "🪨", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: a resistência física do clã de Iwa. +10% de vida máxima.", true),
  BK.pass("bakurei_doton", "Domínio Doton", "⛰️", "Terra", -1, 1, ["bakurei_raiz"], 5, 8, "Passiva: seus jutsus de Terra causam +10% de dano."),
  BK.pass("bakurei_bakuton", "Domínio Bakuton", "💥", "Explosão", 1, 1, ["bakurei_raiz"], 10, 8, "Passiva: seus jutsus de Explosão causam +10% de dano."),
  BK.pass("bakurei_punho_rochoso", "Punho Reforçado", "👊", "Terra", -1, 2, ["bakurei_doton"], 6, 10, "Passiva: o Punho Rochoso causa +15% de dano e concede mais 8 pontos de Barreira."),
  BK.pass("bakurei_impacto", "Onda de Choque Ampliada", "💢", "Explosão", 1, 2, ["bakurei_bakuton"], 14, 10, "Passiva: a Explosão de Impacto causa +15% de dano e empurra o alvo 1 casa a mais."),
  BK.pass("bakurei_dragao_terra", "Projétil Ampliado", "🐉", "Terra", -1, 3, ["bakurei_punho_rochoso"], 14, 14, "Passiva: o Projétil do Dragão de Terra causa +15% de dano e a Lentidão que ele aplica dura 1 rodada a mais."),
  BK.pass("bakurei_cortina", "Cortina Persistente", "💨", "Explosão", 1, 3, ["bakurei_bakuton"], 10, 14, "Passiva: a Cortina de Fumaça custa 10% menos chakra e dura 1 rodada a mais."),
  BK.pass("bakurei_cupula", "Cúpula Sufocante", "🛖", "Terra", -1, 4, ["bakurei_dragao_terra"], 20, 18, "Passiva: a Prisão Cúpula de Terra custa 10% menos chakra e o Dreno de Chakra que ela aplica dura 1 rodada a mais."),
];

// --------------------------------------------------------------- KAZEKAGE
// A raiz sorteia UMA manipulação persistente. Depois disso, só o ramo
// correspondente é devolvido pelo servidor para o site e pode ser comprado.
// Os três kits pagam em Ninjutsu e recebem, naturalmente, os modificadores
// das técnicas de Terra por carregarem o elemento TERRA nas abilities.
const KZ = makeClan("kazekage", "ninjutsu");
const sandBranch = <T extends SkillNodeDef>(variant: "AREIA" | "FERRO" | "OURO", node: T): T => ({
  ...node,
  requiresKazekageSand: variant,
});
const KAZEKAGE: SkillNodeDef[] = [
  KZ.pass("kazekage_despertar_areia", "Despertar da Areia", "🏜️", "Despertar", 0, 0, [], 1, 1, "Passiva permanente: desperta uma única manipulação de areia — Areia, Areia de Ferro ou Pó de Ouro — escolhida aleatoriamente. A escolha define sua árvore exclusiva.", true),

  // Areia comum: domínio de área, contenção e execução sobre alvo já preso.
  sandBranch("AREIA", KZ.pass("kazekage_areia_instinto", "Instinto da Areia", "🛡️", "Areia", -1.25, 1, ["kazekage_despertar_areia"], 4, 4, "Passiva: a areia reage ao perigo. +5 pontos percentuais de esquiva contra Ninjutsu.")),
  sandBranch("AREIA", KZ.jutsu("kazekage_chuva_areia", "Chuva de Areia", "🌪️", "C", "Areia", -1.25, 2, ["kazekage_areia_instinto"], 5, 6, "Dispara uma infinidade de balas de areia em linha contra o adversário.")),
  sandBranch("AREIA", KZ.jutsu("kazekage_mao_areia", "Mão de Areia", "✋", "B", "Areia", -1.25, 3, ["kazekage_chuva_areia"], 9, 10, "Mãos de areia surgem ao redor do alvo e fecham os dedos sobre ele.")),
  sandBranch("AREIA", KZ.pass("kazekage_areia_dominio", "Domínio do Deserto", "🏜️", "Areia", -1.25, 4, ["kazekage_mao_areia"], 13, 14, "Passiva: seus jutsus de areia causam +10% de dano e a Imobilização aplicada por eles dura 1 rodada a mais.")),
  sandBranch("AREIA", KZ.jutsu("kazekage_escudo_areia", "Escudo de Areia", "🛡️", "B", "Areia", 0, 3, ["kazekage_chuva_areia"], 10, 11, "A areia se ergue ao redor do próprio corpo em uma muralha compacta.")),
  sandBranch("AREIA", KZ.jutsu("kazekage_prisao_areia", "Prisão de Areia", "⛓️", "B", "Confinamento", 0, 4, ["kazekage_escudo_areia"], 16, 16, "Uma onda voraz de areia cerca os inimigos por todos os lados.")),
  sandBranch("AREIA", KZ.jutsu("kazekage_caixao_areia", "Caixão de Areia", "⚰️", "A", "Confinamento", 0, 5, ["kazekage_prisao_areia"], 22, 22, "A areia se fecha como um caixão e esmaga quem ficou em seu interior.")),
  sandBranch("AREIA", KZ.jutsu("kazekage_enterro_prisao_areia", "Enterro da Prisão de Areia", "🌫️", "A", "Ápice", 0, 6, ["kazekage_caixao_areia"], 30, 28, "Um redemoinho de areia cobre o campo e engole os inimigos em seu centro.")),

  // Areia de Ferro: pressão ofensiva e magnetismo para perfurar defesa.
  sandBranch("FERRO", KZ.pass("kazekage_ferro_magnetismo", "Magnetismo de Ferro", "🧲", "Areia de Ferro", 0, 1, ["kazekage_despertar_areia"], 4, 4, "Passiva: suas técnicas de Areia de Ferro causam +10% de dano.")),
  sandBranch("FERRO", KZ.jutsu("kazekage_assalto_areia_ferro", "Assalto da Areia de Ferro", "⚔️", "C", "Areia de Ferro", 0, 2, ["kazekage_ferro_magnetismo"], 5, 6, "Comprime areia de ferro numa arma metálica gigantesca e golpeia o alvo.")),
  sandBranch("FERRO", KZ.jutsu("kazekage_martelo_ferro", "Martelo", "🔨", "B", "Areia de Ferro", -1, 3, ["kazekage_assalto_areia_ferro"], 10, 11, "Forma um bloco pesado de areia de ferro e o desaba sobre o alvo.")),
  sandBranch("FERRO", KZ.jutsu("kazekage_pregos_longos", "Areia de Ferro: Pregos Longos", "📌", "B", "Areia de Ferro", 1, 3, ["kazekage_assalto_areia_ferro"], 12, 13, "Dispara várias lanças de areia de ferro em diferentes direções.")),
  sandBranch("FERRO", KZ.pass("kazekage_ferro_polaridade", "Polaridade Oposta", "🧲", "Areia de Ferro", 0, 4, ["kazekage_martelo_ferro", "kazekage_pregos_longos"], 18, 18, "Passiva: suas técnicas de Areia de Ferro causam mais 10% de dano e ignoram 15% da redução de Bloqueio e Aparo.")),
  sandBranch("FERRO", KZ.jutsu("kazekage_chuva_areia_ferro", "Chuva da Areia de Ferro", "🌧️", "A", "Areia de Ferro", 0, 5, ["kazekage_ferro_polaridade"], 22, 23, "Espalha pequenos grãos de areia de ferro por toda a área em segundos.")),
  sandBranch("FERRO", KZ.jutsu("kazekage_ordem_mundial_ferro", "Ordem Mundial da Areia de Ferro", "☄️", "S", "Ápice", 0, 6, ["kazekage_chuva_areia_ferro"], 32, 30, "Colide duas massas de areia de ferro com campos magnéticos opostos em uma grande área.")),

  // Pó de Ouro: defesa pesada, controle por densidade e arremesso.
  sandBranch("OURO", KZ.pass("kazekage_ouro_densidade", "Densidade Dourada", "✨", "Pó de Ouro", 0, 1, ["kazekage_despertar_areia"], 4, 4, "Passiva: +8% de vida máxima. Sua Barreira de Pó de Ouro recebe mais 8 pontos.")),
  sandBranch("OURO", KZ.jutsu("kazekage_escudo_po_ouro", "Escudo de Pó de Ouro", "🛡️", "C", "Pó de Ouro", 0, 2, ["kazekage_ouro_densidade"], 5, 6, "Eleva o pó de ouro ao redor do usuário em uma barricada espessa.")),
  sandBranch("OURO", KZ.jutsu("kazekage_enterro_po_ouro", "Enterro de Pó de Ouro", "🌊", "B", "Pó de Ouro", -1, 3, ["kazekage_escudo_po_ouro"], 10, 11, "Uma maré de pó de ouro emerge do chão e avança pelo campo.")),
  sandBranch("OURO", KZ.jutsu("kazekage_quadrado_perfeito_ouro", "Quadrado Perfeito do Pó de Ouro", "⬛", "B", "Pó de Ouro", 1, 3, ["kazekage_escudo_po_ouro"], 12, 13, "Forma uma massa quadrada de pó de ouro acima do alvo e a faz despencar.")),
  sandBranch("OURO", KZ.pass("kazekage_ouro_gravidade", "Gravidade do Ouro", "⚖️", "Pó de Ouro", 0, 4, ["kazekage_enterro_po_ouro", "kazekage_quadrado_perfeito_ouro"], 18, 18, "Passiva: seus jutsus de Pó de Ouro causam +10% de dano e a Imobilização aplicada por eles dura 1 rodada a mais.")),
  sandBranch("OURO", KZ.jutsu("kazekage_funeral_imperial_ouro", "Funeral Imperial do Pó de Ouro", "⚰️", "A", "Pó de Ouro", 0, 5, ["kazekage_ouro_gravidade"], 22, 23, "O pó de ouro engole o alvo e se comprime sob uma pressão esmagadora.")),
  sandBranch("OURO", KZ.jutsu("kazekage_esfera_po_ouro", "Esfera do Pó de Ouro", "🟡", "A", "Ápice", 0, 6, ["kazekage_funeral_imperial_ouro"], 30, 28, "Arremessa uma esfera pesada de pó de ouro contra o alvo.")),
];

// -------------------------------------------------------------- SHIROGANE
// Clã dos marionetistas de Suna (Kankuro). Kugutsu já existe como disciplina
// INDEPENDENTE de clã (kugutsu_oficina_inicial, ver data/kugutsu-tree.ts) —
// qualquer personagem pode construir marionetes. Shirogane não dá jutsu
// próprio (mesmo padrão do Onoki/Yotsuki/Bakurei): a árvore inteira é
// passiva e empurra o sistema de Kugutsu pra frente — dano e alcance dos
// mecanismos (crossCategory: "KUGUTSU" em clan-trees/passives.ts, o mesmo
// escape hatch que o Chinoike usa pra Genjutsu), chance de Veneno/Sangramento,
// e desconto no craft (Ryō + materiais) de criar/reformar marionetes — esse
// último não passa por passiveMods(), é lido direto em
// services/puppets/puppet-service.ts. Pool = "kugutsu": o mesmo atributo que
// banca a árvore base de Kugutsu banca esta também (sem cap, attributeCap=0),
// então investir em Kugutsu desbloqueia as duas árvores juntas.
const SG = makeClan("shirogane", "kugutsu");
const SHIROGANE: SkillNodeDef[] = [
  SG.pass("shirogane_raiz", "Domínio dos Fios", "🪆", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: o domínio clássico da manipulação de fios. Suas técnicas de marionete custam 10% menos Chakra.", true),
  SG.pass("shirogane_engenharia_letal", "Engenharia Letal", "⚙️", "Ofensiva", -1, 1, ["shirogane_raiz"], 6, 8, "Passiva: as técnicas ofensivas das suas marionetes causam +10% de dano."),
  SG.pass("shirogane_fios_precisos", "Fios Precisos", "🧵", "Controle", 1, 1, ["shirogane_raiz"], 6, 8, "Passiva: o controle refinado dos fios de chakra estende o alcance de qualquer técnica de marionete em 1 casa."),
  SG.pass("shirogane_venenos_calibrados", "Venenos Calibrados", "🧪", "Ofensiva", -1, 2, ["shirogane_engenharia_letal"], 12, 14, "Passiva: Veneno e Sangramento aplicados por suas marionetes duram 1 rodada a mais."),
  SG.pass("shirogane_oficina_mestra", "Oficina Mestra", "🛠️", "Controle", 1, 2, ["shirogane_fios_precisos"], 12, 14, "Passiva: domínio de oficina avançado. A criação e a reforma de marionetes custam 15% menos Ryō e materiais."),
  SG.pass("shirogane_braco_extra", "Braço Extra", "🦾", "Braço Extra", 0, 3, ["shirogane_venenos_calibrados", "shirogane_oficina_mestra"], 18, 20, "Passiva: escolha uma das suas marionetes para receber um terceiro mecanismo, além dos dois padrão. A escolha é permanente — nenhuma outra marionete pode reivindicar essa vaga extra depois, a menos que esta seja descartada."),
  SG.pass("shirogane_apice", "Mestre Marionetista", "🎯", "Ápice", 0, 4, ["shirogane_braco_extra"], 22, 24, "Passiva: o auge da engenharia Shirogane. Suas técnicas ofensivas de marionete ignoram a Barreira do alvo."),
];

export const CLAN_TREES: Record<string, SkillNodeDef[]> = {
  uchiha: UCHIHA,
  nara: NARA,
  hyuuga: HYUUGA,
  lee: LEE,
  akimichi: AKIMICHI,
  aburame: ABURAME,
  inuzuka: INUZUKA,
  uzumaki: UZUMAKI,
  hatake: HATAKE,
  hoshigaki: HOSHIGAKI,
  hozuki: HOZUKI,
  kaguya: KAGUYA,
  yuki: YUKI,
  chinoike: CHINOIKE,
  kamaitachi: KAMAITACHI,
  yamanaka: YAMANAKA,
  raikage: RAIKAGE,
  kamizuru: KAMIZURU,
  senju: SENJU,
  sarutobi: SARUTOBI,
  onoki: ONOKI,
  yotsuki: YOTSUKI,
  bakurei: BAKUREI,
  kazekage: KAZEKAGE,
  shirogane: SHIROGANE,
};
