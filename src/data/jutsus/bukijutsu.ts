import type { Ability } from "../types.js";

export const BUKIJUTSU_ABILITIES: Ability[] = [
  {
    id: "buki_moinho", name: "Manipulação do Moinho de Vento de Lâminas Triplas",
    category: "BUKIJUTSU", tier: 1, resource: "energia", cost: 18, actionType: "COMUM",
    baseDamage: 16, scalingAttribute: "bukijutsu", range: 4, shape: "SINGLE_TARGET",
    effects: [{ effectId: "DEFENSE_DOWN", duration: 1, chance: 0.65 }],
    requirements: { manualOnly: true },
    requiredItems: [
      { itemId: "kunai", amount: 3, consume: true },
      { itemId: "shuriken", amount: 3, consume: true },
      { itemId: "fios_aco_ninja", amount: 1 },
    ],
    tags: ["projétil", "fio"],
    description: "A primeira trajetória distrai enquanto a shuriken retorna presa aos fios por um ponto cego.",
  },
  {
    id: "buki_dragoes_gemeos", name: "Dragões Gêmeos Ascendentes",
    category: "BUKIJUTSU", tier: 2, resource: "energia", cost: 32, actionType: "COMUM",
    baseDamage: 24, scalingAttribute: "bukijutsu", range: 5, shape: "RADIUS",
    requirements: { manualOnly: true },
    requiredItems: [
      // Tecnica de PERGAMINHO: o pergaminho existe justamente pra despejar uma
      // quantidade grande de ferramenta de uma vez — por isso o consumo aqui e'
      // varias vezes maior que o de uma tecnica de arremesso comum.
      { itemId: "pergaminho_rank_b", amount: 1, exhaustToItemId: "pergaminho_rank_b_gasto" },
      { itemId: "kunai", amount: 10, consume: true },
      { itemId: "shuriken", amount: 10, consume: true },
    ],
    tags: ["projétil", "pergaminho"],
    description: "Dois pergaminhos giram no ar como dragões de fumaça e cercam a área com armas.",
  },
  {
    id: "buki_voo_andorinha", name: "Voo da Andorinha",
    category: "BUKIJUTSU", tier: 2, resource: "chakra", cost: 25, actionType: "COMUM",
    baseDamage: 26, scalingAttribute: "bukijutsu", range: 3, shape: "LINE",
    unguardable: true,
    requirements: { manualOnly: true },
    equippedItemIds: ["lamina_chakra"],
    tags: ["lamina-chakra", "corpo-a-corpo"],
    description: "A lâmina recebe uma extensão invisível de chakra que atravessa a defesa antes do contato do metal.",
  },
  {
    id: "buki_meteoro_anexado", name: "Meteoro Anexado",
    category: "BUKIJUTSU", tier: 3, resource: "energia", cost: 42, actionType: "COMUM",
    baseDamage: 30, scalingAttribute: "bukijutsu", range: 4, shape: "SINGLE_TARGET",
    effects: [{ effectId: "ROOT", duration: 1 }],
    requirements: { manualOnly: true },
    requiredItems: [
      { itemId: "corrente_ferro", amount: 1 },
      { itemId: "kunai", amount: 6, consume: true },
      { itemId: "shuriken", amount: 6, consume: true },
    ],
    tags: ["corrente", "fio"],
    description: "A corrente contém o alvo enquanto armas convocadas o atingem antes do impacto contra o chão.",
  },
  {
    id: "buki_clone_shuriken", name: "Técnica do Clone da Sombra de Shuriken",
    category: "BUKIJUTSU", tier: 3, resource: "chakra", cost: 48, actionType: "COMUM",
    baseDamage: 32, scalingAttribute: "bukijutsu", range: 6, shape: "RADIUS",
    undodgeable: true,
    // parte do princípio dos Clones das Sombras (kage_bunshin) aplicado numa
    // arma — precisa conhecer a técnica base primeiro.
    requirements: { manualOnly: true, requiresAbilityId: "kage_bunshin" },
    requiredItems: [{ itemId: "shuriken", amount: 1, consume: true }],
    tags: ["projétil", "clones"],
    description: "Uma shuriken se transforma em uma nuvem de cópias que fecha todas as rotas de fuga.",
  },
  {
    id: "buki_esfera_explosiva", name: "Esfera Explosiva",
    category: "BUKIJUTSU", tier: 3, resource: "energia", cost: 44, actionType: "COMUM",
    baseDamage: 24, scalingAttribute: "bukijutsu", range: 5, shape: "RADIUS",
    effects: [{ effectId: "MINADO", stacks: 1, duration: 2 }],
    requirements: { manualOnly: true },
    requiredItems: [
      { itemId: "pergaminho_rank_a", amount: 1, exhaustToItemId: "pergaminho_rank_a_gasto" },
      { itemId: "esfera_explosiva", amount: 1, consume: true },
    ],
    tags: ["projétil", "explosivo", "pergaminho"],
    description: "A esfera explode no impacto, espalha kunai e deixa cargas instáveis entre os destroços.",
  },
  {
    id: "buki_camara_tortura", name: "Câmara de Tortura",
    category: "BUKIJUTSU", tier: 4, resource: "chakra", cost: 56, actionType: "COMUM",
    baseDamage: 30, scalingAttribute: "bukijutsu", range: 3, shape: "SINGLE_TARGET",
    unguardable: true,
    effects: [
      { effectId: "ROOT", duration: 2 },
      { effectId: "BLEED", stacks: 1, duration: 3 },
    ],
    requirements: { manualOnly: true },
    requiredItems: [
      { itemId: "fios_aco_ninja", amount: 1 },
    ],
    tags: ["fio", "corrente", "invocacao"],
    description: "A estrutura de ferro se fecha sobre o alvo, prende seus membros e contrai fios de aço a cada giro das engrenagens.",
  },
  {
    id: "buki_cadeia_desastre", name: "Cadeia do Desastre Celestial",
    category: "BUKIJUTSU", tier: 4, resource: "energia", cost: 66, actionType: "COMUM",
    baseDamage: 38, scalingAttribute: "bukijutsu", range: 7, shape: "RADIUS",
    undodgeable: true, oncePerCombat: true,
    requirements: { manualOnly: true },
    requiredItems: [
      // Pergaminho rank S cobrindo a area inteira numa chuva continua de armas:
      // o maior consumo do jogo, coerente com o que a descricao promete.
      { itemId: "pergaminho_rank_s", amount: 1, exhaustToItemId: "pergaminho_rank_s_gasto" },
      { itemId: "kunai", amount: 20, consume: true },
      { itemId: "shuriken", amount: 20, consume: true },
    ],
    tags: ["projétil", "pergaminho"],
    description: "O pergaminho se abre acima do campo e cobre uma vasta área com uma chuva contínua de armas.",
  },
];
