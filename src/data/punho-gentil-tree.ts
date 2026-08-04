import type { SkillNodeDef } from "./element-trees/index.js";

const passive = (
  id: string, name: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string,
): SkillNodeDef => ({
  id, name, kind: "PASSIVE", icon: "🖐️", pool: "taijutsu", cost: 2, branch: "Punho Gentil",
  col, row, requires, reqLevel, reqPool, desc, clanId: "hyuuga",
});

// Aprimoramentos exclusivos das técnicas Hyuuga. A árvore do clã continua
// ensinando os jutsus; esta concentra o domínio posterior do Punho Gentil.
export const PUNHO_GENTIL_TREE: SkillNodeDef[] = [
  passive("tai_gentil_fluxo", "Fluxo dos Tenketsu", 0, 0, [], 12, 12, "Passiva: Punho Suave, 64 Palmas e 128 Palmas recebem +12 pontos percentuais de chance de Bloqueio de Ninjutsu."),
  passive("tai_gentil_precisao", "Precisão do Byakugan", -0.8, 1, ["tai_gentil_fluxo"], 20, 20, "Passiva: Palma de Vácuo ganha +1 casa de alcance; ela e os Punhos dos Leões Gêmeos causam 12% mais dano."),
  passive("tai_gentil_guarda", "Guarda dos Trigramas", 0.8, 1, ["tai_gentil_fluxo"], 20, 20, "Passiva: Palma Rotativa recebe +10 pontos de Barreira e custa 15% menos energia. Este desconto se combina com outros descontos de custo."),
  passive("tai_gentil_vacuo", "Impulso do Vácuo", -0.8, 2, ["tai_gentil_precisao"], 28, 28, "Passiva: Palma de Vácuo empurra o alvo 1 casa adicional."),
  passive("tai_gentil_tenketsu", "Rede de Tenketsu", 0.8, 2, ["tai_gentil_guarda"], 28, 28, "Passiva: 64 Palmas e 128 Palmas gastam 10% menos energia. Este desconto se combina com outros descontos de custo."),
  passive("tai_gentil_leoes", "Feras de Chakra", 0, 3, ["tai_gentil_vacuo", "tai_gentil_tenketsu"], 38, 38, "Passiva: Punhos dos Leões Gêmeos causam 8% mais dano."),
];
