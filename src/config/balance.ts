// Camada de balanceamento editavel. Ajuste tudo aqui sem mexer na engine.
import type { EffectId, MasteryLevel } from "./enums.js";

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
  // de 100 HP por turno continua sendo o contrapeso central.
  punhoForteGates: {
    1: { taijutsuDamageMult: 1.10, selfDamagePerTurn: 5 },
    2: { taijutsuDamageMult: 1.20, selfDamagePerTurn: 8, energyRecoveryPerTurn: 10 },
    3: { taijutsuDamageMult: 1.32, selfDamagePerTurn: 12 },
    4: { taijutsuDamageMult: 1.45, selfDamagePerTurn: 18 },
    5: { taijutsuDamageMult: 1.58, selfDamagePerTurn: 25 },
    6: { taijutsuDamageMult: 1.72, selfDamagePerTurn: 35, energyRecoveryPerTurn: 20 },
    7: { taijutsuDamageMult: 1.85, selfDamagePerTurn: 50 },
    8: { taijutsuDamageMult: 2.50, selfDamagePerTurn: 100 },
  } as Record<number, { taijutsuDamageMult: number; selfDamagePerTurn: number; energyRecoveryPerTurn?: number }>,

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
  xpPerLevel: (level: number) => 100 + level * 50,

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
      STUN: 4, // trava a acao inteira — calibrado (raiton_esfera/ataque_raio)
      SHADOW_BOUND: 8, // trava movimento+reacao E e' combo-enabler do Nara — mediana real 5-19, ver nota acima
      PRISM: 8, // casulo de luz: reduz dano recebido E reflete — mediana real (Fio de Luz)
      NINJUTSU_BLOCK: 4, // fecha uma categoria inteira
      CONFUSION: 4, // ataca alvo aleatorio, pode acertar aliado
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
