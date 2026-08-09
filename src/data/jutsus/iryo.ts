import type { Ability } from "../types.js";

// `manualOnly: true` em TODAS: as 10 sao concedidas por no' da arvore de Iryo
// (ver IRYO_NINJUTSU_TREE + NODE_ABILITY). Sem a flag, autoUnlockJutsus()
// entrega o jutsu de graca assim que o personagem bate nivel/atributo e a
// arvore vira enfeite — o jogador recebe sem gastar ponto de no' nenhum.
// Era o que a falha de tests/combat-math.test.ts ("todo jutsu concedido pela
// arvore e' manualOnly") vinha apontando.
const req = (iryoNinjutsu: number, level?: number) => ({
  manualOnly: true,
  attributes: { iryoNinjutsu },
  ...(level ? { level } : {}),
});
export const IRYO_ABILITIES: Ability[] = [
  { id: "iryo_palma_mistica", name: "Técnica da Palma Mística", category: "IRYO_NINJUTSU", tier: 1, resource: "chakra", cost: 16, actionType: "BONUS", baseHeal: 12, scalingAttribute: "iryoNinjutsu", range: 1, shape: "ALLY", requirements: req(1), tags: ["cura"], description: "Cura leve com chakra médico." },
  { id: "iryo_desintoxicacao", name: "Técnica de Desintoxicação", category: "IRYO_NINJUTSU", tier: 1, resource: "chakra", cost: 14, actionType: "COMUM", range: 1, shape: "ALLY", cleanses: ["POISON"], scalingAttribute: "iryoNinjutsu", requirements: req(4, 4), tags: ["cura", "remocao"], description: "Remove completamente o Veneno." },
  { id: "iryo_hemostatica", name: "Técnica Hemostática", category: "IRYO_NINJUTSU", tier: 1, resource: "chakra", cost: 14, actionType: "BONUS", baseHeal: 8, range: 1, shape: "ALLY", reduceEffectDuration: [{ effectId: "BLEED", turns: 2 }], scalingAttribute: "iryoNinjutsu", requirements: req(7, 7), tags: ["cura", "remocao"], description: "Estanca hemorragias, cura pouco e reduz Sangramento em 2 turnos." },
  { id: "iryo_medusa", name: "Água Medicinal: Medusa", category: "IRYO_NINJUTSU", tier: 2, resource: "chakra", cost: 18, actionType: "COMUM", baseHeal: 16, restoreResource: { resource: "chakra", amount: 10 }, scalingAttribute: "iryoNinjutsu", range: 2, shape: "ALLY", requirements: req(10, 10), tags: ["cura"], description: "Cura e restaura um pouco de chakra." },
  // O Selo dos Tenketsu entra aqui como REDUCAO, nao como remocao: e' a
  // identidade da tecnica (ela nunca limpa nada, so' encurta) e mantem a
  // contra-jogada vindo de FORA — quem esta selado nao consegue lancar Iryo em
  // si mesmo, por isso o shape ALLY importa. Passa a ser a unica resposta ao
  // selo no roster real: a Clareza Mental, que o limpava, morava no support.ts
  // e foi apagada junto com ele em 09/08/2026.
  { id: "iryo_mosquitos", name: "Água Medicinal: Mosquitos de Água", category: "IRYO_NINJUTSU", tier: 2, resource: "chakra", cost: 18, actionType: "COMUM", range: 2, shape: "ALLY", reduceEffectDuration: [{ effectId: "BURN", turns: 2 }, { effectId: "POISON", turns: 2 }, { effectId: "TENKETSU_SEAL", turns: 2 }], scalingAttribute: "iryoNinjutsu", requirements: req(14, 14), tags: ["cura", "remocao"], visualDescription: "Pequenos mosquitos feitos de água medicinal pousam sobre o paciente e extraem resíduos escuros do corpo.", description: "Reduz Queimadura, Veneno e Selo dos Tenketsu em 2 turnos." },
  { id: "iryo_bisturi", name: "Bisturi de Chakra", category: "IRYO_NINJUTSU", tier: 2, resource: "chakra", cost: 18, actionType: "BONUS", range: 0, shape: "SELF", effects: [{ effectId: "EMPOWERED", stacks: 1.2, duration: 2, empoweredScope: "taijutsu" }], scalingAttribute: "iryoNinjutsu", requirements: req(18, 18), tags: ["buff", "taijutsu"], visualDescription: "Lâminas finas de chakra médico se formam ao redor das duas mãos do usuário.", description: "Lâminas finas de chakra médico se formam ao redor das duas mãos do usuário." },
  { id: "iryo_choque_desorientacao", name: "Choque da Desorientação", category: "IRYO_NINJUTSU", tier: 3, resource: "chakra", cost: 18, actionType: "COMUM", baseDamage: 8, range: 1, shape: "SINGLE_TARGET", effects: [{ effectId: "CONFUSION", duration: 2 }], scalingAttribute: "iryoNinjutsu", requirements: req(24, 24), tags: ["controle", "ofensivo"], description: "Desorienta o sistema nervoso do alvo, causando Confusão por 2 rodadas." },
  { id: "iryo_yin", name: "Redução e Cura de Ferimentos Yin", category: "IRYO_NINJUTSU", tier: 3, resource: "chakra", cost: 26, actionType: "COMUM", baseHeal: 30, range: 1, shape: "ALLY", reduceEffectDuration: [{ effectId: "BURN", turns: 2 }, { effectId: "BLEED", turns: 2 }], scalingAttribute: "iryoNinjutsu", requirements: req(28, 28), tags: ["cura", "remocao"], description: "Cura bastante e reduz Queimadura e Sangramento em 2 turnos." },
  { id: "iryo_cura_regenerativa", name: "Técnica da Cura Regenerativa", category: "IRYO_NINJUTSU", tier: 3, resource: "chakra", cost: 41, actionType: "COMUM", baseHeal: 46, range: 1, shape: "ALLY", scalingAttribute: "iryoNinjutsu", requirements: req(34, 33), tags: ["cura"], description: "Reconstrói ferimentos severos e restaura muita vida, exigindo muito chakra." },
  { id: "iryo_regeneracao", name: "Regeneração da Criação", category: "IRYO_NINJUTSU", tier: 4, resource: "chakra", cost: 46, actionType: "COMUM", baseHeal: 62, range: 0, shape: "SELF", cleanses: ["BLEED", "BURN"], scalingAttribute: "iryoNinjutsu", requirements: req(40, 40), tags: ["cura", "remocao"], visualDescription: "Chakra médico verde percorre todo o corpo enquanto ferimentos se fecham rapidamente sob uma luz intensa.", description: "Cura extremamente e remove Sangramento e Queimadura." },
];
