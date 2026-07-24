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

export const CLAN_TREES: Record<string, SkillNodeDef[]> = {
  nara: NARA,
};
