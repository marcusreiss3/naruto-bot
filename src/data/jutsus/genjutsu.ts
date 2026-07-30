import type { Ability } from "../types.js";

// ============================================================================
// Genjutsu — roster REAL (nao e' o placeholder de jogador mencionado no
// CLAUDE.md): estas 8 tecnicas sao o conteudo oficial da arvore de Genjutsu
// (src/data/genjutsu-tree.ts), em 3 ramos: Aprisionamento (Raizes Obscuras ->
// Arvore Assassina -> Interrogatorio), Ilusao/Fuga (Contra-Genjutsu ->
// Substituicao Ilusoria) e Pesadelo (Penas Caidas -> Dominio do Mundo
// Obscuro), convergindo em Visao do Inferno. Os 4 genjutsu antigos em
// jutsus/support.ts
// (gen_confusao, gen_bloqueio_nin, gen_defesa_baixa, gen_perda_acao) sao o
// placeholder que ainda NAO foi apagado porque varios NpcTemplate.abilityIds
// (src/data/npcs.ts) dependem deles hoje — migrar esses NPCs pra esta nova
// arvore fica pra uma limpeza dedicada, nao faz parte deste commit.
//
// Identidade: Genjutsu e' arvore de CONTROLE (igual Nara/Hyuuga/Aburame no
// jutsu-authoring skill) — sem damageMult de dano bruto. O atributo genjutsu
// rende via genjutsuDuration() (ligada em resolveHit, combat-engine.ts):
// +1 rodada de efeito a cada 10 pontos de genjutsu, ate o teto de
// BALANCE.genjutsuDurationCap. baseDamage aqui e' so' o minimo pra a engine
// aplicar os efeitos (so aplica se damage > 0), nao e' o ponto da arvore.
// ============================================================================
export const GENJUTSU_ABILITIES: Ability[] = [
  {
    id: "gen_raizes_obscuras",
    name: "Raízes Obscuras",
    category: "GENJUTSU",
    tier: 1,
    resource: "chakra",
    // custo calculado por suggestedJutsuCost() — versao BASICA da Arvore
    // Assassina: so' Imobiliza (sem Atordoar, sem ignorar esquiva).
    cost: 16,
    actionType: "COMUM",
    baseDamage: 8,
    scalingAttribute: "genjutsu",
    range: 2,
    shape: "SINGLE_TARGET",
    effects: [{ effectId: "ROOT", duration: 2 }],
    requirements: { manualOnly: true, attributes: { genjutsu: 3 } },
    tags: ["genjutsu", "controle", "aprisionamento"],
    description:
      "Uma raiz surge do solo e se transforma numa grande árvore crescente que se enrola no alvo, prendendo-o no lugar.",
  },
  {
    id: "gen_arvore_assassina",
    name: "Aprisionamento da Árvore Assassina",
    category: "GENJUTSU",
    tier: 2,
    resource: "chakra",
    // custo calculado por suggestedJutsuCost() — ver jutsu-balance.ts. Prende
    // com STUN (nao age) + ROOT (nao foge) por 2 rodadas E ignora esquiva:
    // e' um lockdown quase completo, tem que custar como um.
    cost: 28,
    actionType: "COMUM",
    baseDamage: 8,
    scalingAttribute: "genjutsu",
    range: 2,
    shape: "SINGLE_TARGET",
    undodgeable: true,
    effects: [{ effectId: "STUN", duration: 2 }, { effectId: "ROOT", duration: 2 }],
    requirements: { manualOnly: true, attributes: { genjutsu: 12 }, level: 14 },
    tags: ["genjutsu", "controle", "aprisionamento"],
    description:
      "Você desaparece como uma névoa para se aproximar sem ser detectado. Ao alcançar o alvo, ele vê uma árvore crescer e se enrolar ao redor do próprio corpo: fica paralisado e imobilizado, mas consciente. Não pode ser esquivado.",
  },
  {
    id: "gen_contra_genjutsu",
    name: "Contra-Genjutsu",
    category: "GENJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 12,
    actionType: "BONUS",
    scalingAttribute: "genjutsu",
    range: 2,
    shape: "ALLY",
    cleanses: ["CONFUSION", "NINJUTSU_BLOCK", "DEFENSE_DOWN"],
    requirements: { manualOnly: true, attributes: { genjutsu: 3 } },
    tags: ["genjutsu", "remocao", "suporte"],
    description:
      "Interrompe por um instante a rede de chakra do cérebro, cortando o fluxo que alimenta uma ilusão. Remove Confusão, Bloqueio de Ninjutsu e Defesa Reduzida de si mesmo ou de um aliado.",
  },
  {
    id: "gen_substituicao_ilusoria",
    name: "Substituição Ilusória",
    category: "GENJUTSU",
    tier: 1,
    // sem baseDamage/effects: reactionDodgeBonus nao entra na formula de
    // custo (igual tecnica_substituicao, fundamentals.ts) — precificado a
    // mao pelo mesmo valor do equivalente de fundamentos.
    resource: "chakra",
    cost: 15,
    actionType: "REACAO",
    reactionKind: "DODGE",
    reactionDodgeBonus: 0.2,
    isCloneTrick: true,
    range: 0,
    shape: "SELF",
    requirements: { manualOnly: true, attributes: { genjutsu: 3 } },
    tags: ["genjutsu", "reacao", "ilusao", "fuga"],
    description:
      "Planta uma ilusão na cabeça do inimigo no instante do golpe: ele ataca uma cópia sua que nunca existiu de verdade. Como reação, dá +20% de chance de esquiva contra o golpe.",
  },
  {
    id: "gen_penas_caidas",
    name: "Penas Caídas",
    category: "GENJUTSU",
    tier: 2,
    resource: "chakra",
    // custo calculado por suggestedJutsuCost() — area, 70% de chance, 1 rodada
    cost: 16,
    actionType: "COMUM",
    baseDamage: 10,
    scalingAttribute: "genjutsu",
    range: 4,
    shape: "RADIUS",
    effects: [{ effectId: "STUN", duration: 1, chance: 0.7 }],
    requirements: { manualOnly: true, attributes: { genjutsu: 10 }, level: 10 },
    tags: ["genjutsu", "area", "controle"],
    description:
      "Libera uma chuva de penas no ambiente: todos os adversários na área sentem um sono repentino e podem cair Atordoados.",
  },
  {
    id: "gen_dominio_mundo_obscuro",
    name: "Domínio do Mundo Obscuro",
    category: "GENJUTSU",
    tier: 3,
    resource: "chakra",
    // custo calculado por suggestedJutsuCost() — FLEE_LOCK longo + Defesa
    // Reduzida, indefensavel (a ilusao envolve o local inteiro, nao e' um
    // golpe pra desviar).
    cost: 36,
    actionType: "COMUM",
    baseDamage: 20,
    scalingAttribute: "genjutsu",
    range: 3,
    shape: "SINGLE_TARGET",
    unblockable: true,
    effects: [{ effectId: "FLEE_LOCK", duration: 3 }, { effectId: "DEFENSE_DOWN", duration: 3 }],
    requirements: { manualOnly: true, attributes: { genjutsu: 20 }, level: 24 },
    tags: ["genjutsu", "controle", "isolamento"],
    description:
      "Envolve todo o local numa ilusão que separa você e o alvo do mundo exterior: a luta vira um mano a mano do qual não há como fugir. É Inevitável.",
  },
  {
    id: "gen_interrogatorio",
    name: "Genjutsu: Interrogatório",
    category: "GENJUTSU",
    tier: 2,
    resource: "chakra",
    // custo calculado por suggestedJutsuCost() — mais barato que o normal do
    // tier porque so' pode ser usado numa vitima ja capturada (requiresTargetEffect)
    cost: 14,
    actionType: "COMUM",
    baseDamage: 8,
    scalingAttribute: "genjutsu",
    range: 2,
    shape: "SINGLE_TARGET",
    requiresTargetEffect: ["ROOT", "STUN"],
    effects: [{ effectId: "CHAKRA_DRAIN", duration: 2 }],
    requirements: { manualOnly: true, attributes: { genjutsu: 17 }, level: 20 },
    tags: ["genjutsu", "controle", "captura"],
    description:
      "Só funciona numa vítima já Imobilizada ou Atordoada por outra técnica: a ilusão quebra a força de vontade do capturado, drenando o chakra dele a cada rodada.",
  },
  {
    id: "gen_visao_inferno",
    name: "Ilusão Demoníaca: Visão do Inferno",
    category: "GENJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 51,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "genjutsu",
    range: 3,
    shape: "SINGLE_TARGET",
    unblockable: true,
    effects: [{ effectId: "STUN", duration: 2 }, { effectId: "DEFENSE_DOWN", duration: 2 }],
    requirements: { manualOnly: true, attributes: { genjutsu: 28 }, level: 34 },
    tags: ["genjutsu", "apice", "controle", "medo"],
    description:
      "Revela à vítima o medo mais profundo escondido nela — consciente ou não — e a faz acreditar que ele é real. O terror puro a paralisa e destrói sua defesa. É Inevitável.",
  },
];
