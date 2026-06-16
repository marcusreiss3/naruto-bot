// Camada de balanceamento editavel. Ajuste tudo aqui sem mexer na engine.
import type { MasteryLevel } from "./enums.js";

export const BALANCE = {
  // ---- Vida / atributos ----
  hpBase: 100,
  hpPerLevel: 5,
  hpPerTaijutsu: 3,

  // nivel maximo
  maxLevel: 30,
  // ponto de atributo por nivel
  attributePointsPerLevel: 2,
  // a cada N niveis, 1 ponto de maestria
  masteryEveryLevels: 15,

  // ---- Escalas de dano/cura ----
  ninjutsuScaling: 2.0,
  iryoScaling: 2.5,
  taijutsuScaling: 1.8,
  kenjutsuScaling: 1.8,

  // ---- Genjutsu duracao ----
  genjutsuBaseDurationBonusEvery: 10, // +1 rodada a cada 10 de genjutsu
  genjutsuDurationCap: 6,

  // ---- Esquiva (caps) ----
  dodgePhysBase: 0.05,
  dodgePhysCap: 0.35,
  dodgePhysPerTaijutsu: 0.01,
  dodgeNinjutsuBase: 0.03,
  dodgeNinjutsuCap: 0.3,
  dodgeNinjutsuPerNinjutsu: 0.008,

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

  // ---- Maestria: multiplicador de custo por recurso ----
  masteryCostMultiplier: {
    BASICO: 1.0,
    CONTROLADO: 0.7,
    MESTRE: 0.55,
  } as Record<MasteryLevel, number>,

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
