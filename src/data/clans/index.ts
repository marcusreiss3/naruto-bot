import type { Ability, ClanDef } from "../types.js";

// Abilities de cla (categoria CLA). Hooks identificados por string p/ a engine.
export const CLAN_ABILITIES: Ability[] = [
  // ---- Uchiha ----
  {
    id: "uchiha_sharingan_1_tomoe",
    name: "Sharingan: Primeiro Tomoe",
    category: "DOJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "uchiha", manualOnly: true },
    tags: ["cla", "uchiha", "doujutsu", "buff", "esquiva"],
    toggleRules: {
      command: "/combate sharingan tomoe:1",
      dodgeBonus: 0.03,
      upkeepPerTurn: 5,
      disablesWithoutResource: true,
    },
    visualDescription:
      "A íris do usuário se torna vermelha e revela um único tomoe negro girando ao redor da pupila.",
    description:
      "Desperta o primeiro tomoe do Sharingan. Enquanto estiver ativo, concede +3% de esquiva e consome 5% de chakra por turno.",
  },
  {
    id: "uchiha_sharingan_2_tomoe",
    name: "Sharingan: Segundo Tomoe",
    category: "DOJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "uchiha", manualOnly: true },
    tags: ["cla", "uchiha", "doujutsu", "buff", "esquiva"],
    toggleRules: {
      command: "/combate sharingan tomoe:2",
      dodgeBonus: 0.05,
      upkeepPerTurn: 7,
      disablesWithoutResource: true,
    },
    visualDescription:
      "Um segundo tomoe surge na íris vermelha, e os dois símbolos passam a acompanhar cada movimento diante do usuário.",
    description:
      "Evolui o Sharingan para dois tomoe. Enquanto estiver ativo, concede +5% de esquiva e consome 7% de chakra por turno.",
  },
  {
    id: "uchiha_sharingan_3_tomoe",
    name: "Sharingan: Terceiro Tomoe",
    category: "DOJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "uchiha", manualOnly: true },
    tags: ["cla", "uchiha", "doujutsu", "buff", "esquiva", "copia"],
    toggleRules: {
      command: "/combate sharingan tomoe:3",
      dodgeBonus: 0.1,
      upkeepPerTurn: 9,
      disablesWithoutResource: true,
    },
    visualDescription:
      "O terceiro tomoe acompanha os movimentos do adversário e grava permanentemente no arsenal as técnicas elementais que consegue copiar.",
    description:
      "Completa o Sharingan de três tomoe. Enquanto estiver ativo, concede +10% de esquiva, consome 9% de chakra por turno e aprende permanentemente apenas Ninjutsus de Fogo, Água, Vento, Terra e Raio, além dos jutsus ativos de Punho Forte, Arhat e Adamantino observados em combate. Não copia passivas. Cada cópia exige nível e os pontos do atributo da própria árvore; Ninjutsu elemental ainda exige afinidade.",
  },
  {
    id: "uchiha_mangekyo_sharingan",
    name: "Mangekyō Sharingan",
    category: "DOJUTSU",
    tier: 4,
    resource: "chakra",
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "uchiha", manualOnly: true },
    tags: ["cla", "uchiha", "doujutsu", "mangekyo"],
    description:
      "O Mangekyō desperta após um Trauma e manifesta uma variação única: Itachi, Sasuke, Shisui, Obito ou Madara. Seus caminhos exclusivos serão adicionados futuramente.",
  },

  // ---- Yamanaka ----
  // Concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao pelo
  // scan de autoUnlockJutsus — por isso `manualOnly: true` em todas (mesmo
  // padrao do Nara/Hyuuga). baseDamage: 0 de proposito (nao machuca, so'
  // captura) — mesmo padrao do Nara (nara_possessao). unguardable: so' da
  // pra esquivar, bloqueio/aparo nao adiantam contra uma transferencia de
  // mente. mindTransfer: ao acertar, establishControl() (combat-engine.ts)
  // toma o corpo do alvo em vez de causar dano. Ver BALANCE.yamanaka pro
  // upkeep/dano reduzido/disputa.
  {
    id: "yamanaka_shintenshin",
    name: "Técnica de Transferência de Mente",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 40,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "SINGLE_TARGET",
    scalingAttribute: "ninjutsu",
    unguardable: true,
    mindTransfer: true,
    requirements: { clanId: "yamanaka", attributes: { ninjutsu: 10 }, manualOnly: true },
    tags: ["cla", "yamanaka", "controle", "corpo", "mental"],
    visualDescription:
      "A consciência do usuário abandona o próprio corpo como um fluxo invisível e invade a mente do alvo.",
    description:
      "Projeta a consciência para o corpo do alvo, assumindo o controle — só dá pra esquivar, bloqueio e aparo não adiantam contra um ataque mental. Enquanto durar, seu corpo original fica imóvel e vulnerável, e todo dano que o corpo tomado sofrer também atinge o seu. Gasta muito chakra, e mais um pouco a cada turno pra manter o controle; o dono do corpo tenta expulsar sua mente a cada rodada.",
  },
  // baseDamage: 0 de proposito (so' efeito, nao machuca). Sem unguardable/
  // undodgeable: como o dano nunca passa de 0, so' a ESQUIVA impede o efeito
  // de "landed" (ver effectsLanded em effects.ts) — bloqueio/aparo nao
  // reduzem um dano que ja' era zero, entao a interferencia mental passa por
  // cima deles do mesmo jeito. Reusa CONFUSION (ja' mira alvo aleatorio,
  // aliado ou inimigo — services/combat/effects.ts:isConfused).
  {
    id: "yamanaka_destruicao_mente",
    name: "Técnica de Destruição de Mente",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 10,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "SINGLE_TARGET",
    scalingAttribute: "ninjutsu",
    effects: [{ effectId: "CONFUSION", duration: 1 }],
    requirements: { clanId: "yamanaka", attributes: { ninjutsu: 6 }, manualOnly: true },
    tags: ["cla", "yamanaka", "ninjutsu", "confusao", "mental"],
    description:
      "Interfere na mente do alvo — se ele não esquivar, perde a noção de aliados e inimigos por um turno: o próximo ataque dele mira alguém aleatório, não importa quem ele escolher.",
  },
  // Versao multi-alvo da Transferencia de Mente: mindTransferMax controla quantos corpos
  // simultaneos essa ability pode tomar (establishControl rejeita alem do
  // teto), mindTransferTurns fixa uma duracao (sem disputa de Genjutsu —
  // libera sozinho, ver processTurnStart). Inevitavel: nenhuma reacao impede
  // a tecnica, pois os clones encontram as mentes visadas.
  {
    id: "yamanaka_clones_shintenshin",
    name: "Técnicas dos Clones de Transferência de Mente",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 80,
    actionType: "COMUM",
    baseDamage: 0,
    range: 6,
    shape: "RADIUS",
    scalingAttribute: "ninjutsu",
    unblockable: true,
    oncePerCombat: true,
    mindTransfer: true,
    mindTransferMax: 3,
    mindTransferTurns: 1,
    requirements: { clanId: "yamanaka", level: 25, attributes: { ninjutsu: 20 }, manualOnly: true },
    tags: ["cla", "yamanaka", "controle", "corpo", "mental", "area"],
    visualDescription:
      "Replicas da consciencia atravessam o campo em silencio e invadem as mentes inimigas, enquanto o corpo do usuario permanece vulneravel onde esta.",
    description:
      "Divide a consciência em vários alvos ao mesmo tempo (até 3), tomando o controle total de cada corpo. É Inevitável — diferente da Técnica de Transferência de Mente, não dá pra resistir: o controle dura exatamente 1 turno por corpo e se desfaz sozinho depois. Enquanto durar, seu corpo original fica imóvel e vulnerável.",
  },
  // Buff SELF que atinge o time inteiro (teamBuff, ver bloco SELF em
  // useAbility, combat-engine.ts) em vez de so' o ator. Reusa HASTE pronto —
  // nao precisa de efeito novo. teamBuffMax: 3 conta o proprio usuario.
  {
    id: "yamanaka_transmissao_mentes",
    name: "Técnica de Transmissão de Mentes",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 21,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "HASTE", duration: 3 }],
    teamBuff: true,
    teamBuffMax: 3,
    requirements: { clanId: "yamanaka", manualOnly: true },
    tags: ["cla", "yamanaka", "buff", "equipe", "mental"],
    description:
      "Cria uma rede telepática entre até 3 aliados (contando o usuário) — comunicação instantânea deixa o grupo mais ágil e reativo por um tempo (Aceleração).",
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
    category: "DOJUTSU",
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
    toggleRules: {
      command: "/combate byakugan",
      dodgeBonus: 0.1,
      upkeepPerTurn: 5,
      disablesWithoutResource: true,
      cloneDodgeReduction: 0.5,
    },
    visualDescription:
      "Veias saltam ao redor dos olhos enquanto sua visao se expande pelo campo. Fluxos de chakra, movimentos sutis e falsos corpos ganham uma nitidez sobrenatural.",
    description:
      "O dōjutsu do clã. Ative e desative a qualquer momento com /combate byakugan: enquanto ligado, dá +10% de chance de esquiva contra qualquer ataque, gasta 5% de chakra por rodada (desliga sozinho se o chakra acabar) e enxerga através de clones/substituição — corta pela metade o bônus de esquiva de quem tentar escapar de você com esses truques.",
  },
  {
    id: "hyuuga_punho_suave",
    name: "Punho Suave",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 15,
    actionType: "COMUM",
    // rebalanceamento 06/08/2026: kit inteiro do Hyuuga tava com dano base
    // sistematicamente abaixo dos outros clas de dano (ver clan-balance-report.ts).
    // 14 -> 18, dentro da faixa generica de tier 1 (14-18).
    baseDamage: 18,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "TENKETSU_SEAL", duration: 1, chance: 0.4 }],
    requiresActiveDoujutsu: { flag: "byakuganActive", label: "Byakugan" },
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "fisico"],
    description:
      "Estilo de combate básico dos Hyūga: injeta chakra no golpe para ferir órgãos internos e a rede de chakra do adversário, em vez de só o corpo. 40% de chance de selar os tenketsu do alvo por 1 rodada. Exige o Byakugan ativo.",
  },
  {
    id: "hyuuga_palma_vacuo",
    name: "Oito Trigramas: Palma de Vácuo",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 22,
    actionType: "COMUM",
    baseDamage: 26, // rebalanceamento 06/08/2026 (era 22), ver hyuuga_punho_suave
    scalingAttribute: "taijutsu",
    range: 4,
    shape: "SINGLE_TARGET",
    // undodgeable, nao unguardable (09/08/2026): a ability E o no da arvore
    // sempre descreveram uma bala de vacuo que acerta "antes mesmo dele
    // perceber o que aconteceu" — isso e' negar ESQUIVA. O dado dizia
    // unguardable (nega Bloqueio/Aparo), contradizendo os dois textos.
    undodgeable: true,
    push: 3,
    requiresActiveDoujutsu: { flag: "byakuganActive", label: "Byakugan" },
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "precisao", "impacto"],
    description:
      "Usando o Byakugan como mira, identifica os pontos vitais do oponente e dispara uma 'bala de vácuo' comprimida à distância — não pode ser esquivada e empurra o alvo 3 casas para trás antes mesmo dele perceber o que aconteceu. Exige o Byakugan ativo.",
  },
  {
    id: "hyuuga_64_palmas",
    name: "Oito Trigramas: 64 Palmas",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 31,
    actionType: "COMUM",
    baseDamage: 28, // rebalanceamento 06/08/2026 (era 24), ver hyuuga_punho_suave
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [
      { effectId: "TENKETSU_SEAL", duration: 1, chance: 0.75 },
      { effectId: "STUN", duration: 1, chance: 0.3 },
    ],
    requiresActiveDoujutsu: { flag: "byakuganActive", label: "Byakugan" },
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "barragem"],
    description:
      "Sequência de 64 golpes extremamente rápidos que bloqueiam dezenas de tenketsu de uma vez: 75% de chance de selar os tenketsu do alvo por 1 rodada, e 30% de chance de Atordoar por 1 rodada. Exige o Byakugan ativo.",
  },
  {
    id: "hyuuga_palma_rotativa",
    name: "Palma Rotativa",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 24,
    actionType: "REACAO",
    reactionKind: "BLOCK",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "SHIELD", stacks: 7, hpPercentStacks: 0.09, duration: 3 }],
    cleanses: ["ROOT"],
    requiresActiveDoujutsu: { flag: "byakuganActive", label: "Byakugan" },
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "defesa", "barreira"],
    description:
      "Gira rapidamente enquanto libera chakra por todos os tenketsu, criando uma esfera defensiva quase impenetrável. Ganha uma Barreira que cresce com sua vida máxima por 3 rodadas e livra você de ficar preso ao chão. Exige o Byakugan ativo.",
  },
  {
    id: "hyuuga_128_palmas",
    name: "Oito Trigramas: 128 Palmas",
    category: "TAIJUTSU",
    tier: 3,
    // 27 -> 38 (09/08/2026): com o dano em 33 a tecnica virou o maior outlier
    // do roster no audit de custo (sugeria 50 contra 27 cobrados). Era a unica
    // do clan que dava MAIS dano que as 64 Palmas custando MENOS que elas (31).
    resource: "energia",
    cost: 38,
    actionType: "COMUM",
    // rebalanceamento 06/08/2026 (era 20): area (RADIUS) continua pagando
    // menos que alvo unico do mesmo tier (Leoes Gemeos, 40) — mas precisa
    // ficar ACIMA de 64 Palmas (28, tier 2, MELEE), nao abaixo como estava.
    baseDamage: 33,
    scalingAttribute: "taijutsu",
    range: 4,
    shape: "RADIUS",
    effects: [
      { effectId: "TENKETSU_SEAL", duration: 1, chance: 0.8 },
      { effectId: "SLOW", duration: 2, chance: 0.5 },
    ],
    requiresActiveDoujutsu: { flag: "byakuganActive", label: "Byakugan" },
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "area", "barragem"],
    description:
      "Versão em dobro de velocidade das 64 Palmas: 80% de chance de selar os tenketsu do alvo por 1 rodada e 50% de chance de deixá-lo mais lento por 2 rodadas. Exige o Byakugan ativo.",
  },
  {
    id: "hyuuga_leoes_gemeos",
    name: "Punhos dos Leões Gêmeos",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    // 66 -> 60 em 09/08/2026: era o unico do kit a cobrar PREMIO sobre a regua
    // (-2) exigindo o mesmo Byakugan que da' desconto de +3 a +9 nos outros
    // quatro. 60 o poe a +4, no meio da faixa dos irmaos. Nao muda o numero de
    // usos (2x60 > 100 do mesmo jeito) — muda o que sobra pro resto do turno.
    cost: 60,
    actionType: "COMUM",
    baseDamage: 40, // rebalanceamento 06/08/2026 (era 36), ver hyuuga_punho_suave
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    undodgeable: true,
    effects: [
      { effectId: "TENKETSU_SEAL", duration: 2 },
      { effectId: "DEFENSE_DOWN", duration: 2 },
    ],
    requiresActiveDoujutsu: { flag: "byakuganActive", label: "Byakugan" },
    requirements: { clanId: "hyuuga", manualOnly: true },
    tags: ["hyuuga", "tenketsu", "apice", "finalizador"],
    description:
      "Libera uma grande quantidade de chakra pelos punhos, moldado em duas cabeças de leão. Não pode ser esquivado. Ao acertar, destroça por completo os meridianos do alvo: sela os tenketsu dele por 2 rodadas e reduz a defesa dele por 2 rodadas. Exige o Byakugan ativo.",
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
    cost: 27,
    actionType: "COMUM",
    baseDamage: 0,
    range: 5,
    shape: "LINE",
    effects: [{ effectId: "SHADOW_BOUND", duration: 2 }],
    unguardable: true,
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
    cost: 29,
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
    cost: 20,
    actionType: "COMUM",
    baseDamage: 16,
    scalingAttribute: "ninjutsu",
    range: 4,
    shape: "CONE",
    effects: [
      { effectId: "BLEED", duration: 2, chance: 0.6 },
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
    cost: 35,
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
    effects: [{ effectId: "SHADOW_BOUND", duration: 3 }],
    unguardable: true,
    requirements: { clanId: "nara", manualOnly: true },
    tags: ["nara", "sombra", "area", "controle"],
    visualDescription:
      "Filamentos de sombra deslizam pelo chao e se entrelacam ao redor dos adversarios, como uma rede viva que fecha o campo.",
    description:
      "Divide a sombra em vários filamentos que se espalham pelo chão, prendendo todos os inimigos numa área em Vínculo de Sombra ao mesmo tempo.",
  },
  {
    id: "nara_lirio",
    name: "Lírio da Aranha Negra",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 24,
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
    cost: 15,
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
    cost: 24,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "SHIELD", stacks: 5, hpPercentStacks: 0.06, duration: 4, replaceGroup: "akimichi_forma" }],
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
    cost: 23,
    actionType: "COMUM",
    baseDamage: 22,
    scalingAttribute: "taijutsu",
    range: 3,
    shape: "LINE",
    push: 2,
    effects: [{ effectId: "STUN", duration: 1, chance: 0.3 }],
    requiresActiveEffectFromAbilityId: "akimichi_baika",
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
    cost: 24,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "SHIELD", stacks: 7, hpPercentStacks: 0.09, duration: 4, replaceGroup: "akimichi_forma" }],
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
    cost: 32,
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
    requiresActiveEffectFromAbilityId: "akimichi_super_baika",
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "gigante", "impacto"],
    description:
      "Depois da Técnica do Super Tamanho Múltiplo, desfere um tapa mortal com as duas mãos: a concentração de chakra ativa os músculos e aumenta ainda mais a massa do golpe. Não pode ser esquivada.",
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
    effects: [{ effectId: "SHIELD", stacks: 9, hpPercentStacks: 0.13, duration: 2 }],
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
    cost: 45,
    actionType: "COMUM",
    baseDamage: 36,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    unguardable: true,
    requiresActiveEffectFromAbilityId: "akimichi_modo_borboleta",
    requirements: { clanId: "akimichi", manualOnly: true },
    tags: ["akimichi", "borboleta", "apice", "finalizador"],
    description:
      "Depois do Modo Borboleta, concentra todo o poder acumulado num único golpe de taijutsu devastador. Ignora Bloqueio e Aparo.",
  },

  // ---- Aburame ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. Todas NINJUTSU (chakra manipulando o proprio
  // enxame de kikaichu, mesmo quando o resultado e' fisico/dano). O tronco
  // (Clones de Inseto -> Casulo) e' generico; dali a arvore se ramifica em
  // Kikaichu (Esfera/Parede/Mordida — controle e dreno de chakra, sem
  // veneno) e Rinkaichu (Nuvem/Jarro de Veneno — a linhagem venenosa de
  // Torune). Nenhuma tem baseDamage de sobra: o clã ganha por DRENAR e
  // ENVENENAR, nao por rajada (como o Nara ganha por controle, nao dano).
  {
    id: "aburame_clone_inseto",
    name: "Técnica dos Clones de Inseto",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 16,
    actionType: "REACAO",
    reactionKind: "DODGE",
    reactionDodgeBonus: 0.22,
    isCloneTrick: true,
    range: 0,
    shape: "SELF",
    requirements: { clanId: "aburame", manualOnly: true },
    tags: ["aburame", "inseto", "reacao", "fuga"],
    description:
      "Um clone formado por milhares de kikaichū assume o próprio lugar no instante do golpe. Como reação, dá +22% de chance de esquiva contra o ataque: se for atingido mesmo assim, o clone se desfaz num enxame que confunde o atacante, abrindo espaço pra fugir ou contra-atacar.",
  },
  {
    id: "aburame_casulo",
    name: "Casulo de Insetos",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 28,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [
      { effectId: "ROOT", duration: 2 },
      { effectId: "DEFENSE_DOWN", duration: 2 },
      { effectId: "EMPOWERED", stacks: 1.3, duration: 3, empoweredScope: "ninjutsu" },
    ],
    requirements: { clanId: "aburame", manualOnly: true },
    tags: ["aburame", "inseto", "buff", "risco"],
    visualDescription:
      "Um casulo espesso, formado por seda e insetos, se fecha completamente ao redor do usuário.",
    description:
      "Um casulo espesso, formado por seda e insetos, se fecha completamente ao redor do usuário.",
  },
  {
    id: "aburame_esfera",
    name: "Esfera de Insetos",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 20,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "SINGLE_TARGET",
    effects: [
      { effectId: "ROOT", duration: 2 },
      { effectId: "CHAKRA_DRAIN", duration: 3, chance: 0.85 },
      { effectId: "FLEE_LOCK", duration: 2 },
    ],
    requirements: { clanId: "aburame", manualOnly: true },
    tags: ["aburame", "inseto", "controle", "dreno"],
    description:
      "Os kikaichū cercam completamente o alvo, formando uma esfera viva: ele fica preso ao chão e não consegue fugir por 2 rodadas, com 85% de chance de perder 10% de chakra por turno por 3 rodadas.",
  },
  {
    id: "aburame_nuvem_veneno",
    name: "Técnica da Nuvem de Veneno",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 13,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "CONE",
    effects: [{ effectId: "POISON", stacks: 2, duration: 3, chance: 0.7 }],
    terrain: { kind: "SMOKE", duration: 1 },
    requirements: { clanId: "aburame", manualOnly: true },
    tags: ["aburame", "inseto", "veneno", "area"],
    description:
      "Explode uma esfera de rinkaichū numa cortina de veneno bem na frente do usuário: se dissipa rápido se não acertar ninguém, mas quem for tocado ou respirar a nuvem tem 70% de chance de ficar com Veneno por 3 rodadas.",
  },
  {
    id: "aburame_parede",
    name: "Parede de Insetos",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 20,
    actionType: "COMUM",
    range: 2,
    shape: "ALLY",
    effects: [{ effectId: "SHIELD", stacks: 7, hpPercentStacks: 0.09, duration: 3 }],
    requirements: { clanId: "aburame", manualOnly: true },
    tags: ["aburame", "inseto", "defesa", "barreira"],
    description:
      "Um enxame denso forma uma parede viva de insetos, resistente o bastante pra aguentar entulho caindo ou fogo: dá uma Barreira que cresce com a vida máxima de quem recebe (você ou um aliado próximo) por 3 rodadas. Não segura gases, como uma cortina de veneno.",
  },
  {
    id: "aburame_jarro_veneno",
    name: "Técnica do Jarro de Veneno",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 27,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "RADIUS",
    effects: [
      { effectId: "POISON", stacks: 3, duration: 4, chance: 0.75 },
      { effectId: "CHAKRA_DRAIN", duration: 3, chance: 0.85 },
      { effectId: "FLEE_LOCK", duration: 3 },
    ],
    requirements: { clanId: "aburame", manualOnly: true },
    tags: ["aburame", "inseto", "veneno", "area", "prisao", "finalizador"],
    description:
      "Concentra uma quantidade enorme de rinkaichū numa área fechada: quem estiver dentro não consegue fugir por 3 rodadas, com 75% de chance de ficar com Veneno por 4 rodadas e 85% de chance de perder 10% de chakra por turno por 3 rodadas.",
  },
  {
    id: "aburame_mordida",
    name: "Inseto Parasita Gigante — Mordida de Inseto",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 21,
    actionType: "COMUM",
    baseDamage: 10,
    scalingAttribute: "ninjutsu",
    range: 1,
    shape: "MELEE",
    effects: [
      { effectId: "BLEED", duration: 3 },
      { effectId: "CHAKRA_DRAIN", duration: 3, chance: 0.85 },
    ],
    requirements: { clanId: "aburame", manualOnly: true },
    tags: ["aburame", "inseto", "dreno", "finalizador"],
    description:
      "Planta uma leva de kidaichū na pele do alvo: eles se enterram na hora e passam a devorar carne e chakra, crescendo enquanto se alimentam — o hospedeiro sangra por 3 rodadas, com 85% de chance de perder 10% de chakra por turno pelo mesmo período.",
  },

  // ---- Inuzuka ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. "Crescer/transformar" (Cao Ninja, Clone da
  // Besta, as duas Fusoes) sao NINJUTSU/chakra; "usar o corpo pra bater"
  // (Sobre Presa e as duas Presas) sao TAIJUTSU/energia — mesma logica do
  // Akimichi. `requiresPet: true` marca as tecnicas que dependem do cao
  // ninja vivo em campo (ver useAbility() em combat-engine.ts): se ele
  // morreu na luta, elas ficam bloqueadas ate o combate acabar.
  {
    id: "inuzuka_cao_ninja",
    name: "Cão Ninja",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 15,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    oncePerCombat: true,
    summon: { templateId: "cao_ninja", hpFraction: 1 / 3 },
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "cao", "invocacao"],
    description:
      "Invoca seu cão ninja: um companheiro treinado desde filhote. Ele entra no mapa com 1/3 da sua vida máxima e ataca sozinho todo turno, como uma invocação comum. Só pode ser chamado uma vez por combate: se ele cair em combate, as técnicas que dependem dele ficam bloqueadas até o fim da luta — mas ele volta saudável na próxima.",
  },
  {
    id: "inuzuka_quatro_patas",
    name: "Técnica das Quatro Patas",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 21,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "HASTE", duration: 3 }],
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "buff", "instinto"],
    description:
      "Assume uma postura animal, ficando Acelerado por 3 rodadas: o movimento aumenta em 2 casas, a esquiva em 10 pontos percentuais e a chance de fuga em 25 pontos percentuais. As unhas afiadas devolvem 8 de dano em quem acertar você corpo a corpo.",
  },
  {
    id: "inuzuka_clone_besta",
    name: "Clone da Besta Humana",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 20,
    actionType: "COMUM",
    baseDamage: 16,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "CONFUSION", duration: 2, chance: 0.6 }],
    requiresPet: true,
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "cao", "clone", "combo"],
    visualDescription:
      "O cão ninja assume uma cópia física perfeita do usuário, e os dois avançam com movimentos espelhados.",
    description:
      "O cão ninja assume uma cópia física perfeita do usuário, e os dois avançam com movimentos espelhados.",
  },
  {
    id: "inuzuka_sobre_presa",
    name: "Sobre Presa",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 26,
    actionType: "COMUM",
    baseDamage: 24,
    scalingAttribute: "taijutsu",
    range: 3,
    shape: "LINE",
    push: 1,
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "presa", "perfuracao"],
    description:
      "Gira em altíssima velocidade, virando uma espécie de broca humana: avança em linha reta perfurando tudo no caminho e empurra o alvo 1 casa.",
  },
  {
    id: "inuzuka_presa_sobre_presa",
    name: "Presa Sobre Presa",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 44,
    actionType: "COMUM",
    baseDamage: 30,
    scalingAttribute: "taijutsu",
    range: 3,
    shape: "LINE",
    push: 2,
    undodgeable: true,
    effects: [{ effectId: "STUN", duration: 1, chance: 0.3 }],
    requiresPet: true,
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "cao", "presa", "combo", "perfuracao"],
    visualDescription:
      "Usuário e cão giram lado a lado como duas brocas que se cruzam em alta velocidade.",
    description:
      "Usuário e cão giram lado a lado como duas brocas que se cruzam em alta velocidade.",
  },
  {
    id: "inuzuka_lobo_duas_cabecas",
    name: "Transformação Combinada da Besta Humana: Lobo de Duas Cabeças",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 18,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "EMPOWERED", stacks: 1.3, duration: 3, empoweredScope: "physical" }],
    requiresPet: true,
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "cao", "fusao", "buff"],
    visualDescription:
      "Usuário e cão se fundem, formando um enorme lobo branco de duas cabeças com garras e presas salientes.",
    description:
      "Usuário e cão se fundem, formando um enorme lobo branco de duas cabeças com garras e presas salientes.",
  },
  {
    id: "inuzuka_presa_de_lobo",
    name: "Presa de Lobo Sobre Presa",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 50,
    actionType: "COMUM",
    baseDamage: 34,
    scalingAttribute: "taijutsu",
    range: 4,
    shape: "LINE",
    push: 2,
    undodgeable: true,
    requiresPet: true,
    requiresActiveEffectFromAbilityId: "inuzuka_lobo_duas_cabecas",
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "cao", "fusao", "perfuracao"],
    visualDescription:
      "O lobo de duas cabeças concentra o corpo numa enorme broca giratória e dispara em linha reta.",
    description:
      "O lobo de duas cabeças concentra o corpo numa enorme broca giratória e dispara em linha reta.",
  },
  {
    id: "inuzuka_lobo_tres_cabecas",
    name: "Transformação Misturada da Besta Humana — Lobo de Três Cabeças",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 32,
    actionType: "COMUM",
    range: 0,
    shape: "SELF",
    effects: [
      { effectId: "EMPOWERED", stacks: 1.3, duration: 3, empoweredScope: "physical" },
      { effectId: "SHIELD", stacks: 9, hpPercentStacks: 0.13, duration: 3 },
    ],
    requiresPet: true,
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "cao", "fusao", "buff", "apice"],
    visualDescription:
      "O usuário, seu clone e o cão ninja se fundem num lobo branco gigantesco de três cabeças.",
    description:
      "O usuário, seu clone e o cão ninja se fundem num lobo branco gigantesco de três cabeças.",
  },
  {
    id: "inuzuka_cauda_perseguidora",
    name: "Cauda Perseguidora de Presa da Presa Giratória de Presa",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 56,
    actionType: "COMUM",
    baseDamage: 38,
    scalingAttribute: "taijutsu",
    range: 5,
    shape: "LINE",
    undodgeable: true,
    effects: [{ effectId: "STUN", duration: 1, chance: 0.35 }],
    requiresPet: true,
    requiresActiveEffectFromAbilityId: "inuzuka_lobo_tres_cabecas",
    requirements: { clanId: "inuzuka", manualOnly: true },
    tags: ["inuzuka", "cao", "fusao", "apice", "finalizador"],
    visualDescription:
      "O lobo de três cabeças se enrola numa esfera e avança girando com violência pelo campo.",
    description:
      "O lobo de três cabeças se enrola numa esfera e avança girando com violência pelo campo.",
  },

  // ---- Uzumaki ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. So 2 jutsu foram pedidos: Regeneracao de Vigor
  // (IRYO_NINJUTSU — cura de verdade, escala com iryoNinjutsu igual o resto
  // do roster medico) e Correntes de Selamento Adamantinas (NINJUTSU —
  // controle puro, baseDamage 0 DE PROPOSITO, mesmo marcador que o Nara usa
  // pras tecnicas de imitacao: libera os efeitos mesmo sem dano real).
  {
    id: "uzumaki_regeneracao",
    name: "Regeneração de Vigor",
    category: "IRYO_NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 22,
    actionType: "COMUM",
    baseHeal: 30,
    restoreResource: { resource: "chakra", amount: 15 },
    scalingAttribute: "iryoNinjutsu",
    range: 1,
    shape: "ALLY",
    requirements: { clanId: "uzumaki", manualOnly: true },
    tags: ["uzumaki", "cura", "vitalidade"],
    description:
      "Deixa um aliado morder sua pele e sugar um pouco do próprio chakra Uzumaki: em troca, fecha os ferimentos dele. Cura 30 de vida e devolve 15% de chakra — funciona até em ferimentos graves. Só em aliado, não cura o próprio usuário.",
  },
  {
    id: "uzumaki_correntes",
    name: "Correntes de Selamento Adamantinas",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 32,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "RADIUS",
    undodgeable: true,
    effects: [
      { effectId: "ROOT", duration: 3 },
      { effectId: "CHAKRA_DRAIN", duration: 3, chance: 0.85 },
      { effectId: "FLEE_LOCK", duration: 3 },
    ],
    requirements: { clanId: "uzumaki", manualOnly: true },
    tags: ["uzumaki", "selamento", "controle", "area", "finalizador"],
    description:
      "Correntes de chakra douradas brotam do corpo do usuário e se espalham pela área: prendem quem estiver no caminho por 3 rodadas, com 85% de chance de sugar 10% de chakra por turno pelo mesmo período, e ninguém consegue fugir enquanto durar. Não pode ser esquivado — as mesmas correntes que, na lenda do clã, já continham até Bestas com Cauda.",
  },

  // ---- Hatake ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. Cães Ninja e Cerco da Matilha sao NINJUTSU
  // (chakra ligando o usuario aos ninken, mesmo golpe fisico); a Lâmina e'
  // BUKIJUTSU de verdade, escalando por `kenjutsu` (nao `bukijutsu`) — a
  // primeira habilidade do jogo a usar o atributo novo.
  {
    id: "hatake_caes_ninja",
    name: "Técnica de Invocação: Cão Ninja",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 20,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    oncePerCombat: true,
    summon: { templateId: "ninken_hatake", count: 3 },
    requirements: { clanId: "hatake", manualOnly: true },
    tags: ["hatake", "cao", "invocacao", "rastreamento"],
    description:
      "Invoca três cães ninja da matilha: eles entram no mapa e atacam sozinhos todo turno, como invocações — servem tanto pra rastrear quanto pra imobilizar o alvo em combate. Só pode ser chamado uma vez por combate; se todos caírem, as técnicas que dependem da matilha ficam bloqueadas até o fim da luta, mas eles voltam saudáveis na próxima.",
  },
  {
    id: "hatake_cerco_matilha",
    name: "Cerco da Matilha",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 20,
    actionType: "COMUM",
    baseDamage: 14,
    scalingAttribute: "ninjutsu",
    range: 2,
    shape: "SINGLE_TARGET",
    push: 1,
    effects: [
      { effectId: "ROOT", duration: 2, chance: 0.85 },
      { effectId: "STUN", duration: 1, chance: 0.3 },
    ],
    requiresPet: true,
    requirements: { clanId: "hatake", manualOnly: true },
    tags: ["hatake", "cao", "controle", "combo"],
    visualDescription:
      "A matilha salta de vários ângulos ao mesmo tempo, derrubando e cercando o alvo com presas e patas.",
    description:
      "A matilha salta de vários ângulos ao mesmo tempo, derrubando e cercando o alvo com presas e patas.",
  },
  {
    id: "hatake_lamina",
    name: "Lâmina da Luz Branca",
    category: "KENJUTSU",
    tier: 3,
    resource: "energia",
    cost: 35,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "kenjutsu",
    range: 1,
    shape: "MELEE",
    undodgeable: true,
    effects: [{ effectId: "BLEED", duration: 3 }],
    requirements: { clanId: "hatake", manualOnly: true },
    tags: ["hatake", "kenjutsu", "lamina", "finalizador"],
    description:
      "Usando a Lâmina de Chakra de Luz Branca, desfere um corte diagonal descendente que deixa um rastro de chakra branco: um golpe rápido demais pra esquivar, que abre um corte profundo.",
  },

  // ---- Hoshigaki ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. Todas NINJUTSU e todas Suiton DE VERDADE — por
  // isso `element: "AGUA"` fica ao lado de `requirements.clanId`: os dois
  // gates valem ao mesmo tempo. `requirements` continua SO' com clanId (o
  // personagem desbloqueia comprando o no' da arvore do clã, nao precisa
  // ter elemento Agua pra isso) — mas o campo `element` no topo da ability
  // faz essas tecnicas tambem responderem a passiva elemental de Agua (ex:
  // Fluxo Constante) e a modificador de cenario por elemento, empilhando
  // com a passiva propria do clã (ver passiveMods() em
  // services/combat/passives.ts).
  {
    id: "hoshigaki_bomba_tubarao",
    name: "Técnica da Bomba do Tubarão de Água",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 1,
    resource: "chakra",
    cost: 26,
    actionType: "COMUM",
    baseDamage: 24,
    scalingAttribute: "ninjutsu",
    range: 4,
    shape: "LINE",
    push: 2,
    requirements: { clanId: "hoshigaki", manualOnly: true },
    tags: ["hoshigaki", "suiton", "tubarao"],
    description:
      "Concentra um grande volume de água e a dispara com um empurrão de mão: um jato compacto em forma de tubarão que avança em linha reta e empurra o alvo 2 casas.",
  },
  {
    id: "hoshigaki_cinco_tubaroes",
    name: "Técnica dos Cinco Tubarões Famintos",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 2,
    resource: "chakra",
    cost: 31,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "ninjutsu",
    range: 3,
    shape: "CONE",
    effects: [{ effectId: "BLEED", duration: 2, chance: 0.6 }],
    requirements: { clanId: "hoshigaki", manualOnly: true },
    tags: ["hoshigaki", "suiton", "tubarao", "area"],
    description:
      "Com a mão sobre uma superfície de água, os cinco dedos emitem chakra que ganha forma de cinco tubarões famintos: avançam em leque e mordem tudo pela frente. 60% de chance de Sangramento por 2 rodadas.",
  },
  {
    id: "hoshigaki_esfera_selvagem",
    name: "Técnica da Esfera Selvagem do Tubarão de Água",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 2,
    resource: "chakra",
    cost: 24,
    actionType: "COMUM",
    baseDamage: 22,
    scalingAttribute: "ninjutsu",
    range: 2,
    shape: "RADIUS",
    effects: [{ effectId: "SLOW", duration: 2, chance: 0.7 }],
    requirements: { clanId: "hoshigaki", manualOnly: true },
    tags: ["hoshigaki", "suiton", "tubarao", "area", "defesa"],
    description:
      "Cria uma esfera de água ao seu redor: quem tentar se aproximar entra na área de ataque dos tubarões que nadam dentro dela. Dano em área e 70% de chance de deixar mais lento por 2 rodadas quem for atingido.",
  },
  {
    id: "hoshigaki_mil_tubaroes",
    name: "Técnica dos Mil Tubarões de Alimentação",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 3,
    resource: "chakra",
    cost: 43,
    actionType: "COMUM",
    baseDamage: 32,
    scalingAttribute: "ninjutsu",
    range: 5,
    shape: "RADIUS",
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.7 }],
    requirements: { clanId: "hoshigaki", manualOnly: true },
    tags: ["hoshigaki", "suiton", "tubarao", "area", "finalizador"],
    description:
      "Versão monumental do Cinco Tubarões Famintos: mil tubarões brotam de uma vasta fonte de água e caem como chuva sobre a área. 70% de chance de Sangramento por 3 rodadas.",
  },
  {
    id: "hoshigaki_grande_bomba",
    name: "Técnica da Grande Bomba do Tubarão de Água",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 3,
    resource: "chakra",
    cost: 59,
    actionType: "COMUM",
    baseDamage: 42,
    scalingAttribute: "ninjutsu",
    range: 4,
    shape: "LINE",
    unguardable: true,
    effects: [{ effectId: "CHAKRA_DRAIN", duration: 3, chance: 0.9 }],
    requirements: { clanId: "hoshigaki", manualOnly: true },
    tags: ["hoshigaki", "suiton", "tubarao", "dreno", "finalizador"],
    description:
      "Cria um tubarão gigantesco fora da água e o arremessa com as duas mãos: ignora Bloqueio e Aparo, absorvendo o chakra da técnica do adversário e crescendo ainda mais no impacto — sugando 10% de chakra por turno por 3 rodadas.",
  },

  // ---- Hozuki ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. Todas NINJUTSU e todas Suiton DE VERDADE (corpo
  // liquido) — `element: "AGUA"` ao lado de `requirements.clanId`, mesmo
  // raciocinio do Hoshigaki (ver comentario la'). Sem jutsu de Kenjutsu aqui
  // de proposito — as passivas de Kenjutsu (Lamina Liquida / Corte Sem Peso)
  // ficam prontas pra quando o personagem pegar uma arma por outro caminho.
  {
    id: "hozuki_hidratacao",
    name: "Hidratação",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 1,
    resource: "chakra",
    cost: 18,
    actionType: "REACAO",
    reactionKind: "DODGE",
    reactionDodgeBonus: 0.3,
    range: 0,
    shape: "SELF",
    requirements: { clanId: "hozuki", manualOnly: true },
    tags: ["hozuki", "hidratacao", "reacao", "defesa"],
    description:
      "Ao ser atingido por um golpe físico, a parte do corpo alcançada vira líquido na hora: o ataque atravessa sem te machucar. Como reação, dá +30% de chance de esquiva contra qualquer ataque.",
  },
  {
    id: "hozuki_braco_agua",
    name: "Grande Braço de Água",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 1,
    resource: "chakra",
    cost: 23,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    effects: [{ effectId: "EMPOWERED", stacks: 1.3, duration: 3, empoweredScope: "physical" }],
    requirements: { clanId: "hozuki", manualOnly: true },
    tags: ["hozuki", "buff", "forca"],
    visualDescription:
      "O braço do usuário absorve uma grande massa de água e cresce de forma desproporcional, coberto por músculos líquidos.",
    description:
      "O braço do usuário absorve uma grande massa de água e cresce de forma desproporcional, coberto por músculos líquidos.",
  },
  {
    id: "hozuki_revolver_agua",
    name: "Revólver de Água",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 2,
    resource: "chakra",
    // 21 -> 28 em 09/08/2026: mesma divida do Tate Eboshi — o buff de dano de
    // 06/08 nao foi repreciado. Sem freio compensatorio (nao exige dojutsu
    // ativo nem item), e a 21 era o alvo unico indefensavel mais barato do
    // jogo. 28 fica entre a Palma de Vacuo (22, sem efeito e presa ao
    // Byakugan) e a Lamina da Luz Branca (35, 26 de dano com Sangramento).
    cost: 28,
    actionType: "COMUM",
    baseDamage: 24, // rebalanceamento 06/08/2026 (era 20)
    scalingAttribute: "ninjutsu",
    range: 5,
    shape: "SINGLE_TARGET",
    undodgeable: true,
    effects: [{ effectId: "WET", duration: 2, chance: 0.7 }],
    requirements: { clanId: "hozuki", manualOnly: true },
    tags: ["hozuki", "suiton", "distancia"],
    description:
      "Imita uma arma de fogo com a mão e comprime água no dedo indicador: dispara uma bala de água com força e velocidade de tiro de verdade. Não pode ser esquivado, e 70% de chance de deixar o alvo Encharcado por 2 rodadas.",
  },
  {
    id: "hozuki_tate_eboshi",
    name: "Tate Eboshi",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 3,
    resource: "chakra",
    // 34 -> 48 em 09/08/2026: o custo era de quando o dano era 26 (e estava
    // exato pra ele). O buff de 06/08 subiu 8 pontos de dano sem repreciar, e
    // esses 8 caem na faixa de 1.5/ponto AINDA multiplicada por area (1.15) e
    // por ignorar guarda (1.15) — viraram 16 de custo. 48 fica acima da Chuva
    // de Agulhas Geladas (45: mesmo dano/forma/alcance/efeito, sem os extras)
    // e abaixo dos 50 da regua, que nem cobra o `push: 3`.
    cost: 48,
    actionType: "COMUM",
    // rebalanceamento 06/08/2026 (era 26): rank S pagando dano de rank C.
    // 34 bate no piso real medido pra S (34-48, ver ninjutsu-authoring).
    baseDamage: 34,
    scalingAttribute: "ninjutsu",
    range: 5,
    shape: "RADIUS",
    unguardable: true,
    push: 3,
    effects: [{ effectId: "SLOW", duration: 2, chance: 0.75 }],
    requirements: { clanId: "hozuki", manualOnly: true },
    tags: ["hozuki", "suiton", "area", "finalizador"],
    description:
      "Forma uma onda gigante em formato de peixe demoníaco: capaz de lutar contra adversários muito maiores, arrasando a área. Ignora Bloqueio e Aparo, empurra 3 casas quem for atingido e tem 75% de chance de deixar mais lento por 2 rodadas.",
  },

  // ---- Kaguya ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. Todas TAIJUTSU (osso e' fisico, nao chakra
  // elemental), exceto a Danca das Camelias — BUKIJUTSU escalando por
  // kenjutsu de verdade (espada viva feita do proprio osso do braco).
  {
    id: "kaguya_dez_dedos",
    name: "Técnica dos Dez Dedos Perfuradores",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 25,
    actionType: "COMUM",
    baseDamage: 24,
    scalingAttribute: "taijutsu",
    range: 4,
    shape: "SINGLE_TARGET",
    effects: [{ effectId: "BLEED", duration: 2, chance: 0.55 }],
    requirements: { clanId: "kaguya", manualOnly: true },
    tags: ["kaguya", "osso", "distancia"],
    description:
      "Abre as pontas dos dedos, expondo os ossos endurecidos: atira uma rajada de balas de osso à distância, movimentando as mãos. 55% de chance de causar Sangramento por 2 rodadas.",
  },
  {
    id: "kaguya_salgueiro",
    name: "Técnica da Dança do Salgueiro",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 34,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "taijutsu",
    range: 2,
    shape: "CONE",
    undodgeable: true,
    requirements: { clanId: "kaguya", manualOnly: true },
    tags: ["kaguya", "osso", "area"],
    description:
      "Ossos saem das palmas, cotovelos, joelhos e ombros ao mesmo tempo, golpeando o alvo de vários ângulos de uma vez: rápido demais e de direções demais pra esquivar. Não pode ser esquivado.",
  },
  {
    id: "kaguya_larico",
    name: "Técnica da Dança do Lariço",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 29,
    actionType: "COMUM",
    baseDamage: 24,
    scalingAttribute: "taijutsu",
    range: 2,
    shape: "RADIUS",
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.75 }],
    requirements: { clanId: "kaguya", manualOnly: true },
    tags: ["kaguya", "osso", "area"],
    description:
      "Inúmeros ossos brotam de dentro do próprio corpo de uma vez, formando espetos afiados que dilaceram qualquer um por perto. 75% de chance de causar Sangramento por 3 rodadas em quem estiver na área.",
  },
  {
    id: "kaguya_camelias",
    name: "Técnica da Dança das Camélias",
    category: "KENJUTSU",
    tier: 2,
    resource: "energia",
    cost: 38,
    actionType: "COMUM",
    baseDamage: 32,
    scalingAttribute: "kenjutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.7 }],
    requirements: { clanId: "kaguya", manualOnly: true },
    tags: ["kaguya", "kenjutsu", "osso"],
    description:
      "Modifica o osso do próprio braço numa espada viva e desfere uma sequência de estocadas furiosas, rápidas demais pra contar. 70% de chance de causar Sangramento por 3 rodadas.",
  },
  {
    id: "kaguya_impulso_flor",
    name: "Técnica do Impulso da Flor",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 32,
    actionType: "COMUM",
    baseDamage: 30,
    scalingAttribute: "taijutsu",
    range: 3,
    shape: "MELEE",
    push: 2,
    requirements: { clanId: "kaguya", manualOnly: true },
    tags: ["kaguya", "osso", "investida"],
    description:
      "Corre em disparada até o alvo e golpeia com os ossos das próprias costas, empurrando-o 2 casas com o impacto.",
  },
  {
    id: "kaguya_danca_flor",
    name: "Técnica da Dança da Flor",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 50,
    actionType: "COMUM",
    baseDamage: 44,
    scalingAttribute: "taijutsu",
    range: 3,
    shape: "SINGLE_TARGET",
    unguardable: true,
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.85 }],
    requirements: { clanId: "kaguya", manualOnly: true },
    tags: ["kaguya", "osso", "finalizador"],
    description:
      "Concentra todo o poder do próprio corpo, projetando os ossos comprimidos em lanças rígidas ao extremo: uma arma de osso incrivelmente destrutiva. Ignora Bloqueio e Aparo. 85% de chance de causar Sangramento por 3 rodadas.",
  },

  // ---- Chinoike ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao dos outros. A Genjutsu Ketsuryuugan e' a excecao real do
  // catalogo de Genjutsu: tem baseDamage (a ilusao causa dano de verdade),
  // enquanto os genjutsu genericos de fundamentos (gen_confusao etc.) so'
  // aplicam efeito, sem dano — identidade do doujutsu do clã. Chuva de
  // Granizo e Bolhas de Água SAO Suiton de verdade — `element: "AGUA"` ao
  // lado de `requirements.clanId`, mesmo raciocinio do Hoshigaki/Hozuki
  // (ver comentario la'). Ketsuryuugan (o doujutsu) e Genjutsu Ketsuryuugan
  // NAO tem elemento — sao o proprio olho agindo, nao chakra de natureza; a
  // Ascensao do Dragao de Sangue tambem fica sem elemento (e' sangue/doujutsu,
  // nao Suiton puro, apesar do "libera vapor").
  {
    id: "chinoike_chuva_granizo",
    name: "Técnica Chuva de Granizo",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 1,
    resource: "chakra",
    cost: 22,
    actionType: "COMUM",
    baseDamage: 22,
    scalingAttribute: "ninjutsu",
    range: 4,
    shape: "CONE",
    requirements: { clanId: "chinoike", manualOnly: true },
    tags: ["chinoike", "suiton", "distancia"],
    description:
      "Molda o chakra em incontáveis pequenos projéteis de água e os dispara em leque na direção do oponente.",
  },
  {
    id: "chinoike_doujutsu",
    name: "Ketsuryuugan",
    category: "DOJUTSU",
    tier: 1,
    // custo 0: nunca e' "usada" via /jutsu — e' ligada/desligada com
    // /combate ketsuryuugan (mesmo padrao do Byakugan/Caminhada Aquatica),
    // gasta BALANCE.ketsuryuuganUpkeepPerTurn por turno enquanto ativa.
    resource: "chakra",
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { clanId: "chinoike", manualOnly: true },
    tags: ["chinoike", "doujutsu", "ketsuryuugan"],
    toggleRules: {
      command: "/combate ketsuryuugan",
      dodgeBonus: 0.1,
      upkeepPerTurn: 5,
      disablesWithoutResource: true,
    },
    visualDescription:
      "Olhos vermelhos como sangue despertam e acompanham cada tensao muscular e cada fluxo de chakra ao redor do usuario.",
    description:
      "O dōjutsu do clã: olhos avermelhados como sangue, capazes de ler o instante exato em que o corpo do oponente vai se mover. Ative e desative a qualquer momento com /combate ketsuryuugan: enquanto ligado, dá +10% de chance de esquiva contra qualquer ataque e gasta 5% de chakra por rodada — desliga sozinho se o chakra acabar.",
  },
  {
    id: "chinoike_bolhas_agua",
    name: "Técnica das Bolhas de Água",
    category: "NINJUTSU",
    element: "AGUA",
    tier: 2,
    resource: "chakra",
    cost: 31,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "ninjutsu",
    range: 4,
    shape: "RADIUS",
    effects: [{ effectId: "BURN", duration: 2, chance: 0.65 }],
    requirements: { clanId: "chinoike", manualOnly: true },
    tags: ["chinoike", "suiton", "area"],
    description:
      "Cria bolhas de composição explosiva ao redor do alvo, capazes de estourar sozinhas ou sob comando. Dano em área com 65% de chance de causar Queimadura por 2 rodadas.",
  },
  {
    id: "chinoike_genjutsu_ketsuryuugan",
    name: "Genjutsu Ketsuryuugan",
    category: "GENJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 35,
    actionType: "COMUM",
    // Dano inteiro na ability, como nas demais disciplinas. Antes era 28 +
    // Genjutsu por causa de genjutsuScaling=1.
    baseDamage: 29,
    scalingAttribute: "genjutsu",
    range: 4,
    shape: "SINGLE_TARGET",
    effects: [{ effectId: "CONFUSION", duration: 2, chance: 0.6 }],
    requiresActiveDoujutsu: { flag: "ketsuryuuganActive", label: "Ketsuryuugan" },
    requirements: { clanId: "chinoike", manualOnly: true },
    tags: ["chinoike", "genjutsu", "doujutsu"],
    description:
      "Prende o oponente numa ilusão sangrenta que o próprio corpo dele acredita ser real — a dor é real. Tem 60% de chance de causar Confusão por 2 rodadas e exige o Ketsuryuugan ativo (/combate ketsuryuugan).",
  },
  {
    id: "chinoike_dragao_sangue",
    name: "Técnica da Ascensão do Dragão de Sangue",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    // 42 -> 50 em 09/08/2026: mesma divida do Tate Eboshi e do Revolver de
    // Agua. A 42 ele dava 9 pontos de dano A MAIS que o Vento Cortante (43,
    // 30 de dano, Sangramento quase igual) cobrando 1 a menos. 50 poe os dois
    // na mesma curva.
    cost: 50,
    actionType: "COMUM",
    // rebalanceamento 06/08/2026 (era 30): ápice alvo único de tier 3, sem
    // desconto de área — era o pior golpe de fechamento entre os clãs de
    // dano (Hyuuga 40, Akimichi 36, Kaguya 44). Ver clan-balance-report.ts.
    baseDamage: 39,
    scalingAttribute: "ninjutsu",
    range: 5,
    shape: "SINGLE_TARGET",
    undodgeable: true,
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.8 }],
    requirements: { clanId: "chinoike", manualOnly: true },
    tags: ["chinoike", "suiton", "finalizador"],
    description:
      "Libera um grande dragão de sangue de 8 cabeças que avança sobre o alvo e libera vapor após morder. Não pode ser esquivado. 80% de chance de causar Sangramento por 3 rodadas.",
  },

  // ---- Kamaitachi ----
  // Habilidades concedidas pela arvore de cla (src/data/clan-trees/index.ts),
  // mesmo padrao do Hoshigaki/Yuki. O clã do vento de Suna (leque gigante,
  // golpes de foice) e' Fuuton na base — `element: "VENTO"` ao lado de
  // `requirements.clanId`, mesmo raciocinio dos clãs de Kiri (ver
  // CLAN_STARTING_ELEMENT: kamaitachi tambem começa com Vento). Fica dentro
  // do vocabulario ja estabelecido de Vento (Sangramento, indefensavel/
  // imparavel, perfuracao de guarda — ver skill ninjutsu-authoring). Custo
  // total fecha em 30 PN, entre o Chinoike (29) e o Hoshigaki/Yuki (34) — ver
  // "Custo total da árvore vs dano" na skill jutsu-authoring.
  {
    id: "kamaitachi_foice",
    name: "Foice da Doninha",
    category: "NINJUTSU",
    element: "VENTO",
    tier: 1,
    resource: "chakra",
    cost: 19,
    actionType: "COMUM",
    baseDamage: 18,
    scalingAttribute: "ninjutsu",
    range: 4,
    shape: "CONE",
    effects: [{ effectId: "BLEED", duration: 2, chance: 0.6 }],
    requirements: { clanId: "kamaitachi", manualOnly: true },
    tags: ["kamaitachi", "vento", "cone", "sangramento"],
    description:
      "Técnica de Estilo Vento que cria lâminas cortantes de vento em cone à sua frente, dilacerando quem for atingido.",
  },
  {
    id: "kamaitachi_grande_foice",
    name: "Grande Foice da Doninha",
    category: "NINJUTSU",
    element: "VENTO",
    tier: 2,
    resource: "chakra",
    cost: 33,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "ninjutsu",
    range: 5,
    shape: "RADIUS",
    push: 1,
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.7 }],
    requirements: { clanId: "kamaitachi", manualOnly: true },
    tags: ["kamaitachi", "vento", "area", "leque", "sangramento"],
    description:
      "Usa o leque gigante para criar uma versão mais poderosa e em maior escala dos ventos cortantes: correntes de ar pesado se chocam em várias bolsas de vácuo que cortam tudo na área.",
  },
  {
    id: "kamaitachi_rede",
    name: "Lançamento da Rede",
    category: "NINJUTSU",
    element: "VENTO",
    tier: 3,
    resource: "chakra",
    cost: 55,
    actionType: "COMUM",
    baseDamage: 34,
    scalingAttribute: "ninjutsu",
    range: 6,
    shape: "RADIUS",
    undodgeable: true,
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.8 }],
    requirements: { clanId: "kamaitachi", manualOnly: true },
    tags: ["kamaitachi", "vento", "area", "indefensavel", "sangramento"],
    description:
      "Cria várias correntes estreitas de vento que se entrelaçam numa grande rede de corte. Os fios são afiados e rápidos demais pra esquivar.",
  },
  {
    id: "kamaitachi_decapitacao",
    name: "Dança da Decapitação Rápida",
    category: "NINJUTSU",
    element: "VENTO",
    tier: 3,
    resource: "chakra",
    cost: 68,
    actionType: "COMUM",
    baseDamage: 38,
    scalingAttribute: "ninjutsu",
    range: 6,
    shape: "LINE",
    unblockable: true,
    effects: [{ effectId: "BLEED", duration: 3, chance: 0.9 }],
    requirements: { clanId: "kamaitachi", manualOnly: true },
    tags: ["kamaitachi", "vento", "linha", "finalizador"],
    description:
      "O leque provoca um vendaval poderoso e Inevitável que corta através de tudo o que toca.",
  },

  // ---- Raikage ----
  // Concedidas pela arvore de cla (src/data/clan-trees/index.ts), manualOnly:
  // true em todas — mesmo padrao do Nara/Hyuuga/Yamanaka. Categoria reflete a
  // natureza real de cada golpe (nao "CLA" generico): os 5 golpes fisicos sao
  // TAIJUTSU (chakra de raio so' tempera o soco, quem golpeia e' o corpo —
  // mesmo raciocinio do Jyuuken do Hyuuga), so' os 2 jutsus de chakra puro
  // (deslocamento e a armadura, sem golpe nenhum) sao NINJUTSU de verdade.
  {
    id: "raikage_deslocamento",
    name: "Deslocamento Instantâneo do Estilo Raio",
    category: "NINJUTSU",
    element: "RAIO",
    tier: 1,
    resource: "chakra",
    cost: 11,
    actionType: "MOVIMENTO",
    range: 0,
    shape: "SELF",
    scalingAttribute: "ninjutsu",
    effects: [{ effectId: "HASTE", duration: 2 }],
    requirements: { clanId: "raikage", manualOnly: true },
    tags: ["cla", "raikage", "raio", "movimento", "velocidade"],
    description:
      "Jutsu básico de movimento em alta velocidade: o usuário se desloca de um ponto a outro numa velocidade quase indetectável, ficando Acelerado por um instante.",
  },
  {
    id: "raikage_armadura",
    name: "Armadura de Raio",
    category: "NINJUTSU",
    element: "RAIO",
    tier: 2,
    resource: "chakra",
    cost: 26,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    scalingAttribute: "ninjutsu",
    effects: [{ effectId: "HASTE", duration: 4 }],
    requirements: { clanId: "raikage", manualOnly: true },
    tags: ["cla", "raikage", "raio", "buff", "velocidade"],
    description:
      "Envolve o corpo numa camada de chakra relâmpago que estimula eletricamente o sistema nervoso: sinapses mais rápidas e destreza física no limite absoluto — fica Acelerado por um bom tempo.",
  },
  // undodgeable: golpe rápido demais pra reagir (a mesma ideia do Relampago
  // Reto do material de origem), mas ainda dá pra bloquear/aparar.
  {
    id: "raikage_relampago_reto",
    name: "Relâmpago Reto",
    category: "TAIJUTSU",
    element: "RAIO",
    tier: 2,
    resource: "energia",
    cost: 38,
    actionType: "COMUM",
    baseDamage: 28,
    scalingAttribute: "taijutsu",
    range: 3,
    shape: "LINE",
    undodgeable: true,
    requirements: { clanId: "raikage", manualOnly: true },
    tags: ["cla", "raikage", "raio", "velocidade", "linha"],
    description:
      "Move-se em alta velocidade para desferir um ataque direto contra o alvo — rápido demais pra esquivar.",
  },
  {
    id: "raikage_lariat",
    name: "Lariat",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 28,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "STUN", duration: 1, chance: 0.5 }],
    requirements: { clanId: "raikage", manualOnly: true },
    tags: ["cla", "raikage", "corpo-a-corpo", "atordoamento"],
    description:
      "Avança rapidamente e encaixa o braço flexionado no pescoço do inimigo, derrubando-o com um golpe forte.",
  },
  {
    id: "raikage_guilhotina",
    name: "Queda da Guilhotina",
    category: "TAIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 31,
    actionType: "COMUM",
    baseDamage: 28,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "DEFENSE_DOWN", duration: 2, chance: 0.4 }],
    requirements: { clanId: "raikage", manualOnly: true },
    tags: ["cla", "raikage", "corpo-a-corpo", "queda"],
    description:
      "Salta no ar acima do oponente e executa um chute baixo, usando o impulso da queda pra aumentar o poder por trás do golpe e deixar a guarda dele aberta.",
  },
  {
    id: "raikage_corte_horizontal",
    name: "Corte Horizontal de Relâmpago Violento",
    category: "TAIJUTSU",
    element: "RAIO",
    tier: 3,
    resource: "energia",
    cost: 41,
    actionType: "COMUM",
    baseDamage: 36,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "BLEED", duration: 2, chance: 0.5 }],
    requirements: { clanId: "raikage", manualOnly: true },
    tags: ["cla", "raikage", "raio", "corte", "sangramento"],
    description:
      "Golpeia o adversário com a lateral externa da mão, endurecida em forma de faca por chakra relâmpago — um corte fundo o bastante pra sangrar.",
  },
  // unblockable: agarra e derruba, nao da' pra bloquear/aparar NEM esquivar
  // um golpe que ja' comecou pelo agarrao — o finalizador do cla.
  {
    id: "raikage_bomba_liger",
    name: "Bomba Liger",
    category: "TAIJUTSU",
    tier: 3,
    resource: "energia",
    cost: 58,
    actionType: "COMUM",
    baseDamage: 42,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    unblockable: true,
    effects: [{ effectId: "STUN", duration: 1, chance: 0.5 }],
    requirements: { clanId: "raikage", manualOnly: true },
    tags: ["cla", "raikage", "corpo-a-corpo", "finalizador", "forca"],
    description:
      "Agarra o oponente, levanta-o no ar e usa força extrema pra esmagá-lo de cabeça contra o chão. O golpe é Inevitável.",
  },

  // ---- Kamizuru ----
  // Se baseia no Aburame (mesmo pedido do usuario): clã de enxame/chakra,
  // categoria NINJUTSU em tudo (chakra manipulando o proprio enxame, mesmo
  // quando o resultado e' fisico), quase nenhuma tem baseDamage de sobra —
  // ganha por DRENAR/IMOBILIZAR/ENVENENAR, nao por rajada (so' a Bomba de
  // Abelha foge disso de proposito, e' a UNICA tecnica de dano real do
  // clã — o resto e' puro controle). manualOnly: true em todas, mesmo padrao.
  {
    id: "kamizuru_abelha_gigante",
    name: "Técnica de Invocação: Abelha Gigante",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 20,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    oncePerCombat: true,
    summon: { templateId: "kamizuru_abelha_gigante" },
    requirements: { clanId: "kamizuru", manualOnly: true },
    tags: ["kamizuru", "abelha", "invocacao"],
    description:
      "Invoca uma abelha gigante: mandíbula de dentes afiados, ferrão mortal e asas capazes de causar ventos fortes. Ataca sozinha todo turno, como uma invocação comum. Só pode ser chamada uma vez por combate; se ela cair em combate, as técnicas que dependem do enxame ficam bloqueadas até o fim da luta, mas ela volta saudável na próxima.",
  },
  {
    id: "kamizuru_abelha_mel",
    name: "Técnica da Abelha do Mel",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 11,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "SINGLE_TARGET",
    effects: [{ effectId: "ROOT", duration: 2, chance: 0.75 }],
    requirements: { clanId: "kamizuru", manualOnly: true },
    tags: ["kamizuru", "abelha", "controle", "imobilizacao"],
    description:
      "Conjura um enxame de abelhas feitas de chakra. Toda vez que uma abelha é ferida ou destruída, libera cera pegajosa sobre o adversário — forte o suficiente pra imobilizá-lo.",
  },
  {
    id: "kamizuru_bomba_abelha",
    name: "Bomba de Abelha",
    category: "NINJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 29,
    actionType: "COMUM",
    baseDamage: 26,
    scalingAttribute: "ninjutsu",
    range: 5,
    shape: "RADIUS",
    push: 1,
    requirements: { clanId: "kamizuru", manualOnly: true },
    tags: ["kamizuru", "abelha", "explosao", "area"],
    description:
      "Abelhas carregando amuletos explosivos atacam em enxame. Assim que entram em contato com o alvo, os selos explodem.",
  },
  {
    id: "kamizuru_mil_ferroes",
    name: "Mil Ferrões de Abelha",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 17,
    actionType: "COMUM",
    baseDamage: 0,
    range: 5,
    shape: "RADIUS",
    effects: [
      { effectId: "POISON", stacks: 2, duration: 3, chance: 0.75 },
      { effectId: "FLEE_LOCK", duration: 2 },
    ],
    requirements: { clanId: "kamizuru", manualOnly: true },
    tags: ["kamizuru", "abelha", "veneno", "area"],
    description:
      "Invoca uma nuvem de abelhas que disparam seus ferrões venenosos contra tudo na área, cercando o alvo por dentro.",
  },
  {
    id: "kamizuru_colmeia_rocha",
    name: "Colmeia de Rocha",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 19,
    actionType: "COMUM",
    baseDamage: 0,
    range: 4,
    shape: "SINGLE_TARGET",
    effects: [
      { effectId: "ROOT", duration: 3, chance: 0.85 },
      { effectId: "CHAKRA_DRAIN", duration: 3, chance: 0.85 },
    ],
    terrain: { kind: "OBSTACLE", duration: 2 },
    requirements: { clanId: "kamizuru", manualOnly: true },
    tags: ["kamizuru", "abelha", "prisao", "dreno", "finalizador"],
    description:
      "Cria uma caverna em forma de colmeia, abrigando larvas de abelha gigante que se alimentam de chakra e o drenam de cada centímetro das paredes — prendendo quem estiver lá dentro.",
  },
];

CLAN_ABILITIES.push({
  id: "senju_ondas_cortantes",
  name: "Ondas de Águas Cortantes",
  category: "NINJUTSU",
  element: "AGUA",
  tier: 3,
  resource: "chakra",
  cost: 45,
  actionType: "COMUM",
  baseDamage: 34,
  scalingAttribute: "ninjutsu",
  range: 5,
  shape: "CONE",
  effects: [{ effectId: "BLEED", duration: 2, chance: 0.7 }],
  requirements: { clanId: "senju", level: 28, attributes: { ninjutsu: 20 }, manualOnly: true },
  tags: ["senju", "agua", "suiton", "area", "corte"],
  visualDescription: "O usuário lança sucessivas lâminas largas de água, que se abrem em leque e atravessam o campo.",
  description: "Dispara ondas cortantes de água contra vários inimigos.",
});

export const CLANS: ClanDef[] = [
  {
    id: "uchiha",
    name: "Uchiha",
    description: "Clã do Sharingan: leitura de movimentos, genjutsu e fogo.",
    passiveIds: [],
    activeIds: [
      "uchiha_sharingan_1_tomoe",
      "uchiha_sharingan_2_tomoe",
      "uchiha_sharingan_3_tomoe",
      "uchiha_mangekyo_sharingan",
    ],
    hooks: { onAttacked: "uchiha_read" },
  },
  {
    id: "yamanaka",
    name: "Yamanaka",
    description: "Clã das técnicas mentais: confusão, controle de corpo (Transferência de Mente) e controle em massa (Clones).",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: [
      "yamanaka_destruicao_mente",
      "yamanaka_transmissao_mentes",
      "yamanaka_shintenshin",
      "yamanaka_clones_shintenshin",
    ],
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
  {
    id: "lee",
    name: "Lee",
    description: "Clã de Taijutsu puro: disciplina física, velocidade e domínio do Punho Forte.",
    passiveIds: [],
    activeIds: [],
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
    activeIds: ["senju_ondas_cortantes"],
    hooks: {},
  },
  {
    id: "inuzuka",
    name: "Inuzuka",
    // A mencao a "nao dao pra esquivar" e' identidade declarada, nao enfeite:
    // 3 das 5 tecnicas ofensivas do cla sao `undodgeable` (a maior densidade
    // do jogo, acima do proprio Vento). Os custos ja' pagam o multiplicador de
    // 1.2 e o Bloqueio/Aparo continuam funcionando — o que faltava era o texto
    // dizer que isso e' a marca do cla, e nao coincidencia. Ver conversa de
    // 09/08/2026 em pendencias-balanceamento.
    description: "Clã dos ninken de Konoha: luta ao lado de cães e faro apurado. As brocas giratórias do clã perseguem o alvo pelo cheiro — de meio caminho em diante, não dá para esquivar delas.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts). Cao Ninja
    // e' a excecao: nasce com o personagem (ver autoGrantedNodeIds abaixo),
    // as outras oito continuam exigindo compra manual normal.
    activeIds: [
      "inuzuka_cao_ninja",
      "inuzuka_quatro_patas",
      "inuzuka_clone_besta",
      "inuzuka_sobre_presa",
      "inuzuka_presa_sobre_presa",
      "inuzuka_lobo_duas_cabecas",
      "inuzuka_presa_de_lobo",
      "inuzuka_lobo_tres_cabecas",
      "inuzuka_cauda_perseguidora",
    ],
    // Inuzuka nasce com o cao ninja — nao desbloqueia upando (pedido
    // explicito). O no continua na arvore, isolado (sem requires).
    autoGrantedNodeIds: ["inuzuka_cao_ninja"],
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
      "akimichi_modo_borboleta",
      "akimichi_bombardeio",
    ],
    hooks: {},
  },
  {
    id: "sarutobi",
    name: "Sarutobi",
    description:
      "Clã do Terceiro Hokage: domínio raro sobre as cinco naturezas básicas de chakra, com tradição de vento (Asuma).",
    passiveIds: [],
    // Sem jutsu proprio (o "Professor" nao tem tecnica assinatura no roster,
    // so' versatilidade elemental) — todo o kit mora na arvore de cla
    // (src/data/clan-trees/index.ts): 1 raiz que dobra o sorteio de elemento
    // na arvore de Fundamentos + 5 passivas crossElement (uma por natureza).
    activeIds: [],
    // Legado do Professor nasce comprado, igual o cao ninja do Inuzuka —
    // e' a mecanica do clã, nao algo que se upa.
    autoGrantedNodeIds: ["sarutobi_raiz"],
    hooks: {},
  },
  {
    id: "uzumaki",
    name: "Uzumaki",
    description: "Clã de Uzushiogakure: chakra vasto, longevidade e mestria em fuinjutsu.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: ["uzumaki_regeneracao", "uzumaki_correntes"],
    hooks: {},
  },
  {
    id: "aburame",
    name: "Aburame",
    description: "Clã dos insetos de Konoha: hospedam kikaichu que drenam o chakra alheio.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao do Nara/Hyuuga/Akimichi.
    activeIds: [
      "aburame_clone_inseto",
      "aburame_casulo",
      "aburame_esfera",
      "aburame_nuvem_veneno",
      "aburame_parede",
      "aburame_jarro_veneno",
      "aburame_mordida",
    ],
    hooks: {},
  },
  {
    id: "hatake",
    name: "Hatake",
    description: "Linhagem de Kakashi: gênios versáteis com forte afinidade de raio.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: ["hatake_caes_ninja", "hatake_cerco_matilha", "hatake_lamina"],
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
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: [
      "kamaitachi_foice",
      "kamaitachi_grande_foice",
      "kamaitachi_rede",
      "kamaitachi_decapitacao",
    ],
    hooks: {},
  },

  // ---- Kiri ----
  {
    id: "hoshigaki",
    name: "Hoshigaki",
    description: "Clã de Kiri: aparência de tubarão e mestria absoluta em Suiton.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: [
      "hoshigaki_bomba_tubarao",
      "hoshigaki_cinco_tubaroes",
      "hoshigaki_esfera_selvagem",
      "hoshigaki_mil_tubaroes",
      "hoshigaki_grande_bomba",
    ],
    hooks: {},
  },
  {
    id: "hozuki",
    name: "Hozuki",
    description: "Clã de Kiri: hidrificação — o corpo se converte em água.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: ["hozuki_hidratacao", "hozuki_braco_agua", "hozuki_revolver_agua", "hozuki_tate_eboshi"],
    hooks: {},
  },
  {
    id: "kaguya",
    name: "Kaguya",
    description: "Clã de Kiri: Shikotsumyaku, a manipulação dos próprios ossos.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: [
      "kaguya_dez_dedos",
      "kaguya_salgueiro",
      "kaguya_larico",
      "kaguya_camelias",
      "kaguya_impulso_flor",
      "kaguya_danca_flor",
    ],
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
    description: "Clã de Kiri: afinidade de Água, o elemento que funde no próprio kekkei genkai — o Hyoton (Gelo).",
    passiveIds: [],
    // O Hyoton (Gelo) virou kekkei genkai de verdade (element-trees/index.ts,
    // secao GELO) — pedido explicito do usuario, migrado pra fora do clã. O
    // clã Yuki foi reconstruido do zero, mesmo padrao do Onoki/Bakurei: so'
    // passiva, sem jutsu proprio (ver clan-trees/index.ts).
    activeIds: [],
    hooks: {},
  },

  // ---- Kumo ----
  {
    id: "yotsuki",
    name: "Yotsuki",
    description: "Clã de Kumo: força física, afinidade de raio e mestria em Kenjutsu.",
    passiveIds: [],
    // Sem jutsu proprio — mesmo padrao do Onoki/Sarutobi: a arvore inteira
    // (clan-trees/index.ts) e' passiva, reforçando tecnicas de Raio
    // especificas (nao so' o elemento) e Kenjutsu em geral.
    activeIds: [],
    hooks: {},
  },
  {
    id: "chinoike",
    name: "Chinoike",
    description: "Clã de Kumo: Ketsuryugan, o olho que domina o sangue.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: [
      "chinoike_chuva_granizo",
      "chinoike_doujutsu",
      "chinoike_bolhas_agua",
      "chinoike_genjutsu_ketsuryuugan",
      "chinoike_dragao_sangue",
    ],
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
    description: "Linhagem dos Raikage de Kumo: armadura de raio, velocidade extrema e força bruta corpo a corpo.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: [
      "raikage_deslocamento",
      "raikage_armadura",
      "raikage_relampago_reto",
      "raikage_lariat",
      "raikage_guilhotina",
      "raikage_corte_horizontal",
      "raikage_bomba_liger",
    ],
    hooks: {},
  },

  // ---- Iwa e outros ----
  {
    id: "bakurei",
    name: "Bakurei",
    description: "Clã de Iwagakure: afinidade dupla com Doton e o kekkei genkai Bakuton (Explosão).",
    passiveIds: [],
    // Sem jutsu proprio — mesmo padrao do Onoki/Yotsuki/Sarutobi: a arvore
    // inteira (clan-trees/index.ts) e' passiva, reforçando Terra E o kekkei
    // genkai Explosão (elemento inteiro + tecnicas especificas de cada um).
    activeIds: [],
    hooks: {},
  },
  {
    id: "kamizuru",
    name: "Kamizuru",
    description: "Clã das abelhas de Iwa, antigos rivais dos Aburame.",
    passiveIds: [],
    // concedidas pela arvore de cla (src/data/clan-trees/index.ts), nao por
    // requisito automatico — mesmo padrao dos outros clas com arvore propria.
    activeIds: [
      "kamizuru_abelha_gigante",
      "kamizuru_abelha_mel",
      "kamizuru_bomba_abelha",
      "kamizuru_mil_ferroes",
      "kamizuru_colmeia_rocha",
    ],
    hooks: {},
  },
  {
    id: "onoki",
    name: "Onoki",
    description: "Linhagem dos Tsuchikage de Iwa: Doton e o Jinton (Poeira).",
    passiveIds: [],
    // Sem jutsu proprio — pedido explicito do usuario: o cla so' da PASSIVA
    // pra Terra e pro kekkei genkai Poeira (ver clan-trees/index.ts), mesmo
    // padrao do Sarutobi (arvore 100% passiva, sem ability nova pra registrar
    // aqui).
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
