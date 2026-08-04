import type { SkillNodeDef } from "./element-trees/index.js";

const passive = (
  id: string, name: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string,
): SkillNodeDef => ({
  id, name, kind: "PASSIVE", icon: "🥊", pool: "taijutsu", cost: 2, branch: "Taijutsu de Agitação",
  col, row, requires, reqLevel, reqPool, desc,
});

// Um estilo corporal imprevisível: não aumenta dano bruto, mas reduz a janela
// de esquiva do adversário com fintas, trocas de ritmo e deslocamentos tortos.
export const TAIJUTSU_AGITACAO_TREE: SkillNodeDef[] = [
  passive("tai_agitacao_passos", "Passos Irregulares", -0.8, 0, [], 10, 10, "Passiva: seus Taijutsus reduzem em 5 pontos percentuais a chance de esquiva do alvo."),
  passive("tai_agitacao_finta", "Finta Instintiva", -0.8, 1, ["tai_agitacao_passos"], 20, 20, "Passiva: seus Taijutsus reduzem mais 4 pontos percentuais a chance de esquiva do alvo."),
  passive("tai_agitacao_ritmo", "Ritmo Caótico", -0.8, 2, ["tai_agitacao_finta"], 32, 32, "Passiva: seus Taijutsus reduzem mais 3 pontos percentuais a chance de esquiva do alvo."),

  // Lâmina: uma rota independente para quem mistura movimentos imprevisíveis
  // com ataques de espada. Usa pontos de Kenjutsu e não exige uma árvore extra.
  {
    ...passive("tai_ken_postura", "Postura da Lâmina", 0.8, 0, [], 10, 10, "Passiva: suas técnicas de Kenjutsu gastam 10% menos energia. Este desconto se combina com outros descontos de custo."),
    pool: "kenjutsu", branch: "Kenjutsu",
  },
  {
    ...passive("tai_ken_fio", "Fio de Aço", 0.8, 1, ["tai_ken_postura"], 20, 20, "Passiva: suas técnicas de Kenjutsu causam 10% mais dano."),
    pool: "kenjutsu", branch: "Kenjutsu",
  },
  {
    ...passive("tai_ken_geometria", "Geometria do Corte", 0.8, 2, ["tai_ken_fio"], 32, 32, "Passiva: técnicas de Kenjutsu em linha ganham +1 casa de alcance e cortam 10% da redução de Bloqueio/Aparo."),
    pool: "kenjutsu", branch: "Kenjutsu",
  },
];
