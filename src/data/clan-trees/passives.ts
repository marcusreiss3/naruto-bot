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
];

const CLAN_PASSIVE_INDEX: Map<string, ClanPassiveDef> = new Map(CLAN_PASSIVES.map((p) => [p.nodeId, p]));

export function getClanPassive(nodeId: string): ClanPassiveDef | undefined {
  return CLAN_PASSIVE_INDEX.get(nodeId);
}
