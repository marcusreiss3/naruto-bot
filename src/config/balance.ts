// Camada de balanceamento editavel. Ajuste tudo aqui sem mexer na engine.
import type { EffectId } from "./enums.js";

export const BALANCE = {
  // ---- Vida / atributos ----
  hpBase: 100,
  // HP cresce devagar de proposito: como o dano vem da arvore (funcao degrau,
  // limitada pelo total de nos) e nao do atributo, HP linear rapido faria a luta
  // esticar sem fim no fim de jogo. Ver a nota de escalas abaixo.
  //
  // hpPerLevel 2->3 / hpPerTaijutsu 2->1 em 09/08/2026: quem NUNCA investe em
  // taijutsu (piso realista: so' o minimo pra comprar as passivas de vida) ja'
  // ficava saudavel (4,6-5,5 golpes ate morrer, doc pede 3-4). O problema era
  // o TOPO — cada ponto de atributo vira 4 pontos de taijutsu por level-up, e
  // com hpPerTaijutsu igual a hpPerLevel, quem despeja tudo em taijutsu ganhava
  // 5x mais HP por level-up que quem nao investe nada, um gap que SO' cresce
  // com o nivel (1,9x no nv10, 3,5x no nv45). Um personagem de Taijutsu
  // completo (Punho Forte + Fundamentos, 139 de taijutsu) matava em 9,1 golpes
  // no nv45, quase o dobro do saudavel. Mover peso de taijutsu pra nivel
  // (sempre igual pra todo mundo) encolhe o gap sem mexer no piso: o hibrido
  // (taijutsu = nivel) fica invariante — hpPerLevel+hpPerTaijutsu continua
  // somando o mesmo total nesse caso especifico — so' os extremos se movem.
  hpPerLevel: 3,
  hpPerTaijutsu: 1,

  // nivel maximo
  maxLevel: 50,
  // ponto de atributo por nivel
  attributePointsPerLevel: 4,
  // teto por atributo (0 = sem teto)
  attributeCap: 0,
  // ---- Escalas de dano/cura ----
  // Escala 0 = o atributo NAO soma dano/cura. Isso e' intencional nos quatro
  // primeiros: dano vem de BUILD (jutsu comprado + passivas da arvore), nao de
  // acumular atributo. O atributo continua valendo muito por outros caminhos:
  //   ninjutsu  -> e' o orcamento da arvore de habilidades
  //   taijutsu  -> HP, alcance de movimento, esquiva fisica e chance de fuga
  //   bukijutsu -> dano da arma somado a parte (so KENJUTSU)
  //   iryo      -> ainda sem arvore propria; cura hoje sai so do baseHeal
  // Se voltar a escalar, revise hpPerLevel junto: os dois se equilibram.
  ninjutsuScaling: 0,
  iryoNinjutsuScaling: 0,
  taijutsuScaling: 0,
  bukijutsuScaling: 0,
  // Genjutsu segue a mesma regra das demais disciplinas: o atributo compra
  // progresso e melhora duracao/disputas, mas nao soma dano bruto.
  genjutsuScaling: 0,
  fuinjutsuScaling: 0,
  kugutsuScaling: 0,
  senjutsuScaling: 0,
  dojutsuScaling: 0,
  // kenjutsu (espadas, separado de bukijutsu) segue a mesma regra: so' serve
  // de orcamento pra desbloquear skill (reqAttribute), nao escala dano.
  kenjutsuScaling: 0,

  // ---- Genjutsu duracao ----
  genjutsuBaseDurationBonusEvery: 10, // +1 rodada a cada 10 de genjutsu
  genjutsuDurationCap: 6,

  // ---- Esquiva ----
  // Chance base unica pra todos (nao escala com atributo). Reacoes somam bonus
  // por cima (Substituicao, jutsu, Clonagem, Haste...) ate o cap unico.
  dodgeBase: 0.15,
  dodgeCap: 0.5,
  // Esquiva normal (reacao sem jutsu) gasta recurso pra nao ser spam: energia
  // contra ataque fisico (TAI/BUKI), chakra contra o resto (ninjutsu/etc).
  esquivaNormalCost: 15,

  // bloqueio: fracao do dano reduzida (nao anula)
  blockReductionBase: 0.5,
  blockReductionCap: 0.8,
  // aparar (kenjutsu) reduz e pode contra-atacar
  parryReductionBase: 0.6,

  // ---- Movimento ----
  moveBase: 2,
  movePerTaijutsuDiv: 15, // 2 + floor(tai/15) -> máx 4 com taijutsu 30

  // ---- Recursos ----
  resourceMax: 100,
  waterWalkUpkeepPerTurn: 5, // % chakra por turno andando na agua
  // Byakugan (Hyuuga): liga/desliga por /combate byakugan, mesmo padrao do
  // waterWalk — upkeep por turno, desliga sozinho se faltar chakra. +10% de
  // esquiva vale contra QUALQUER ataque (fisico ou ninjutsu) enquanto ativo.
  byakuganUpkeepPerTurn: 5, // % chakra por turno com o Byakugan ativo
  byakuganDodgeBonus: 0.1, // +10 pontos percentuais de esquiva enquanto ativo
  // Byakugan enxerga atraves de clone/substituicao (nao e' ilusao de otica
  // pra quem ve o corpo de chakra por baixo): quando o ATACANTE esta com o
  // Byakugan ativo, corta o reactionDodgeBonus de jutsus marcados
  // isCloneTrick pela metade (Substituicao, Clones de Inseto). Nao afeta
  // Hidratacao (Hozuki) — o corpo vira liquido de verdade, nao e' um logro.
  byakuganCloneSightMult: 0.5,

  // Ketsuryuugan (Chinoike): mesmo padrao de toggle do Byakugan — liga/desliga
  // por /combate ketsuryuugan, upkeep por turno, desliga sozinho se faltar
  // chakra. O comentario do byakugan() ja avisava "serve de modelo pra outros
  // doujutsu no futuro" — este e' o primeiro.
  ketsuryuuganUpkeepPerTurn: 5, // % chakra por turno com o Ketsuryuugan ativo
  ketsuryuuganDodgeBonus: 0.1, // +10 pontos percentuais de esquiva enquanto ativo

  // Sharingan (Uchiha): bônus e manutenção crescem com os tomoe. O terceiro
  // também habilita a cópia temporária, tratada em combat/sharingan.ts.
  sharingan: {
    1: { upkeepPerTurn: 5, dodgeBonus: 0.03 },
    2: { upkeepPerTurn: 7, dodgeBonus: 0.05 },
    3: { upkeepPerTurn: 9, dodgeBonus: 0.1 },
  } as Record<1 | 2 | 3, { upkeepPerTurn: number; dodgeBonus: number }>,

  // Punho Forte / Portões Internos: cada portão futuro poderá aumentar os
  // dois valores; o primeiro já cobra o desgaste físico pedido pela árvore.
  // O Portão da Morte ultrapassa o teto usual de 2.0x porque, uma vez aberto,
  // não pode mais ser fechado ou trocado até a morte do usuário. O desgaste
  // de 80 HP por turno segue a mesma proporção de crescimento dos portões
  // anteriores (~1.4-1.6x por portão) em vez de dobrar como fazia antes,
  // mas continua sendo o contrapeso central.
  punhoForteGates: {
    1: { taijutsuDamageMult: 1.10, selfDamagePerTurn: 10 },
    2: { taijutsuDamageMult: 1.20, selfDamagePerTurn: 15, energyRecoveryPerTurn: 10 },
    3: { taijutsuDamageMult: 1.30, selfDamagePerTurn: 20 },
    4: { taijutsuDamageMult: 1.45, selfDamagePerTurn: 25 },
    5: { taijutsuDamageMult: 1.60, selfDamagePerTurn: 35 },
    6: { taijutsuDamageMult: 1.70, selfDamagePerTurn: 45, energyRecoveryPerTurn: 20 },
    7: { taijutsuDamageMult: 1.85, selfDamagePerTurn: 60 },
    8: { taijutsuDamageMult: 2.50, selfDamagePerTurn: 80 },
  } as Record<number, { taijutsuDamageMult: number; selfDamagePerTurn: number; energyRecoveryPerTurn?: number }>,

  // ---- Formato de area ----
  // meio-angulo do cone, em graus. 45 = cone de 90deg (padrao).
  // menor = cone mais estreito/agulha; maior = leque mais aberto.
  coneHalfAngleDeg: 45,

  // ---- Cenario: bonus de altura (arvore) ----
  heightAttackRangeBonus: 1,
  heightTargetDodgePenalty: 0.1, // alvos abaixo perdem 10% esquiva

  // ---- Efeitos: numeros base ----
  effects: {
    // explodeDmg 40 -> 30 (09/08/2026): a explosao era o unico payoff de
    // gatilho que pagava em DANO num patamar de jutsu de apice (o maior
    // baseDamage do jogo e' 48, a media dos elementais e' 24). Somada aos 24
    // de dano por turno da propria Queimadura, uma aplicacao entregava mais
    // que o golpe mais forte que existe. 30 fica acima da media e bem abaixo
    // do teto. REGRA: explodeAtStacks tem que ser MAIOR que o maximo de
    // acumulos que um unico uso consegue aplicar (hoje 4 = jutsu de 3 +
    // Brasas Persistentes), senao a explosao vira dano fixo por uso.
    // dmgPerTurn 8 -> 5 e explodeDmg 40 -> 20 (09/08/2026). Dois motivos:
    //   1. O BALANCEAMENTO_FINAL.txt mede so' baseDamage x passivas, entao o
    //      dano da Queimadura era invisivel nele: o doc mostrava Fogo 47,4 e
    //      Vento 49,4 (empate), quando o real era 84,8 x 49,4.
    //   2. A escada de dano-por-turno estava invertida — a Queimadura, de
    //      elemento BASICO, batia mais que todos os efeitos de kekkei genkai
    //      (Desintegracao 6, Corrosao 5, Magma 4). Agora ela empata com os
    //      comuns e fica abaixo do Poeira, que e' a hierarquia do projeto.
    // O tick e' FIXO de proposito (nao escala com acumulo): quem investe em
    // empilhar e' pago pela explosao e pelo corte de dano de TAI/BUKI.
    BURN: { dmgPerTurn: 5, taijutsuDmgReductionPerStack: 0.05, explodeAtStacks: 5, explodeDmg: 20 },
    POISON: { baseDmg: 2, dmgPerStack: 1, maxDuration: 5 },
    BLEED: { dmgPerTurn: 5, extraOnTaiKen: 6, healCutFactor: 0.5 },
    STUN: { defaultDuration: 1 },
    SLOW: { moveFactor: 0.5 },
    CONFUSION: { defaultDuration: 2 },
    ROOT: { defaultDuration: 1 },
    NINJUTSU_BLOCK: { defaultDuration: 2 },
    // Selo dos Tenketsu (Hyuuga): mesma duracao padrao do NINJUTSU_BLOCK, mas
    // fecha as tres categorias de chakra e tranca a abertura de Portao.
    TENKETSU_SEAL: { defaultDuration: 2 },
    CONTRACT_SEAL: { defaultDuration: 2 },
    DEFENSE_DOWN: { dodgeReduction: 0.15 },
    FLEE_LOCK: { defaultDuration: 2 },
    // Encharcado nao causa dano sozinho: e' um marcador que Agua e Raio leem.
    WET: { defaultDuration: 2 },
    // Barreira: os stacks SAO os pontos de dano absorvidos (nao multiplicador).
    SHIELD: { defaultDuration: 3, perDefend: 1 },
    CHAKRA_DRAIN: { defaultDuration: 2, chakraPerTurn: 10 },
    HASTE: {
      defaultDuration: 3,
      moveBonus: 2,
      dodgeBonus: 0.1,
      fleeChanceBonus: 0.25,
      contactDamage: 8,
    },
    // Sobrecarga: dano de saida multiplicado por tempo limitado. Generico —
    // primeiro uso e' a Pilula Secreta do Akimichi (skill com duracao, nao
    // passiva permanente: o corpo cobra o preco quando passa, ver onExpire
    // em AppliedEffect/data/types.ts).
    EMPOWERED: { defaultDuration: 3, dmgMultBonus: 0.6 },

    // ---- exclusivo do cla Nara ----
    // Vinculo de Sombra: o oposto do dano-por-toque comum. NAO causa dano nem
    // tem stacks — o payoff e' CONTROLE TOTAL: alem de travar o movimento
    // (como o Enraizado), tambem trava a REACAO do alvo (nao pode Esquivar,
    // Bloquear nem Aparar enquanto durar) porque o corpo dele "copia" o do
    // usuario. So uma Esquiva bem-sucedida ANTES do vinculo prender evita o
    // efeito — depois de preso, nao ha mais escolha.
    SHADOW_BOUND: { defaultDuration: 2 },

    // ---- exclusivos de kekkei genkai ----
    // Cristalizado: o oposto da Queimadura. NAO causa dano por turno — cobre o
    // alvo de cristal, tirando esquiva e movimento a cada acumulo. O payoff e'
    // CONTROLE: ao encher, o alvo e' selado dentro do proprio cristal.
    CRYSTALLIZED: {
      defaultDuration: 3,
      dodgePenaltyPerStack: 0.08, // -8 pontos percentuais de esquiva por acumulo
      movePenaltyPerStack: 1, // -1 casa de movimento por acumulo
      sealAtStacks: 4, // ao chegar aqui, o casulo fecha e os acumulos zeram
      sealStunDuration: 1,
      sealRootDuration: 2,
    },
    // Prisma (Fio de Luz): casulo de luz refratada. Corta o ninjutsu recebido e
    // devolve parte no atacante, mas o usuario fica IMOVEL e o corpo a corpo
    // passa inteiro — quem chega perto ganha a troca.
    PRISM: {
      defaultDuration: 2,
      ninjutsuDamageReduction: 0.6, // corta 60% do dano de NINJUTSU recebido
      reflectFraction: 0.3, // 30% do que foi barrado volta no atacante
    },
    // Corrosao (Vapor): nevoa que derrete o que atinge. Dano por turno leve
    // (metade da Queimadura) — o payoff nao e' dano, e' derreter a Barreira do
    // alvo: a cada tick, tambem consome pontos de SHIELD, ignorando-a.
    CORROSION: {
      defaultDuration: 3,
      dmgPerTurn: 5,
      shieldCorrodePerStack: 8, // pontos de Barreira derretidos por turno, por acumulo
    },
    // Desidratacao (Calor): o calor extremo suga a agua do corpo do alvo,
    // deixando-o fraco. Diferente da Queimadura (que so corta TAI/BUKI), corta
    // o dano de QUALQUER categoria que o alvo debilitado causar.
    DEHYDRATION: {
      defaultDuration: 2,
      // -10% de todo dano causado pelo alvo, por acumulo (era 15%). E' o unico
      // efeito que corta dano de QUALQUER categoria — a Queimadura, que e' o
      // outro corte de dano, tira 5% e so' de TAI/BUKI. Em 15% sem teto o
      // Calor zerava o dano do alvo com 7 acumulos (4 usos da Esfera).
      dmgReductionPerStack: 0.1,
      // Teto de acumulos. Queimadura e Cristal ja' tem freio natural (o
      // gatilho zera os acumulos); a Desidratacao era a unica que somava sem
      // limite. Com 3, o piso do alvo e' 70% do dano.
      maxStacks: 3,
    },
    // Magma (Lava): mesma forma do Cristalizado (acumula ate um gatilho), mas
    // com dano leve por turno enquanto acumula — a lava esfria sobre o corpo.
    // Ao encher, endurece e prende (ROOT) o alvo, sem Atordoar como o Cristal.
    MAGMA: {
      defaultDuration: 3,
      dmgPerTurn: 4,
      hardenAtStacks: 4,
      hardenRootDuration: 2,
    },
    // Minado (Explosao): pavio de tempo. Nao causa dano enquanto o pavio
    // queima — so estoura tudo de uma vez no ultimo tick, quando a duracao
    // chega a zero. Diferente do Cristal/Lava, o gatilho e' TEMPO, nao stack.
    MINADO: {
      defaultDuration: 2,
      explodeDamagePerStack: 20,
    },
    // Desintegracao (Poeira/Jinton): o KKG MAIS FORTE do jogo, entao o efeito
    // combina os DOIS payoffs que os outros KKG batem separado em vez de um
    // so — corrosao por turno (como Vapor: derrete Barreira ignorando-a,
    // shieldCorrodePerStack um pouco acima do da Corrosao) E controle por
    // acumulo (como Cristal/Lava: ao encher, colapsa). O colapso do Poeira
    // nao Atordoa nem Enraiza (isso ja e' o payoff do Cristal/Lava) — em vez
    // disso ele DESINTEGRA a defesa de verdade: zera toda Barreira restante
    // do alvo de uma vez (nao so' o que o tick drenaria) e aplica Defesa
    // Reduzida. collapseAtStacks mais baixo que sealAtStacks/hardenAtStacks
    // (4) de proposito — o Poeira deve colapsar mais rapido que os outros.
    DISINTEGRATION: {
      defaultDuration: 3,
      dmgPerTurn: 6,
      shieldCorrodePerStack: 10,
      collapseAtStacks: 3,
      collapseDefenseDownDuration: 3,
    },
    // Congelamento (Gelo): o unico efeito do jogo que mexe no CUSTO das
    // tecnicas do alvo. Sem dano por turno de proposito — o Gelo ja' tem o
    // maior pico de dano entre os KKG (ver capitulo de KKG do balanceamento);
    // o que faltava era identidade propria. Mesma forma de acumular ate um
    // gatilho do Cristal/Lava, mas o payoff nao Atordoa nem Enraiza: congela
    // o corpo e tira a REACAO (nem Esquiva, nem Bloqueio, nem Aparo).
    FROZEN: {
      defaultDuration: 3,
      // +10% no custo das tecnicas do alvo, por acumulo. Comecou em 15% e
      // caiu: o teto pratico e' 3 acumulos (no 4o congela e zera), entao 15%
      // dava +45% de custo somado a -3 de movimento — os dois juntos apagavam
      // o turno do alvo. Em 10% o pico fica em +30%, na mesma faixa do
      // Cristalizado (que cobra -8% de esquiva por acumulo na mesma forma).
      costPenaltyPerStack: 0.1,
      movePenaltyPerStack: 1,
      freezeAtStacks: 4, // ao chegar aqui, congela e os acumulos zeram
      freezeDuration: 1, // rodadas de FROZEN_SOLID aplicadas ao congelar
    },
    FROZEN_SOLID: { defaultDuration: 1 },
  },

  // ---- Deslocamento (empurrao / puxao) ----
  push: {
    // teto de casas que um unico jutsu pode arrastar o alvo
    maxCells: 4,
    // dano por bater em obstaculo/parede ao ser empurrado (passiva Vacuo Cortante)
    impactDamage: 15,
  },

  // ---- Terreno dinamico (manchas temporarias no mapa) ----
  terrain: {
    fireDmgPerTurn: 8, // dano por terminar o turno numa celula em chamas
    swampMoveFactor: 0.5, // pantano corta o movimento pela metade
    defaultDuration: 2, // rodadas padrao de uma mancha
  },

  // ---- Fuga do combate ----
  flee: {
    baseChance: 0.5,
    perAdjacentEnemy: -0.15, // cada inimigo colado dificulta
    perTaijutsuPoint: 0.01, // agilidade ajuda
    maxChance: 0.9,
    minChance: 0.1,
    energiaCost: 15,
  },

  // ---- Combate ----
  maxParticipants: 25,

  // ---- Yamanaka (Shintenshin) ----
  // Custo de iniciar mora so' em yamanaka_shintenshin.cost (clans/index.ts) —
  // uma unica fonte de verdade, sem duplicar o numero aqui.
  yamanaka: {
    upkeepPerTurn: 10, // % chakra por turno mantendo o controle
    // ponto percentual de chance de o dono do corpo resistir, por ponto de
    // diferenca de Ninjutsu (vitima - controlador) — ver yamanakaResistChance
    // em combat-math.ts. Simetrico em torno de 50%.
    resistBasePerNinjutsuDiff: 0.03,
    resistMinChance: 0.1,
    resistMaxChance: 0.9,
    maxUpwardLevelGap: 9,
    // dano do controlador ATRAVES do corpo emprestado: nao domina o corpo
    // 100%, entao todo golpe sai com 1/3 a menos enquanto durar o controle.
    pilotedDamageMult: 0.67,
  },

  // ---- Progressao / XP ----
  // A curva inteira (nível 1 -> 50) soma 95.550 XP. Com a rotina-base de um
  // ninja ativo — uma missão D + uma C (≈350), um treino de reação (até 250)
  // e cerca de uma hora de RP (≈108) — a chegada ao nível 50 fica em cerca de
  // 135 dias. RP complementa a jornada; missão continua sendo a fonte mais
  // eficiente de progresso, inclusive no rank D.
  xpPerLevel: (level: number) => 200 + level * 70,
  xp: {
    // Treino diário de reação: clicar no alvo azul concede XP até a meta;
    // clicar no preto encerra a tentativa, preservando o que já foi ganho.
    trainingReward: 250,
    trainingDailyLimit: 1,
    training: {
      blueXpMin: 25,
      blueXpMax: 40,
      blackChance: 0.08,
      targetLifetimeMs: 1_250,
      durationMs: 180_000,
      gridSize: 3,
    },
    roleplay: {
      rewardMin: 2,
      rewardMax: 4,
      cooldownMinMs: 20_000,
      cooldownMaxMs: 3 * 60_000,
      // Mensagem muito curta não é uma ação de RP e não reinicia o intervalo.
      minimumContentLength: 8,
    },
  },

  // ---- Formula de custo sugerido de jutsu ----
  // Ferramenta de AUTORIA (services/characters/jutsu-balance.ts): dado
  // baseDamage/baseHeal/effects/actionType/shape/unblockable de uma ability,
  // devolve um custo "justo" sugerido, pra nao inventar o numero de olho.
  // NAO e' chamada pela engine de combate (o `cost` que a engine usa continua
  // sendo o valor escrito na ability) e NAO cobre summon/mindTransfer/
  // trapField/cleanses/teamBuff — esses continuam a criterio de quem escreve
  // o jutsu (valor de combo/multi-alvo que a formula nao enxerga).
  //
  // v2: a v1 usava uma taxa LINEAR de dano (0.55/ponto) calibrada so' contra 3
  // jutsu tier 1-2. Rodando scripts/audit-jutsu-costs.ts contra as ~170
  // abilities restantes, ela furava feio pra cima: jutsu de apice com 34-46 de
  // dano bruto ficavam 30-46 pontos ABAIXO do custo real (ex: Punho de Mina
  // Terrestre 74 -> sugeria 28). Dano NAO escala linear no orcamento do jogo —
  // um golpe de 46 nao "vale" so' o triplo de um de 14, vale muito mais que
  // isso, e a curva precisa refletir. Daqui pra baixo, `damageBrackets`
  // substitui `outputRate` por uma taxa PROGRESSIVA (tipo faixa de IR): os
  // primeiros pontos custam pouco, o excedente custa cada vez mais.
  //
  // As severidades tambem subiram: rodando o audit contra ~25 abilities SEM
  // dano (so' efeito puro — SHADOW_BOUND, EMPOWERED, PRISM, HASTE, SHIELD...)
  // a v1 tambem furava pra baixo nelas. Uma parte disso e' real (o efeito
  // sozinho vale mais do que eu estimava), outra parte e' valor de COMBO que
  // nenhuma formula estatica por-ability enxerga (ex: SHADOW_BOUND do Nara so'
  // vale tanto porque garante o proximo golpe de um jutsu DIFERENTE — Nara
  // ainda fica com o maior residuo de erro do roster, e isso e' esperado, nao
  // bug: ver tests/jutsu-balance.test.ts). Os numeros aqui sao a MEDIANA das
  // abilities reais que usam cada efeito sozinho, nao um chute.
  jutsuCostFormula: {
    base: 6, // piso: "taxa de selos de mao" mesmo pra jutsu sem dano/cura/efeito
    // faixas progressivas de custo por ponto de baseDamage OU baseHeal (os
    // dois contam igual). Cada faixa cobre so' os pontos DENTRO dela — os
    // primeiros 20 pontos sempre custam 0.55/ponto, nao importa o total.
    // A 3a faixa quase NAO sobe (0.15, quase um teto): jutsu que ja' passam de
    // 35 de dano bruto sao apice/quase-apice, e esses ja' sao freados por
    // OUTRO eixo — nivel/atributo altissimo pra desbloquear, `oncePerCombat`
    // em alguns, arvore cara pra chegar la'. Cobrar em cima disso TAMBEM na
    // taxa progressiva normal double-conta o freio (Kirin e Bomba Liger, os
    // dois dano 48, viravam +38/+37 antes desta faixa quase-plana existir).
    damageBrackets: [
      { upTo: 20, rate: 0.55 }, // calibrado contra tier 1-2 (Bola de Fogo, Esfera de Relampago...)
      { upTo: 35, rate: 1.5 },
      { upTo: Infinity, rate: 0.15 }, // apice: o nivel/atributo/oncePerCombat ja' freiam
    ],
    areaMult: 1.15, // LINE/CONE/RADIUS acertam varios alvos de uma vez
    // multiplicadores de "sem defesa possivel" — so' o mais forte presente conta
    unblockableMult: 1.4, // ignora Bloqueio, Aparo E Esquiva
    undodgeableMult: 1.2, // ignora so' Esquiva
    unguardableMult: 1.15, // ignora so' Bloqueio/Aparo
    // multiplica o total conforme o slot de acao — BONUS paga premio por ser
    // uma acao "de graca" (soma com a acao COMUM no mesmo turno); REACAO paga
    // um pouco menos por so' estar disponivel quando o alvo e' atacado, MOVIMENTO
    // um pouco menos ainda por consumir o slot mais barato.
    actionTypeMult: { COMUM: 1.0, BONUS: 1.3, MOVIMENTO: 0.85, REACAO: 0.85 },
    // pontos de severidade por RODADA de cada efeito (multiplicado por duracao
    // e chance na formula). Recalibrados contra abilities reais SEM dano (so'
    // o efeito) — ver comentario acima. Efeitos que travam ACAO INTEIRA (STUN)
    // ou que a engine sabe ter um "pagamento escondido" em BALANCE.effects
    // (MINADO explode depois, CRYSTALLIZED/MAGMA selam ao encher) valem mais.
    effectSeverity: {
      // STUN 4 -> 7 (09/08/2026): estava ABAIXO de efeitos que negam menos.
      // Atordoar tira o turno inteiro (acao E movimento); o Selo dos Tenketsu,
      // que valia 7, deixa o alvo andar e usar TAI/BUKI/KEN a vontade. Fica em
      // 7 e nao em 8 porque o atordoado ainda consegue REAGIR (Esquivar,
      // Bloquear, Aparar) — e' o Vinculo de Sombra que tira a reacao, e e' por
      // isso que ele vale 8 mesmo deixando o alvo agir. A chance/duracao baixa
      // da maioria dos jutsus com Atordoamento ja' desconta na formula.
      STUN: 7,
      SHADOW_BOUND: 8, // trava movimento+reacao E e' combo-enabler do Nara — mediana real 5-19, ver nota acima
      PRISM: 8, // casulo de luz: reduz dano recebido E reflete — mediana real (Fio de Luz)
      NINJUTSU_BLOCK: 4, // fecha uma categoria inteira
      // Selo dos Tenketsu: fecha TRES categorias (Ninjutsu/Genjutsu/Iryo) e
      // ainda tranca a abertura de Portao — acima do NINJUTSU_BLOCK, que fecha
      // uma so'. Baixado de 7 pra 5 em 09/08/2026: negar tres categorias e'
      // menos que negar o turno inteiro (Atordoamento), e o alvo selado
      // continua andando, batendo e reagindo normalmente.
      TENKETSU_SEAL: 5,
      // Congelamento: mesmo peso do Cristalizado — acumula ate um gatilho de
      // controle, sem dano por turno. O encarecimento por acumulo compensa o
      // payoff ser mais curto (1 rodada sem reacao contra 1 Atordoar + 2
      // Imobilizar do Cristal).
      FROZEN: 4,
      CONFUSION: 4, // ataca alvo aleatorio, pode acertar aliado
      // Era o ultimo efeito do roster sem severidade propria (caia no padrao
      // 2). Fecha uma mecanica inteira — invocacao e chakra de Bijuu — entao
      // vale como o NINJUTSU_BLOCK, que tambem fecha uma so'. Nao mais que
      // isso porque so' morde quem investiu em invocacao.
      CONTRACT_SEAL: 4,
      DISARM: 3,
      ROOT: 3, // so' trava movimento — mediana real (Abelha do Mel) puxou pra cima
      POISON: 3, // mediana real (Nuvem de Veneno do Aburame)
      CRYSTALLIZED: 4, // acumula ate SELAR (Atordoamento + Imobilizacao) — pagamento escondido
      MAGMA: 3, // acumula ate ENDURECER (Imobilizacao) — pagamento escondido
      MINADO: 18, // detona SOZINHO depois (explodeDamagePerStack: 20/acumulo) — calibrado (Punho de Mina Terrestre)
      DISINTEGRATION: 5, // corroi Barreira por turno E acumula ate COLAPSAR (zera Barreira restante + Defesa Reduzida) — os dois payoffs do Cristal/Vapor num efeito so', o KKG mais forte
      DEHYDRATION: 3,
      HASTE: 3.5, // mediana real (Armadura de Raio, Quatro Patas, Deslocamento...)
      EMPOWERED: 4, // mediana real (Bisturi, Pilula Secreta, Lobo de Duas Cabecas...)
      SHIELD: 4.5, // mediana real (Muralha de Agua, Tamanho Multiplo, Parede de Insetos...)
      DEFENSE_DOWN: 2,
      CHAKRA_DRAIN: 2,
      CORROSION: 2.5,
      BURN: 1.5, // calibrado (Grande Bola de Fogo)
      BLEED: 1.5,
      SLOW: 1,
      FLEE_LOCK: 1.5,
      WET: 1, // setup puro (habilita outro jutsu), sem valor direto
    } as Record<EffectId, number>,
  },
} as const;

export type Balance = typeof BALANCE;

// ---------------- Economia / vilas ----------------
// Separado de BALANCE porque a economia tem ciclo de ajuste proprio (o Kage
// muda taxa em jogo) e nao entra em nenhuma formula de combate.
export const ECONOMY = {
  // Taxa inicial do imposto pessoal semanal de cada vila. O Kage altera em
  // jogo; a competencia congela o valor na abertura (VillageTaxPeriod).
  defaultTaxRate: 0.05,
  minTaxRate: 0,
  maxTaxRate: 0.15,

  // Saciedade: 100 = cheio. A queda por acao entra na etapa 3.
  satietyStart: 100,
  satietyMax: 100,

  // Meta oculta de atividade semanal, em XP tributavel (~3 missoes rank B).
  // Abaixo dela a competencia fecha como ISENTO_INATIVO. Nunca exibir ao
  // jogador — ver secao 3.2 de docs/economia-vilas.md.
  weeklyTaxableXpGoal: 1600,

  // ---- Coleta (secao 4.3) ----
  // 15 min por personagem E por tipo de acao.
  gatherCooldownMs: 15 * 60_000,
  // Coleta/mineracao/agua: 3 a 7 unidades distribuidas na tabela da area.
  gatherMin: 3,
  gatherMax: 7,
  // Caca/pesca: 2 a 5 do alvo principal e 0 a 2 do secundario.
  huntMin: 2,
  huntMax: 5,
  huntSecondaryMax: 2,
  // Raro: fixo, sem bonus de nivel ou de obra. Exatamente 1 unidade.
  rareResourceChance: 0.05,

  // ---- Cofre da vila (secao 3.3) ----
  // Saque do Kage: 10% do saldo DISPONIVEL (cofre menos reserva) por semana,
  // com teto por saque. A janela e' a mesma competencia do imposto.
  kageWeeklyWithdrawalRate: 0.1,
  kageWithdrawalCap: 2000,
  withdrawalReasonMin: 10,
  withdrawalReasonMax: 200,

  // ---- Ordens de coleta (secao 4.2.1) ----
  orderMinDurationMs: 60 * 60_000, // 1 hora
  orderMaxDurationMs: 7 * 24 * 60 * 60_000, // 7 dias

  // ---- Lojas de vila (secao 7) ----
  // Capacidade fixa de estoque por loja. Nao ha evolucao de loja nesta
  // economia: nivel, melhoria de capacidade e limite diario extra sao
  // explicitamente proibidos pela secao 7.2.
  shopCapacity: 500,
  // Orcamento diario de compra de ingrediente: 500 x fator de populacao, por
  // loja. Impede que uma vila de cofre baixo compre coleta infinitamente.
  shopDailyBudgetBase: 500,
  // Compra de matéria-prima também tem cota física: por dia, cada loja
  // municipal aceita só parte dos insumos do catálogo. A seleção é congelada
  // no banco e muda por vila/dia; não é possível farmar todos os recursos no
  // mesmo balcão. A quantidade de cada oferta cresce com os ativos de 14 dias.
  shopPurchaseOffersMin: 2,
  shopPurchaseOffersMax: 4,
  shopPurchaseOffersPerActive: 0.15,
  shopPurchaseQtyPerActive: 3,
  shopPurchaseQtyMin: 12,
  shopPurchaseQtyMax: 80,
  // Recompra de emergencia do Mercado Geral: 30% do valor de referencia
  // (secao 3.1). E' de proposito pior que vender a loja municipal — a saida de
  // emergencia existe, mas craft e doacao continuam valendo mais.
  npcBuybackRate: 0.3,
  // Markup do Mercado Geral sobre a base de compra da materia bruta. Precisa
  // ser > 1 / (1 - taxa maxima): se o NPC vendesse madeira mais barato do que a
  // Marcenaria paga por ela, o par de lojas viraria uma impressora de Ryo.
  generalMarketMarkup: 2,
  // ---- Caravana do Mercado Geral (secao 7.2.1) ----
  // O NPC nao tem estoque infinito: cada vila recebe QUATRO ofertas sorteadas
  // por dia local, e nada alem delas esta a venda ali.
  generalMarketOffersPerDay: 4,
  // Quantidade compartilhada de cada oferta, congelada na criacao:
  // limitar(min, max, teto(porAtivo x ativos_14d)). Com 6 ativos da' 12; com
  // 20, 40; de 30 para cima bate o teto de 60.
  generalMarketQtyPerActive: 2,
  generalMarketQtyMin: 10,
  generalMarketQtyMax: 60,
  // Virada da caravana: 00:05 no fuso da competencia, junto da producao diaria.
  generalMarketHour: 0,
  generalMarketMinute: 5,
  // Valor do contrato de atacado = piso(lote x referencia x esta taxa).
  // 10 Lámen x 48 x 0,875 = 420 Ryo, o exemplo da secao 7.6.
  wholesaleRate: 0.875,
  // Contratos de atacado por loja e por dia (secao 7.6).
  wholesaleContractsPerDay: 1,
  // Escassez da Oficina de Selos: Pergaminhos de Arsenal por vila e por
  // competencia semanal (secao 7.2). Reseta junto do corte de domingo 22:00.
  sealScrollsPerWeek: 3,
  // Piso de obras simultaneas por vila. A capacidade real vem do nivel do
  // Centro da Vila (`centerCapacity` em src/data/sectors.ts): 1, 2 ou 3. Este
  // numero e' o que sobra quando o Centro esta em NECESSITA_REFORMA.
  constructionSlots: 1,
  // Vida da sessao do painel de /loja. Depois disso o painel velho e' recusado.
  shopSessionTtlMs: 15 * 60_000,

  // ---- Manutencao semanal (secao 6.4) ----
  // Reforma cobra 3% do Ryo-base ja investido no predio e 1% de cada material
  // acumulado, ambos multiplicados pelo fator de populacao. So' o Ryo recebe o
  // desconto do Centro.
  maintenanceRyoRate: 0.03,
  maintenanceItemRate: 0.01,
  // Prazo de graca depois da cobranca. Vencido, o predio vai para
  // NECESSITA_REFORMA — sem perder nivel e sem juros.
  maintenanceGraceMs: 72 * 3_600_000,
  // Segunda-feira, 00:15 no fuso da competencia.
  maintenanceWeekday: 1,
  maintenanceHour: 0,
  maintenanceMinute: 15,
  // Producao passiva e recalculo da populacao: 00:05 todo dia.
  dailyProductionHour: 0,
  dailyProductionMinute: 5,
  // Bonus de coleta por nivel de setor acima do 1 (secao 6.3): +5% por nivel,
  // ate +20% no nivel 5. So' recurso COMUM, nunca raro.
  sectorGatherBonusPerLevel: 0.05,
  sectorGatherBonusMax: 0.2,

  // ---- Populacao ativa (secao 6.2) ----
  // Janela de atividade e os limites do fator. O fator NAO e' aplicado a custo
  // nem producao nesta etapa: e' so' leitura de painel ate a etapa 6.
  activeWindowDays: 14,
  populationBaseline: 20,
  populationFactorMin: 0.3,
  populationFactorMax: 1.5,
} as const;

export type Economy = typeof ECONOMY;
