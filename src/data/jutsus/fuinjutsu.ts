import type { Ability } from "../types.js";

export const FUINJUTSU_ABILITIES: Ability[] = [
  {
    id: "fuin_metodo_selamento_fogo", name: "Método de Selamento de Fogo", category: "NINJUTSU", tier: 1, resource: "chakra", cost: 12, actionType: "BONUS",
    range: 4, shape: "SINGLE_TARGET", clearsTerrain: "FIRE", cleanses: ["BURN"], scalingAttribute: "fuinjutsu",
    requiredItems: [{ itemId: "pergaminho_arsenal", amount: 1, exhaustToItemId: "pergaminho_arsenal_gasto" }],
    requirements: { manualOnly: true, attributes: { fuinjutsu: 4 }, level: 4 }, tags: ["fuinjutsu", "selamento", "fogo", "suporte"],
    description: "Inscreve uma fórmula de selamento que apaga o fogo no local visado e remove Queimadura do alvo atingido.",
  },
  {
    id: "fuin_selo_cinco_elementos", name: "Selo de Cinco Elementos", category: "NINJUTSU", tier: 2, resource: "chakra", cost: 22, actionType: "COMUM",
    baseDamage: 8, scalingAttribute: "fuinjutsu", range: 3, shape: "SINGLE_TARGET", effects: [{ effectId: "NINJUTSU_BLOCK", duration: 2, chance: 0.7 }],
    requirements: { manualOnly: true, attributes: { fuinjutsu: 14 }, level: 14 }, tags: ["fuinjutsu", "selamento", "controle", "chakra"],
    description: "Um selo de chakra maligno desorganiza o fluxo do alvo e pode bloquear seu Ninjutsu por duas rodadas.",
  },
  {
    id: "fuin_selamento_contrato", name: "Selamento de Contrato", category: "NINJUTSU", tier: 3, resource: "chakra", cost: 30, actionType: "COMUM",
    baseDamage: 6, scalingAttribute: "fuinjutsu", range: 1, shape: "MELEE", effects: [{ effectId: "CONTRACT_SEAL", duration: 2, chance: 0.85 }],
    requirements: { manualOnly: true, attributes: { fuinjutsu: 24 }, level: 24 }, tags: ["fuinjutsu", "selamento", "contrato", "controle"],
    description: "Ao tocar o peito do alvo, rompe temporariamente contratos de invocação e veda o chakra associado a Bijuu.",
  },
  {
    id: "fuin_selo_quatro_simbolos_reverso", name: "Selo de Quatro Símbolos Reverso", category: "NINJUTSU", tier: 3, resource: "chakra", cost: 22, actionType: "BONUS",
    range: 0, shape: "SELF", scalingAttribute: "fuinjutsu", oncePerCombat: true,
    deathTrigger: { radius: 2, effects: [{ effectId: "ROOT", duration: 1 }, { effectId: "NINJUTSU_BLOCK", duration: 2 }] },
    requirements: { manualOnly: true, attributes: { fuinjutsu: 28 }, level: 30 }, tags: ["fuinjutsu", "selamento", "sacrificio", "controle"],
    description: "Arma no próprio corpo um selo que, ao ser derrotado, imobiliza inimigos próximos e bloqueia o Ninjutsu deles por duas rodadas.",
  },
  {
    // 24 -> 20 em 09/08/2026: era -8 na regua, o unico Fuinjutsu caro SEM
    // motivo. Os outros negativos se explicam por negacao de build (Selamento
    // de Contrato anula invocacao, Selo de Cinco Elementos fecha o Ninjutsu do
    // alvo) ou por campo que a formula nao preca (`cleanses`). Este e' so'
    // Imobilizacao em area. 20 o poe no mesmo preco da Ligacao de Pano, que
    // troca a area por um segundo efeito e 15pp de chance.
    id: "fuin_formacao_cordas_luz", name: "Formação das Cordas de Luz", category: "NINJUTSU", tier: 2, resource: "chakra", cost: 20, actionType: "COMUM",
    baseDamage: 8, scalingAttribute: "fuinjutsu", range: 3, shape: "RADIUS", effects: [{ effectId: "ROOT", duration: 2, chance: 0.65 }],
    requirements: { manualOnly: true, attributes: { fuinjutsu: 10 }, level: 10 }, tags: ["fuinjutsu", "selamento", "area", "controle"],
    description: "Uma fórmula circular se espalha pelo chão e pode imobilizar todos os inimigos dentro dela.",
  },
  {
    id: "fuin_ligacao_pano", name: "Técnica da Ligação de Pano", category: "NINJUTSU", tier: 2, resource: "chakra", cost: 20, actionType: "COMUM",
    baseDamage: 8, scalingAttribute: "fuinjutsu", range: 3, shape: "SINGLE_TARGET", effects: [{ effectId: "ROOT", duration: 2, chance: 0.8 }, { effectId: "NINJUTSU_BLOCK", duration: 1, chance: 0.8 }],
    requirements: { manualOnly: true, attributes: { fuinjutsu: 20 }, level: 20 }, tags: ["fuinjutsu", "selamento", "controle", "pano"],
    description: "Um rolo de pano marcado por selos imobiliza o alvo e pode impedi-lo de usar Ninjutsu.",
  },
  {
    id: "fuin_rugido_confinamento_leao", name: "Rugido do Confinamento do Leão", category: "NINJUTSU", tier: 3, resource: "chakra", cost: 24, actionType: "COMUM",
    baseDamage: 10, scalingAttribute: "fuinjutsu", range: 3, shape: "SINGLE_TARGET", effects: [{ effectId: "NINJUTSU_BLOCK", duration: 2, chance: 0.85 }, { effectId: "ROOT", duration: 1, chance: 0.75 }],
    requirements: { manualOnly: true, attributes: { fuinjutsu: 25 }, level: 26 }, tags: ["fuinjutsu", "selamento", "controle", "leao"],
    description: "Uma fórmula de leão pode bloquear o Ninjutsu do alvo e imobilizá-lo brevemente. Não sela tenketsu nem impede o uso de Genjutsu, Iryō Ninjutsu ou Portões.",
  },
  {
    id: "fuin_selo_auto_amaldicoamento", name: "Selo de Auto-Amaldiçoamento", category: "NINJUTSU", tier: 3, resource: "chakra", cost: 22, actionType: "COMUM",
    baseDamage: 8, scalingAttribute: "fuinjutsu", range: 3, shape: "SINGLE_TARGET", effects: [{ effectId: "ROOT", duration: 2, chance: 0.75 }, { effectId: "NINJUTSU_BLOCK", duration: 1, chance: 0.75 }],
    requirements: { manualOnly: true, attributes: { fuinjutsu: 30 }, level: 32 }, tags: ["fuinjutsu", "selamento", "controle", "amaldicoado"],
    description: "Uma marca amaldiçoada se espalha pelo alvo e pode Imobilizá-lo, além de interromper o Ninjutsu por uma rodada.",
  },
];
