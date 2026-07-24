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
// Nota: os jutsus de jogador (inclusive os de clã) ainda são placeholder
// (ver CLAUDE.md) — a estrutura da árvore (nó, requisito, custo) é o que
// deve sobreviver, não necessariamente estes ids/números exatos.
// ============================================================================
import type { Attribute } from "../../config/enums.js";
import type { NodeRank, SkillNodeDef } from "../element-trees/index.js";

const COST: Record<string, number> = { ROOT: 1, PASSIVE: 2, D: 1, C: 3, B: 4, A: 6, S: 10 };

// Fábrica compacta espelhando make() de element-trees/index.ts, trocando
// `element` por `clanId`.
function makeClan(clanId: string) {
  const jutsu = (
    id: string,
    name: string,
    icon: string,
    rank: NodeRank,
    branch: string,
    col: -1 | 0 | 1,
    row: number,
    requires: string[],
    reqLevel: number,
    reqNinjutsu: number,
    desc: string,
    // gate adicional por atributo bruto (ex: Hyuuga: Byakugan pede Dojutsu,
    // o resto pede Taijutsu — "desbloqueia upando X"). Omitido = sem gate extra.
    reqAttribute?: { attribute: Attribute; value: number },
  ): SkillNodeDef => ({
    id,
    clanId,
    name,
    kind: "JUTSU",
    rank,
    icon,
    cost: COST[rank]!,
    branch,
    col,
    row,
    requires,
    reqLevel,
    reqNinjutsu,
    reqAttribute,
    grantsAbilityId: id,
    desc,
  });
  const pass = (
    id: string,
    name: string,
    icon: string,
    branch: string,
    col: -1 | 0 | 1,
    row: number,
    requires: string[],
    reqLevel: number,
    reqNinjutsu: number,
    desc: string,
    root = false,
  ): SkillNodeDef => ({
    id,
    clanId,
    name,
    kind: "PASSIVE",
    icon,
    cost: root ? COST.ROOT! : COST.PASSIVE!,
    branch,
    col,
    row,
    requires,
    reqLevel,
    reqNinjutsu,
    desc,
  });
  return { jutsu, pass };
}

// ---------------------------------------------------------------- NARA
// Clã das sombras: controle, não dano em rajada. O tronco sobe pela técnica
// assinatura (Possessão da Sombra) e se ramifica em dois acabamentos —
// Enforcamento (finalizador de controle) e Costura (área/perfuração) — antes
// de retomar o tronco central rumo à versão em arma (Shuriken), à versão em
// rede (multi-alvo) e ao ápice, que puxa os presos pra dentro de outra jogada
// (Lírio da Aranha Negra). As duas passivas (raiz/ápice) NÃO dão dano: dão
// custo menor e imobilização mais confiável/duradoura — a curva de poder do
// clã é toda em controle, coerente com o material de origem.
const N = makeClan("nara");
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
// Clã do Byakugan: percepção e Punho Suave (Jyuuken). Cadeia LINEAR (sem
// ramos) seguindo exatamente o escalonamento pedido: Byakugan (pede Dojutsu)
// -> Punho Suave -> Oito Trigramas: Palma de Vácuo -> 64 Palmas -> Palma
// Rotativa -> 128 Palmas -> Punhos dos Leões Gêmeos. Todo o resto do kit
// (a partir de Punho Suave) pede Taijutsu em vez de Dojutsu — reqAttribute
// modela literalmente "desbloqueia upando X" do pedido original.
// As duas passivas (raiz/ápice) empurram a identidade real do clã: não é
// dano bruto, é ATRAVESSAR defesa (perfura Bloqueio/Barreira, ignora escudo)
// e SELAR chakra (Bloqueio de Ninjutsu) — o mesmo golpe físico dobra como
// controle, igual no material de origem.
const H = makeClan("hyuuga");
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
    "Passiva sempre ativa: mesmo sem o Byakugan ativado, a visão periférica quase total do clã já ajuda a mirar nos tenketsu certos. Seus jutsus de clã custam 10% menos recurso e têm +10 pontos percentuais de chance de aplicar Bloqueio de Ninjutsu.",
    true,
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
    1,
    "O dōjutsu do clã. Ative e desative a qualquer momento com /combate byakugan: enquanto ligado, dá +10% de chance de esquiva contra qualquer ataque e gasta 5% de chakra por rodada — desliga sozinho se o chakra acabar.",
    { attribute: "dojutsu", value: 3 },
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
    "Estilo de combate básico dos Hyūga: injeta chakra no golpe para ferir órgãos internos e a rede de chakra do adversário, em vez de só o corpo. 40% de chance de bloquear o Ninjutsu do alvo por 1 rodada.",
    { attribute: "taijutsu", value: 3 },
  ),
  H.jutsu(
    "hyuuga_palma_vacuo",
    "Oito Trigramas: Palma de Vácuo",
    "🌬️",
    "B",
    "Oito Trigramas",
    0,
    3,
    ["hyuuga_punho_suave"],
    9,
    9,
    "Usando o Byakugan como mira, identifica os pontos vitais do oponente e dispara uma 'bala de vácuo' comprimida à distância — não pode ser esquivada e empurra o alvo 3 casas para trás antes mesmo dele perceber o que aconteceu.",
    { attribute: "taijutsu", value: 9 },
  ),
  H.jutsu(
    "hyuuga_64_palmas",
    "Oito Trigramas: 64 Palmas",
    "🖐️",
    "B",
    "Oito Trigramas",
    0,
    4,
    ["hyuuga_palma_vacuo"],
    12,
    10,
    "Sequência de 64 golpes extremamente rápidos que bloqueiam dezenas de tenketsu de uma vez: 85% de chance de bloquear o Ninjutsu do alvo por 2 rodadas, e 30% de chance de Atordoar por 1 rodada.",
    { attribute: "taijutsu", value: 12 },
  ),
  H.jutsu(
    "hyuuga_palma_rotativa",
    "Palma Rotativa",
    "🌀",
    "B",
    "Defesa",
    0,
    5,
    ["hyuuga_64_palmas"],
    14,
    12,
    "Gira rapidamente enquanto libera chakra por todos os tenketsu, criando uma esfera defensiva quase impenetrável. Ganha 24 pontos de Barreira por 3 rodadas e livra você de ficar preso ao chão.",
    { attribute: "taijutsu", value: 14 },
  ),
  H.jutsu(
    "hyuuga_128_palmas",
    "Oito Trigramas: 128 Palmas",
    "💥",
    "A",
    "Oito Trigramas",
    0,
    6,
    ["hyuuga_palma_rotativa"],
    19,
    16,
    "Versão em dobro de velocidade das 64 Palmas: 80% de chance de bloquear o Ninjutsu do alvo por 2 rodadas e 50% de chance de deixá-lo mais lento por 2 rodadas.",
    { attribute: "taijutsu", value: 19 },
  ),
  H.pass(
    "hyuuga_apice",
    "Rede de Tenketsu",
    "🧿",
    "Ápice",
    0,
    7,
    ["hyuuga_128_palmas"],
    24,
    20,
    "Passiva: seus golpes de Punho Suave miram direto nos órgãos internos, por cima de qualquer escudo — ignoram a Barreira do alvo e causam +25% de dano em quem estiver abaixo de 30% de vida. O Bloqueio de Ninjutsu que você aplica dura 1 rodada a mais.",
  ),
  H.jutsu(
    "hyuuga_leoes_gemeos",
    "Punhos dos Leões Gêmeos",
    "🦁",
    "S",
    "Ápice",
    0,
    8,
    ["hyuuga_apice"],
    30,
    24,
    "Libera uma grande quantidade de chakra pelos punhos, moldado em duas cabeças de leão. Não pode ser esquivado. Ao acertar, destroça por completo os meridianos do alvo: bloqueia o Ninjutsu dele por 3 rodadas e reduz a defesa dele por 2 rodadas.",
    { attribute: "taijutsu", value: 28 },
  ),
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
const K = makeClan("akimichi");
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
    "Passiva sempre ativa: gerações de Akimichi acumulando calorias em força. Seus jutsus de clã causam +30% de dano e empurram o alvo 1 casa a mais.",
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
    { attribute: "ninjutsu", value: 3 },
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
    "Altera livremente o próprio tamanho e consegue manter a forma por um período extenso — consome muitas calorias, mas o corpo maior absorve muito mais impacto. Ganha 20 pontos de Barreira por 4 rodadas.",
    { attribute: "ninjutsu", value: 7 },
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
    { attribute: "taijutsu", value: 9 },
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
    11,
    "A versão mais poderosa da Técnica do Tamanho Múltiplo: multiplica o corpo pra um tamanho inacreditável. Ganha 32 pontos de Barreira por 4 rodadas.",
    { attribute: "ninjutsu", value: 12 },
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
    14,
    "Depois da Técnica do Super Tamanho Múltiplo, pula de grande altura sobre uma área e a devasta com o próprio peso.",
    { attribute: "taijutsu", value: 15 },
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
    16,
    "Depois da Técnica do Super Tamanho Múltiplo, desfere um tapa mortal com as duas mãos: a concentração de chakra ativa os músculos e aumenta ainda mais a massa do golpe. Não pode ser esquivada.",
    { attribute: "taijutsu", value: 18 },
  ),
  K.jutsu(
    "akimichi_apice",
    "Pílula Secreta",
    "💊",
    "A",
    "Ápice",
    0,
    7,
    ["akimichi_bofetada"],
    25,
    19,
    "Engole uma das pílulas secretas do clã: por 3 rodadas, +60% de dano nos seus golpes. Quando o efeito passa, o corpo cobra o preço: reduz a defesa por 2 rodadas.",
  ),
  K.jutsu(
    "akimichi_modo_borboleta",
    "Modo Borboleta",
    "🦋",
    "A",
    "Ápice",
    0,
    8,
    ["akimichi_apice"],
    28,
    21,
    "Converte calorias em chakra puro: fazem brotar borboletas de chakra nas costas, multiplicando a força bruta do usuário. Limpa Queimadura, Veneno, Sangramento e Lentidão, e ganha 20 pontos de Barreira por 2 rodadas.",
  ),
  K.jutsu(
    "akimichi_bombardeio",
    "Bombardeio da Borboleta",
    "💢",
    "S",
    "Ápice",
    0,
    9,
    ["akimichi_modo_borboleta"],
    32,
    25,
    "Depois do Modo Borboleta, concentra todo o poder acumulado num único golpe de taijutsu devastador. Não pode ser esquivado.",
  ),
];

export const CLAN_TREES: Record<string, SkillNodeDef[]> = {
  nara: NARA,
  hyuuga: HYUUGA,
  akimichi: AKIMICHI,
};
