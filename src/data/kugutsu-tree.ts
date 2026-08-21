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
    "Passiva: libera a construção de carapaças e mecanismos de marionete Grau I, além do comando /marionetes.",
  ),
  passive(
    "kugutsu_carapaca_ofensiva", "Engrenagens Ofensivas", "Carapaça ofensiva", -1.5, 1, ["kugutsu_oficina_inicial"], 2, 4, 7,
    "Passiva: suas marionetes de carapaça ofensiva causam +10% de dano.",
  ),
  passive(
    "kugutsu_carapaca_defensiva", "Estrutura Reforçada", "Carapaça defensiva", 0, 1, ["kugutsu_oficina_inicial"], 2, 4, 7,
    "Passiva: suas marionetes de carapaça defensiva ganham +15% de vida, e o Escudo Luz Mecânica recebe +15% de força.",
  ),
  passive(
    "kugutsu_carapaca_efeito", "Mecanismos Tóxicos", "Carapaça de efeito", 1.5, 1, ["kugutsu_oficina_inicial"], 2, 4, 7,
    "Passiva: Veneno, Sangramento e Queimadura aplicados por suas marionetes de carapaça de efeito duram 1 rodada a mais.",
  ),
  passive(
    "kugutsu_alcance_fios_i", "Fios de Chakra Estendidos I", "Controle", -0.75, 2, ["kugutsu_oficina_inicial"], 2, 6, 9,
    "Passiva: a distância máxima entre você e sua marionete aumenta de 2 para 3 metros.",
  ),
  passive(
    "kugutsu_slot_2", "Dupla Manipulação", "Controle", 0.75, 2, ["kugutsu_oficina_inicial"], 3, 8, 11,
    "Passiva: você pode manter até 2 marionetes em campo ao mesmo tempo.",
  ),
  passive(
    "kugutsu_craft_grau_ii", "Oficina de Precisão", "Oficina", 0, 2, ["kugutsu_oficina_inicial"], 3, 10, 13,
    "Passiva: libera a construção de mecanismos Grau II.",
  ),
  passive(
    "kugutsu_carapaca_ofensiva_ii", "Mecanismo de Assalto", "Carapaça ofensiva", -1.5, 3, ["kugutsu_carapaca_ofensiva"], 3, 12, 15,
    "Passiva: suas marionetes ofensivas recebem mais 8% de dano, totalizando +18%.",
  ),
  passive(
    "kugutsu_carapaca_defensiva_ii", "Núcleo Blindado", "Carapaça defensiva", 0, 3, ["kugutsu_carapaca_defensiva"], 3, 12, 15,
    "Passiva: suas marionetes defensivas recebem mais 15% de vida, totalizando +30%; o Escudo Luz Mecânica também chega a +30% de força.",
  ),
  passive(
    "kugutsu_carapaca_efeito_ii", "Reservatório de Veneno", "Carapaça de efeito", 1.5, 3, ["kugutsu_carapaca_efeito"], 3, 12, 15,
    "Passiva: Veneno, Sangramento e Queimadura aplicados por suas marionetes de carapaça de efeito duram mais 1 rodada, totalizando +2 rodadas.",
  ),
  passive(
    "kugutsu_alcance_fios_ii", "Fios de Chakra Estendidos II", "Controle", -0.75, 4, ["kugutsu_alcance_fios_i"], 3, 14, 17,
    "Passiva: a distância máxima entre você e sua marionete aumenta para 4 metros.",
  ),
  passive(
    "kugutsu_acao_bonus", "Ataque Descuidado", "Controle", 0.75, 4, ["kugutsu_slot_2"], 4, 16, 19,
    "Passiva: depois de atacar com a ação comum, você pode realizar mais um ataque de mecanismo com sua marionete usando a ação bônus. Como consequência, o próximo ataque que você sofrer acerta em cheio, sem chance de Esquivar, Bloquear ou Aparar.",
  ),
  passive(
    "kugutsu_craft_grau_iii", "Arquiteto de Marionetes", "Oficina", 0, 5, ["kugutsu_craft_grau_ii"], 4, 18, 21,
    "Passiva: libera mecanismos Grau III e técnicas que exigem duas marionetes coordenadas.",
  ),
  passive(
    "kugutsu_slot_3", "Tríade de Fios", "Controle", 0.75, 6, ["kugutsu_acao_bonus", "kugutsu_craft_grau_iii"], 5, 24, 26,
    "Passiva: você pode manter até 3 marionetes em campo ao mesmo tempo.",
  ),
  passive(
    "kugutsu_alcance_fios_iii", "Fios de Chakra Estendidos III", "Controle", -0.75, 6, ["kugutsu_alcance_fios_ii", "kugutsu_craft_grau_iii"], 4, 22, 24,
    "Passiva: a distância máxima entre você e sua marionete aumenta para 5 metros.",
  ),
  passive(
    "kugutsu_carapaca_ofensiva_iii", "Coração de Guerra", "Carapaça ofensiva", -1.5, 5, ["kugutsu_carapaca_ofensiva_ii", "kugutsu_craft_grau_iii"], 4, 20, 23,
    "Passiva: suas marionetes ofensivas chegam a +25% de dano total.",
  ),
  passive(
    "kugutsu_carapaca_defensiva_iii", "Fortaleza Mecânica", "Carapaça defensiva", 0, 6, ["kugutsu_carapaca_defensiva_ii", "kugutsu_craft_grau_iii"], 4, 20, 23,
    "Passiva: suas marionetes defensivas chegam a +45% de vida; o Escudo Luz Mecânica também chega a +45% de força.",
  ),
  passive(
    "kugutsu_carapaca_efeito_iii", "Mestre dos Dispositivos", "Carapaça de efeito", 1.5, 5, ["kugutsu_carapaca_efeito_ii", "kugutsu_craft_grau_iii"], 4, 20, 23,
    "Passiva: mecanismos de carapaça de efeito que aplicam Veneno, Sangramento ou Queimadura custam 10% menos Chakra.",
  ),
];
