import type { Ability } from "../types.js";

// ============================================================================
// Clones das Sombras (Kage Bunshin) — invocacao especial, diferente dos
// clones elementais de src/data/jutsus/elemental.ts (Agua/Terra/Raio/Cristal):
// aqueles tem corpo e jutsu FIXOS de template; este herda os jutsu que o
// PROPRIO invocador ja possui (Ability.summon.inheritOwnerJutsu) e reflete
// parte do dano/chakra que sofre de volta pro invocador ao morrer
// (Ability.summon.deathReflect). Ver createSummon()/resolveHit() em
// combat-engine.ts e runNpcTurn() em npc-combat.ts.
//
// NAO esta em nenhum no de arvore ainda (manualOnly) — de proposito, a
// pedido explicito. Placeholder de jogador como qualquer outro, ver
// CLAUDE.md.
// ============================================================================
export const KAGE_BUNSHIN_ABILITIES: Ability[] = [
  {
    id: "kage_bunshin",
    name: "Clones das Sombras",
    category: "NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 5,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    summon: {
      templateId: "summon_kage_bunshin",
      maxAlive: 6,
      inheritOwnerJutsu: { maxCostPct: 35 },
      actsNextRound: true,
      deathReflect: { overkillDamagePct: 0.3, jutsuCostPct: 0.3 },
    },
    requirements: { manualOnly: true },
    tags: ["clone", "invocacao", "apice"],
    description:
      "Cria um clone material com 1 de vida (até 6 no campo; se um morre, dá pra repor). O clone age por conta própria a partir da rodada seguinte à criação, usando os jutsu que você já possui (nunca um que custe mais de 35% de chakra). Quando o clone morre, você sente 30% do dano excedente que ele tomou e paga 30% do custo de cada jutsu que ele usou em vida.",
  },
];
