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
  {
    // Obstáculo da missão de escolta. Sem habilidades => fica imóvel (não ataca).
    id: "tronco",
    name: "Tronco",
    hpMax: 45,
    attributes: { taijutsu: 1 },
    abilityIds: [],
    image: "enemies/log.png",
  },
  {
    // Bandido do deserto (escolta): ~4 capangas juntos, um pouco mais fraco.
    // 4 capangas = 280 HP; este fica em 240 e bate mais forte que um único capanga.
    id: "escort_bandit",
    name: "Bandido do Deserto",
    hpMax: 240,
    attributes: { taijutsu: 13, kenjutsu: 14, ninjutsu: 7 },
    abilityIds: ["ken_corte_simples", "ken_corte_linha", "tai_soco_forte"],
    image: "enemies/desert-bandit.png",
  },
  {
    id: "purse_thief",
    name: "Ladrao de Bolsas",
    hpMax: 55,
    attributes: { taijutsu: 5, kenjutsu: 3 },
    abilityIds: ["tai_soco_forte"],
    aiPersona: "purse_thief",
    image: "enemies/purse-thief.png",
  },
  {
    id: "roof_pigeon",
    name: "Pombo",
    hpMax: 12,
    attributes: { taijutsu: 1 },
    abilityIds: ["pombo_bicada"],
    image: "enemies/roof-pigeon.png",
  },
  {
    id: "wasp_swarm",
    name: "Enxame de Vespas",
    hpMax: 38,
    attributes: { taijutsu: 4 },
    abilityIds: ["vespa_ferroada"],
    image: "enemies/wasp-swarm.png",
  },
  {
    id: "alley_troublemaker",
    name: "Arruaceiro do Beco",
    hpMax: 50,
    attributes: { taijutsu: 5, kenjutsu: 2 },
    abilityIds: ["tai_soco_forte"],
    aiPersona: "alley_troublemaker",
  },
];

const NPC_MAP = new Map<string, NpcTemplate>(NPCS.map((n) => [n.id, n]));

export function getNpc(id: string): NpcTemplate | undefined {
  return NPC_MAP.get(id);
}
