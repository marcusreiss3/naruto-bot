import type { NpcTemplate } from "./types.js";

export const NPCS: NpcTemplate[] = [
  {
    id: "bandit_leader",
    name: "Líder dos Bandidos",
    hpMax: 160,
    attributes: { taijutsu: 14, kenjutsu: 16, ninjutsu: 8 },
    abilityIds: ["ken_corte_simples", "ken_corte_linha", "tai_soco_forte", "katon_goukakyuu"],
    aiPersona: "bandit_leader",
    image: "enemies/bandit-leader-forest.png",
  },
  {
    id: "bandit_thug",
    name: "Capanga",
    hpMax: 70,
    attributes: { taijutsu: 8, kenjutsu: 6 },
    abilityIds: ["ken_corte_simples", "tai_soco_forte"],
    image: "enemies/bandit-forest.png",
  },
];

const NPC_MAP = new Map<string, NpcTemplate>(NPCS.map((n) => [n.id, n]));

export function getNpc(id: string): NpcTemplate | undefined {
  return NPC_MAP.get(id);
}
