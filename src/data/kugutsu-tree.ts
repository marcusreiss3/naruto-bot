import type { SkillNodeDef } from "./element-trees/index.js";

const passive = (
  id: string,
  name: string,
  branch: string,
  col: number,
  row: number,
  requires: string[],
  cost: number,
  reqLevel: number,
  reqPool: number,
  desc: string,
): SkillNodeDef => ({
  id, name, kind: "PASSIVE", icon: "🪆", pool: "kugutsu", cost, branch, col, row,
  requires, reqLevel, reqPool, desc,
});

// Kugutsu é uma árvore de infraestrutura + especialização. A oficina abre o
// sistema, os três ramos definem o comportamento da carapaça e o tronco dá
// escala de controle (slots, distância e ação bônus).
export const KUGUTSU_TREE: SkillNodeDef[] = [
  passive(
    "kugutsu_oficina_inicial", "Oficina de Marionetes", "Fundamento", 0, 0, [], 5, 1, 5,
    "Libera o craft de carapaças e mecanismos de marionete Grau I, além do comando /marionetes.",
  ),
  passive(
    "kugutsu_carapaca_ofensiva", "Engrenagens Ofensivas", "Carapaça ofensiva", -1.5, 1, ["kugutsu_oficina_inicial"], 2, 4, 7,
    "Marionetes de carapaça ofensiva causam +12% de dano.",
  ),
  passive(
    "kugutsu_carapaca_defensiva", "Estrutura Reforçada", "Carapaça defensiva", 0, 1, ["kugutsu_oficina_inicial"], 2, 4, 7,
    "Marionetes de carapaça defensiva ganham +15% de vida e seus escudos recebem +15% de força.",
  ),
  passive(
    "kugutsu_carapaca_efeito", "Mecanismos Tóxicos", "Carapaça de efeito", 1.5, 1, ["kugutsu_oficina_inicial"], 2, 4, 7,
    "Efeitos aplicados por marionetes de carapaça de efeito duram +1 turno; drenagem de chakra ganha +5 pontos percentuais.",
  ),
  passive(
    "kugutsu_alcance_fios_i", "Fios de Chakra Estendidos I", "Controle", -0.75, 2, ["kugutsu_oficina_inicial"], 2, 6, 9,
    "A distância máxima entre você e sua marionete sobe de 2 para 3 células.",
  ),
  passive(
    "kugutsu_slot_2", "Dupla Manipulação", "Controle", 0.75, 2, ["kugutsu_oficina_inicial"], 3, 8, 11,
    "Permite manter até 2 marionetes em campo ao mesmo tempo.",
  ),
  passive(
    "kugutsu_craft_grau_ii", "Oficina de Precisão", "Oficina", 0, 2, ["kugutsu_oficina_inicial"], 3, 10, 13,
    "Libera a construção de mecanismos Grau II.",
  ),
  passive(
    "kugutsu_carapaca_ofensiva_ii", "Mecanismo de Assalto", "Carapaça ofensiva", -1.5, 3, ["kugutsu_carapaca_ofensiva"], 3, 12, 15,
    "Marionetes ofensivas recebem mais +13% de dano (total +25%).",
  ),
  passive(
    "kugutsu_carapaca_defensiva_ii", "Núcleo Blindado", "Carapaça defensiva", 0, 3, ["kugutsu_carapaca_defensiva"], 3, 12, 15,
    "Marionetes defensivas recebem mais +15% de vida e +15% de escudo (total +30% em ambos).",
  ),
  passive(
    "kugutsu_carapaca_efeito_ii", "Reservatório de Veneno", "Carapaça de efeito", 1.5, 3, ["kugutsu_carapaca_efeito"], 3, 12, 15,
    "Efeitos das marionetes de efeito ganham +1 turno adicional (total +2) e drenagem ganha mais 5 p.p.",
  ),
  passive(
    "kugutsu_alcance_fios_ii", "Fios de Chakra Estendidos II", "Controle", -0.75, 4, ["kugutsu_alcance_fios_i"], 3, 14, 17,
    "A distância máxima entre você e sua marionete sobe para 4 células.",
  ),
  passive(
    "kugutsu_acao_bonus", "Ataque Descuidado", "Controle", 0.75, 4, ["kugutsu_slot_2"], 4, 16, 19,
    "Depois de atacar com a ação comum, você pode arriscar mais um ataque de mecanismo com sua marionete usando a ação bônus. O preço vem no giro seguinte: o próximo ataque que você sofrer acerta em cheio, sem chance de Esquivar, Bloquear ou Aparar.",
  ),
  passive(
    "kugutsu_craft_grau_iii", "Arquiteto de Marionetes", "Oficina", 0, 5, ["kugutsu_craft_grau_ii"], 4, 18, 21,
    "Libera mecanismos Grau III e técnicas que exigem duas marionetes coordenadas.",
  ),
  passive(
    "kugutsu_slot_3", "Tríade de Fios", "Controle", 0.75, 6, ["kugutsu_acao_bonus", "kugutsu_craft_grau_iii"], 5, 24, 26,
    "Permite manter até 3 marionetes em campo ao mesmo tempo.",
  ),
  passive(
    "kugutsu_alcance_fios_iii", "Fios de Chakra Estendidos III", "Controle", -0.75, 6, ["kugutsu_alcance_fios_ii", "kugutsu_craft_grau_iii"], 4, 22, 24,
    "A distância máxima entre você e sua marionete sobe para 5 células.",
  ),
  passive(
    "kugutsu_carapaca_ofensiva_iii", "Coração de Guerra", "Carapaça ofensiva", -1.5, 5, ["kugutsu_carapaca_ofensiva_ii", "kugutsu_craft_grau_iii"], 4, 20, 23,
    "Marionetes ofensivas chegam a +35% de dano total.",
  ),
  passive(
    "kugutsu_carapaca_defensiva_iii", "Fortaleza Mecânica", "Carapaça defensiva", 0, 6, ["kugutsu_carapaca_defensiva_ii", "kugutsu_craft_grau_iii"], 4, 20, 23,
    "Marionetes defensivas chegam a +45% de vida e de força de escudo total.",
  ),
  passive(
    "kugutsu_carapaca_efeito_iii", "Mestre dos Dispositivos", "Carapaça de efeito", 1.5, 5, ["kugutsu_carapaca_efeito_ii", "kugutsu_craft_grau_iii"], 4, 20, 23,
    "Marionetes de efeito chegam a +3 turnos de duração total e +15 p.p. de drenagem de chakra.",
  ),
];
