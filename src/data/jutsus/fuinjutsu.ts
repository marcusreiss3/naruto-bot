import type { Ability } from "../types.js";

export const FUINJUTSU_ABILITIES: Ability[] = [
  {
    id: "fuin_metodo_selamento_fogo", name: "Método de Selamento de Fogo", category: "NINJUTSU", tier: 1, resource: "chakra", cost: 12, actionType: "BONUS",
    range: 4, shape: "SINGLE_TARGET", clearsTerrain: "FIRE", cleanses: ["BURN"], scalingAttribute: "fuinjutsu",
    requiredItems: [{ itemId: "pergaminho_rank_b", amount: 1, exhaustToItemId: "pergaminho_rank_b_gasto" }],
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
    id: "fuin_formacao_cordas_luz", name: "Formação das Cordas de Luz", category: "NINJUTSU", tier: 2, resource: "chakra", cost: 24, actionType: "COMUM",
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
];
