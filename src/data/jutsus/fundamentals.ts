import type { Ability } from "../types.js";

// ============================================================================
// Fundamentos — ninjutsu de Academia, sem natureza de chakra. Roster REAL
// (nao e' o placeholder mencionado no CLAUDE.md): sao os 3 jutsus concedidos
// pelos nos de data/element-trees/fundamentals.ts, o pre-requisito pra
// desbloquear o primeiro elemento. Ver skill "ninjutsu-authoring" e
// services/characters/skill-tree.ts.
// ============================================================================
export const FUNDAMENTOS: Ability[] = [
  {
    id: "tecnica_clonagem",
    name: "Técnica de Clonagem",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 10,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { manualOnly: true },
    tags: ["fundamentos", "buff", "ilusao", "clone"],
    description:
      "Cria uma ou mais imagens de si mesmo, sem corpo físico. Os clones não causam dano, mas confundem o adversário: seu próximo golpe recebido tem mais chance de acertar a ilusão em vez de você.",
  },
  {
    id: "tecnica_substituicao",
    name: "Técnica de Substituição",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 15,
    actionType: "REACAO",
    reactionKind: "DODGE",
    reactionDodgeBonus: 0.2,
    isCloneTrick: true,
    range: 0,
    shape: "SELF",
    requirements: { manualOnly: true },
    tags: ["fundamentos", "reacao", "fuga", "ilusao"],
    description:
      "Substitui o próprio corpo por um tronco de madeira no instante em que o ataque chega, criando uma ilusão de ótica. Como reação, dá +20% de chance de esquiva contra o golpe.",
  },
  {
    id: "tecnica_caminhada_aquatica",
    name: "Técnica da Caminhada Aquática",
    category: "NINJUTSU",
    tier: 1,
    resource: "chakra",
    // custo 0: nunca e' "usada" via /jutsu — e' ligada/desligada com
    // /combate agua, que gasta BALANCE.waterWalkUpkeepPerTurn por turno.
    cost: 0,
    actionType: "BONUS",
    range: 0,
    shape: "SELF",
    requirements: { manualOnly: true },
    tags: ["fundamentos", "passivo", "agua", "mobilidade"],
    description:
      "Ativa automaticamente ao pisar na água (ligar/desligar com /combate agua). Enquanto ativa, gasta 5% de chakra por turno, mas você não fica Encharcado nem tem o movimento reduzido pela água.",
  },
];
