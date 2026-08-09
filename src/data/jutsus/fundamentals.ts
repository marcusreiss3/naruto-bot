import type { Ability } from "../types.js";

// ============================================================================
// Fundamentos — o que todo ninja sabe, sem natureza de chakra.
// ============================================================================
// Duas familias:
//
// 1. NINJUTSU DE ACADEMIA — os 3 jutsus concedidos pelos nos de
//    data/element-trees/fundamentals.ts, pre-requisito pra desbloquear o
//    primeiro elemento. Ver skill "ninjutsu-authoring".
//
// 2. REACOES BASICAS — Guarda de Ferro (BLOCK), Aparar (PARRY) e a Tecnica de
//    Substituicao (DODGE). Existem outras reacoes no jogo (Muralha de Agua,
//    Palma Rotativa do Hyuuga, Metodo de Intersecao...), mas todas exigem
//    elemento, cla ou arvore — estas tres sao as UNICAS GENERICAS, o
//    contra-jogo que qualquer personagem tem. As duas primeiras moravam no
//    `jutsus/support.ts` e vieram pra ca' quando ele foi apagado (09/08/2026):
//    sao infraestrutura, nao placeholder de conteudo. NAO apague sem
//    substituir — a engine escolhe a reacao por `reactionKind`, nao por id,
//    entao nada quebra ao compilar e o jogador so' perde a opcao.
// ============================================================================
export const FUNDAMENTOS: Ability[] = [
  {
    id: "tecnica_clonagem",
    name: "Técnica de Clonagem",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 10,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { manualOnly: true },
    tags: ["fundamentos", "buff", "ilusao", "clone"],
    description:
      "Cria uma ou mais imagens de si mesmo, sem corpo físico. Os clones não causam dano, mas confundem o adversário: seu próximo golpe recebido tem mais chance de acertar a ilusão em vez de você.",
  },
  {
    id: "tecnica_substituicao",
    name: "Técnica de Substituição",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 15,
    actionType: "REACAO",
    reactionKind: "DODGE",
    reactionDodgeBonus: 0.2,
    isCloneTrick: true,
    range: 0,
    shape: "SELF",
    requirements: { manualOnly: true },
    tags: ["fundamentos", "reacao", "fuga", "ilusao"],
    description:
      "Substitui o próprio corpo por um tronco de madeira no instante em que o ataque chega, criando uma ilusão de ótica. Como reação, dá +20% de chance de esquiva contra o golpe.",
  },
  {
    id: "tecnica_caminhada_aquatica",
    name: "Técnica da Caminhada Aquática",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    // custo 0: nunca e' "usada" via /jutsu — e' ligada/desligada com
    // /combate agua, que gasta BALANCE.waterWalkUpkeepPerTurn por turno.
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { manualOnly: true },
    tags: ["fundamentos", "passivo", "agua", "mobilidade"],
    description:
      "Ativa automaticamente ao pisar na água (ligar/desligar com /combate agua). Enquanto ativa, gasta 5% de chakra por turno, mas você não fica Encharcado nem tem o movimento reduzido pela água.",
  },

  // ---------------- reacoes basicas ----------------
  // As unicas com reactionKind BLOCK e PARRY do jogo (a de DODGE e' a Tecnica
  // de Substituicao, acima). Ver o cabecalho do arquivo antes de mexer.
  {
    id: "tai_defesa",
    name: "Guarda de Ferro",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 10,
    actionType: "REACAO",
    reactionKind: "BLOCK",
    range: 0,
    shape: "SELF",
    scalingAttribute: "taijutsu",
    requirements: { attributes: { taijutsu: 4 } },
    tags: ["taijutsu", "defesa"],
    description: "Defesa física que reduz o dano recebido.",
  },
  {
    id: "ken_aparar",
    name: "Aparar",
    category: "BUKIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 8,
    actionType: "REACAO",
    reactionKind: "PARRY",
    range: 0,
    shape: "SELF",
    scalingAttribute: "bukijutsu",
    requirements: { anyAttribute: { bukijutsu: 5, kenjutsu: 5 } },
    tags: ["arma", "defesa"],
    description: "Desvia o ataque com a arma antes que ele alcance o corpo.",
  },
];
