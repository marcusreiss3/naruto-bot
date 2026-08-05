import type { SkillNodeDef } from "./element-trees/index.js";

const cost = (rank: NonNullable<SkillNodeDef["rank"]>) => rank === "A" ? 6 : rank === "B" ? 4 : 3;
const jutsu = (id: string, name: string, rank: NonNullable<SkillNodeDef["rank"]>, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string): SkillNodeDef => ({ id, name, kind: "JUTSU", rank, icon: "🔖", pool: "fuinjutsu", cost: cost(rank), branch, col, row, requires, reqLevel, reqPool, grantsAbilityId: id, desc });
const passive = (id: string, name: string, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string, root = false): SkillNodeDef => ({ id, name, kind: "PASSIVE", icon: "🧿", pool: "fuinjutsu", cost: root ? 1 : 2, branch, col, row, requires, reqLevel, reqPool, desc });

// Fuinjutsu privilegia controle e contrajogo: remove chamas, bloqueia chakra,
// invalida contratos e prende posicoes. Nao e uma arvore de dano bruto.
export const FUINJUTSU_TREE: SkillNodeDef[] = [
  passive("fuin_raiz", "Caligrafia de Selos", "Fundamento", 0, 0, [], 1, 1, "Passiva: seus selamentos de chakra têm +10 pontos percentuais de chance de aplicação." , true),

  jutsu("fuin_metodo_selamento_fogo", "Método de Selamento de Fogo", "C", "Supressão", -1.25, 1, ["fuin_raiz"], 4, 4, "Inscreve uma fórmula sobre as chamas para apagar o fogo ativo e purificar Queimadura de um alvo."),
  passive("fuin_traco_contencao", "Traço de Contenção", "Supressão", -1.25, 2, ["fuin_metodo_selamento_fogo"], 8, 8, "Passiva: Método de Selamento de Fogo e Selo de Cinco Elementos custam 15% menos chakra."),
  jutsu("fuin_selo_cinco_elementos", "Selo de Cinco Elementos", "B", "Supressão", -1.25, 3, ["fuin_traco_contencao"], 14, 14, "Marca o fluxo de chakra do alvo com um selo maligno, dificultando ou bloqueando o uso de Ninjutsu."),
  jutsu("fuin_selamento_contrato", "Selamento de Contrato", "A", "Supressão", -1.25, 4, ["fuin_selo_cinco_elementos"], 24, 24, "Ao tocar o peito do alvo, rompe temporariamente seu contrato de invocação e bloqueia técnicas de chakra vinculadas a Bijuu."),

  jutsu("fuin_formacao_cordas_luz", "Formação das Cordas de Luz", "B", "Confinamento", 1.25, 1, ["fuin_raiz"], 10, 10, "Uma fórmula circular se alastra no chão e imobiliza inimigos dentro de sua área."),
  passive("fuin_ancora_formula", "Âncora da Fórmula", "Confinamento", 1.25, 2, ["fuin_formacao_cordas_luz"], 16, 16, "Passiva: suas técnicas de selamento que imobilizam duram 1 rodada adicional."),
  jutsu("fuin_ligacao_pano", "Técnica da Ligação de Pano", "C", "Confinamento", 1.25, 3, ["fuin_ancora_formula"], 20, 20, "Um grande rolo de pano selado envolve o adversário, prendendo seus movimentos e impedindo-o de usar técnicas de Ninjutsu."),
];
