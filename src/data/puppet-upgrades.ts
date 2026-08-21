export type PuppetShell = "OFFENSE" | "DEFENSE" | "EFFECT";
export type PuppetCraftGrade = 1 | 2 | 3;

export interface PuppetIngredient {
  itemId: string;
  qty: number;
}

export interface PuppetUpgradeDef {
  id: string;
  name: string;
  grade: PuppetCraftGrade;
  reqLevel: number;
  durationHours: number;
  ryo: number;
  ingredients: PuppetIngredient[];
  description: string;
}

export const PUPPET_SHELLS: Record<PuppetShell, { name: string; description: string; ryo: number; durationHours: number; ingredients: PuppetIngredient[] }> = {
  OFFENSE: {
    name: "Carapaça ofensiva", description: "Prioriza mecanismos de dano.", ryo: 180, durationHours: 3,
    ingredients: [{ itemId: "madeira_reforcada", qty: 4 }, { itemId: "aco", qty: 2 }, { itemId: "fios_aco_ninja", qty: 2 }],
  },
  DEFENSE: {
    name: "Carapaça defensiva", description: "Prioriza vida própria e escudos.", ryo: 210, durationHours: 4,
    ingredients: [{ itemId: "madeira_reforcada", qty: 5 }, { itemId: "aco", qty: 3 }, { itemId: "couro", qty: 3 }],
  },
  EFFECT: {
    name: "Carapaça de efeito", description: "Prioriza toxinas e desgaste contínuo.", ryo: 200, durationHours: 4,
    ingredients: [{ itemId: "madeira_reforcada", qty: 4 }, { itemId: "aco", qty: 2 }, { itemId: "polvora", qty: 2 }, { itemId: "fibra_vegetal", qty: 4 }],
  },
};

// Tempo, custo e grade são uma adaptação de progressão: mecanismos simples
// entram em horas; dispositivos compostos/combos de duas marionetes chegam a
// dias. A peça não é consumida no ataque — representa o mecanismo instalado.
export const PUPPET_UPGRADES: PuppetUpgradeDef[] = [
  { id: "tiro_mecanismo_destrutivo", name: "Tiro de Mecanismo Destrutivo", grade: 1, reqLevel: 4, durationHours: 4, ryo: 110, ingredients: [{ itemId: "kunai", qty: 6 }, { itemId: "aco", qty: 1 }, { itemId: "fios_aco_ninja", qty: 1 }], description: "Dispara kunais pela boca: dano e Sangramento." },
  { id: "capturar", name: "Capturar", grade: 1, reqLevel: 5, durationHours: 5, ryo: 125, ingredients: [{ itemId: "fios_aco_ninja", qty: 3 }, { itemId: "aco", qty: 2 }, { itemId: "couro", qty: 2 }], description: "Prende o alvo, aplicando Imobilização por 1 turno." },
  { id: "lamina_agulha", name: "Lâmina Agulha", grade: 1, reqLevel: 5, durationHours: 6, ryo: 135, ingredients: [{ itemId: "senbon", qty: 8 }, { itemId: "aco", qty: 1 }, { itemId: "erva_medicinal", qty: 3 }], description: "Agulha na cabeça: dano e Veneno." },
  { id: "ataque_super_arma", name: "Ataque da Super Arma", grade: 1, reqLevel: 6, durationHours: 8, ryo: 155, ingredients: [{ itemId: "bomba_fumaca", qty: 2 }, { itemId: "polvora", qty: 3 }, { itemId: "aco", qty: 2 }], description: "Libera uma bomba de veneno em área curta." },
  { id: "multiplos_bracos", name: "Múltiplos Braços", grade: 2, reqLevel: 10, durationHours: 18, ryo: 310, ingredients: [{ itemId: "aco", qty: 5 }, { itemId: "madeira_reforcada", qty: 4 }, { itemId: "fios_aco_ninja", qty: 4 }], description: "Abraça o alvo e o Atordoa." },
  { id: "escudo_luz_mecanica", name: "Escudo Luz Mecânica", grade: 2, reqLevel: 11, durationHours: 20, ryo: 330, ingredients: [{ itemId: "aco", qty: 6 }, { itemId: "lingote_ferro", qty: 6 }, { itemId: "tinta_de_selo", qty: 2 }], description: "Os braços viram uma estrutura que gera escudo de chakra." },
  { id: "modificador_aparencia", name: "Modificador de Aparência", grade: 2, reqLevel: 12, durationHours: 24, ryo: 360, ingredients: [{ itemId: "madeira_reforcada", qty: 5 }, { itemId: "tinta_de_selo", qty: 3 }, { itemId: "fios_aco_ninja", qty: 3 }], description: "Substituição com marionete, com chance de esquiva ampliada." },
  { id: "lanca_chamas", name: "Lança-Chamas", grade: 2, reqLevel: 13, durationHours: 30, ryo: 420, ingredients: [{ itemId: "polvora", qty: 8 }, { itemId: "aco", qty: 5 }, { itemId: "papel_bomba", qty: 3 }], description: "Dano e Queimadura." },
  { id: "cauda_escorpiao", name: "Cauda de Escorpião", grade: 2, reqLevel: 14, durationHours: 36, ryo: 480, ingredients: [{ itemId: "aco", qty: 7 }, { itemId: "senbon", qty: 10 }, { itemId: "erva_medicinal", qty: 8 }, { itemId: "couro", qty: 3 }], description: "Dano, Veneno e Sangramento." },
  { id: "carapaca_resistente", name: "Carapaça Resistente", grade: 2, reqLevel: 15, durationHours: 42, ryo: 520, ingredients: [{ itemId: "aco", qty: 9 }, { itemId: "madeira_reforcada", qty: 6 }, { itemId: "tinta_de_selo", qty: 3 }], description: "Abriga o portador: imobiliza por 2 turnos em troca de grande escudo temporário." },
  { id: "dama_ferro", name: "Dama de Ferro", grade: 3, reqLevel: 20, durationHours: 60, ryo: 900, ingredients: [{ itemId: "aco", qty: 15 }, { itemId: "kunai", qty: 12 }, { itemId: "fios_aco_ninja", qty: 8 }, { itemId: "tinta_de_selo", qty: 5 }], description: "Combo de Capturar + Lâmina Agulha entre duas marionetes; executa abaixo de 8% de vida." },
  { id: "atacando_ambos_lados", name: "Atacando de Ambos os Lados", grade: 3, reqLevel: 22, durationHours: 72, ryo: 1100, ingredients: [{ itemId: "aco", qty: 18 }, { itemId: "kunai", qty: 16 }, { itemId: "fios_aco_ninja", qty: 10 }, { itemId: "papel_bomba", qty: 5 }], description: "Combo inesquivável que exige duas marionetes com este mecanismo em campo." },
];

const UPGRADE_BY_ID = new Map(PUPPET_UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

export function getPuppetUpgrade(id: string): PuppetUpgradeDef | undefined {
  return UPGRADE_BY_ID.get(id);
}

export function isPuppetShell(value: string): value is PuppetShell {
  return value === "OFFENSE" || value === "DEFENSE" || value === "EFFECT";
}

export function craftNodeForGrade(grade: PuppetCraftGrade): string {
  return grade === 1 ? "kugutsu_oficina_inicial" : grade === 2 ? "kugutsu_craft_grau_ii" : "kugutsu_craft_grau_iii";
}
