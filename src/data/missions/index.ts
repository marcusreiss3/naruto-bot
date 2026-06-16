import type { MissionDef } from "../types.js";
import {
  FLORESTA_CHANNEL_ID,
  PRACA_VILA_DA_FOLHA_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
} from "../scenarios/index.js";

export const MISSIONS: MissionDef[] = [
  {
    id: "gato_perdido",
    name: "Recuperar o Gato (Tora)",
    rank: "D",
    description:
      "A esposa do Daimyo perdeu o gato Tora. Encontre-o na Praça da Vila da Folha e capture-o.",
    channelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
    type: "FETCH_CAT",
    objectives: [{ id: "capturar_gato", description: "Capturar o gato Tora" }],
    rewards: { xp: 80, ryo: 50 },
    data: { catMoveMin: 1, catMoveMax: 2, fleeMin: 2, fleeMax: 4, captureBaseChance: 0.45 },
  },
  {
    id: "lider_bandidos",
    name: "Líder dos Bandidos",
    rank: "C",
    description:
      "Roubos atormentam Konoha. Vá ao Centro Comercial, investigue com o mercador e a criança, e depois enfrente os bandidos na Floresta.",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    type: "BANDIT_FIGHT",
    objectives: [
      { id: "ir_centro", description: "Ir ao Centro Comercial de Konoha (use /mapa lá)" },
      { id: "pista_mercador", description: "Descobrir onde os roubos acontecem (Mercador)" },
      { id: "pista_crianca", description: "Descobrir quem são os ladrões (Criança)" },
      { id: "derrotar_lider", description: "Derrotar o líder e os capangas na Floresta" },
    ],
    rewards: { xp: 220, ryo: 180, items: [{ itemId: "katana_bandida", name: "Katana Bandida", qty: 1 }] },
    data: { thugs: 3, maxDialogue: 3, forestChannelId: FLORESTA_CHANNEL_ID, npcMaxTurns: 3 },
  },
];

const MISSION_MAP = new Map<string, MissionDef>(MISSIONS.map((m) => [m.id, m]));

export function getMission(id: string): MissionDef | undefined {
  return MISSION_MAP.get(id);
}
