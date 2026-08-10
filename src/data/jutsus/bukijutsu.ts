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
      { itemId: "pergaminho_arsenal", amount: 1, exhaustToItemId: "pergaminho_arsenal_gasto" },
      { itemId: "kunai", amount: 10, consume: true },
      { itemId: "shuriken", amount: 10, consume: true },
    ],
    tags: ["projétil", "pergaminho"],
    description: "Dois pergaminhos giram no ar como dragões de fumaça e cercam a área com armas.",
  },
  {
    // Degrau entre os Dragoes Gemeos (nv4, 32) e a Esfera Explosiva (nv15, 44)
    // no ramo de Pergaminhos. Sai em LINHA pra nao ser a terceira area seguida
    // do ramo, e aplica Queimadura em vez de Minado — o Minado e' a assinatura
    // da Esfera e nao deve aparecer antes dela.
    // Dano calibrado contra o BALANCEAMENTO_FINAL.txt, nao contra o consumo:
    // o doc poe o MELHOR golpe de Bukijutsu em ~30 no nv10 e ~38 no nv20, e
    // Bukijutsu ja' e' a categoria mais forte nessa faixa. 26 de base da' 29,9
    // com os Fundamentos e 35,9 com a Polvora Refinada — dentro da curva.
    // O payoff sobre arremessar uma kunai explosiva sozinha (25 de base) nao
    // esta' no numero e sim na LINHA: acerta todo mundo no caminho.
    id: "buki_resma_explosiva", name: "Resma de Amuletos Explosivos",
    category: "BUKIJUTSU", tier: 2, resource: "energia", cost: 36, actionType: "COMUM",
    baseDamage: 26, scalingAttribute: "bukijutsu", range: 5, shape: "LINE",
    effects: [{ effectId: "BURN", duration: 2, chance: 0.6 }],
    requirements: { manualOnly: true },
    requiredItems: [
      { itemId: "pergaminho_arsenal", amount: 1, exhaustToItemId: "pergaminho_arsenal_gasto" },
      { itemId: "kunai_explosiva", amount: 4, consume: true },
    ],
    tags: ["projétil", "pergaminho", "explosivo"],
    visualDescription:
      "O pergaminho se desenrola de uma vez e cospe uma fileira de kunai, cada uma com vários papéis-bomba presos ao cabo, que detonam em sequência ao longo da linha.",
    description:
      "O pergaminho se desenrola de uma vez e cospe uma fileira de kunai, cada uma com vários papéis-bomba presos ao cabo, que detonam em sequência ao longo da linha.",
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
    // Dano bruto 24 mantido de proposito mesmo com a Resma (26) entrando no
    // degrau anterior: a Esfera cobra parte do dano ATRASADO, pelo Minado
    // (20 por acumulo), e o total dela — 53 contra 36 — segue bem acima.
    id: "buki_esfera_explosiva", name: "Esfera Explosiva",
    category: "BUKIJUTSU", tier: 3, resource: "energia", cost: 44, actionType: "COMUM",
    baseDamage: 24, scalingAttribute: "bukijutsu", range: 5, shape: "RADIUS",
    effects: [{ effectId: "MINADO", stacks: 1, duration: 2 }],
    requirements: { manualOnly: true },
    requiredItems: [
      { itemId: "pergaminho_arsenal", amount: 2, exhaustToItemId: "pergaminho_arsenal_gasto" },
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
      { effectId: "BLEED", duration: 3 },
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
      // TRES pergaminhos abertos de uma vez cobrindo a area inteira numa chuva
      // continua de armas: o maior consumo do jogo, coerente com o que a
      // descricao promete (e o mesmo custo de restauro do antigo rank S).
      { itemId: "pergaminho_arsenal", amount: 3, exhaustToItemId: "pergaminho_arsenal_gasto" },
      { itemId: "kunai", amount: 20, consume: true },
      { itemId: "shuriken", amount: 20, consume: true },
    ],
    tags: ["projétil", "pergaminho"],
    description: "O pergaminho se abre acima do campo e cobre uma vasta área com uma chuva contínua de armas.",
  },
];
