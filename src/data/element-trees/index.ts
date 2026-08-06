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
import type { Attribute, Element, FightingStyle } from "../../config/enums.js";
import type { CharacterCondition } from "../../services/characters/mangekyo.js";
import type { VillageId } from "../../services/village-service.js";
import { FUNDAMENTOS } from "./fundamentals.js";
import { CLAN_TREES } from "../clan-trees/index.js";
import { BUKIJUTSU_TREE } from "../bukijutsu-tree.js";
import { IRYO_NINJUTSU_TREE } from "../iryo-ninjutsu-tree.js";
import { GENJUTSU_TREE } from "../genjutsu-tree.js";
import { TAIJUTSU_TREE } from "../taijutsu-tree.js";
import { ARHAT_TREE } from "../arhat-tree.js";
import { ADAMANTINO_TREE } from "../adamantino-tree.js";
import { TAIJUTSU_PASSIVES_TREE } from "../taijutsu-passives-tree.js";
import { ASSASSINATO_NINJA_TREE } from "../assassinato-ninja-tree.js";
import { TAIJUTSU_AGITACAO_TREE } from "../taijutsu-agitacao-tree.js";
import { FUINJUTSU_TREE } from "../fuinjutsu-tree.js";

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
  requiresVillage?: VillageId;
  // presente em todo no' dos 5 estilos de luta de Taijutsu (Punho Forte/
  // Arhat/Adamantino/Agitacao/Assassinato Silencioso), incluindo a raiz.
  // lockReason exige que o personagem ja tenha sido ensinado o estilo (ver
  // FightingStyle em config/enums.ts) antes de liberar qualquer no', igual
  // ao gate de `element`. Em Assassinato Silencioso isso SOMA ao gate que
  // ja existia (elemento AGUA + vila Kiri) — nao substitui.
  fightingStyle?: FightingStyle;
  name: string;
  kind: NodeKind;
  rank?: NodeRank; // só em JUTSU
  icon: string; // emoji exibido na bolinha (fallback)
  img?: string; // caminho opcional de PNG em /assets/icons (tem prioridade sobre icon)
  // Mantém a recompensa narrativa em segredo até o personagem comprar o nó.
  concealUntilOwned?: boolean;
  // ORCAMENTO: de qual atributo saem os pontos que pagam este no. Cada
  // atributo tem a PROPRIA bolsa (ver skill-tree.ts): gastar taijutsu numa
  // arvore de cla nao consome o ninjutsu que banca a arvore elemental.
  // Regra de ouro: o pool e' o atributo que a tecnica realmente E' — jutsu
  // de soco sai de taijutsu, de espada sai de kenjutsu, de selo sai de
  // fuinjutsu. Nunca "tudo ninjutsu".
  pool: Attribute;
  cost: number; // custo em pontos do `pool` deste no
  branch: string; // rótulo do ramo (só visual)
  // Posição horizontal. A maioria usa -1/0/1; árvores com quatro caminhos
  // podem usar meias colunas (ex: -1.5/-0.5/0.5/1.5 em Bukijutsu).
  col: number;
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
  // Condição narrativa/controlada pelo sistema. O primeiro uso é TRAUMA para
  // o Mangekyō; a forma de concedê-la será definida em etapa própria.
  requiresCondition?: CharacterCondition;
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
  F.jutsu("fogo_grande_bola", "Grande Bola de Fogo", "☄️", "C", "Brasa", 0, 1, ["fogo_raiz"], 1, 3, "O usuário concentra chakra na boca e cospe uma esfera de fogo que avança em cone, iluminando o campo com uma explosão de chamas."),
  F.jutsu("fogo_flor_fenix", "Flor de Fogo Fênix", "🌸", "C", "Brasa", 0, 2, ["fogo_grande_bola"], 5, 5, "Várias pequenas bolas de fogo florescem ao redor do usuário e voam em trajetórias diferentes, fechando os caminhos de fuga do alvo."),
  F.pass("fogo_brasas", "Brasas Persistentes", "♨️", "Brasa", 1, 2, ["fogo_flor_fenix"], 8, 8, "Passiva: todo acerto seu de Fogo aplica 1 acúmulo de Queimadura a mais."),
  F.pass("fogo_combustao", "Combustão", "💥", "Brasa", 1, 3, ["fogo_brasas"], 15, 12, "Passiva: a Queimadura explode com 4 acúmulos em vez de 5, e a explosão causa 60 de dano em vez de 40."),
  F.jutsu("fogo_dragao", "Fogo do Dragão", "🐉", "B", "Cerco", 0, 4, ["fogo_flor_fenix"], 12, 10, "Lança um jato de fogo em linha reta que deixa um rastro de chamas no caminho. Aplica 3 acúmulos de Queimadura."),
  F.pass("fogo_pavio", "Pavio", "🧨", "Cerco", -1, 4, ["fogo_dragao"], 12, 10, "Passiva: as casas atingidas pelos seus jutsus de Fogo ficam em chamas por 2 rodadas e queimam quem passar por elas."),
  F.jutsu("fogo_cinzas", "Cinzas Ardentes", "🌫️", "A", "Cerco", -1, 5, ["fogo_pavio"], 22, 16, "Solta uma cortina de cinzas que bloqueia a visão e depois detona, aplicando 3 acúmulos de Queimadura em área."),
  F.jutsu("fogo_grande_dragao", "Grande Dragão de Fogo", "🐲", "A", "Conflagração", 0, 6, ["fogo_dragao"], 25, 18, "Um dragão colossal de chamas avança em linha reta, cobrindo o caminho com uma torrente de fogo e iluminando tudo ao redor."),
  F.pass("fogo_folego", "Fôlego do Dragão", "🌬️", "Conflagração", 1, 6, ["fogo_grande_dragao"], 25, 18, "Passiva: seus jutsus de Fogo causam +55% de dano."),
  F.jutsu("fogo_bomba_dragao", "Bomba do Dragão Flamejante", "🔱", "A", "Conflagração", 1, 7, ["fogo_folego"], 28, 20, "Dragão de fogo que se divide em 3 direções e cerca o alvo. Aplica 2 acúmulos de Queimadura."),
  F.jutsu("fogo_corrida", "Corrida de Fogo", "⭕", "B", "Cerco", 0, 8, ["fogo_grande_dragao"], 25, 18, "Um anel de fogo se fecha ao redor do alvo, cercando-o com chamas altas e contínuas que transformam o espaço numa muralha ardente."),
  F.pass("fogo_sopro", "Sopro Eficiente", "💨", "Brasa", 0, 9, ["fogo_corrida"], 25, 18, "Passiva: seus jutsus de Fogo em cone custam 20% menos chakra."),
  F.jutsu("fogo_aniquilador", "Grande Fogo Aniquilador", "🌋", "S", "Ápice", 0, 10, ["fogo_sopro"], 35, 24, "Uma muralha de chamas se espalha em cone gigante, transformando tudo à frente do usuário num mar de fogo e vapor escaldante."),
];

// ---------------------------------------------------------------- TERRA
const T = make("TERRA");
const TERRA: SkillNodeDef[] = [
  T.pass("terra_raiz", "Pele de Pedra", "🪨", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: seus jutsus de Terra causam +30% de dano e, toda vez que você defende, você ganha +1 de Barreira.", true),
  T.jutsu("terra_parede", "Parede de Terra", "🧱", "C", "Muralha", 0, 1, ["terra_raiz"], 5, 4, "Ergue um muro de terra que bloqueia a passagem e a linha de visão dos ataques. Também te dá Barreira."),
  T.pass("terra_firme", "Terreno Firme", "⛰️", "Muralha", -1, 1, ["terra_parede"], 12, 8, "Passiva: os muros, cúpulas e pântanos que você cria duram 1 rodada a mais."),
  T.jutsu("terra_cupula", "Prisão Cúpula de Terra", "🛖", "A", "Muralha", -1, 2, ["terra_firme"], 22, 16, "Fecha o alvo numa cúpula de terra: ele fica preso ao chão e perde chakra a cada turno."),
  T.jutsu("terra_punho", "Punho Rochoso", "👊", "C", "Colosso", 0, 3, ["terra_parede"], 6, 4, "Cobre o punho de pedra e golpeia corpo a corpo. Você ganha Barreira no turno."),
  T.jutsu("terra_clone", "Clone de Terra", "🧍", "B", "Colosso", 1, 3, ["terra_punho"], 12, 8, "Cria um clone de terra que luta ao seu lado e explode em pedras quando morre, ferindo quem está perto."),
  T.pass("terra_barro", "Vínculo de Barro", "🧎", "Colosso", 1, 4, ["terra_clone"], 18, 12, "Passiva: seus clones e invocações nascem com +25% de vida."),
  T.jutsu("terra_decapitacao", "Decapitação Subterrânea", "🕳️", "B", "Aprisionamento", 0, 5, ["terra_punho"], 12, 8, "Você mergulha no solo e puxa o alvo para baixo da terra: ele fica preso ao chão, atordoado e sem poder fugir."),
  T.pass("terra_peso", "Peso da Montanha", "🏔️", "Aprisionamento", -1, 5, ["terra_decapitacao"], 18, 12, "Passiva: seus jutsus de Terra causam +55% de dano, e prender alguém ao chão dura 1 rodada a mais."),
  T.jutsu("terra_pantano", "Pântano do Submundo", "🟫", "A", "Aprisionamento", -1, 6, ["terra_peso"], 25, 18, "Transforma a área num pântano que fica no mapa: quem estiver dentro fica preso ao chão e mais lento."),
  T.jutsu("terra_dragao", "Projétil do Dragão de Terra", "🐉", "B", "Colosso", 0, 7, ["terra_decapitacao"], 12, 10, "Invoca um dragão de terra que cospe projéteis de lama em linha. Deixa o alvo mais lento."),
  T.jutsu("terra_biscoito", "Biscoito de Terra Sepulcral", "🥮", "B", "Terraplanagem", 1, 7, ["terra_dragao"], 15, 12, "O usuário enfia as mãos no solo e arranca um amontoado de terra do tamanho de uma casa, ergue o bloco acima da cabeça e o despeja sobre os alvos."),
  T.jutsu("terra_golem", "Golem Defensor", "🗿", "S", "Ápice", 0, 8, ["terra_dragao"], 35, 24, "O chão se levanta em blocos que se encaixam uns nos outros até um gigante de pedra ficar de pé entre o usuário e o inimigo."),
];

// ---------------------------------------------------------------- ÁGUA
const A = make("AGUA");
const AGUA: SkillNodeDef[] = [
  A.pass("agua_raiz", "Fluxo Constante", "💧", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: seus jutsus de Água custam 15% menos chakra e causam +15% de dano.", true),
  A.jutsu("agua_choro", "Choro Celestial", "🩸", "D", "Lâmina", 0, 1, ["agua_raiz"], 1, 1, "Agulhas de água caem de surpresa sobre o alvo e não podem ser esquivadas. Deixa o alvo levemente Encharcado."),
  A.jutsu("agua_ondas", "Ondas Furiosas", "🌊", "C", "Maré", 0, 2, ["agua_choro"], 5, 4, "Uma massa turbulenta de água avança e se abre à frente do usuário como uma maré violenta."),
  A.jutsu("agua_clone", "Clone de Água", "🌫️", "B", "Névoa", -1, 2, ["agua_ondas"], 12, 8, "A água se ergue e assume uma cópia líquida do usuário, com corpo translúcido e movimentos fluidos."),
  A.pass("agua_correnteza", "Correnteza", "💫", "Maré", 1, 2, ["agua_ondas"], 12, 8, "Passiva: seus empurrões e puxões de Água movem o alvo 1 casa a mais."),
  A.jutsu("agua_prisao", "Prisão de Água", "🫧", "B", "Maré", 1, 3, ["agua_correnteza"], 15, 12, "Prende o alvo dentro de uma esfera de água: ele fica preso ao chão, Encharcado e não consegue fugir."),
  A.jutsu("agua_trombeta", "Trombeta de Água", "🎺", "C", "Corrente", 0, 4, ["agua_ondas"], 6, 4, "Dispara um jato de água pressurizada. Deixa o alvo Encharcado."),
  A.pass("agua_condutora", "Maré Condutora", "⚡", "Corrente", -1, 4, ["agua_trombeta"], 18, 12, "Passiva: seus jutsus de Água causam +25% de dano, e o estado Encharcado que você aplica dura 1 rodada a mais."),
  A.jutsu("agua_cachoeira", "Grande Cachoeira Explosiva", "🏞️", "A", "Corrente", -1, 5, ["agua_condutora"], 25, 18, "Uma parede colossal de água desaba sobre o campo com a força de uma cachoeira liberada de uma só vez."),
  A.jutsu("agua_amarra", "Amarra de Água", "🌀", "C", "Corrente", 0, 6, ["agua_trombeta"], 6, 4, "Tentáculos de água que puxam o alvo para perto de você e o deixam mais lento."),
  A.jutsu("agua_louva", "Louva-a-deus de Água", "🦗", "C", "Lâmina", 1, 6, ["agua_amarra"], 8, 6, "A água escorre pelos braços e endurece em duas lâminas curvas, compridas como as patas dianteiras de um louva-a-deus."),
  A.pass("agua_fio", "Fio d'Água", "🪡", "Lâmina", 1, 7, ["agua_louva"], 18, 12, "Passiva: seus jutsus de Água causam +50% de dano contra alvos Encharcados."),
  A.jutsu("agua_dragao", "Dragão de Água", "🐉", "B", "Corrente", 0, 8, ["agua_amarra"], 12, 10, "Dragão de água em linha reta: empurra o alvo e o deixa Encharcado. É o ataque principal do elemento."),
  A.jutsu("agua_muralha", "Técnica da Muralha de Água", "🛡️", "B", "Defesa", 1, 8, ["agua_louva"], 14, 12, "Uma coluna circular de água se ergue e protege o usuário."),
  A.jutsu("agua_onda", "Grande Onda Explosiva", "🌊", "S", "Ápice", 0, 9, ["agua_dragao"], 35, 24, "Inunda o mapa inteiro: todo o terreno vira água e todos ficam Encharcados. Gasta muito chakra."),
];

// ---------------------------------------------------------------- VENTO
const V = make("VENTO");
const VENTO: SkillNodeDef[] = [
  V.pass("vento_raiz", "Fio de Navalha", "🌪️", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: seus jutsus de Vento causam +30% de dano e cortam 20% da redução de quem bloqueia ou apara.", true),
  V.jutsu("vento_palma", "Palma do Vendaval Violento", "🖐️", "C", "Corte", 0, 1, ["vento_raiz"], 1, 3, "O chakra vira vento entre as palmas e o usuário bate as mãos uma na outra: o ar comprimido escapa de uma vez, numa rajada que sai rasante e violenta."),
  V.jutsu("vento_bestial", "Palma da Onda Bestial", "🌊", "B", "Corte", 1, 1, ["vento_palma"], 12, 10, "Um balançar largo dos braços solta uma onda de chakra afiada, que se abre em leque enquanto avança pelo campo."),
  V.pass("vento_corte", "Corte Profundo", "🩸", "Corte", 1, 2, ["vento_bestial"], 18, 12, "Passiva: seus jutsus de Vento causam +55% de dano, e seu Sangramento dura 1 rodada a mais."),
  V.jutsu("vento_destruicao", "Grande Destruição", "💨", "C", "Vendaval", 0, 3, ["vento_palma"], 5, 5, "O usuário enche o peito e sopra uma parede de ar que varre tudo pela frente, levantando poeira e arrancando o inimigo do lugar onde estava."),
  V.jutsu("vento_danca", "Dança da Dispersão de Flor", "🌸", "B", "Dispersão", 1, 3, ["vento_destruicao"], 12, 10, "Um turbilhão de pétalas sobe em espiral e gira cada vez mais rápido em volta dos alvos, até ninguém enxergar mais nada além do rodopio."),
  V.pass("vento_vacuo", "Vácuo Cortante", "🌀", "Vendaval", -1, 3, ["vento_destruicao"], 18, 12, "Passiva: alvo empurrado contra uma parede ou obstáculo toma +15 de dano de impacto."),
  V.pass("vento_brasa", "Vento em Brasa", "🔥", "Vendaval", -1, 4, ["vento_vacuo"], 18, 12, "Passiva: quando seu vento passa por chamas, ele espalha o fogo: causa dano extra e passa 1 acúmulo de Queimadura para quem estiver ao lado. (Combo Fogo → Vento)"),
  V.jutsu("vento_lamina", "Lâmina de Vento", "🗡️", "B", "Precisão", 0, 5, ["vento_destruicao"], 12, 10, "O ar se afina até virar um fio invisível: não há o que ver chegando, só o corte que já passou."),
  V.jutsu("vento_cortante", "Vento Cortante", "✂️", "B", "Lâmina Fantasma", -1, 5, ["vento_lamina"], 14, 12, "O chakra de vento sai concentrado numa rajada tão afiada e veloz que atravessa a vítima antes de ela conseguir reagir."),
  V.pass("vento_alcance", "Alcance Estendido", "📏", "Precisão", 1, 5, ["vento_lamina"], 18, 12, "Passiva: +2 casas de alcance nos seus jutsus de Vento em linha reta."),
  V.jutsu("vento_pressao", "Pressão Danosa", "🌀", "A", "Precisão", 1, 6, ["vento_alcance"], 22, 16, "Furacão que explode numa área grande e reduz a defesa de todos os atingidos."),
  V.jutsu("vento_vacuo_ondas", "Ondas Consecutivas do Vácuo", "🌬️", "S", "Ápice", 0, 7, ["vento_lamina"], 35, 24, "Dispara várias ondas de vácuo seguidas e atinge vários alvos. É Inevitável. Gasta muito chakra."),
];

// ---------------------------------------------------------------- RAIO
const R = make("RAIO");
const RAIO: SkillNodeDef[] = [
  R.pass("raio_raiz", "Sinapse Acelerada", "⚡", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: você esquiva mais de Ninjutsu e age mais cedo na ordem do turno.", true),
  R.jutsu("raio_esfera", "Esfera de Relâmpago", "🔵", "C", "Descarga", 0, 1, ["raio_raiz"], 1, 3, "Bolas de relâmpago se formam girando em volta das mãos do usuário e saem disparadas uma atrás da outra contra o inimigo."),
  R.jutsu("raio_ataque", "Ataque de Raio", "🔌", "C", "Corrente", -1, 1, ["raio_esfera"], 5, 4, "Dispara um fluxo elétrico contínuo em linha longa que atravessa obstáculos, árvores e fumaça. Pode Atordoar."),
  R.pass("raio_sobrecarga", "Sobrecarga", "🔋", "Descarga", 1, 1, ["raio_esfera"], 12, 10, "Passiva: +20% de chance dos seus jutsus de Raio Atordoarem o alvo."),
  R.jutsu("raio_pilares", "Prisão dos Quatro Pilares", "🏛️", "A", "Descarga", 1, 2, ["raio_sobrecarga"], 22, 16, "Ergue 4 pilares de pedra em volta do alvo e eletrocuta: Atordoamento longo, alvo preso ao chão e sem poder fugir."),
  R.jutsu("raio_clone", "Clone de Raio", "👥", "B", "Descarga", 0, 3, ["raio_esfera"], 12, 8, "Invoca um clone elétrico. Quando é ferido, ele se desfaz numa descarga e Atordoa quem o atacou."),
  R.jutsu("raio_armadura", "Armadura do Ataque Relâmpago", "🛡️", "B", "Tempestade", -1, 3, ["raio_clone"], 12, 10, "O chakra acumulado se solta de uma vez e envolve o corpo inteiro numa casca de eletricidade crepitante, que salta para qualquer metal por perto — corrente, shuriken, fio de aço."),
  R.pass("raio_nuvens", "Nuvens de Tempestade", "⛈️", "Tempestade", -1, 4, ["raio_armadura"], 25, 18, "Passiva: libera o uso do Kirin sem depender de chamas no campo, e alvos Encharcados passam a tomar +75% de dano de Raio."),
  R.jutsu("raio_assassinato", "Assassinato Eletromagnético", "🧲", "B", "Perfuração", 0, 5, ["raio_clone"], 15, 12, "Envia eletricidade através de um condutor (água ou metal): atinge em cadeia todos os alvos Encharcados e os Atordoa com certeza."),
  R.pass("raio_perfurante", "Ponta Perfurante", "📍", "Perfuração", 1, 5, ["raio_assassinato"], 20, 14, "Passiva: seus jutsus de Raio ignoram a Barreira do alvo e causam +25% de dano em quem estiver abaixo de 30% de vida."),
  R.jutsu("raio_pararaios", "Para-Raios", "🗼", "A", "Perfuração", 1, 6, ["raio_perfurante"], 22, 16, "Você ergue o braço e descarrega um raio que percorre o seu corpo até o alvo em um único impacto."),
  R.jutsu("raio_kirin", "Kirin", "🌩️", "S", "Ápice", 0, 7, ["raio_assassinato"], 35, 24, "Guia um raio de verdade das nuvens de tempestade: causa dano enorme em área e é Inevitável. Precisa de nuvens de tempestade (criadas por jutsus de Fogo) e só pode ser usado 1 vez por combate."),
];

// ---------------------------------------------------------------- CRISTAL (KG)
// Kekkei genkai: nao e' sorteado, so entra via /admin. Arvore mais cara em
// nivel/Ninjutsu que as basicas (a linhagem cobra caro) e com dano ~2.03x em
// vez de ~2.015x. O tronco desce montando o plano de controle: cravar cristal
// ate o casulo FECHAR. Os dois ramos sao as duas leituras do cristal —
// Faceta corta (dano/indefensavel), Prisma refrata (defesa/luz).
const C = make("CRISTAL");
const CRISTAL: SkillNodeDef[] = [
  C.pass("cristal_raiz", "Estrutura Cristalina", "💎", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Cristal causam +35% de dano.", true),
  C.jutsu("cristal_shuriken", "Shuriken de Cristal", "❇️", "C", "Agulha", 0, 1, ["cristal_raiz"], 1, 4, "Lança agulhas de cristal afiadas em linha. Ao acertar, os cristais se fixam no corpo do alvo (Cristalizado) e podem prendê-lo no lugar."),
  C.jutsu("cristal_espinhos", "Espinhos Crescentes de Cristal", "🌵", "B", "Agulha", -1, 1, ["cristal_shuriken"], 8, 8, "Faz espinhos de cristal crescerem continuamente na direção do alvo. Cravam 1 acúmulo de Cristalizado e deixam o caminho bloqueado."),
  C.pass("cristal_estilhaco", "Faceta Cortante", "🔷", "Agulha", -1, 2, ["cristal_espinhos"], 14, 12, "Passiva: cada acerto seu de Cristal crava 1 acúmulo de Cristalizado a mais. Na prática, o casulo fecha em 2 golpes em vez de 4."),
  C.jutsu("cristal_prisao", "Prisão Cristal de Jade", "⛓️", "B", "Casulo", 0, 3, ["cristal_shuriken"], 10, 10, "Envolve o adversário em cristais: crava 2 acúmulos, prende no lugar e impede a fuga. Só funciona em uma única vítima."),
  C.jutsu("cristal_clone", "Clone Cristal de Jade", "🪞", "B", "Espelho", 1, 3, ["cristal_prisao"], 12, 10, "Ergue um espelho hexagonal de cristal que reflete sua imagem e cria um clone. Ao ser destruído, ele se despedaça e crava cristais em quem estiver ao lado."),
  C.jutsu("cristal_barragem", "Barragem de Cristais de Jade", "💠", "B", "Casulo", 0, 4, ["cristal_prisao"], 15, 12, "Dispara uma enxurrada de cristais resistentes em linha reta. Os estilhaços rasgam o alvo e o deixam Sangrando."),
  C.pass("cristal_rede", "Rede Cristalina", "🕸️", "Espelho", 1, 4, ["cristal_clone"], 18, 14, "Passiva: as paredes e prisões de cristal que você cria duram 1 rodada a mais, e o seu Cristalizado também."),
  C.jutsu("cristal_danca", "Dança Selvagem da Shuriken Hexagonal", "🌟", "A", "Faceta", -1, 5, ["cristal_estilhaco"], 22, 18, "Dispara uma nuvem de shurikens hexagonais contra vários inimigos de uma vez. São tantas que não há como desviar."),
  C.jutsu("cristal_shuriken_gigante", "Shuriken Gigante Hexagonal", "❄️", "A", "Faceta", -1, 6, ["cristal_danca"], 26, 20, "Forma uma shuriken imensa com o desenho de um floco de neve e a arremessa. É Inevitável e corta tudo na linha."),
  C.jutsu("cristal_dragao", "Dragão Cadente do Cristal Destruidor", "🐉", "A", "Casulo", 0, 5, ["cristal_barragem"], 25, 20, "Cristaliza a matéria da área e a molda num dragão. Ele cristaliza o chakra de quem atinge: os alvos ficam sem poder usar Ninjutsu por 2 rodadas."),
  C.pass("cristal_refracao", "Refração", "🔮", "Prisma", 1, 5, ["cristal_rede"], 22, 16, "Passiva: a luz presa nas facetas atrapalha a mira de quem lança Ninjutsu em você. Ganha 8 pontos percentuais de esquiva contra Ninjutsu."),
  C.jutsu("cristal_fio_luz", "Fio de Luz", "🌈", "A", "Prisma", 1, 6, ["cristal_refracao"], 28, 22, "Forma um prisma de luz ao seu redor. Por 2 rodadas o Ninjutsu recebido cai 60% e parte volta no atacante. Em troca, você fica totalmente imóvel e o corpo a corpo passa inteiro."),
  C.pass("cristal_faceta", "Faceta Perfeita", "✨", "Ápice", 0, 6, ["cristal_dragao"], 30, 22, "Passiva: seus jutsus de Cristal causam +50% de dano."),
  C.jutsu("cristal_oito_paredes", "Oito Paredes de Cristal de Jade", "🏯", "S", "Ápice", 0, 7, ["cristal_faceta"], 38, 28, "Fecha uma área imensa em oito paredes de cristal. Crava 3 acúmulos de Cristalizado em todos os atingidos, o bastante para selar quem já tiver um cristal no corpo. Gasta quase todo o chakra."),
];

// ----------------------------------------------------------------- VAPOR (KG)
// Kekkei genkai: nao e' sorteado, so entra via /admin, igual Cristal. Arvore
// Arvore com os 3 jutsus oficiais de Vapor — raiz (1,35x) +
// ápice (1,50x) = 2,025x, idêntico — custando um pouco menos (52 PN contra
// 62 do Cristal). As passivas de dano vem so das duas (raiz+apice); as
// outras tres sao utilidade pura, espalhadas pela arvore (nao mais tudo
// numa raiz so). Identidade mantida: Corrosao derrete a Barreira do alvo.
const VP = make("VAPOR");
const VAPOR: SkillNodeDef[] = [
  VP.pass("vapor_raiz", "Ponto de Ebulição", "♨️", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Vapor causam +35% de dano.", true),
  VP.jutsu("vapor_nevoa", "Névoa Qualificada", "☁️", "C", "Névoa", 0, 1, ["vapor_raiz"], 1, 4, "Cria uma nuvem de névoa extremamente corrosiva e a libera pela boca. Derrete o que atinge, cravando Corrosão em todos os alvos na área."),
  VP.jutsu("vapor_punho", "Punho em Propulsão", "👊", "B", "Propulsão", 0, 2, ["vapor_nevoa"], 9, 9, "Usa o estilo de Ebulição para se propulsionar num soco à queima-roupa, misturando ninjutsu com taijutsu. O vapor residual do impacto pode cravar Corrosão."),
  VP.pass("vapor_condensacao", "Condensação", "💧", "Névoa", 1, 3, ["vapor_nevoa"], 13, 11, "Passiva: a Corrosão que você aplica dura 1 rodada a mais."),
  VP.jutsu("vapor_chute", "Chute em Propulsão", "🦵", "A", "Propulsão", 0, 4, ["vapor_punho"], 16, 15, "Versão aprimorada do Punho em Propulsão: mais velocidade e poder de impacto usando a força das pernas junto da propulsão do estilo Ebulição. Crava Corrosão com força total."),
  VP.pass("vapor_pressurizacao", "Pressurização", "🌡️", "Propulsão", -1, 4, ["vapor_punho"], 14, 12, "Passiva: seus golpes corpo a corpo de Vapor custam 15% menos chakra."),
  VP.pass("vapor_instinto_termal", "Instinto Térmico", "🔥", "Propulsão", -1, 5, ["vapor_pressurizacao"], 20, 16, "Passiva: seus golpes de Vapor perfuram 20% da redução de quem bloqueia ou apara."),
  VP.pass("vapor_ebulicao_total", "Ebulição Total", "♨️", "Ápice", 0, 6, ["vapor_chute"], 30, 22, "Passiva: seus jutsus de Vapor causam +50% de dano."),
];

// ----------------------------------------------------------------- CALOR (KG)
// Kekkei genkai, mesmo nivel do Vapor/Cristal agora: arvore expandida (13 nos)
// com raiz (1,35x) + ápice (1,50x) = 2,025x, idêntico ao Cristal, custando
// um pouco menos (52 PN). Passivas de dano so nas duas pontas; as outras
// tres sao utilidade, espalhadas pela arvore. Identidade mantida:
// Desidratacao corta TODO o dano que o alvo causa (nao so TAI/BUKI).
const CL = make("CALOR");
const CALOR: SkillNodeDef[] = [
  CL.pass("calor_raiz", "Ebulição Corporal", "🔥", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Calor causam +35% de dano.", true),
  CL.jutsu("calor_disparo", "Disparo das Bolas de Calor", "🔴", "C", "Calor", 0, 1, ["calor_raiz"], 1, 4, "Dispara quatro esferas de calor extremo contra a área do oponente. Quem é atingido desidrata e fica fraco."),
  CL.jutsu("calor_esfera", "Esfera de Calor", "🟠", "B", "Calor", 0, 2, ["calor_disparo"], 9, 9, "Uma única esfera de calor que suga a água do corpo do alvo ao acertar, evaporando qualquer Encharcado nele e deixando-o desidratado e fraco."),
  CL.pass("calor_ressecamento", "Ressecamento", "🏜️", "Calor", 1, 3, ["calor_disparo"], 13, 11, "Passiva: a Desidratação que você aplica dura 1 rodada a mais."),
  CL.jutsu("calor_assassinato", "Assassinato de Calor Extremo", "☀️", "A", "Miragem", 0, 4, ["calor_esfera"], 16, 15, "Envolve a área ao redor do alvo num calor imenso, causando queimaduras graves em todos que estiverem perto."),
  CL.pass("calor_ondas_termicas", "Ondas Térmicas", "🌫️", "Calor", -1, 4, ["calor_esfera"], 14, 12, "Passiva: seus jutsus de Calor em área custam 15% menos chakra."),
  CL.pass("calor_pele_rachada", "Pele Rachada", "🏔️", "Calor", -1, 5, ["calor_ondas_termicas"], 20, 16, "Passiva: seus jutsus de Calor perfuram 20% da redução de quem bloqueia ou apara."),
  CL.pass("calor_combustao_interna", "Combustão Interna", "🔥", "Ápice", 0, 6, ["calor_assassinato"], 30, 22, "Passiva: seus jutsus de Calor causam +50% de dano."),
];

// ----------------------------------------------------------------- LAVA (KG)
// Kekkei genkai no MESMO nivel do Cristal agora (pedido explicito do
// usuario: as arvores de Lava/Explosao/Vapor/Calor devem empatar ou ficar
// so um pouco abaixo do custo do Cristal, no mesmo patamar de dano). Arvore
// expandida (13 nós): raiz (1,35x) + Coração do Vulcão (1,50x) = 2,025x,
// identico ao Cristal, custando um pouco menos (52 PN contra 62). Passivas
// de dano so nas duas pontas; as outras tres sao utilidade, espalhadas pela
// arvore em vez de concentradas. Identidade mantida: Magma acumula e
// endurece (ROOT), sem Atordoar como o Cristal.
const LV = make("LAVA");
const LAVA: SkillNodeDef[] = [
  LV.pass("lava_raiz", "Núcleo Magmático", "🌋", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Lava causam +35% de dano.", true),
  LV.jutsu("lava_balas", "Técnica das Balas de Lava", "🔴", "C", "Lava", 0, 1, ["lava_raiz"], 1, 4, "Dispara vários resquícios de lava em sequência contra o alvo, cravando Magma a cada acerto."),
  LV.jutsu("lava_solucao", "Técnica da Cobertura de Lava", "🌋", "B", "Lava", 0, 2, ["lava_balas"], 9, 9, "Libera um grande arco de lava pela boca, que desaba de cima para baixo sobre a área do alvo, cravando Magma em todos atingidos."),
  LV.pass("lava_calor_residual", "Calor Residual", "♨️", "Lava", 1, 3, ["lava_balas"], 13, 11, "Passiva: o Magma que você aplica dura 1 rodada a mais."),
  LV.jutsu("lava_rio", "Rio de Rochas Flamejantes", "🪨", "A", "Vulcão", 0, 4, ["lava_solucao"], 16, 15, "Expele um rio de lava que se solidifica em múltiplos pedregulhos disparados com força tremenda, empurrando o alvo e cravando Magma."),
  LV.pass("lava_crosta", "Crosta Endurecida", "🧱", "Lava", -1, 4, ["lava_solucao"], 14, 12, "Passiva: seus jutsus de Lava em linha reta custam 15% menos chakra."),
  LV.pass("lava_pele_basaltica", "Pele Basáltica", "🪨", "Lava", -1, 5, ["lava_crosta"], 20, 16, "Passiva: seus jutsus de Lava perfuram 20% da redução de quem bloqueia ou apara."),
  LV.pass("lava_apice", "Coração do Vulcão", "🔥", "Ápice", 0, 6, ["lava_rio"], 30, 22, "Passiva: seus jutsus de Lava causam +50% de dano."),
  LV.jutsu("lava_huaguo", "Monte Huaguo", "🌺", "S", "Ápice", 0, 7, ["lava_apice"], 38, 28, "Cria um pequeno vulcão que explode violentamente, espalhando rocha derretida em todas as direções como uma flor gigante — o bastante para endurecer na hora qualquer Magma já acumulado no alvo."),
];

// -------------------------------------------------------------- EXPLOSAO (KG)
// Mesmo nivel do Lava/Cristal agora (pedido explicito do usuario). Arvore
// expandida (13 nós): raiz (1,35x) + Estilo Explosão Pleno (1,50x) = 2,025x,
// identico ao Cristal, custando um pouco menos (52 PN contra 62). Passivas
// de dano so nas duas pontas; as outras tres sao utilidade, espalhadas pela
// arvore. A ordem de rank continua NAO seguindo a ordem em que o usuario
// mandou as tecnicas originais — Cortina de Fumaca (utilidade, sem dano)
// fica B, e Punho de Mina Terrestre (a explosao "enorme") e' o apice S.
const EX = make("EXPLOSAO");
const EXPLOSAO: SkillNodeDef[] = [
  EX.pass("explosao_raiz", "Núcleo Detonante", "💣", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Explosão causam +35% de dano.", true),
  EX.jutsu("explosao_defensiva", "Técnica da Explosão Defensiva", "🖐️", "C", "Explosão", 0, 1, ["explosao_raiz"], 1, 4, "Cria uma pequena explosão na palma da mão para se defender. Contra um projétil como uma kunai, apara e redireciona o golpe de volta contra quem o arremessou; contra qualquer outro ataque, funciona como um aparo comum."),
  EX.jutsu("explosao_cortina", "Técnica da Explosão: Cortina de Fumaça", "💨", "B", "Explosão", 0, 2, ["explosao_defensiva"], 9, 9, "Produz uma cortina de fumaça, como uma bomba de fumaça, obstruindo a visão inimiga e ocultando seus movimentos."),
  EX.pass("explosao_polvora", "Pólvora Refinada", "⚫", "Explosão", 1, 3, ["explosao_defensiva"], 13, 11, "Passiva: seus jutsus de Explosão têm 15 pontos percentuais a mais de chance de plantar Minado."),
  EX.jutsu("explosao_impacto", "Técnica da Explosão: Impacto", "👊", "A", "Onda de Choque", 0, 4, ["explosao_cortina"], 16, 15, "Desfere um soco no solo e libera chakra explosivo numa onda de choque, lançando detritos que ferem os oponentes na área e os deixam sem equilíbrio."),
  EX.pass("explosao_fragmentacao", "Fragmentação", "💢", "Explosão", -1, 4, ["explosao_cortina"], 14, 12, "Passiva: seus jutsus de Explosão em área custam 15% menos chakra."),
  EX.pass("explosao_blindagem", "Blindagem Explosiva", "🛡️", "Explosão", -1, 5, ["explosao_fragmentacao"], 20, 16, "Passiva: o dano dos seus jutsus de Explosão ignora a Barreira do alvo."),
  EX.pass("explosao_apice", "Estilo Explosão Pleno", "🔥", "Ápice", 0, 6, ["explosao_impacto"], 30, 22, "Passiva: seus jutsus de Explosão causam +50% de dano."),
  EX.jutsu("explosao_mina", "Técnica do Punho de Mina Terrestre", "⛏️", "S", "Ápice", 0, 7, ["explosao_apice"], 38, 28, "Usa o Estilo Explosão para plantar uma carga no ponto de contato físico. O golpe inicial já dói, mas duas rodadas depois uma explosão enorme detona no local."),
];

// -------------------------------------------------------------- POEIRA (KG)
// Jinton: o kekkei genkai MAIS FORTE do jogo (pedido explicito do usuario).
// Efeito exclusivo: Desintegracao (DISINTEGRATION, ver config/enums.ts e
// services/combat/effects.ts) — combina os dois payoffs que os outros KKG
// batem separado (corroi Barreira por turno como Vapor/Corrosao E acumula
// ate um gatilho como Cristal/Lava), mas o gatilho nao Atordoa/Enraiza: ele
// COLAPSA a defesa por completo (zera toda a Barreira restante de uma vez +
// Defesa Reduzida). Teto de dano 1.40 * 1.55 = 2.17x (poeira_raiz + apice em
// element-trees/passives.ts), ACIMA do 2.025 padrao dos outros KKG.
//
// As 4 tecnicas pedidas viram os 4 nos de JUTSU. Pedido explicito: a arvore
// NAO abre com a passiva de dano (diferente de todo outro elemento/cla) — o
// primeiro no' e' o proprio jutsu rank C (Desprendimento base), e a passiva
// generica de dano ("Nucleo do Mundo Primitivo") fica logo depois dele, no
// meio do tronco. Dali em diante e' o mesmo padrao Aburame/Hyuuga de
// ramo-e-convergencia ate o apice:
//   Desprendimento do Mundo Primitivo (base, RADIUS): a esfera se expande,
//     prende (ROOT) e explode — dano em area.
//   Pilar (LINE, undodgeable): a mesma tecnica esticada da mao ate o alvo —
//     feixe direto, dificil de esquivar por ser instantaneo.
//   Cônica (CONE, alcance maior): a mesma tecnica em area bem mais ampla.
//   Projéteis (SINGLE_TARGET, unguardable): barragem de projeteis pequenos —
//     Bloqueio/Aparo nao adianta (a propria desintegracao "passa por cima"),
//     so' Esquiva continua valendo (dificil por causa da velocidade).
// Ver as Abilities reais em data/jutsus/elemental.ts (familia "jinton_*") e
// a ponte de id em NODE_ABILITY, mais abaixo.
const PO = make("POEIRA");
const POEIRA: SkillNodeDef[] = [
  PO.jutsu("poeira_desprendimento", "Desprendimento do Mundo Primitivo", "⚪", "C", "Colapso", 0, 0, [], 1, 4, "A estrutura se expande rapidamente em tamanho ao ser impulsionada contra o alvo, prendendo-o — a esfera então explode com uma força tremenda, desintegrando o que estiver por perto."),
  PO.pass("poeira_raiz", "Núcleo do Mundo Primitivo", "🌫️", "Colapso", 0, 1, ["poeira_desprendimento"], 5, 7, "Passiva sempre ativa: todos os seus jutsus de Poeira causam +40% de dano.", false),
  PO.jutsu("poeira_pilar", "Desprendimento do Mundo Primitivo: Pilar", "➡️", "B", "Colapso", 0, 2, ["poeira_raiz"], 11, 11, "Variação da técnica padrão: a esfera se estende diretamente da mão do usuário até o oponente, um feixe contínuo rápido demais para desviar."),
  PO.pass("poeira_estilhaco", "Fragmentação Progressiva", "💠", "Colapso", -1, 3, ["poeira_pilar"], 16, 14, "Passiva: cada acerto seu de Poeira crava 1 acúmulo de Desintegração a mais, acelerando o colapso da defesa do alvo."),
  PO.pass("poeira_erosao", "Erosão Absoluta", "🧪", "Colapso", 1, 3, ["poeira_pilar"], 16, 14, "Passiva: seus jutsus de Poeira perfuram 25% da redução de quem bloqueia ou apara."),
  PO.jutsu("poeira_conica", "Desprendimento do Mundo Primitivo: Cônica", "📐", "A", "Colapso", -1, 4, ["poeira_estilhaco"], 24, 20, "Variação em formato de cone da técnica padrão, cobrindo uma área muito mais ampla."),
  PO.jutsu("poeira_projeteis", "Desprendimento do Mundo Primitivo: Projéteis", "✴️", "A", "Colapso", 1, 4, ["poeira_erosao"], 26, 21, "Lança pequenos projéteis da técnica consecutivamente contra o alvo, desintegrando proporcionalmente o que tocam. Defender é impossível, e a velocidade extrema torna a esquiva muito difícil."),
  PO.pass("poeira_apice", "Vazio Absoluto", "🕳️", "Ápice", 0, 5, ["poeira_conica", "poeira_projeteis"], 34, 28, "Passiva: seus jutsus de Poeira causam +55% de dano — nada resiste ao Poeira."),
];

// ---------------------------------------------------------------- GELO (KG)
// Hyoton: ex-arvore de clã do Yuki, migrada pra kekkei genkai de verdade
// (pedido explicito do usuario) — mesmos ids de sempre com o prefixo trocado
// de yuki_* pra gelo_* (evita colisão com os novos nós do clã Yuki
// reconstruido, ver clan-trees/index.ts), mesma forma de árvore (tronco +
// ramo de defesa isolado Domo/Reflexos, igual Hoshigaki/Hozuki). Balanceado
// no MESMO nível de Vapor/Calor/Lava: raiz 1.35x + ápice 1.50x = 2.025x — a
// raiz e o ápice agora são dano PURO (formato padrão dos outros KKG); o
// desconto de custo que estava na raiz foi pra Reflexos Gélidos, e o bônus
// de Defesa Reduzida/Lentidão que estava no ápice ficou só na Presença
// Silenciosa.
const GL = make("GELO");
const GELO: SkillNodeDef[] = [
  GL.pass("gelo_raiz", "Sangue de Gelo", "❄️", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: todos os seus jutsus de Gelo causam +35% de dano.", true),
  GL.jutsu("gelo_agulhas", "Agulhas de Gelo", "🧊", "C", "Gelo", 0, 1, ["gelo_raiz"], 4, 4, "Congela a umidade do ar em agulhas afiadas e as dispara em linha reta contra o alvo, cortando fundo."),
  GL.jutsu("gelo_espelho", "Espelho Demoníaco de Gelo Fino", "🪞", "B", "Gelo", 0, 2, ["gelo_agulhas"], 9, 8, "Cria um único espelho de gelo fino e ataca de dentro dele com agulhas em vários ângulos ao mesmo tempo. O alvo, distraído tentando achar de onde vem o golpe, baixa a guarda."),
  GL.jutsu("gelo_domo", "Domo de Iceberg", "🏔️", "B", "Defesa", 1, 2, ["gelo_agulhas"], 9, 8, "A umidade do ar congela num estalo e sobe em placas que se fecham por cima, trancando o usuário e quem estiver ao lado dele sob uma abóbada de gelo."),
  GL.pass("gelo_presenca", "Presença Silenciosa", "🌫️", "Gelo", 0, 3, ["gelo_espelho"], 13, 11, "Passiva sempre ativa: os espelhos e reflexos gélidos confundem qualquer um. Seus jutsus de Gelo têm +15 pontos percentuais de chance de deixar o alvo com a guarda baixa (Defesa Reduzida), e a Lentidão que você aplica dura 1 rodada a mais."),
  GL.pass("gelo_reflexos", "Reflexos Gélidos", "💠", "Defesa", 1, 3, ["gelo_domo"], 13, 11, "Passiva sempre ativa: anos refletindo o próprio corpo no gelo afiam os reflexos. +8 pontos percentuais de esquiva contra qualquer jutsu de Ninjutsu, e seus jutsus de Gelo custam 10% menos chakra."),
  GL.jutsu("gelo_chuva_agulhas", "Chuva de Agulhas Geladas", "🌨️", "A", "Gelo", 0, 4, ["gelo_presenca"], 18, 15, "Multiplica os espelhos e enche a área de agulhas de gelo caindo de todos os ângulos, deixando quem for atingido mais lento pelo frio nos ferimentos."),
  GL.pass("gelo_apice", "Domínio do Espelho de Gelo", "🔷", "Ápice", 0, 5, ["gelo_chuva_agulhas"], 24, 19, "Passiva: o domínio total da técnica do espelho chega ao ápice. Seus jutsus de Gelo causam +50% de dano."),
  GL.jutsu("gelo_agulhas_mil", "Mil Agulhas Voadoras de Água da Morte", "❄️", "S", "Ápice", 0, 6, ["gelo_apice"], 30, 24, "Produz mil agulhas de gelo afiadas e longas, mira num único alvo específico e as lança todas de uma vez em altíssima velocidade. Rápido demais pra esquivar."),
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
  POEIRA,
  GELO,
};

// FUNDAMENTOS e as arvores de CLA (CLAN_TREES, ex: Nara) nao entram em
// ELEMENT_TREES (nao pertencem a nenhum elemento), mas entram no indice
// global — e' aqui que getNode/allNodes/buyNode as acham.
const NODE_INDEX: Map<string, SkillNodeDef> = new Map(
  [...Object.values(ELEMENT_TREES).flat(), ...FUNDAMENTOS, ...BUKIJUTSU_TREE, ...IRYO_NINJUTSU_TREE, ...GENJUTSU_TREE, ...FUINJUTSU_TREE, ...TAIJUTSU_TREE, ...ARHAT_TREE, ...ADAMANTINO_TREE, ...TAIJUTSU_PASSIVES_TREE, ...ASSASSINATO_NINJA_TREE, ...TAIJUTSU_AGITACAO_TREE, ...Object.values(CLAN_TREES).flat()].map((n) => [
    n.id,
    n,
  ]),
);

// Ícones PNG por nó (public/assets/icons/<subpasta>). Ausente = usa o emoji do nó.
// A subpasta de árvore de clã tem o mesmo nome do clanId (nara/, hyuuga/...),
// igual as elementais usam o nome do elemento.
const NODE_ICONS: Record<string, string> = {
  // ---- Bukijutsu ----
  buki_fundamentos: "bukijutsu/fundamentos-de-bukijutsu.png",
  buki_manipulacao_fios: "bukijutsu/manipulacao-de-fios.png",
  buki_arsenal_selado: "bukijutsu/arsenal-selado.png",
  buki_lamina_chakra: "bukijutsu/lamina-de-chakra.png",
  buki_moinho: "bukijutsu/moinho-de-vento-laminas-triplas.png",
  buki_dragoes_gemeos: "bukijutsu/dragoes-gemeos-ascendentes.png",
  buki_afinidade_lamina: "bukijutsu/afinidade-na-lamina.png",
  buki_voo_andorinha: "bukijutsu/voo-da-andorinha.png",
  buki_maestria_arremesso: "bukijutsu/maestria-de-arremesso.png",
  buki_resma_explosiva: "bukijutsu/resma-de-amuletos-explosivos.png",
  buki_meteoro_anexado: "bukijutsu/meteoro-anexado.png",
  buki_clone_shuriken: "bukijutsu/clone-da-sombra-de-shuriken.png",
  buki_esfera_explosiva: "bukijutsu/esfera-explosiva.png",
  buki_cadeia_desastre: "bukijutsu/cadeia-do-desastre-celestial.png",
  buki_camara_tortura: "bukijutsu/camara-de-tortura.png",

  // ---- Vapor (Ebulição) ----
  vapor_raiz: "vapor/ponto-de-ebulicao.png",
  vapor_nevoa: "vapor/nevoa-qualificada.png",
  vapor_punho: "vapor/punho-em-propulsao.png",
  vapor_condensacao: "vapor/condensacao.png",
  vapor_chute: "vapor/chute-em-propulsao.png",
  vapor_pressurizacao: "vapor/pressurizacao.png",
  vapor_instinto_termal: "vapor/instinto-termico.png",
  vapor_ebulicao_total: "vapor/ebulicao-total.png",

  // ---- Cristal (Shōton) ----
  cristal_raiz: "cristal/estrutura-cristalina.png",
  cristal_shuriken: "cristal/shuriken-de-cristal.png",
  cristal_espinhos: "cristal/espinhos-crescentes.png",
  cristal_estilhaco: "cristal/faceta-cortante.png",
  cristal_prisao: "cristal/prisao-cristal-jade.png",
  cristal_clone: "cristal/clone-cristal-jade.png",
  cristal_barragem: "cristal/barragem-cristais-jade.png",
  cristal_rede: "cristal/rede-cristalina.png",
  cristal_danca: "cristal/danca-shuriken-hexagonal.png",
  cristal_shuriken_gigante: "cristal/shuriken-gigante-hexagonal.png",
  cristal_dragao: "cristal/dragao-cadente-cristal.png",
  cristal_refracao: "cristal/refracao.png",
  cristal_fio_luz: "cristal/fio-de-luz.png",
  cristal_faceta: "cristal/faceta-perfeita.png",
  cristal_oito_paredes: "cristal/oito-paredes-cristal-jade.png",

  // ---- Calor (Shakuton) ----
  calor_raiz: "calor/ebulicao-corporal.png",
  calor_disparo: "calor/disparo-bolas-calor.png",
  calor_esfera: "calor/esfera-calor.png",
  calor_ressecamento: "calor/ressecamento.png",
  calor_assassinato: "calor/assassinato-calor-extremo.png",
  calor_ondas_termicas: "calor/ondas-termicas.png",
  calor_pele_rachada: "calor/pele-rachada.png",
  calor_combustao_interna: "calor/combustao-interna.png",

  // ---- Lava (Yōton) ----
  lava_raiz: "lava/nucleo-magmatico.png",
  lava_balas: "lava/balas-de-lava.png",
  lava_solucao: "lava/cobertura-de-lava.png",
  lava_calor_residual: "lava/calor-residual.png",
  lava_rio: "lava/rio-de-rochas-flamejantes.png",
  lava_crosta: "lava/crosta-endurecida.png",
  lava_pele_basaltica: "lava/pele-basaltica.png",
  lava_apice: "lava/coracao-do-vulcao.png",
  lava_huaguo: "lava/monte-huaguo.png",

  // ---- Explosão (Bakuton) ----
  explosao_raiz: "explosao/nucleo-detonante.png",
  explosao_defensiva: "explosao/explosao-defensiva.png",
  explosao_cortina: "explosao/cortina-de-fumaca.png",
  explosao_polvora: "explosao/polvora-refinada.png",
  explosao_impacto: "explosao/explosao-impacto.png",
  explosao_fragmentacao: "explosao/fragmentacao.png",
  explosao_blindagem: "explosao/blindagem-explosiva.png",
  explosao_apice: "explosao/estilo-explosao-pleno.png",
  explosao_mina: "explosao/punho-de-mina-terrestre.png",

  // ---- Poeira (Jinton) ----
  poeira_desprendimento: "poeira/desprendimento-do-mundo-primitivo.png",
  poeira_raiz: "poeira/nucleo-do-mundo-primitivo.png",
  poeira_pilar: "poeira/desprendimento-do-mundo-primitivo-pilar.png",
  poeira_estilhaco: "poeira/fragmentacao-progressiva.png",
  poeira_erosao: "poeira/erosao-absoluta.png",
  poeira_conica: "poeira/desprendimento-do-mundo-primitivo-conica.png",
  poeira_projeteis: "poeira/desprendimento-do-mundo-primitivo-projeteis.png",
  poeira_apice: "poeira/vazio-absoluto.png",

  // ---- clãs ----
  uchiha_sharingan_1_tomoe: "uchiha/sharingan-1-tomoe.png",
  uchiha_controle_ocular: "uchiha/controle-ocular.png",
  uchiha_sharingan_2_tomoe: "uchiha/sharingan-2-tomoe.png",
  uchiha_economia_visual: "uchiha/economia-visual.png",
  uchiha_sharingan_3_tomoe: "uchiha/sharingan-3-tomoe.png",
  uchiha_mangekyo_sharingan: "uchiha/mangekyo-sharingan.png",

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

  gelo_raiz: "gelo/sangue-de-gelo.png",
  gelo_agulhas: "gelo/agulhas-de-gelo.png",
  gelo_espelho: "gelo/espelho-demoniaco-de-gelo-fino.png",
  gelo_domo: "gelo/domo-de-iceberg.png",
  gelo_presenca: "gelo/presenca-silenciosa.png",
  gelo_reflexos: "gelo/reflexos-gelidos.png",
  gelo_chuva_agulhas: "gelo/chuva-de-agulhas-geladas.png",
  gelo_apice: "gelo/dominio-do-espelho-de-gelo.png",
  gelo_agulhas_mil: "gelo/mil-agulhas-voadoras.png",

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
  hozuki_braco_agua: "hozuki/grande-braco-de-agua.png?v=20260729",
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

  kamaitachi_raiz: "kamaitachi/fio-do-leque.png",
  kamaitachi_foice: "kamaitachi/foice-da-doninha.png",
  kamaitachi_grande_foice: "kamaitachi/grande-foice-da-doninha.png",
  kamaitachi_corte_profundo: "kamaitachi/corte-profundo.png",
  kamaitachi_rede: "kamaitachi/lancamento-da-rede.png",
  kamaitachi_lamina_viva: "kamaitachi/lamina-viva.png",
  kamaitachi_apice: "kamaitachi/dominio-da-foice.png",
  kamaitachi_decapitacao: "kamaitachi/danca-da-decapitacao-rapida.png",

  yamanaka_raiz: "yamanaka/sintonia-mental.png",
  yamanaka_destruicao_mente: "yamanaka/tecnica-de-destruicao-de-mente.png",
  yamanaka_shintenshin: "yamanaka/tecnica-de-transferencia-de-mente.png",
  yamanaka_transmissao_mentes: "yamanaka/tecnica-de-transmissao-de-mentes.png",
  yamanaka_dominio_mental: "yamanaka/dominio-mental.png",
  yamanaka_elo_telepatico: "yamanaka/elo-telepatico.png",
  yamanaka_apice: "yamanaka/dominio-da-mente.png",
  yamanaka_clones_shintenshin: "yamanaka/tecnicas-dos-clones-de-transferencia-de-mente.png",

  raikage_raiz: "raikage/sangue-de-raikage.png",
  raikage_deslocamento: "raikage/deslocamento-instantaneo-do-estilo-raio.png",
  raikage_armadura: "raikage/armadura-de-raio.png",
  raikage_relampago_reto: "raikage/relampago-reto.png",
  raikage_lariat: "raikage/lariat.png",
  raikage_guilhotina: "raikage/queda-da-guilhotina.png",
  raikage_corte_horizontal: "raikage/corte-horizontal-de-relampago-violento.png",
  raikage_apice: "raikage/furia-do-raikage.png",
  raikage_bomba_liger: "raikage/bomba-liger.png",

  kamizuru_raiz: "kamizuru/colonia-de-iwa.png",
  kamizuru_abelha_gigante: "kamizuru/tecnica-de-invocacao-abelha-gigante.png",
  kamizuru_abelha_mel: "kamizuru/tecnica-da-abelha-do-mel.png",
  kamizuru_bomba_abelha: "kamizuru/bomba-de-abelha.png",
  kamizuru_colmeia_rocha: "kamizuru/colmeia-de-rocha.png",
  kamizuru_mil_ferroes: "kamizuru/mil-ferroes-de-abelha.png",
  kamizuru_apice: "kamizuru/enxame-completo.png",

  akimichi_raiz: "akimichi/fartura-do-cla.png",
  akimichi_baika_parcial: "akimichi/tecnica-do-tamanho-multiplo-parcial.png",
  akimichi_baika: "akimichi/tecnica-do-tamanho-multiplo.png",
  akimichi_tanque: "akimichi/tanque-da-bala-humana.png",
  akimichi_super_baika: "akimichi/tecnica-do-super-tamanho-multiplo.png",
  akimichi_conversao_calorica: "akimichi/conversao-calorica.png",
  akimichi_mergulho: "akimichi/mergulho-gordinho.png",
  akimichi_bofetada: "akimichi/super-bofetada.png",
  akimichi_modo_borboleta: "akimichi/modo-borboleta.png",
  akimichi_bombardeio: "akimichi/bombardeio-da-borboleta.png",

  arhat_palmada_colapso: "punho-arhat/palmada-do-colapso.png",
  arhat_ombro: "punho-arhat/ombrada.png",
  arhat_joelhada: "punho-arhat/joelhada.png",
  arhat_palmada_ascendente: "punho-arhat/palmada-ascendente.png",
  arhat_palma_compressao: "punho-arhat/palma-de-compressao.png",
  arhat_golpe_rocha: "punho-arhat/golpe-de-rocha.png",
  tai_arhat_impacto: "punho-arhat/palma-de-impacto.png",
  tai_arhat_pressao: "punho-arhat/pressao-esmagadora.png",
  tai_arhat_estabilidade: "punho-arhat/base-inabalavel.png",

  adamantino_super_peteleco: "punho-adamantino/super-peteleco.png",
  adamantino_pe_dor_celestial: "punho-adamantino/pe-da-dor-celestial.png",
  adamantino_impacto_flor_cerejeira: "punho-adamantino/impacto-da-flor-de-cerejeira.png",
  adamantino_destruicao_pilar: "punho-adamantino/destruicao-do-pilar-de-pedra.png",
  adamantino_impacto_flor_florescimento: "punho-adamantino/impacto-da-flor-de-cerejeira-florescimento.png",
  adamantino_cem_forcas: "punho-adamantino/tecnica-das-cem-forcas.png",
  tai_adamantino_controle: "punho-adamantino/controle-de-chakra-preciso.png",
  tai_adamantino_ruptura: "punho-adamantino/ruptura-concentrada.png",
  tai_adamantino_forca: "punho-adamantino/forca-acumulada.png",

  lee_raiz: "lee/espirito-da-juventude.png",
  lee_folha_furacao: "lee/ritmo-da-folha.png",
  lee_entrada_dinamica: "lee/entrada-demolidora.png",
  lee_pesos: "lee/pesos-de-treino.png",
  lee_lotus: "lee/disciplina-da-lotus.png",
  lee_condicionamento: "lee/condicionamento-extremo.png",
  lee_recuperacao: "lee/folego-inabalavel.png",
  lee_passos: "lee/passos-acelerados.png",
  lee_reflexos: "lee/reflexos-de-treino.png",

  senju_vitalidade: "senju/vitalidade-senju.png",
  senju_controle_chakra: "senju/controle-de-chakra.png",
  senju_heranca: "senju/heranca-do-cla-senju.png",
  senju_dominio_suiton: "senju/dominio-suiton.png",
  senju_dragao_mare: "senju/dragao-da-mare.png",
  senju_muralha: "senju/muralha-inabalavel.png",
  senju_cachoeira: "senju/grande-cachoeira-devastadora.png",
  senju_chuva: "senju/chuva-celestial.png",
  senju_ondas_cortantes: "senju/ondas-de-aguas-cortantes.png",
  senju_diagnostico: "senju/diagnostico-preciso.png",
  senju_cirurgia: "senju/cirurgia-de-emergencia.png",
  senju_imunidade: "senju/imunidade-adaptativa.png",
  senju_regenerativo: "senju/controle-regenerativo.png",
  senju_especialista: "senju/especialista-medico.png",

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
  agua_muralha: "agua/muralha-de-agua.png",
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

  // ---- Iryō Ninjutsu ----
  iryo_palma_mistica: "iryo-ninjutsu/tecnica-da-palma-mistica.png",
  iryo_medusa: "iryo-ninjutsu/agua-medicinal-medusa.png",
  iryo_yin: "iryo-ninjutsu/reducao-e-cura-de-ferimentos-yin.png",
  iryo_cura_precisa: "iryo-ninjutsu/diagnostico-preciso.png",
  iryo_cura_regenerativa: "iryo-ninjutsu/tecnica-da-cura-regenerativa.png",
  iryo_cura_critica: "iryo-ninjutsu/cirurgia-de-emergencia.png",
  iryo_regeneracao: "iryo-ninjutsu/regeneracao-da-criacao.png",
  iryo_desintoxicacao: "iryo-ninjutsu/tecnica-de-desintoxicacao.png",
  iryo_hemostatica: "iryo-ninjutsu/tecnica-hemostatica.png",
  iryo_antidoto_eficiente: "iryo-ninjutsu/refino-do-fluxo.png",
  iryo_mosquitos: "iryo-ninjutsu/agua-medicinal-mosquitos-de-agua.png",
  iryo_triagem_rapida: "iryo-ninjutsu/triagem-rapida.png",
  iryo_bisturi: "iryo-ninjutsu/bisturi-de-chakra.png",
  iryo_lamina_estavel: "iryo-ninjutsu/lamina-estavel.png",
  iryo_choque_desorientacao: "iryo-ninjutsu/choque-da-desorientacao.png",
  iryo_sinapses_caoticas: "iryo-ninjutsu/sinapses-caoticas.png",

  // ---- Genjutsu ----
  gen_raiz: "genjutsu/veu-da-mente.png",
  gen_raizes_obscuras: "genjutsu/raizes-obscuras.png",
  gen_ecos_cativeiro: "genjutsu/ecos-do-cativeiro.png",
  gen_arvore_assassina: "genjutsu/aprisionamento-da-arvore-assassina.png",
  gen_interrogatorio: "genjutsu/genjutsu-interrogatorio.png",
  gen_contra_genjutsu: "genjutsu/contra-genjutsu.png",
  gen_substituicao_ilusoria: "genjutsu/substituicao-ilusoria.png",
  gen_fluencia_ilusao: "genjutsu/fluencia-da-ilusao.png",
  gen_penas_caidas: "genjutsu/penas-caidas.png",
  gen_dominio_do_medo: "genjutsu/dominio-do-medo.png",
  gen_dominio_mundo_obscuro: "genjutsu/dominio-do-mundo-obscuro.png",
  gen_visao_inferno: "genjutsu/ilusao-demoniaca-visao-do-inferno.png",

  // ---- Taijutsu (árvore geral de passivas) ----
  fuin_raiz: "fuinjutsu/caligrafia-de-selos.png",
  fuin_metodo_selamento_fogo: "fuinjutsu/metodo-de-selamento-de-fogo.png",
  fuin_traco_contencao: "fuinjutsu/traco-de-contencao.png",
  fuin_selo_cinco_elementos: "fuinjutsu/selo-de-cinco-elementos.png",
  fuin_selamento_contrato: "fuinjutsu/selamento-de-contrato.png",
  fuin_formacao_cordas_luz: "fuinjutsu/formacao-das-cordas-de-luz.png",
  fuin_ancora_formula: "fuinjutsu/ancora-da-formula.png",
  fuin_ligacao_pano: "fuinjutsu/tecnica-da-ligacao-de-pano.png",
  tai_furacao_folha: "punho-forte/furacao-da-folha.png",
  tai_entrada_dinamica: "punho-forte/entrada-dinamica.png",
  tai_vendaval_folha: "punho-forte/vendaval-da-folha.png",
  tai_forte_ritmo: "punho-forte/ritmo-da-folha.png",
  tai_acao_dinamica: "punho-forte/acao-dinamica.png",
  tai_grande_furacao_folha: "punho-forte/grande-furacao-da-folha.png",
  tai_metodo_intersecao: "punho-forte/metodo-de-intersecao.png",
  tai_vento_ascendente_folha: "punho-forte/vento-ascendente-da-folha.png",
  tai_sombra_folha_dancante: "punho-forte/sombra-da-folha-dancante.png",
  tai_luz_rotatoria_folha: "punho-forte/luz-rotatoria-da-folha.png",
  tai_portao_abertura: "punho-forte/portao-da-abertura.png",
  tai_rajada_leoes: "punho-forte/rajada-de-leoes.png",
  tai_lotus_frontal: "punho-forte/lotus-frontal.png",
  tai_portao_descanso: "punho-forte/portao-do-descanso.png",
  tai_portao_vida: "punho-forte/portao-da-vida.png",
  tai_lotus_oculta: "punho-forte/lotus-oculta.png",
  tai_portao_dor: "punho-forte/portao-da-dor.png",
  tai_portao_fechamento: "punho-forte/portao-do-fechamento.png",
  tai_portao_alegria: "punho-forte/portao-da-alegria.png",
  tai_pavao_amanhecer: "punho-forte/pavao-do-amanhecer.png",
  tai_portao_tristeza: "punho-forte/portao-da-tristeza.png",
  tai_tigre_diurno: "punho-forte/tigre-diurno.png",
  tai_portao_morte: "punho-forte/portao-da-morte.png",
  tai_elefante_anoitecer: "punho-forte/elefante-do-anoitecer.png",
  tai_guy_noturno: "punho-forte/guy-noturno.png",
  tai_pass_raiz: "taijutsu/disciplina-corporal.png",
  tai_pass_vigor: "taijutsu/vigor-de-combate.png",
  tai_pass_passada: "taijutsu/passada-leve.png",
  tai_pass_passo_silencioso: "taijutsu/passo-silencioso.png",
  tai_pass_reflexo_evasivo: "taijutsu/reflexo-evasivo.png",
  tai_pass_corpo_temperado: "taijutsu/corpo-temperado.png",
  tai_pass_recuperacao: "taijutsu/recuperacao-marcial.png",
  tai_pass_resistencia_fisica: "taijutsu/resistencia-fisica.png",
  tai_pass_reserva: "taijutsu/reserva-fisica.png",
  tai_pass_reserva_profunda: "taijutsu/reserva-fisica-profunda.png",
  tai_pass_maestria: "taijutsu/maestria-marcial.png",

  // ---- Taijutsu de Agitação ----
  tai_agitacao_passos: "taijutsu-agitacao/passos-irregulares.png",
  tai_agitacao_finta: "taijutsu-agitacao/finta-instintiva.png",
  tai_agitacao_ritmo: "taijutsu-agitacao/ritmo-caotico.png",
  tai_ken_postura: "taijutsu-agitacao/postura-da-lamina.png",
  tai_ken_fio: "taijutsu-agitacao/fio-de-aco.png",
  tai_ken_geometria: "taijutsu-agitacao/geometria-do-corte.png",

  // ---- Assassinato Silencioso ----
  tai_ocultacao_nevoa: "assassinato-silencioso/tecnica-de-ocultacao-da-nevoa.png",
  tai_nevoa_primeiro_golpe: "assassinato-silencioso/primeiro-golpe.png",
  tai_nevoa_ponto_cego: "assassinato-silencioso/ponto-cego.png",
  tai_nevoa_ofuscante: "assassinato-silencioso/nevoa-ofuscante.png",
  tai_nevoa_danca: "assassinato-silencioso/danca-da-nevoa.png",
  tai_nevoa_marca: "assassinato-silencioso/marca-do-alvo.png",
  tai_nevoa_misericordia: "assassinato-silencioso/golpe-de-misericordia.png",
  tai_nevoa_saque: "assassinato-silencioso/saque-relampago.png",
  tai_nevoa_corte: "assassinato-silencioso/corte-decisivo.png",
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
  agua_muralha: "suiton_suijinheki",
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
  poeira_desprendimento: "jinton_desprendimento_mundo_primitivo",
  poeira_pilar: "jinton_pilar",
  poeira_conica: "jinton_conica",
  poeira_projeteis: "jinton_projeteis",
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
