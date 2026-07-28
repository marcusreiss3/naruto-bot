// ============================================================================
// Árvores de habilidade por elemento — DEFINIÇÃO ESTÁTICA (conteúdo editável).
// ============================================================================
// Espinha: tronco central (col 0) descendo da raiz até o jutsu rank S, com
// ramificações brotando para os lados (col -1 / col +1) em profundidades
// diferentes. O front desenha as "bolinhas" a partir de (col, row).
//
// O que cada nó concede e seus requisitos é AUTORIDADE DO SERVIDOR: o site
// só exibe. A compra é validada em services/characters/skill-tree.ts.
//
// Nota: os jutsus de jogador ainda são placeholder (ver CLAUDE.md). Os ids de
// nó são estáveis (guardados no banco); os grantsAbilityId apontam para as
// abilities que serão escritas quando o roster real existir.
// ============================================================================
import type { Attribute, Element } from "../../config/enums.js";
import { FUNDAMENTOS } from "./fundamentals.js";
import { CLAN_TREES } from "../clan-trees/index.js";

export type NodeKind = "JUTSU" | "PASSIVE" | "ELEMENT";
export type NodeRank = "D" | "C" | "B" | "A" | "S";

export interface SkillNodeDef {
  id: string;
  // ausente para nos da arvore de Fundamentos (Clonagem/Substituicao/
  // Caminhada Aquatica/rolagem de elemento): eles nao pertencem a nenhuma
  // natureza de chakra, entao lockReason pula a exigencia de elemento.
  element?: Element;
  // presente so em nos de arvore de CLA (ex: Nara): lockReason exige que o
  // personagem pertenca a este cla em vez de checar elemento.
  clanId?: string;
  name: string;
  kind: NodeKind;
  rank?: NodeRank; // só em JUTSU
  icon: string; // emoji exibido na bolinha (fallback)
  img?: string; // caminho opcional de PNG em /assets/icons (tem prioridade sobre icon)
  // ORCAMENTO: de qual atributo saem os pontos que pagam este no. Cada
  // atributo tem a PROPRIA bolsa (ver skill-tree.ts): gastar taijutsu numa
  // arvore de cla nao consome o ninjutsu que banca a arvore elemental.
  // Regra de ouro: o pool e' o atributo que a tecnica realmente E' — jutsu
  // de soco sai de taijutsu, de espada sai de kenjutsu, de selo sai de
  // fuinjutsu. Nunca "tudo ninjutsu".
  pool: Attribute;
  cost: number; // custo em pontos do `pool` deste no
  branch: string; // rótulo do ramo (só visual)
  col: -1 | 0 | 1; // -1 esquerda, 0 tronco, 1 direita
  row: number; // profundidade (linha)
  requires: string[]; // ids de nó pré-requisito (vazio = raiz; exige só o elemento)
  reqLevel: number;
  // valor MINIMO do atributo `pool` para liberar o no ("desbloqueia upando X").
  // Antes era reqNinjutsu (sempre lia ninjutsu); agora le o proprio pool, o
  // que dispensa o reqAttribute duplicado que existia nos nos de Taijutsu/
  // Kenjutsu/Dojutsu — os valores dos dois foram fundidos (o maior venceu).
  reqPool: number;
  // gate ADICIONAL num atributo DIFERENTE do pool. Hoje nenhum no usa (todos
  // os gates viraram reqPool na migracao), mas o contrato fica: serve pra
  // um jutsu de espada que tambem exija corpo (kenjutsu + taijutsu), etc.
  reqAttribute?: { attribute: Attribute; value: number };
  grantsAbilityId?: string; // JUTSU: id da ability concedida
  desc: string;
}

// Custo padrão por rank/tipo (ponto de partida; ajuste à vontade).
const COST: Record<string, number> = { ROOT: 1, PASSIVE: 2, D: 1, C: 3, B: 4, A: 6, S: 10 };

// Fábricas compactas: element é injetado por seção.
// Toda arvore ELEMENTAL paga em `ninjutsu` — moldar uma natureza de chakra e'
// ninjutsu por definicao, entao aqui nao ha' excecao (as excecoes de pool
// vivem nas arvores de CLA, ver makeClan em clan-trees/index.ts).
function make(element: Element) {
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
    reqPool: number,
    desc: string,
  ): SkillNodeDef => ({
    id,
    element,
    name,
    kind: "JUTSU",
    rank,
    icon,
    pool: "ninjutsu",
    cost: COST[rank]!,
    branch,
    col,
    row,
    requires,
    reqLevel,
    reqPool,
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
    reqPool: number,
    desc: string,
    root = false,
  ): SkillNodeDef => ({
    id,
    element,
    name,
    kind: "PASSIVE",
    icon,
    pool: "ninjutsu",
    cost: root ? COST.ROOT! : COST.PASSIVE!,
    branch,
    col,
    row,
    requires,
    reqLevel,
    reqPool,
    desc,
  });
  return { jutsu, pass };
}

// ---------------------------------------------------------------- FOGO
const F = make("FOGO");
const FOGO: SkillNodeDef[] = [
  F.pass("fogo_raiz", "Chama Interior", "🔥", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Fogo causam +30% de dano.", true),
  F.jutsu("fogo_grande_bola", "Grande Bola de Fogo", "☄️", "C", "Brasa", 0, 2, ["fogo_raiz"], 1, 3, "Cospe uma grande bola de fogo em cone. Aplica 1 acúmulo de Queimadura."),
  F.jutsu("fogo_flor_fenix", "Flor de Fogo Fênix", "🌸", "C", "Brasa", 0, 4, ["fogo_grande_bola"], 5, 5, "Dispara vários projéteis flamejantes de uma vez. Aplica 2 acúmulos de Queimadura."),
  F.pass("fogo_brasas", "Brasas Persistentes", "♨️", "Brasa", 1, 4, ["fogo_flor_fenix"], 8, 8, "Passiva: todo acerto seu de Fogo aplica 1 acúmulo de Queimadura a mais."),
  F.pass("fogo_combustao", "Combustão", "💥", "Brasa", 1, 5, ["fogo_brasas"], 15, 12, "Passiva: a Queimadura explode com 4 acúmulos em vez de 5, e a explosão causa 60 de dano em vez de 40."),
  F.jutsu("fogo_dragao", "Fogo do Dragão", "🐉", "B", "Cerco", 0, 6, ["fogo_flor_fenix"], 12, 10, "Lança um jato de fogo em linha reta que deixa um rastro de chamas no caminho. Aplica 3 acúmulos de Queimadura."),
  F.pass("fogo_pavio", "Pavio", "🧨", "Cerco", -1, 6, ["fogo_dragao"], 12, 10, "Passiva: as casas atingidas pelos seus jutsus de Fogo ficam em chamas por 2 rodadas e queimam quem passar por elas."),
  F.jutsu("fogo_cinzas", "Cinzas Ardentes", "🌫️", "A", "Cerco", -1, 7, ["fogo_pavio"], 22, 16, "Solta uma cortina de cinzas que bloqueia a visão e depois detona, aplicando 3 acúmulos de Queimadura em área."),
  F.jutsu("fogo_grande_dragao", "Grande Dragão de Fogo", "🐲", "A", "Conflagração", 0, 8, ["fogo_dragao"], 25, 18, "Jato colossal de fogo em linha reta. É o maior dano direto do elemento."),
  F.pass("fogo_folego", "Fôlego do Dragão", "🌬️", "Conflagração", 1, 8, ["fogo_grande_dragao"], 20, 14, "Passiva: +55% de dano com jutsus de Fogo (multiplica com o bônus da raiz: 2x no total)."),
  F.jutsu("fogo_bomba_dragao", "Bomba do Dragão Flamejante", "🔱", "A", "Conflagração", 1, 9, ["fogo_folego"], 28, 20, "Dragão de fogo que se divide em 3 direções e cerca o alvo. Aplica 2 acúmulos de Queimadura."),
  F.jutsu("fogo_corrida", "Corrida de Fogo", "⭕", "B", "Cerco", 0, 10, ["fogo_grande_dragao"], 18, 14, "Cria um anel de fogo em volta do alvo: enquanto durar, ele não consegue fugir do combate."),
  F.pass("fogo_sopro", "Sopro Eficiente", "💨", "Brasa", 0, 11, ["fogo_corrida"], 20, 16, "Passiva: seus jutsus de Fogo em cone custam 20% menos chakra."),
  F.jutsu("fogo_aniquilador", "Grande Fogo Aniquilador", "🌋", "S", "Ápice", 0, 12, ["fogo_sopro"], 35, 24, "Dilúvio de chamas num cone gigante. Evapora a água do terreno. Gasta muito chakra."),
];

// ---------------------------------------------------------------- TERRA
const T = make("TERRA");
const TERRA: SkillNodeDef[] = [
  T.pass("terra_raiz", "Pele de Pedra", "🪨", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: seus jutsus de Terra causam +30% de dano e, toda vez que você defende, você ganha +1 de Barreira.", true),
  T.jutsu("terra_parede", "Parede de Terra", "🧱", "C", "Muralha", 0, 2, ["terra_raiz"], 5, 4, "Ergue um muro de terra que bloqueia a passagem e a linha de visão dos ataques. Também te dá Barreira."),
  T.pass("terra_firme", "Terreno Firme", "⛰️", "Muralha", -1, 2, ["terra_parede"], 12, 8, "Passiva: os muros, cúpulas e pântanos que você cria duram 1 rodada a mais."),
  T.jutsu("terra_cupula", "Prisão Cúpula de Terra", "🛖", "A", "Muralha", -1, 3, ["terra_firme"], 22, 16, "Fecha o alvo numa cúpula de terra: ele fica preso ao chão e perde chakra a cada turno."),
  T.jutsu("terra_punho", "Punho Rochoso", "👊", "C", "Colosso", 0, 4, ["terra_parede"], 6, 4, "Cobre o punho de pedra e golpeia corpo a corpo. Você ganha Barreira no turno."),
  T.jutsu("terra_clone", "Clone de Terra", "🧍", "B", "Colosso", 1, 4, ["terra_punho"], 12, 8, "Cria um clone de terra que luta ao seu lado e explode em pedras quando morre, ferindo quem está perto."),
  T.pass("terra_barro", "Vínculo de Barro", "🧎", "Colosso", 1, 5, ["terra_clone"], 18, 12, "Passiva: seus clones e invocações nascem com +25% de vida."),
  T.jutsu("terra_decapitacao", "Decapitação Subterrânea", "🕳️", "B", "Aprisionamento", 0, 6, ["terra_punho"], 12, 8, "Você mergulha no solo e puxa o alvo para baixo da terra: ele fica preso ao chão, atordoado e sem poder fugir."),
  T.pass("terra_peso", "Peso da Montanha", "🏔️", "Aprisionamento", -1, 6, ["terra_decapitacao"], 18, 12, "Passiva: +55% de dano com jutsus de Terra (2x no total, com a raiz) e prender alguém ao chão dura 1 rodada a mais."),
  T.jutsu("terra_pantano", "Pântano do Submundo", "🟫", "A", "Aprisionamento", -1, 7, ["terra_peso"], 25, 18, "Transforma a área num pântano que fica no mapa: quem estiver dentro fica preso ao chão e mais lento."),
  T.jutsu("terra_dragao", "Projétil do Dragão de Terra", "🐉", "B", "Colosso", 0, 8, ["terra_decapitacao"], 12, 10, "Invoca um dragão de terra que cospe projéteis de lama em linha. Deixa o alvo mais lento."),
  T.jutsu("terra_biscoito", "Biscoito de Terra Sepulcral", "🥮", "B", "Terraplanagem", 1, 8, ["terra_dragao"], 15, 12, "Arranca um pedaço gigante do chão e arremessa: causa dano em área, empurra os alvos 1 casa e o bloco vira um obstáculo onde cair."),
  T.jutsu("terra_golem", "Golem Defensor", "🗿", "S", "Ápice", 0, 10, ["terra_dragao"], 35, 24, "Invoca um golem gigante que dá Barreira aos aliados e ataca sozinho. Gasta muito chakra."),
];

// ---------------------------------------------------------------- ÁGUA
const A = make("AGUA");
const AGUA: SkillNodeDef[] = [
  A.pass("agua_raiz", "Fluxo Constante", "💧", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: seus jutsus de Água custam 15% menos chakra e causam +15% de dano.", true),
  A.jutsu("agua_choro", "Choro Celestial", "🩸", "D", "Lâmina", 0, 2, ["agua_raiz"], 1, 1, "Agulhas de água caem de surpresa sobre o alvo e não podem ser esquivadas. Deixa o alvo levemente Encharcado."),
  A.jutsu("agua_ondas", "Ondas Furiosas", "🌊", "C", "Maré", 0, 4, ["agua_choro"], 5, 4, "Onda em cone que empurra os alvos para trás e deixa um rastro de água no chão."),
  A.jutsu("agua_clone", "Clone de Água", "🌫️", "B", "Névoa", -1, 4, ["agua_ondas"], 12, 8, "Ação bônus: invoca um clone de água que luta sozinho ao seu lado. Ao morrer, ele estoura e deixa todos em volta Encharcados, preparando o combo com Raio."),
  A.pass("agua_correnteza", "Correnteza", "💫", "Maré", 1, 4, ["agua_ondas"], 12, 8, "Passiva: seus empurrões e puxões de Água movem o alvo 1 casa a mais."),
  A.jutsu("agua_prisao", "Prisão de Água", "🫧", "B", "Maré", 1, 5, ["agua_correnteza"], 15, 12, "Prende o alvo dentro de uma esfera de água: ele fica preso ao chão, Encharcado e não consegue fugir."),
  A.jutsu("agua_trombeta", "Trombeta de Água", "🎺", "C", "Corrente", 0, 6, ["agua_ondas"], 6, 4, "Dispara um jato de água pressurizada. Deixa o alvo Encharcado."),
  A.pass("agua_condutora", "Maré Condutora", "⚡", "Corrente", -1, 6, ["agua_trombeta"], 18, 12, "Passiva: o estado Encharcado dura 1 rodada a mais."),
  A.jutsu("agua_cachoeira", "Grande Cachoeira Explosiva", "🏞️", "A", "Corrente", -1, 7, ["agua_condutora"], 25, 18, "Onda gigante que empurra e inunda a área inteira, deixando todos os atingidos Encharcados."),
  A.jutsu("agua_amarra", "Amarra de Água", "🌀", "C", "Corrente", 0, 8, ["agua_trombeta"], 6, 4, "Tentáculos de água que puxam o alvo para perto de você e o deixam mais lento."),
  A.jutsu("agua_louva", "Louva-a-deus de Água", "🦗", "C", "Lâmina", 1, 8, ["agua_amarra"], 8, 6, "Garras de água que aumentam o alcance dos seus golpes. Causa Sangramento."),
  A.pass("agua_fio", "Fio d'Água", "🪡", "Lâmina", 1, 9, ["agua_louva"], 18, 12, "Passiva: +75% de dano contra alvos Encharcados. É daqui que vem a força da Água: contra alvo seco você bate pouco, contra Encharcado você bate como os outros elementos."),
  A.jutsu("agua_dragao", "Dragão de Água", "🐉", "B", "Corrente", 0, 10, ["agua_amarra"], 12, 10, "Dragão de água em linha reta: empurra o alvo e o deixa Encharcado. É o ataque principal do elemento."),
  A.jutsu("agua_onda", "Grande Onda Explosiva", "🌊", "S", "Ápice", 0, 12, ["agua_dragao"], 35, 24, "Inunda o mapa inteiro: todo o terreno vira água e todos ficam Encharcados. Gasta muito chakra."),
];

// ---------------------------------------------------------------- VENTO
const V = make("VENTO");
const VENTO: SkillNodeDef[] = [
  V.pass("vento_raiz", "Fio de Navalha", "🌪️", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: seus jutsus de Vento causam +30% de dano e cortam 20% da redução de quem bloqueia ou apara.", true),
  V.jutsu("vento_palma", "Palma do Vendaval Violento", "🖐️", "C", "Corte", 0, 2, ["vento_raiz"], 1, 3, "Rajada de vento comprimido em cone que empurra os alvos para trás e corta na passagem, causando Sangramento."),
  V.jutsu("vento_bestial", "Palma da Onda Bestial", "🌊", "B", "Corte", 1, 2, ["vento_palma"], 12, 10, "Onda cortante que passa por cima da defesa: o alvo não consegue reduzir o dano bloqueando. Causa Sangramento."),
  V.pass("vento_corte", "Corte Profundo", "🩸", "Corte", 1, 3, ["vento_bestial"], 18, 12, "Passiva: +55% de dano com jutsus de Vento (2x no total, com a raiz) e seu Sangramento dura 1 rodada a mais."),
  V.jutsu("vento_destruicao", "Grande Destruição", "💨", "C", "Vendaval", 0, 4, ["vento_palma"], 5, 5, "Rajada frontal forte que empurra o alvo 3 casas para trás."),
  V.jutsu("vento_danca", "Dança da Dispersão de Flor", "🌸", "B", "Dispersão", 1, 4, ["vento_destruicao"], 12, 10, "Turbilhão de pétalas: causa dano em área, empurra os alvos 2 casas e cega quem for atingido, reduzindo a defesa deles."),
  V.pass("vento_vacuo", "Vácuo Cortante", "🌀", "Vendaval", -1, 4, ["vento_destruicao"], 18, 12, "Passiva: alvo empurrado contra uma parede ou obstáculo toma +15 de dano de impacto."),
  V.pass("vento_brasa", "Vento em Brasa", "🔥", "Vendaval", -1, 5, ["vento_vacuo"], 18, 12, "Passiva: quando seu vento passa por chamas, ele espalha o fogo: causa dano extra e passa 1 acúmulo de Queimadura para quem estiver ao lado. (Combo Fogo → Vento)"),
  V.jutsu("vento_lamina", "Lâmina de Vento", "🗡️", "B", "Precisão", 0, 6, ["vento_destruicao"], 12, 10, "Lâmina de vento invisível que não pode ser esquivada. Causa Sangramento."),
  V.jutsu("vento_cortante", "Vento Cortante", "✂️", "B", "Lâmina Fantasma", -1, 6, ["vento_lamina"], 14, 12, "Rajada afiada focada em um único alvo: não pode ser esquivada, causa dano alto e 2 acúmulos de Sangramento."),
  V.pass("vento_alcance", "Alcance Estendido", "📏", "Precisão", 1, 6, ["vento_lamina"], 18, 12, "Passiva: +2 casas de alcance nos seus jutsus de Vento em linha reta."),
  V.jutsu("vento_pressao", "Pressão Danosa", "🌀", "A", "Precisão", 1, 7, ["vento_alcance"], 22, 16, "Furacão que explode numa área grande e reduz a defesa de todos os atingidos."),
  V.jutsu("vento_vacuo_ondas", "Ondas Consecutivas do Vácuo", "🌬️", "S", "Ápice", 0, 8, ["vento_lamina"], 35, 24, "Dispara várias ondas de vácuo seguidas: atingem vários alvos e não podem ser esquivadas. Gasta muito chakra."),
];

// ---------------------------------------------------------------- RAIO
const R = make("RAIO");
const RAIO: SkillNodeDef[] = [
  R.pass("raio_raiz", "Sinapse Acelerada", "⚡", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: você esquiva mais de Ninjutsu e age mais cedo na ordem do turno.", true),
  R.jutsu("raio_esfera", "Esfera de Relâmpago", "🔵", "C", "Descarga", 0, 2, ["raio_raiz"], 1, 3, "Cria esferas de relâmpago e lança numa área pequena. 25% de chance de Atordoar."),
  R.jutsu("raio_ataque", "Ataque de Raio", "🔌", "C", "Corrente", -1, 2, ["raio_esfera"], 5, 4, "Dispara um fluxo elétrico contínuo em linha longa que atravessa obstáculos, árvores e fumaça. Pode Atordoar."),
  R.pass("raio_sobrecarga", "Sobrecarga", "🔋", "Descarga", 1, 2, ["raio_esfera"], 12, 10, "Passiva: +20% de chance dos seus jutsus de Raio Atordoarem o alvo."),
  R.jutsu("raio_pilares", "Prisão dos Quatro Pilares", "🏛️", "A", "Descarga", 1, 3, ["raio_sobrecarga"], 22, 16, "Ergue 4 pilares de pedra em volta do alvo e eletrocuta: Atordoamento longo, alvo preso ao chão e sem poder fugir."),
  R.jutsu("raio_clone", "Clone de Raio", "👥", "B", "Descarga", 0, 4, ["raio_esfera"], 12, 8, "Invoca um clone elétrico. Quando é ferido, ele se desfaz numa descarga e Atordoa quem o atacou."),
  R.jutsu("raio_armadura", "Armadura do Ataque Relâmpago", "🛡️", "B", "Tempestade", -1, 4, ["raio_clone"], 12, 10, "Cobre seu corpo com uma descarga elétrica: você fica mais rápido, esquiva mais, recebe +25 pontos percentuais na chance de fuga, eletrocuta quem encostar e se solta de amarras e armadilhas de metal."),
  R.pass("raio_nuvens", "Nuvens de Tempestade", "⛈️", "Tempestade", -1, 5, ["raio_armadura"], 25, 18, "Passiva: libera o uso do Kirin sem depender de chamas no campo, e alvos Encharcados passam a tomar +75% de dano de Raio."),
  R.jutsu("raio_assassinato", "Assassinato Eletromagnético", "🧲", "B", "Perfuração", 0, 6, ["raio_clone"], 15, 12, "Envia eletricidade através de um condutor (água ou metal): atinge em cadeia todos os alvos Encharcados e os Atordoa com certeza."),
  R.pass("raio_perfurante", "Ponta Perfurante", "📍", "Perfuração", 1, 6, ["raio_assassinato"], 20, 14, "Passiva: seus jutsus de Raio ignoram a Barreira do alvo e causam +25% de dano em quem estiver abaixo de 30% de vida."),
  R.jutsu("raio_pararaios", "Para-Raios", "🗼", "A", "Perfuração", 1, 7, ["raio_perfurante"], 22, 16, "Precisa encostar no alvo primeiro. Você ergue o braço e descarrega um raio que percorre o seu corpo até o dele: não pode ser esquivado, causa dano alto em um alvo só e Atordoa."),
  R.jutsu("raio_kirin", "Kirin", "🌩️", "S", "Ápice", 0, 8, ["raio_assassinato"], 35, 24, "Guia um raio de verdade das nuvens de tempestade: cai quase na hora, não pode ser esquivado e causa dano enorme em área. Precisa de nuvens de tempestade (criadas por jutsus de Fogo) e só pode ser usado 1 vez por combate."),
];

// ---------------------------------------------------------------- CRISTAL (KG)
// Kekkei genkai: nao e' sorteado, so entra via /admin. Arvore mais cara em
// nivel/Ninjutsu que as basicas (a linhagem cobra caro) e com dano ~2.30x em
// vez de ~2.015x. O tronco desce montando o plano de controle: cravar cristal
// ate o casulo FECHAR. Os dois ramos sao as duas leituras do cristal —
// Faceta corta (dano/indefensavel), Prisma refrata (defesa/luz).
const C = make("CRISTAL");
const CRISTAL: SkillNodeDef[] = [
  C.pass("cristal_raiz", "Estrutura Cristalina", "💎", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Cristal causam +35% de dano.", true),
  C.jutsu("cristal_shuriken", "Shuriken de Cristal", "❇️", "C", "Agulha", 0, 2, ["cristal_raiz"], 1, 4, "Lança agulhas de cristal afiadas em linha. Ao acertar, os cristais se fixam no corpo do alvo (Cristalizado) e podem prendê-lo no lugar."),
  C.jutsu("cristal_espinhos", "Espinhos Crescentes de Cristal", "🌵", "B", "Agulha", -1, 2, ["cristal_shuriken"], 8, 8, "Faz espinhos de cristal crescerem continuamente na direção do alvo. Cravam 1 acúmulo de Cristalizado e deixam o caminho bloqueado."),
  C.pass("cristal_estilhaco", "Faceta Cortante", "🔷", "Agulha", -1, 3, ["cristal_espinhos"], 14, 12, "Passiva: cada acerto seu de Cristal crava 1 acúmulo de Cristalizado a mais. Na prática, o casulo fecha em 2 golpes em vez de 4."),
  C.jutsu("cristal_prisao", "Prisão Cristal de Jade", "⛓️", "B", "Casulo", 0, 4, ["cristal_shuriken"], 10, 10, "Envolve o adversário em cristais: crava 2 acúmulos, prende no lugar e impede a fuga. Só funciona em uma única vítima."),
  C.jutsu("cristal_clone", "Clone Cristal de Jade", "🪞", "B", "Espelho", 1, 4, ["cristal_prisao"], 12, 10, "Ergue um espelho hexagonal de cristal que reflete sua imagem e cria um clone. Ao ser destruído, ele se despedaça e crava cristais em quem estiver ao lado."),
  C.jutsu("cristal_barragem", "Barragem de Cristais de Jade", "💠", "B", "Casulo", 0, 5, ["cristal_prisao"], 15, 12, "Dispara uma enxurrada de cristais resistentes em linha reta. Os estilhaços rasgam o alvo e o deixam Sangrando."),
  C.pass("cristal_rede", "Rede Cristalina", "🕸️", "Espelho", 1, 5, ["cristal_clone"], 18, 14, "Passiva: as paredes e prisões de cristal que você cria duram 1 rodada a mais, e o seu Cristalizado também."),
  C.jutsu("cristal_danca", "Dança Selvagem da Shuriken Hexagonal", "🌟", "A", "Faceta", -1, 6, ["cristal_estilhaco"], 22, 18, "Dispara uma nuvem de shurikens hexagonais contra vários inimigos de uma vez. São tantas que não há como desviar."),
  C.jutsu("cristal_shuriken_gigante", "Shuriken Gigante Hexagonal", "❄️", "A", "Faceta", -1, 7, ["cristal_danca"], 26, 20, "Forma uma shuriken imensa com o desenho de um floco de neve e a arremessa. Passa por qualquer guarda e corta tudo na linha."),
  C.jutsu("cristal_dragao", "Dragão Cadente do Cristal Destruidor", "🐉", "A", "Casulo", 0, 6, ["cristal_barragem"], 25, 20, "Cristaliza a matéria da área e a molda num dragão. Ele cristaliza o chakra de quem atinge: os alvos ficam sem poder usar Ninjutsu por 2 rodadas."),
  C.pass("cristal_refracao", "Refração", "🔮", "Prisma", 1, 6, ["cristal_rede"], 22, 16, "Passiva: a luz presa nas facetas atrapalha a mira de quem lança Ninjutsu em você. Ganha 8 pontos percentuais de esquiva contra Ninjutsu."),
  C.jutsu("cristal_fio_luz", "Fio de Luz", "🌈", "A", "Prisma", 1, 7, ["cristal_refracao"], 28, 22, "Forma um prisma de luz ao seu redor. Por 2 rodadas o Ninjutsu recebido cai 60% e parte volta no atacante. Em troca, você fica totalmente imóvel e o corpo a corpo passa inteiro."),
  C.pass("cristal_faceta", "Faceta Perfeita", "✨", "Ápice", 0, 7, ["cristal_dragao"], 30, 22, "Passiva: +70% de dano com jutsus de Cristal (2,30x no total, com a raiz). É a maior curva de dano do jogo, privilégio de kekkei genkai."),
  C.jutsu("cristal_oito_paredes", "Oito Paredes de Cristal de Jade", "🏯", "S", "Ápice", 0, 8, ["cristal_faceta"], 38, 28, "Fecha uma área imensa em oito paredes de cristal. Crava 3 acúmulos de Cristalizado em todos os atingidos, o bastante para selar quem já tiver um cristal no corpo. Gasta quase todo o chakra."),
];

// ----------------------------------------------------------------- VAPOR (KG)
// Kekkei genkai: nao e' sorteado, so entra via /admin, igual Cristal. Kit
// inicial com 4 nos (mais tecnicas virao depois) — a arvore sobe reta
// (Ponto de Ebulicao -> Nevoa -> Punho -> Chute), sem ramo ainda.
const VP = make("VAPOR");
const VAPOR: SkillNodeDef[] = [
  VP.pass("vapor_raiz", "Ponto de Ebulição", "♨️", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Vapor causam +120% de dano.", true),
  VP.jutsu("vapor_nevoa", "Névoa Qualificada", "☁️", "C", "Névoa", 0, 1, ["vapor_raiz"], 1, 4, "Cria uma nuvem de névoa extremamente corrosiva e a libera pela boca. Derrete o que atinge, cravando Corrosão em todos os alvos na área."),
  VP.jutsu("vapor_punho", "Punho em Propulsão", "👊", "B", "Propulsão", 0, 2, ["vapor_nevoa"], 9, 9, "Usa o estilo de Ebulição para se propulsionar num soco à queima-roupa, misturando ninjutsu com taijutsu. O vapor residual do impacto pode cravar Corrosão."),
  VP.jutsu("vapor_chute", "Chute em Propulsão", "🦵", "A", "Propulsão", 0, 3, ["vapor_punho"], 16, 15, "Versão aprimorada do Punho em Propulsão: mais velocidade e poder de impacto usando a força das pernas junto da propulsão do estilo Ebulição. Crava Corrosão com força total."),
];

// ----------------------------------------------------------------- CALOR (KG)
// Kekkei genkai, mesmo nivel do Vapor: kit inicial de 3 nos + 1 passiva raiz,
// arvore reta (Disparo -> Esfera -> Assassinato), sem ramo ainda.
const CL = make("CALOR");
const CALOR: SkillNodeDef[] = [
  CL.pass("calor_raiz", "Ebulição Corporal", "🔥", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Calor causam +120% de dano.", true),
  CL.jutsu("calor_disparo", "Disparo das Bolas de Calor", "🔴", "C", "Calor", 0, 1, ["calor_raiz"], 1, 4, "Dispara quatro esferas de calor extremo contra a área do oponente. Quem é atingido desidrata e fica fraco."),
  CL.jutsu("calor_esfera", "Esfera de Calor", "🟠", "B", "Calor", 0, 2, ["calor_disparo"], 9, 9, "Uma única esfera de calor que suga a água do corpo do alvo ao acertar, evaporando qualquer Encharcado nele e deixando-o desidratado e fraco."),
  CL.jutsu("calor_assassinato", "Assassinato de Calor Extremo", "☀️", "A", "Calor", 0, 3, ["calor_esfera"], 16, 15, "Envolve a área ao redor do alvo num calor imenso, causando queimaduras graves em todos que estiverem perto."),
];

// ----------------------------------------------------------------- LAVA (KG)
// Kekkei genkai mais forte que Vapor/Calor (2.25x), mais fraco que Cristal
// (2.295x) — pedido explicito do usuario. Kit de 4 nos (um a mais que
// Vapor/Calor) ja da espaco pra raiz + apice, igual o Cristal, em vez de uma
// raiz unica.
const LV = make("LAVA");
const LAVA: SkillNodeDef[] = [
  LV.pass("lava_raiz", "Núcleo Magmático", "🌋", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Lava causam +50% de dano.", true),
  LV.jutsu("lava_balas", "Técnica das Balas de Lava", "🔴", "C", "Lava", 0, 1, ["lava_raiz"], 1, 4, "Dispara vários resquícios de lava em sequência contra o alvo, cravando Magma a cada acerto."),
  LV.jutsu("lava_solucao", "Solução Misteriosa", "🌋", "B", "Lava", 0, 2, ["lava_balas"], 9, 9, "Libera um grande arco de lava pela boca, que desaba de cima para baixo sobre a área do alvo, cravando Magma em todos atingidos."),
  LV.jutsu("lava_rio", "Rio de Rochas Flamejantes", "🪨", "A", "Lava", 0, 3, ["lava_solucao"], 16, 15, "Expele um rio de lava que se solidifica em múltiplos pedregulhos disparados com força tremenda, empurrando o alvo e cravando Magma."),
  LV.pass("lava_apice", "Coração do Vulcão", "🔥", "Ápice", 0, 4, ["lava_rio"], 26, 20, "Passiva: +50% de dano com jutsus de Lava (2,25x no total, com a raiz)."),
  LV.jutsu("lava_huaguo", "Monte Huaguo", "🌺", "S", "Ápice", 0, 5, ["lava_apice"], 34, 26, "Cria um pequeno vulcão que explode violentamente, espalhando rocha derretida em todas as direções como uma flor gigante — o bastante para endurecer na hora qualquer Magma já acumulado no alvo."),
];

// -------------------------------------------------------------- EXPLOSAO (KG)
// Mesmo nivel do Lava: 2.25x (raiz+apice), kit de 4 nos. A ordem de rank NAO
// segue a ordem em que o usuario mandou as tecnicas — reordenei por poder:
// Cortina de Fumaca (utilidade, sem dano) fica B em vez de ultima, e Punho de
// Mina Terrestre (a explosao "enorme") vira o apice S.
const EX = make("EXPLOSAO");
const EXPLOSAO: SkillNodeDef[] = [
  EX.pass("explosao_raiz", "Núcleo Detonante", "💣", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Explosão causam +50% de dano.", true),
  EX.jutsu("explosao_defensiva", "Explosão Defensiva", "🖐️", "C", "Explosão", 0, 1, ["explosao_raiz"], 1, 4, "Cria uma pequena explosão na palma da mão para se defender. Contra um projétil como uma kunai, apara e redireciona o golpe de volta contra quem o arremessou; contra qualquer outro ataque, funciona como um aparo comum."),
  EX.jutsu("explosao_cortina", "Explosão: Cortina de Fumaça", "💨", "B", "Explosão", 0, 2, ["explosao_defensiva"], 9, 9, "Produz uma cortina de fumaça, como uma bomba de fumaça, obstruindo a visão inimiga e ocultando seus movimentos."),
  EX.jutsu("explosao_impacto", "Explosão: Impacto", "👊", "A", "Explosão", 0, 3, ["explosao_cortina"], 16, 15, "Desfere um soco no solo e libera chakra explosivo numa onda de choque, lançando detritos que ferem os oponentes na área e os deixam sem equilíbrio."),
  EX.pass("explosao_apice", "Estilo Explosão Pleno", "🔥", "Ápice", 0, 4, ["explosao_impacto"], 26, 20, "Passiva: +50% de dano com jutsus de Explosão (2,25x no total, com a raiz)."),
  EX.jutsu("explosao_mina", "Punho de Mina Terrestre", "⛏️", "S", "Ápice", 0, 5, ["explosao_apice"], 34, 26, "Usa o Estilo Explosão para plantar uma carga no ponto de contato físico. O golpe inicial já dói, mas duas rodadas depois uma explosão enorme detona no local."),
];

export const ELEMENT_TREES: Record<Element, SkillNodeDef[]> = {
  FOGO,
  TERRA,
  AGUA,
  VENTO,
  RAIO,
  CRISTAL,
  VAPOR,
  CALOR,
  LAVA,
  EXPLOSAO,
};

// FUNDAMENTOS e as arvores de CLA (CLAN_TREES, ex: Nara) nao entram em
// ELEMENT_TREES (nao pertencem a nenhum elemento), mas entram no indice
// global — e' aqui que getNode/allNodes/buyNode as acham.
const NODE_INDEX: Map<string, SkillNodeDef> = new Map(
  [...Object.values(ELEMENT_TREES).flat(), ...FUNDAMENTOS, ...Object.values(CLAN_TREES).flat()].map((n) => [
    n.id,
    n,
  ]),
);

// Ícones PNG por nó (public/assets/icons/<subpasta>). Ausente = usa o emoji do nó.
// A subpasta de árvore de clã tem o mesmo nome do clanId (nara/, hyuuga/...),
// igual as elementais usam o nome do elemento.
const NODE_ICONS: Record<string, string> = {
  // ---- clãs ----
  nara_raiz: "nara/conluio-das-sombras.png",
  nara_possessao: "nara/tecnica-de-possessao-da-sombra.png",
  nara_enforcamento: "nara/tecnica-de-enforcamento-pela-sombra.png",
  nara_costura: "nara/tecnica-da-costura-das-sombras.png",
  nara_shuriken: "nara/tecnica-de-imitacao-de-shuriken-pela-sombra.png",
  nara_rede: "nara/rede-de-imitacao-pela-sombra.png",
  nara_apice: "nara/sombra-absoluta.png",
  nara_lirio: "nara/lirio-da-aranha-negra.png",

  hyuuga_raiz: "hyuuga/olhos-brancos.png",
  hyuuga_byakugan: "hyuuga/byakugan.png",
  hyuuga_punho_suave: "hyuuga/punho-suave.png",
  hyuuga_palma_vacuo: "hyuuga/oito-trigramas-palma-de-vacuo.png",
  hyuuga_palma_rotativa: "hyuuga/palma-rotativa.png",
  hyuuga_guarda_perpetua: "hyuuga/guarda-perpetua.png",
  hyuuga_64_palmas: "hyuuga/oito-trigramas-64-palmas.png",
  hyuuga_128_palmas: "hyuuga/oito-trigramas-128-palmas.png",
  hyuuga_apice: "hyuuga/rede-de-tenketsu.png",
  hyuuga_leoes_gemeos: "hyuuga/punhos-dos-leoes-gemeos.png",

  aburame_raiz: "aburame/colonia-ancestral.png",
  aburame_clone_inseto: "aburame/tecnica-dos-clones-de-inseto.png",
  aburame_casulo: "aburame/casulo-de-insetos.png",
  aburame_esfera: "aburame/esfera-de-insetos.png",
  aburame_nuvem_veneno: "aburame/tecnica-da-nuvem-de-veneno.png",
  aburame_parede: "aburame/parede-de-insetos.png",
  aburame_jarro_veneno: "aburame/tecnica-do-jarro-de-veneno.png",
  aburame_mordida: "aburame/inseto-parasita-gigante-mordida-de-inseto.png",
  aburame_apice: "aburame/colmeia-completa.png",

  inuzuka_raiz: "inuzuka/vinculo-de-matilha.png",
  inuzuka_cao_ninja: "inuzuka/cao-ninja.png",
  inuzuka_quatro_patas: "inuzuka/tecnica-das-quatro-patas.png",
  inuzuka_clone_besta: "inuzuka/clone-da-besta-humana.png",
  inuzuka_sobre_presa: "inuzuka/sobre-presa.png",
  inuzuka_presa_sobre_presa: "inuzuka/presa-sobre-presa.png",
  inuzuka_lobo_duas_cabecas: "inuzuka/lobo-de-duas-cabecas.png",
  inuzuka_presa_de_lobo: "inuzuka/presa-de-lobo-sobre-presa.png",
  inuzuka_lobo_tres_cabecas: "inuzuka/lobo-de-tres-cabecas.png",
  inuzuka_apice: "inuzuka/instinto-de-cacador.png",
  inuzuka_cauda_perseguidora: "inuzuka/cauda-perseguidora.png",

  uzumaki_raiz: "uzumaki/vitalidade-do-redemoinho.png",
  uzumaki_regeneracao: "uzumaki/regeneracao-de-vigor.png",
  uzumaki_reservas: "uzumaki/reservas-do-redemoinho.png",
  uzumaki_correntes: "uzumaki/correntes-de-selamento-adamantinas.png",
  uzumaki_apice: "uzumaki/selo-do-redemoinho.png",

  hatake_raiz: "hatake/vinculo-com-a-matilha.png",
  hatake_caes_ninja: "hatake/tecnica-de-invocacao-cao-ninja.png",
  hatake_cerco_matilha: "hatake/cerco-da-matilha.png",
  hatake_lamina: "hatake/lamina-da-luz-branca.png",
  hatake_elo_matilha: "hatake/elo-com-a-matilha.png",
  hatake_apice: "hatake/corte-perfeito.png",

  hoshigaki_raiz: "hoshigaki/sangue-de-tubarao.png",
  hoshigaki_bomba_tubarao: "hoshigaki/tecnica-da-bomba-do-tubarao-de-agua.png",
  hoshigaki_cinco_tubaroes: "hoshigaki/tecnica-dos-cinco-tubaroes-famintos.png",
  hoshigaki_fome_voraz: "hoshigaki/fome-voraz.png",
  hoshigaki_fio_afiado: "hoshigaki/fio-afiado.png",
  hoshigaki_esfera_selvagem: "hoshigaki/tecnica-da-esfera-selvagem-do-tubarao-de-agua.png",
  hoshigaki_golpe_certeiro: "hoshigaki/golpe-certeiro.png",
  hoshigaki_mil_tubaroes: "hoshigaki/tecnica-dos-mil-tubaroes-de-alimentacao.png",
  hoshigaki_grande_bomba: "hoshigaki/tecnica-da-grande-bomba-do-tubarao-de-agua.png",

  hozuki_raiz: "hozuki/corpo-liquido.png",
  hozuki_hidratacao: "hozuki/hidratacao.png",
  hozuki_braco_agua: "hozuki/grande-braco-de-agua.png",
  hozuki_revolver_agua: "hozuki/revolver-de-agua.png",
  hozuki_lamina_liquida: "hozuki/lamina-liquida.png",
  hozuki_fluidez: "hozuki/fluidez.png",
  hozuki_corte_sem_peso: "hozuki/corte-sem-peso.png",
  hozuki_tate_eboshi: "hozuki/tate-eboshi.png",

  kaguya_raiz: "kaguya/esqueleto-vivo.png",
  kaguya_dez_dedos: "kaguya/tecnica-dos-dez-dedos-perfuradores.png",
  kaguya_salgueiro: "kaguya/tecnica-da-danca-do-salgueiro.png",
  kaguya_larico: "kaguya/tecnica-da-danca-do-larico.png",
  kaguya_camelias: "kaguya/tecnica-da-danca-das-camelias.png",
  kaguya_armadura_espinhos: "kaguya/armadura-de-espinhos.png",
  kaguya_fio_osso: "kaguya/fio-de-osso.png",
  kaguya_impulso_flor: "kaguya/tecnica-do-impulso-da-flor.png",
  kaguya_apice: "kaguya/ossos-perfeitos.png",
  kaguya_danca_flor: "kaguya/tecnica-da-danca-da-flor.png",

  chinoike_raiz: "chinoike/sangue-vivo.png",
  chinoike_chuva_granizo: "chinoike/tecnica-chuva-de-granizo.png",
  chinoike_doujutsu: "chinoike/ketsuryuugan.png",
  chinoike_bolhas_agua: "chinoike/tecnica-das-bolhas-de-agua.png",
  chinoike_olhos_sangue: "chinoike/olhos-de-sangue.png",
  chinoike_sangue_fervente: "chinoike/sangue-fervente.png",
  chinoike_genjutsu_ketsuryuugan: "chinoike/genjutsu-ketsuryuugan.png",
  chinoike_apice: "chinoike/sangue-desperto.png",
  chinoike_dragao_sangue: "chinoike/tecnica-da-ascensao-do-dragao-de-sangue.png",

  // ---- elementos ----
  fogo_raiz: "fogo/chama-interior.png",
  fogo_grande_bola: "fogo/grande-bola-de-fogo.png",
  fogo_flor_fenix: "fogo/flor-de-fogo-fenix.png",
  fogo_brasas: "fogo/brasas-persistentes.png",
  fogo_combustao: "fogo/combustao.png",
  fogo_dragao: "fogo/fogo-do-dragao.png",
  fogo_pavio: "fogo/pavio.png",
  fogo_cinzas: "fogo/cinzas-ardentes.png",
  fogo_grande_dragao: "fogo/grande-dragao-de-fogo.png",
  fogo_folego: "fogo/folego-do-dragao.png",
  fogo_bomba_dragao: "fogo/bomba-do-dragao-flamejante.png",
  fogo_corrida: "fogo/corrida-de-fogo.png",
  fogo_sopro: "fogo/sopro-eficiente.png",
  fogo_aniquilador: "fogo/grande-fogo-aniquilador.png",
  agua_raiz: "agua/fluxo-constante.png",
  agua_choro: "agua/choro-celestial.png",
  agua_ondas: "agua/ondas-furiosas.png",
  agua_clone: "agua/clone-de-agua.png",
  agua_correnteza: "agua/correnteza.png",
  agua_prisao: "agua/prisao-de-agua.png",
  agua_trombeta: "agua/trombeta-de-agua.png",
  agua_condutora: "agua/mare-condutora.png",
  agua_cachoeira: "agua/grande-cachoeira-explosiva.png",
  agua_amarra: "agua/amarras-de-agua.png",
  agua_louva: "agua/louva-deus-de-agua.png",
  agua_fio: "agua/fio-de-agua.png",
  agua_dragao: "agua/dragao-de-agua.png",
  agua_onda: "agua/grande-onda-explosiva.png",
  vento_raiz: "vento/fio-de-navalha.png",
  vento_palma: "vento/palma-do-vendaval-violento.png",
  vento_bestial: "vento/palma-da-onda-bestial.png",
  vento_corte: "vento/corte-profundo.png",
  vento_destruicao: "vento/grande-destruicao.png",
  vento_danca: "vento/danca-da-dispercao-de-flor.png",
  vento_vacuo: "vento/vacuo-cortante.png",
  vento_brasa: "vento/vento-em-brasa.png",
  vento_lamina: "vento/lamina-de-vento.png",
  vento_cortante: "vento/vento-cortante.png",
  vento_alcance: "vento/alcance-estendido.png",
  vento_pressao: "vento/pressao-danosa.png",
  vento_vacuo_ondas: "vento/ondas-consecutivas-de-vacuo.png",
  terra_raiz: "terra/pele-de-pedra.png",
  terra_parede: "terra/parede-de-terra.png",
  terra_firme: "terra/terreno-firme.png",
  terra_cupula: "terra/prisao-de-cupula-de-terra.png",
  terra_punho: "terra/punho-rochoso.png",
  terra_clone: "terra/clone-de-terra.png",
  terra_barro: "terra/vinculo-de-barro.png",
  terra_decapitacao: "terra/decapitacao-subterranea.png",
  terra_peso: "terra/peso-da-montanha.png",
  terra_pantano: "terra/pantano-do-submundo.png",
  terra_dragao: "terra/projetil-do-dragao-de-terra.png",
  terra_biscoito: "terra/biscoito-de-terra.png",
  terra_golem: "terra/golem-defensor.png",
  raio_raiz: "raio/sinapse-acelerada.png",
  raio_esfera: "raio/esfera-de-relampago.png",
  raio_ataque: "raio/ataque-de-raio.png",
  raio_sobrecarga: "raio/sobrecarga.png",
  raio_pilares: "raio/prisao-de-quatro-pilares.png",
  raio_clone: "raio/clone-de-raio.png",
  raio_armadura: "raio/armadura-do-ataque-relampago.png",
  raio_nuvens: "raio/nuvens-da-tempestade.png",
  raio_assassinato: "raio/assassinato-eletromagnetico.png",
  raio_perfurante: "raio/ponta-perfurante.png",
  raio_pararaios: "raio/para-raios.png",
  raio_kirin: "raio/kirin.png",
};
for (const [id, file] of Object.entries(NODE_ICONS)) {
  const n = NODE_INDEX.get(id);
  if (n) n.img = `/assets/icons/${file}`;
}

// Qual Ability cada no de JUTSU concede ao ser comprado. Existe porque os ids de
// no (guardados no banco) usam o padrao "fogo_*" e os das abilities seguem a
// convencao de familia ("katon_*"). Sem entrada aqui, o no concede o proprio id.
const NODE_ABILITY: Record<string, string> = {
  fogo_grande_bola: "katon_goukakyuu",
  fogo_flor_fenix: "katon_housenka",
  fogo_dragao: "katon_ryuuka",
  fogo_corrida: "katon_hibashiri",
  fogo_cinzas: "katon_haisekishou",
  fogo_grande_dragao: "katon_gouryuuka",
  fogo_bomba_dragao: "katon_karyuu_endan",
  fogo_aniquilador: "katon_gouka_mekkyaku",
  agua_choro: "suiton_choro_celestial",
  agua_ondas: "suiton_ondas_furiosas",
  agua_trombeta: "suiton_trombeta",
  agua_amarra: "suiton_amarra",
  agua_louva: "suiton_louva_deus",
  agua_prisao: "suiton_prisao",
  agua_dragao: "suiton_suiryuudan",
  agua_cachoeira: "suiton_cachoeira",
  agua_onda: "suiton_grande_onda",
  agua_clone: "suiton_clone",
  vento_palma: "fuuton_daitoppa",
  vento_bestial: "fuuton_onda_bestial",
  vento_destruicao: "fuuton_grande_destruicao",
  vento_danca: "fuuton_danca_flor",
  vento_lamina: "fuuton_lamina",
  vento_cortante: "fuuton_vento_cortante",
  vento_pressao: "fuuton_pressao_danosa",
  vento_vacuo_ondas: "fuuton_ondas_vacuo",
  terra_parede: "doton_parede",
  terra_punho: "doton_punho_rochoso",
  terra_clone: "doton_clone",
  terra_decapitacao: "doton_decapitacao",
  terra_dragao: "doton_dragao",
  terra_biscoito: "doton_biscoito",
  terra_cupula: "doton_cupula",
  terra_pantano: "doton_pantano",
  terra_golem: "doton_golem",
  raio_esfera: "raiton_esfera_relampago",
  raio_ataque: "raiton_ataque_raio",
  raio_pilares: "raiton_prisao_quatro_pilares",
  raio_clone: "raiton_clone",
  raio_armadura: "raiton_armadura_ataque_relampago",
  raio_assassinato: "raiton_assassinato_eletromagnetico",
  raio_pararaios: "raiton_pararaios",
  raio_kirin: "raiton_kirin",
  cristal_shuriken: "shouton_shuriken_cristal",
  cristal_espinhos: "shouton_espinhos_crescentes",
  cristal_prisao: "shouton_prisao_jade",
  cristal_clone: "shouton_clone_jade",
  cristal_barragem: "shouton_barragem_jade",
  cristal_danca: "shouton_danca_hexagonal",
  cristal_shuriken_gigante: "shouton_shuriken_gigante",
  cristal_dragao: "shouton_dragao_cadente",
  cristal_fio_luz: "shouton_fio_luz",
  cristal_oito_paredes: "shouton_oito_paredes",
  vapor_nevoa: "vapor_nevoa_qualificada",
  vapor_punho: "vapor_punho_propulsao",
  vapor_chute: "vapor_chute_propulsao",
  calor_disparo: "calor_disparo_bolas",
  calor_esfera: "calor_esfera",
  calor_assassinato: "calor_assassinato_extremo",
  lava_balas: "lava_tecnica_balas",
  lava_solucao: "lava_solucao_misteriosa",
  lava_rio: "lava_rio_rochas",
  lava_huaguo: "lava_monte_huaguo",
  explosao_cortina: "explosao_cortina_fumaca",
  explosao_mina: "explosao_punho_mina",
  // funda_* (Fundamentos) ja' declara grantsAbilityId direto no proprio no
  // (nao passa pela fabrica make().jutsu()), entao nao precisa de ponte aqui.
};
for (const [nodeId, abilityId] of Object.entries(NODE_ABILITY)) {
  const n = NODE_INDEX.get(nodeId);
  if (n) n.grantsAbilityId = abilityId;
}

export function getNode(id: string): SkillNodeDef | undefined {
  return NODE_INDEX.get(id);
}

export function allNodes(): SkillNodeDef[] {
  return [...NODE_INDEX.values()];
}
