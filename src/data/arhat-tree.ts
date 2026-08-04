import type { SkillNodeDef } from "./element-trees/index.js";

const jutsu = (
  id: string,
  name: string,
  rank: NonNullable<SkillNodeDef["rank"]>,
  row: number,
  requires: string[],
  reqLevel: number,
  reqPool: number,
  desc: string,
  col = 0,
): SkillNodeDef => ({
  id,
  name,
  kind: "JUTSU",
  rank,
  icon: "🖐️",
  pool: "taijutsu",
  cost: rank === "D" ? 1 : rank === "C" ? 3 : rank === "B" ? 4 : rank === "A" ? 6 : 10,
  branch: "Punho Arhat",
  col,
  row,
  requires,
  reqLevel,
  reqPool,
  grantsAbilityId: id,
  desc,
});

// Árvore de Taijutsu focada em impactos, palmas e controle de espaço.
// Não possui passivas: todos os nós concedem técnicas ativas.
export const ARHAT_TREE: SkillNodeDef[] = [
  jutsu("arhat_palmada_colapso", "Palmada do Colapso", "D", 0, [], 2, 2, "Palmada direta que arremessa o alvo para trás."),
  jutsu("arhat_ombro", "Ombrada", "D", 1, ["arhat_palmada_colapso"], 6, 6, "Ataque de ombro que lança o alvo com grande impulso.", -1),
  jutsu("arhat_joelhada", "Joelhada", "C", 1, ["arhat_palmada_colapso"], 10, 10, "Joelhada que ergue o alvo e pode Atordoá-lo.", 1),
  jutsu("arhat_palmada_ascendente", "Palmada Ascendente", "C", 2, ["arhat_joelhada"], 14, 14, "Palma voltada para cima que arremessa o alvo 4 casas.", 1),
  jutsu("arhat_palma_compressao", "Palma de Compressão", "B", 3, ["arhat_palmada_ascendente"], 20, 20, "Compressão em área que empurra e deixa os alvos Lentos.", 1),
  jutsu("arhat_golpe_rocha", "Golpe de Rocha", "B", 4, ["arhat_palma_compressao"], 24, 24, "Soco de impacto extremo que pode reduzir a Defesa do alvo.", 1),
];
