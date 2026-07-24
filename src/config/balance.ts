// Camada de balanceamento editavel. Ajuste tudo aqui sem mexer na engine.
import type { MasteryLevel } from "./enums.js";

export const BALANCE = {
  // ---- Vida / atributos ----
  hpBase: 100,
  // HP cresce devagar de proposito: como o dano vem da arvore (funcao degrau,
  // limitada pelo total de nos) e nao do atributo, HP linear rapido faria a luta
  // esticar sem fim no fim de jogo. Ver a nota de escalas abaixo.
  hpPerLevel: 2,
  hpPerTaijutsu: 2,

  // nivel maximo
  maxLevel: 50,
  // ponto de atributo por nivel
  attributePointsPerLevel: 4,
  // teto por atributo (0 = sem teto)
  attributeCap: 0,
  // a cada N niveis, 1 ponto de maestria
  masteryEveryLevels: 15,

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
  genjutsuScaling: 1.0,
  fuinjutsuScaling: 0,
  kugutsuScaling: 0,
  senjutsuScaling: 0,
  dojutsuScaling: 0,

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

  // ---- Maestria: multiplicador de custo por recurso ----
  masteryCostMultiplier: {
    BASICO: 1.0,
    CONTROLADO: 0.7,
    MESTRE: 0.55,
  } as Record<MasteryLevel, number>,

  // ---- Formato de area ----
  // meio-angulo do cone, em graus. 45 = cone de 90deg (padrao).
  // menor = cone mais estreito/agulha; maior = leque mais aberto.
  coneHalfAngleDeg: 45,

  // ---- Cenario: bonus de altura (arvore) ----
  heightAttackRangeBonus: 1,
  heightTargetDodgePenalty: 0.1, // alvos abaixo perdem 10% esquiva

  // ---- Efeitos: numeros base ----
  effects: {
    BURN: { dmgPerTurn: 8, taijutsuDmgReductionPerStack: 0.05, explodeAtStacks: 5, explodeDmg: 40 },
    POISON: { baseDmg: 2, dmgPerStack: 1, maxDuration: 5 },
    BLEED: { dmgPerTurn: 5, extraOnTaiKen: 6, healCutFactor: 0.5 },
    STUN: { defaultDuration: 1 },
    SLOW: { moveFactor: 0.5 },
    CONFUSION: { defaultDuration: 2 },
    ROOT: { defaultDuration: 1 },
    NINJUTSU_BLOCK: { defaultDuration: 2 },
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
      dmgReductionPerStack: 0.15, // -15% de todo dano causado pelo alvo, por acumulo
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
  yamanaka: {
    initCost: 40, // % chakra para iniciar
    upkeepPerTurn: 10, // % chakra por turno mantendo
    resistBasePerGenjutsuDiff: 0.05,
  },

  // ---- Progressao / XP ----
  xpPerLevel: (level: number) => 100 + level * 50,
} as const;

export type Balance = typeof BALANCE;
