import type { Ability, ClanDef } from "../types.js";

// ============================================================================
// PLACEHOLDER - ESTAS HABILIDADES SERAO APAGADAS
// ============================================================================
// Sharingan, Shintenshin e Juuken existem so para exercitar o sistema.
// Nao entram no projeto final e nao serao substituidas em lugar: somem.
// Mesma regra dos jutsus em ../jutsus/. Ver CLAUDE.md.
//
// => Nao invista em balanceamento fino daqui sem pedido.
// => Nao trate estes ids como contrato estavel.
// ============================================================================

// Abilities de cla (categoria CLA). Hooks identificados por string p/ a engine.
export const CLAN_ABILITIES: Ability[] = [
  // ---- Uchiha ----
  {
    id: "uchiha_sharingan1",
    name: "Sharingan (Nivel 1)",
    category: "CLA",
    tier: 1,
    resource: "chakra",
    cost: 5,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "uchiha" },
    tags: ["cla", "uchiha", "buff", "esquiva"],
    description: "Ativa o Sharingan: bonus em esquiva/reacao por leitura de movimentos.",
  },
  {
    id: "uchiha_genjutsu_sharingan",
    name: "Genjutsu: Sharingan",
    category: "CLA",
    tier: 2,
    resource: "chakra",
    cost: 22,
    actionType: "COMUM",
    range: 3,
    shape: "SINGLE_TARGET",
    scalingAttribute: "genjutsu",
    effects: [{ effectId: "STUN", duration: 1 }, { effectId: "DEFENSE_DOWN", duration: 2 }],
    requirements: { clanId: "uchiha", attributes: { genjutsu: 8 } },
    tags: ["cla", "uchiha", "genjutsu"],
    description: "Debuff mental curto via Sharingan.",
  },
  {
    id: "uchiha_sharingan2",
    name: "Sharingan (Nivel 2)",
    category: "CLA",
    tier: 3,
    resource: "chakra",
    cost: 8,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "uchiha", level: 20, attributes: { ninjutsu: 15 } },
    tags: ["cla", "uchiha", "buff"],
    description: "Sharingan avancado: melhora reacao e reduz custo de genjutsu.",
  },

  // ---- Yamanaka ----
  {
    id: "yamanaka_shintenshin",
    name: "Shintenshin no Jutsu",
    category: "CLA",
    tier: 2,
    resource: "chakra",
    cost: 40,
    actionType: "COMUM",
    range: 4,
    shape: "SINGLE_TARGET",
    scalingAttribute: "genjutsu",
    requirements: { clanId: "yamanaka", attributes: { genjutsu: 10 } },
    tags: ["cla", "yamanaka", "controle", "corpo"],
    description: "Transfere a consciencia para o alvo, controlando seu corpo. Custo alto e upkeep por turno.",
  },

  // ---- Hyuuga ----
  {
    id: "hyuuga_byakugan",
    name: "Byakugan",
    category: "CLA",
    tier: 1,
    resource: "chakra",
    cost: 5,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "hyuuga" },
    tags: ["cla", "hyuuga", "buff", "visao"],
    description: "Visao expandida: vantagem contra esquiva dos alvos e mais alcance de leitura.",
  },
  {
    id: "hyuuga_juuken",
    name: "Juuken",
    category: "CLA",
    tier: 2,
    resource: "energia",
    cost: 16,
    actionType: "COMUM",
    baseDamage: 14,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "NINJUTSU_BLOCK", duration: 1 }],
    requirements: { clanId: "hyuuga", attributes: { taijutsu: 8 } },
    tags: ["cla", "hyuuga", "chakra", "fisico"],
    description: "Golpe suave que fere os pontos de chakra; reduz uso de ninjutsu do alvo.",
    undodgeable: true,
  },

  // ---- Nara ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // nao pelo scan de autoUnlockJutsus — por isso `manualOnly: true` (o campo
  // `requirements` aqui e' so documentacao/gate informativo; quem realmente
  // concede e a compra do no na arvore, ver services/characters/skill-tree.ts).
  // As 4 técnicas de "imitação" (Possessão, Shuriken, Rede, Lírio) não têm
  // baseDamage: no material de origem a sombra não fere ninguém, só prende.
  // baseDamage: 0 (em vez de omitido) é o marcador que a engine lê pra saber
  // que é PRA aplicar o efeito mesmo sem dano — ver SHADOW_BOUND em
  // combat-engine.ts (resolveHit: zeroDamageByDesign). Enforcamento e Costura
  // continuam causando dano de verdade (mãos apertando/agulhas perfurando) e
  // usam ROOT normal, não SHADOW_BOUND.
  {
    id: "nara_possessao",
    name: "Técnica de Possessão da Sombra",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 20,
    actionType: "COMUM",
    baseDamage: 0,
    range: 5,
    shape: "LINE",
    effects: [{ effectId: "SHADOW_BOUND", duration: 2, chance: 0.65 }],
    requirements: { clanId: "nara", manualOnly: true },
    tags: ["nara", "sombra", "controle"],
    description:
      "Estende a sombra pelo chão em linha reta; se ela tocar a sombra do alvo, ele fica em Vínculo de Sombra — sem dano, mas incapaz de se mover ou reagir enquanto durar.",
  },
  {
    id: "nara_enforcamento",
    name: "Técnica de Enforcamento pela Sombra",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 27,
    actionType: "COMUM",
    baseDamage: 22,
    scalingAttribute: "ninjutsu",
    range: 5,
    shape: "SINGLE_TARGET",
    effects: [
      { effectId: "STUN", duration: 1, chance: 0.75 },
      { effectId: "ROOT", duration: 2 },
    ],
    requirements: { clanId: "nara", manualOnly: true },
    tags: ["nara", "sombra", "controle", "finalizador"],
    description:
      "Depois de capturar um alvo com a Possessão da Sombra, ela assume a forma de mãos que apertam o pescoço e o corpo, restringindo os movimentos e causando dano.",
  },
  {
    id: "nara_costura",
    name: "Técnica da Costura das Sombras",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 26,
    actionType: "COMUM",
    baseDamage: 16,
    scalingAttribute: "ninjutsu",
    range: 4,
    shape: "CONE",
    effects: [
      { effectId: "BLEED", stacks: 1, duration: 2, chance: 0.6 },
      { effectId: "ROOT", duration: 1, chance: 0.4 },
    ],
    requirements: { clanId: "nara", manualOnly: true },
    tags: ["nara", "sombra", "area", "perfuracao"],
    description:
      "A sombra se divide em agulhas que avançam pelo solo em leque, perfurando quem estiver na área e podendo prender os pés de quem for atingido.",
  },
  {
    id: "nara_shuriken",
    name: "Técnica de Imitação de Shuriken pela Sombra",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 36,
    actionType: "COMUM",
    baseDamage: 0,
    range: 6,
    shape: "SINGLE_TARGET",
    effects: [{ effectId: "SHADOW_BOUND", duration: 3 }],
    undodgeable: true,
    requirements: { clanId: "nara", manualOnly: true },
    tags: ["nara", "sombra", "precisao", "arma"],
    description:
      "Uma lâmina de chakra absorve a própria sombra do usuário; ao perfurar a sombra do alvo (não o corpo), ele entra em Vínculo de Sombra quase sem perceber o que aconteceu.",
  },
  {
    id: "nara_rede",
    name: "Rede de Imitação pela Sombra",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 38,
    actionType: "COMUM",
    baseDamage: 0,
    range: 6,
    shape: "RADIUS",
    effects: [{ effectId: "SHADOW_BOUND", duration: 3, chance: 0.85 }],
    requirements: { clanId: "nara", manualOnly: true },
    tags: ["nara", "sombra", "area", "controle"],
    description:
      "Divide a sombra em vários filamentos que se espalham pelo chão, prendendo todos os inimigos numa área em Vínculo de Sombra ao mesmo tempo.",
  },
  {
    id: "nara_lirio",
    name: "Lírio da Aranha Negra",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 50,
    actionType: "COMUM",
    baseDamage: 0,
    range: 6,
    shape: "RADIUS",
    effects: [{ effectId: "SHADOW_BOUND", duration: 2 }],
    push: -3,
    requirements: { clanId: "nara", manualOnly: true },
    tags: ["nara", "sombra", "area", "puxao", "apice"],
    description:
      "Envia tentáculos de sombra que alcançam os inimigos e os prendem com a Rede de Imitação (Vínculo de Sombra), puxando todos os capturados até um ponto — útil para arrastar o inimigo para dentro do alcance de outra técnica.",
  },
];

export const CLANS: ClanDef[] = [
  {
    id: "uchiha",
    name: "Uchiha",
    description: "Clã do Sharingan: leitura de movimentos, genjutsu e fogo.",
    passiveIds: [],
    activeIds: ["uchiha_sharingan1", "uchiha_genjutsu_sharingan", "uchiha_sharingan2"],
    hooks: { onAttacked: "uchiha_read" },
  },
  {
    id: "yamanaka",
    name: "Yamanaka",
    description: "Clã das técnicas mentais: controle de corpo (Shintenshin).",
    passiveIds: [],
    activeIds: ["yamanaka_shintenshin"],
    hooks: {},
  },
  {
    id: "hyuuga",
    name: "Hyuuga",
    description: "Clã do Byakugan: visão, anti-esquiva e golpes de chakra.",
    passiveIds: [],
    activeIds: ["hyuuga_byakugan", "hyuuga_juuken"],
    hooks: {},
  },

  // --------------------------------------------------------------------------
  // Clas sem abilities proprias ainda — so a identidade (nome/descricao) e o
  // primeiro elemento em ../clans/starting-element.ts. As habilidades de cla
  // sao placeholder (ver topo do arquivo); estes entram vazios de proposito.
  // --------------------------------------------------------------------------

  // ---- Konoha ----
  {
    id: "nara",
    name: "Nara",
    description: "Clã das sombras de Konoha: estrategistas que manipulam a própria sombra para prender o inimigo.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — ver comentario acima das abilities "---- Nara ----".
    activeIds: [
      "nara_possessao",
      "nara_enforcamento",
      "nara_costura",
      "nara_shuriken",
      "nara_rede",
      "nara_lirio",
    ],
    hooks: {},
  },
  {
    id: "senju",
    name: "Senju",
    description: "Clã da Floresta, fundador de Konoha: vitalidade imensa e forte afinidade com a água.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "inuzuka",
    name: "Inuzuka",
    description: "Clã dos ninken de Konoha: luta ao lado de cães, faro apurado e ataques de garra.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "akimichi",
    name: "Akimichi",
    description: "Clã da expansão de Konoha: converte calorias em tamanho e força bruta.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "sarutobi",
    name: "Sarutobi",
    description: "Clã do Terceiro Hokage: versáteis, com tradição de vento (Asuma).",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "uzumaki",
    name: "Uzumaki",
    description: "Clã de Uzushiogakure: chakra vasto, longevidade e mestria em fuinjutsu.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "aburame",
    name: "Aburame",
    description: "Clã dos insetos de Konoha: hospedam kikaichu que drenam o chakra alheio.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "hatake",
    name: "Hatake",
    description: "Linhagem de Kakashi: gênios versáteis com forte afinidade de raio.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "lee",
    name: "Lee",
    description: "Sem linhagem de sangue: pura mestria em taijutsu e trabalho duro.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },

  // ---- Suna ----
  {
    id: "kazekage",
    name: "Kazekage",
    description: "Linhagem dos Kazekage de Suna: controle de areia e Doton.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "shirogane",
    name: "Shirogane",
    description: "Clã de marionetistas de Sunagakure.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "kamaitachi",
    name: "Kamaitachi",
    description: "Clã do vento de Suna: golpes de foice de vento (kamaitachi).",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },

  // ---- Kiri ----
  {
    id: "hoshigaki",
    name: "Hoshigaki",
    description: "Clã de Kiri: aparência de tubarão e mestria absoluta em Suiton.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "hozuki",
    name: "Hozuki",
    description: "Clã de Kiri: hidrificação — o corpo se converte em água.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "kaguya",
    name: "Kaguya",
    description: "Clã de Kiri: Shikotsumyaku, a manipulação dos próprios ossos.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "karatachi",
    name: "Casa Karatachi",
    description: "Casa Karatachi de Kiri: linhagem do Yondaime Mizukage, Yagura.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "yuki",
    name: "Yuki",
    description: "Clã de Kiri: Hyoton, o Gelo — combina água e vento.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },

  // ---- Kumo ----
  {
    id: "yotsuki",
    name: "Yotsuki",
    description: "Clã de Kumo: força física e afinidade de raio.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "chinoike",
    name: "Chinoike",
    description: "Clã de Kumo: Ketsuryugan, o olho que domina o sangue.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "darui",
    name: "Darui",
    description: "Linhagem de Kumo: Ranton (Tempestade) e raio negro.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "raikage",
    name: "Raikage",
    description: "Linhagem dos Raikage de Kumo: armadura de raio e velocidade extrema.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },

  // ---- Iwa e outros ----
  {
    id: "bakurei",
    name: "Bakurei",
    description: "Clã de Iwagakure.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "kamizuru",
    name: "Kamizuru",
    description: "Clã das abelhas de Iwa, antigos rivais dos Aburame.",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "onoki",
    name: "Onoki",
    description: "Linhagem dos Tsuchikage de Iwa: Doton e o Jinton (Poeira).",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
  {
    id: "kakuzu",
    name: "Kakuzu",
    description: "Linhagem de Takigakure: domina as cinco naturezas (Corações de Terror).",
    passiveIds: [],
    activeIds: [],
    hooks: {},
  },
];
