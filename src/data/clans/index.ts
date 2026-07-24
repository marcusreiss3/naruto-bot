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
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // igual o Nara: `manualOnly: true` porque quem concede e' a compra do no,
  // nao o scan de autoUnlockJutsus. Categoria reflete a natureza real da
  // tecnica (Byakugan = NINJUTSU/chakra; o resto = TAIJUTSU/fisico), nao
  // "CLA" generico — mesma correcao aplicada ao Nara.
  {
    id: "hyuuga_byakugan",
    name: "Byakugan",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    // custo 0: nunca e' "usada" via /jutsu — e' ligada/desligada com
    // /combate byakugan (mesmo padrao da Tecnica da Caminhada Aquatica),
    // gasta BALANCE.byakuganUpkeepPerTurn por turno enquanto ativa.
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "visao", "byakugan"],
    description:
      "O dōjutsu do clã. Ative e desative a qualquer momento com /combate byakugan: enquanto ligado, dá +10% de chance de esquiva contra qualquer ataque e gasta 5% de chakra por rodada — desliga sozinho se o chakra acabar.",
  },
  {
    id: "hyuuga_punho_suave",
    name: "Punho Suave",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 16,
    actionType: "COMUM",
    baseDamage: 14,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "NINJUTSU_BLOCK", duration: 1, chance: 0.4 }],
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "fisico"],
    description:
      "Estilo de combate básico dos Hyūga: injeta chakra no golpe para ferir órgãos internos e a rede de chakra do adversário, em vez de só o corpo. 40% de chance de bloquear o Ninjutsu do alvo por 1 rodada.",
  },
  {
    id: "hyuuga_palma_vacuo",
    name: "Oito Trigramas: Palma de Vácuo",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 26,
    actionType: "COMUM",
    baseDamage: 22,
    scalingAttribute: "taijutsu",
    range: 4,
    shape: "SINGLE_TARGET",
    undodgeable: true,
    push: 3,
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "precisao", "impacto"],
    description:
      "Usando o Byakugan como mira, identifica os pontos vitais do oponente e dispara uma 'bala de vácuo' comprimida à distância — não pode ser esquivada e empurra o alvo 3 casas para trás antes mesmo dele perceber o que aconteceu.",
  },
  {
    id: "hyuuga_64_palmas",
    name: "Oito Trigramas: 64 Palmas",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 27,
    actionType: "COMUM",
    baseDamage: 24,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [
      { effectId: "NINJUTSU_BLOCK", duration: 2, chance: 0.85 },
      { effectId: "STUN", duration: 1, chance: 0.3 },
    ],
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "barragem"],
    description:
      "Sequência de 64 golpes extremamente rápidos que bloqueiam dezenas de tenketsu de uma vez: 85% de chance de bloquear o Ninjutsu do alvo por 2 rodadas, e 30% de chance de Atordoar por 1 rodada.",
  },
  {
    id: "hyuuga_palma_rotativa",
    name: "Palma Rotativa",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 24,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "SHIELD", stacks: 24, duration: 3 }],
    cleanses: ["ROOT"],
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "defesa", "barreira"],
    description:
      "Gira rapidamente enquanto libera chakra por todos os tenketsu, criando uma esfera defensiva quase impenetrável. Ganha 24 pontos de Barreira por 3 rodadas e livra você de ficar preso ao chão.",
  },
  {
    id: "hyuuga_128_palmas",
    name: "Oito Trigramas: 128 Palmas",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 34,
    actionType: "COMUM",
    baseDamage: 20,
    scalingAttribute: "taijutsu",
    range: 4,
    shape: "RADIUS",
    effects: [
      { effectId: "NINJUTSU_BLOCK", duration: 2, chance: 0.8 },
      { effectId: "SLOW", duration: 2, chance: 0.5 },
    ],
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "area", "barragem"],
    description:
      "Versão em dobro de velocidade das 64 Palmas: 80% de chance de bloquear o Ninjutsu do alvo por 2 rodadas e 50% de chance de deixá-lo mais lento por 2 rodadas.",
  },
  {
    id: "hyuuga_leoes_gemeos",
    name: "Punhos dos Leões Gêmeos",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 52,
    actionType: "COMUM",
    baseDamage: 36,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    undodgeable: true,
    effects: [
      { effectId: "NINJUTSU_BLOCK", duration: 3 },
      { effectId: "DEFENSE_DOWN", duration: 2 },
    ],
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "apice", "finalizador"],
    description:
      "Libera uma grande quantidade de chakra pelos punhos, moldado em duas cabeças de leão. Não pode ser esquivado. Ao acertar, destroça por completo os meridianos do alvo: bloqueia o Ninjutsu dele por 3 rodadas e reduz a defesa dele por 2 rodadas.",
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

  // ---- Akimichi ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao do Nara/Hyuuga. As tecnicas de "crescer" (Parcial, Tamanho
  // Multiplo, Super Tamanho Multiplo) sao NINJUTSU (manipulacao de chakra pra
  // mudar o corpo, mesmo que o efeito seja fisico); as de "usar o corpo
  // grande pra bater" (Tanque, Mergulho, Bofetada, Bombardeio) sao TAIJUTSU
  // de verdade. baseDamage omitido (nao 0) nos jutsu SELF de buff, porque
  // SELF nao passa pelo gate damage>0 — nao precisa do truque do Nara.
  {
    id: "akimichi_baika_parcial",
    name: "Técnica do Tamanho Múltiplo Parcial",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 18,
    actionType: "COMUM",
    baseDamage: 16,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    push: 2,
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "tamanho", "fisico"],
    description:
      "Incha uma única parte do corpo — geralmente braço ou perna — e usa o peso extra pra golpear com muito mais força. Empurra o alvo 2 casas pra trás.",
  },
  {
    id: "akimichi_baika",
    name: "Técnica do Tamanho Múltiplo",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 20,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "SHIELD", stacks: 20, duration: 4, replaceGroup: "akimichi_forma" }],
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "tamanho", "buff"],
    description:
      "Altera livremente o próprio tamanho e consegue manter a forma por um período extenso — consome muitas calorias, mas o corpo maior absorve muito mais impacto.",
  },
  {
    id: "akimichi_tanque",
    name: "Tanque da Bala Humana",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 27,
    actionType: "COMUM",
    baseDamage: 22,
    scalingAttribute: "taijutsu",
    range: 3,
    shape: "LINE",
    push: 2,
    effects: [{ effectId: "STUN", duration: 1, chance: 0.3 }],
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "tamanho", "impacto"],
    description:
      "Depois da Técnica do Tamanho Múltiplo, dobra os membros e usa chakra pra se impulsionar num rolo poderoso — a força de rotação é capaz de pulverizar o que estiver no caminho.",
  },
  {
    id: "akimichi_super_baika",
    name: "Técnica do Super Tamanho Múltiplo",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 27,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "SHIELD", stacks: 32, duration: 4, replaceGroup: "akimichi_forma" }],
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "tamanho", "buff", "gigante"],
    description:
      "A versão mais poderosa da Técnica do Tamanho Múltiplo: multiplica o corpo pra um tamanho inacreditável. Substitui a Barreira da Técnica do Tamanho Múltiplo em vez de somar com ela — é a mesma forma, só maior.",
  },
  {
    id: "akimichi_mergulho",
    name: "Mergulho Gordinho",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 36,
    actionType: "COMUM",
    baseDamage: 28,
    scalingAttribute: "taijutsu",
    range: 4,
    shape: "RADIUS",
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "gigante", "area", "impacto"],
    description:
      "Depois da Técnica do Super Tamanho Múltiplo, pula de grande altura sobre uma área e a devasta com o próprio peso.",
  },
  {
    id: "akimichi_bofetada",
    name: "Super Bofetada",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 37,
    actionType: "COMUM",
    baseDamage: 30,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    undodgeable: true,
    push: 3,
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "gigante", "impacto"],
    description:
      "Depois da Técnica do Super Tamanho Múltiplo, desfere um tapa mortal com as duas mãos: a concentração de chakra ativa os músculos e aumenta ainda mais a massa do golpe. Não pode ser esquivada.",
  },
  {
    // id = "akimichi_apice" pra bater com o grantsAbilityId padrao do no
    // homonimo na arvore (clan-trees/index.ts). Skill com duracao, NAO
    // passiva permanente — o pedido original era "muito forte ser passiva".
    id: "akimichi_apice",
    name: "Pílula Secreta",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 25,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    effects: [
      { effectId: "EMPOWERED", duration: 3, onExpire: { effectId: "DEFENSE_DOWN", duration: 2 } },
    ],
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "pilulas", "buff", "risco"],
    description:
      "Engole uma das pílulas secretas do clã: por 3 rodadas, +60% de dano nos seus golpes. Quando o efeito passa, o corpo cobra o preço: reduz a defesa por 2 rodadas.",
  },
  {
    id: "akimichi_modo_borboleta",
    name: "Modo Borboleta",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 30,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "SHIELD", stacks: 20, duration: 2 }],
    cleanses: ["BURN", "POISON", "BLEED", "SLOW"],
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "borboleta", "pilulas", "buff"],
    description:
      "Converte calorias em chakra puro: fazem brotar borboletas de chakra nas costas, multiplicando a força bruta do usuário. Limpa Queimadura, Veneno, Sangramento e Lentidão.",
  },
  {
    id: "akimichi_bombardeio",
    name: "Bombardeio da Borboleta",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 55,
    actionType: "COMUM",
    baseDamage: 40,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    undodgeable: true,
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "borboleta", "apice", "finalizador"],
    description:
      "Depois do Modo Borboleta, concentra todo o poder acumulado num único golpe de taijutsu devastador. Não pode ser esquivado.",
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
    description: "Clã do Byakugan: visão, Punho Suave e o selamento do chakra do adversário.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao do Nara.
    activeIds: [
      "hyuuga_byakugan",
      "hyuuga_punho_suave",
      "hyuuga_palma_vacuo",
      "hyuuga_64_palmas",
      "hyuuga_palma_rotativa",
      "hyuuga_128_palmas",
      "hyuuga_leoes_gemeos",
    ],
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
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao do Nara/Hyuuga.
    activeIds: [
      "akimichi_baika_parcial",
      "akimichi_baika",
      "akimichi_tanque",
      "akimichi_super_baika",
      "akimichi_mergulho",
      "akimichi_bofetada",
      "akimichi_apice",
      "akimichi_modo_borboleta",
      "akimichi_bombardeio",
    ],
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
