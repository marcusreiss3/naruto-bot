import type { SkillNodeDef } from "./element-trees/index.js";

const cost = (rank: NonNullable<SkillNodeDef["rank"]>) => rank === "S" ? 8 : rank === "A" ? 6 : rank === "B" ? 4 : 3;
const jutsu = (id: string, name: string, rank: NonNullable<SkillNodeDef["rank"]>, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string): SkillNodeDef => ({ id, name, kind: "JUTSU", rank, icon: "💚", pool: "iryoNinjutsu", cost: cost(rank), branch, col, row, requires, reqLevel, reqPool, grantsAbilityId: id, desc });
const passive = (id: string, name: string, icon: string, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string): SkillNodeDef => ({ id, name, kind: "PASSIVE", icon, pool: "iryoNinjutsu", cost: 2, branch, col, row, requires, reqLevel, reqPool, desc });

// A Palma Mística é o tronco comum. Depois dela, cada coluna é independente.
export const IRYO_NINJUTSU_TREE: SkillNodeDef[] = [
  jutsu("iryo_palma_mistica", "Técnica da Palma Mística", "C", "Fundamento", 0, 0, [], 1, 1, "As mãos do usuário irradiam uma luz verde suave sobre os ferimentos do paciente."),

  jutsu("iryo_medusa", "Água Medicinal: Medusa", "B", "Cura", -1.25, 1, ["iryo_palma_mistica"], 10, 10, "Uma água-viva de chakra flutua até o aliado e derrama uma luz líquida sobre seus ferimentos, restaurando suas forças."),
  jutsu("iryo_yin", "Redução e Cura de Ferimentos Yin", "A", "Cura", -1.25, 2, ["iryo_medusa"], 28, 28, "Chakra médico envolve o paciente e percorre cuidadosamente as regiões feridas do corpo."),
  passive("iryo_cura_precisa", "Diagnóstico Preciso", "🔬", "Cura", -1.25, 3, ["iryo_yin"], 31, 31, "Passiva: suas técnicas de Iryō Ninjutsu curam 10% a mais."),
  jutsu("iryo_cura_regenerativa", "Técnica da Cura Regenerativa", "A", "Cura", -1.25, 4, ["iryo_cura_precisa"], 33, 34, "Uma camada intensa de chakra médico envolve a região ferida enquanto o tecido se reconstrói."),
  passive("iryo_cura_critica", "Cirurgia de Emergência", "❤️‍🩹", "Cura", -1.25, 5, ["iryo_cura_regenerativa"], 37, 37, "Passiva: em alvos com até 35% da vida, suas curas restauram 20% a mais."),
  jutsu("iryo_regeneracao", "Regeneração da Criação", "S", "Cura", -1.25, 6, ["iryo_cura_critica"], 40, 40, "Chakra médico verde percorre todo o corpo enquanto os ferimentos se fecham rapidamente."),

  jutsu("iryo_desintoxicacao", "Técnica de Desintoxicação", "C", "Purificação", 0, 1, ["iryo_palma_mistica"], 4, 4, "Chakra médico percorre o paciente e concentra as impurezas numa gota escura expelida pela pele."),
  jutsu("iryo_hemostatica", "Técnica Hemostática", "C", "Purificação", 0, 2, ["iryo_desintoxicacao"], 7, 7, "Fios delicados de chakra verde aproximam as bordas do ferimento e selam os vasos rompidos."),
  // Único nó de desconto do Iryō. Antes eram 4 (um geral + três amarrados a
  // técnicas específicas), que empilhavam até -23,5% numa técnica só.
  passive("iryo_antidoto_eficiente", "Refino do Fluxo", "🧪", "Purificação", 0, 3, ["iryo_hemostatica"], 11, 11, "Passiva: técnicas de Iryō Ninjutsu gastam 12% menos chakra. Este desconto se combina com outras reduções de custo que você já possui."),
  jutsu("iryo_mosquitos", "Água Medicinal: Mosquitos de Água", "B", "Purificação", 0, 4, ["iryo_antidoto_eficiente"], 14, 14, "Pequenos mosquitos feitos de água medicinal pousam sobre o paciente e extraem resíduos escuros."),
  passive("iryo_triagem_rapida", "Triagem Rápida", "⚕️", "Purificação", 0, 5, ["iryo_mosquitos"], 24, 24, "Passiva: suas técnicas de purificação e o Choque da Desorientação ganham +1 casa de alcance."),

  jutsu("iryo_bisturi", "Bisturi de Chakra", "B", "Combate Médico", 1.25, 1, ["iryo_palma_mistica"], 18, 18, "Forma lâminas precisas de chakra nas mãos e fortalece os próximos golpes físicos."),
  passive("iryo_lamina_estavel", "Lâmina Estável", "🔪", "Combate Médico", 1.25, 2, ["iryo_bisturi"], 21, 21, "Passiva: Bisturi de Chakra dura 1 rodada adicional."),
  jutsu("iryo_choque_desorientacao", "Choque da Desorientação", "A", "Combate Médico", 1.25, 3, ["iryo_lamina_estavel"], 24, 24, "Um pulso azul de chakra médico atravessa os nervos do alvo e desorganiza os movimentos do corpo."),
  // "Anatomia de Combate" saiu: o +1 de alcance dela virou parte da Triagem
  // Rápida e o desconto de custo virou parte do desconto geral.
  passive("iryo_sinapses_caoticas", "Sinapses Caóticas", "⚡", "Combate Médico", 1.25, 4, ["iryo_choque_desorientacao"], 28, 28, "Passiva: Choque da Desorientação deixa Confusão por 1 rodada adicional."),
];
