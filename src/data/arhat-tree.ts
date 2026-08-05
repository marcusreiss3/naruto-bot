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
  jutsu("arhat_palmada_colapso", "Palmada do Colapso", "D", 0, [], 2, 2, "A palma aberta desce no centro do peito do adversário e descarrega ali o peso do corpo inteiro, arrancando o ar dos pulmões dele."),
  jutsu("arhat_ombro", "Ombrada", "D", 1, ["arhat_palmada_colapso"], 6, 6, "O usuário abaixa o centro de gravidade e avança de ombro como um aríete, entrando por baixo da guarda antes que ela se feche.", -1),
  jutsu("arhat_joelhada", "Joelhada", "C", 1, ["arhat_palmada_colapso"], 10, 10, "Um puxão pela nuca traz o adversário para baixo enquanto o joelho sobe para encontrá-lo no meio do caminho.", 1),
  jutsu("arhat_palmada_ascendente", "Palmada Ascendente", "C", 2, ["arhat_joelhada"], 14, 14, "A palma sobe do chão em arco levando o corpo inteiro junto e encontra o queixo do adversário na ponta do movimento.", 1),
  jutsu("arhat_palma_compressao", "Palma de Compressão", "B", 3, ["arhat_palmada_ascendente"], 20, 20, "As duas palmas descem juntas contra o solo e a onda de pressão se espalha rente ao chão, levantando lascas de pedra em volta.", 1),
  jutsu("arhat_golpe_rocha", "Golpe de Rocha", "B", 4, ["arhat_palma_compressao"], 24, 24, "O punho fecha no último instante e acerta com a densidade de uma pedra: um golpe seco que o adversário sente até os ossos.", 1),

  // Ramo de passivas do estilo, à esquerda, em espelho com a linha de jutsus à
  // direita (col 1). Antes viviam numa árvore transversal à parte; moveram pra
  // cá porque só reforçam técnicas do próprio Punho Arhat.
  {
    id: "tai_arhat_impacto", name: "Palma de Impacto", kind: "PASSIVE", icon: "🥋",
    pool: "taijutsu", cost: 2, branch: "Punho Arhat", col: -1, row: 2,
    requires: ["arhat_ombro"], reqLevel: 8, reqPool: 8,
    desc: "Passiva: Palmada do Colapso, Ombrada e Palmada Ascendente empurram 1 casa adicional.",
  },
  {
    id: "tai_arhat_pressao", name: "Pressão Esmagadora", kind: "PASSIVE", icon: "🥋",
    pool: "taijutsu", cost: 2, branch: "Punho Arhat", col: -1, row: 3,
    requires: ["tai_arhat_impacto"], reqLevel: 18, reqPool: 18,
    desc: "Passiva: Palma de Compressão e Golpe de Rocha causam 12% mais dano.",
  },
  {
    id: "tai_arhat_estabilidade", name: "Base Inabalável", kind: "PASSIVE", icon: "🥋",
    pool: "taijutsu", cost: 2, branch: "Punho Arhat", col: -1, row: 4,
    requires: ["tai_arhat_pressao"], reqLevel: 28, reqPool: 28,
    desc: "Passiva: Joelhada e Palma de Compressão gastam 12% menos energia. Este desconto se combina com outros descontos de custo.",
  },
];
