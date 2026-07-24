// Passivas dos nós PASSIVE das árvores de CLÃ. Mesmo contrato de
// element-trees/passives.ts (services/combat/passives.ts agrega, a engine
// consome) — só troca `element` por `clanId`, porque habilidades de clã
// (categoria CLA) não têm `element` na Ability.
//
// Ao criar uma passiva nova: se ela precisar de um modificador que ainda nao
// existe aqui, o campo tem que nascer aqui E ser consumido em
// services/combat/passives.ts — campo sem consumo é passiva morta.
import type { EffectId, Shape } from "../../config/enums.js";

export interface ClanPassiveDef {
  nodeId: string;
  clanId: string;
  // multiplica o dano dos jutsus de clã (1.3 = +30%) — Akimichi e' o unico
  // clã que ganha dano de graça igual os elementos; Nara/Hyuuga ganham por
  // controle/perfuracao, nao por multiplicador bruto.
  damageMult?: number;
  // multiplica o custo de recurso dos jutsus de clã (0.85 = -15%)
  costMult?: number;
  costShapes?: Shape[];
  // chance extra de aplicar efeitos especificos (0.15 = +15 pontos percentuais)
  effectChanceBonus?: Partial<Record<EffectId, number>>;
  // estende a duracao de um efeito aplicado pelos jutsus de clã
  effectDurationBonus?: { effectId: EffectId; bonus: number };
  // casas extras de alcance
  rangeBonus?: number;
  rangeShapes?: Shape[];
  // o dano dos jutsus de clã passa direto pela Barreira do alvo
  ignoresShield?: boolean;
  // multiplicador contra alvos abaixo de certa fração do HP máximo
  executeBonus?: { hpThreshold: number; mult: number };
  // casas extras de empurrao/puxao dos jutsus de clã
  pushBonus?: number;
}

export const CLAN_PASSIVES: ClanPassiveDef[] = [
  // ---------------------------------------------------------------- NARA
  // Nara não ganha dano de graça como os elementos — o clã é controle, não
  // rajada. A raiz corta custo (o clã é lendário em precisão de chakra); o
  // ápice estende o alcance da sombra e a duração da imobilização (o mesmo
  // papel que "Peso da Montanha" cumpre pra Terra, só que sem multiplicador
  // de dano).
  {
    nodeId: "nara_raiz",
    clanId: "nara",
    costMult: 0.85,
    // ROOT (Enforcamento/Costura, que ainda causam dano de verdade) e
    // SHADOW_BOUND (a família de imitação, sem dano) — os dois "prendem".
    effectChanceBonus: { ROOT: 0.15, SHADOW_BOUND: 0.15 },
  },
  {
    nodeId: "nara_apice",
    clanId: "nara",
    rangeBonus: 2,
    rangeShapes: ["LINE", "SINGLE_TARGET"],
    // so estende o Vínculo de Sombra (a marca do ápice da árvore) — Enforcamento
    // e Costura não ganham esse +1 de ROOT, só o clone de imitação.
    effectDurationBonus: { effectId: "SHADOW_BOUND", bonus: 1 },
  },

  // -------------------------------------------------------------- HYUUGA
  // O clã não ganha dano de graça igual os elementos — ganha por ATRAVESSAR
  // defesa (perfura Barreira, ignora escudo) e por SELAR chakra (Bloqueio de
  // Ninjutsu), porque o Punho Suave sempre foi descrito como "atinge por
  // dentro" no material de origem. A raiz é passiva (percepção do clã, ativa
  // mesmo sem o Byakugan ligado); o ápice é o pagamento do Punho Suave: ele
  // ignora Barreira e finaliza melhor alvos já feridos.
  {
    nodeId: "hyuuga_raiz",
    clanId: "hyuuga",
    costMult: 0.9,
    effectChanceBonus: { NINJUTSU_BLOCK: 0.1 },
  },
  {
    nodeId: "hyuuga_apice",
    clanId: "hyuuga",
    ignoresShield: true,
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
    effectDurationBonus: { effectId: "NINJUTSU_BLOCK", bonus: 1 },
  },

  // ------------------------------------------------------------ AKIMICHI
  // Diferente de Nara (controle) e Hyuuga (perfuração), o Akimichi é o clã
  // de dano bruto — "usar o peso pra bater mais forte". Só a raiz é passiva
  // permanente (+30% de dano, sempre ativo); o ápice ("Pílula Secreta") NÃO
  // é passiva — virou skill com duração (efeito EMPOWERED) porque um +55%
  // de dano permanente de graça ficava forte demais. Ver o jutsu em
  // clans/index.ts e o nó em clan-trees/index.ts (kind: JUTSU, não PASSIVE).
  {
    nodeId: "akimichi_raiz",
    clanId: "akimichi",
    damageMult: 1.3,
    pushBonus: 1,
  },
];

const CLAN_PASSIVE_INDEX: Map<string, ClanPassiveDef> = new Map(CLAN_PASSIVES.map((p) => [p.nodeId, p]));

export function getClanPassive(nodeId: string): ClanPassiveDef | undefined {
  return CLAN_PASSIVE_INDEX.get(nodeId);
}
