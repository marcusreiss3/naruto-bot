import type { SkillNodeDef } from "./element-trees/index.js";

const cost = (rank: NonNullable<SkillNodeDef["rank"]>) => rank === "S" ? 8 : rank === "A" ? 6 : rank === "B" ? 4 : 3;
const jutsu = (id: string, name: string, rank: NonNullable<SkillNodeDef["rank"]>, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string): SkillNodeDef => ({ id, name, kind: "JUTSU", rank, icon: "💚", pool: "iryoNinjutsu", cost: cost(rank), branch, col, row, requires, reqLevel, reqPool, grantsAbilityId: id, desc });
const passive = (id: string, name: string, icon: string, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string): SkillNodeDef => ({ id, name, kind: "PASSIVE", icon, pool: "iryoNinjutsu", cost: 2, branch, col, row, requires, reqLevel, reqPool, desc });

// A Palma Mística é o tronco comum. Depois dela, cada coluna é independente.
export const IRYO_NINJUTSU_TREE: SkillNodeDef[] = [
  jutsu("iryo_palma_mistica", "Técnica da Palma Mística", "C", "Fundamento", 0, 0, [], 1, 1, "Canaliza chakra curativo pelas mãos para fechar ferimentos leves. Cura um pouco como ação bônus."),

  jutsu("iryo_medusa", "Água Medicinal: Medusa", "B", "Cura", -1, 1, ["iryo_palma_mistica"], 10, 10, "Uma água-viva de chakra restaura um pouco de vida e chakra de um aliado."),
  passive("iryo_cura_economica", "Canalização Econômica", "💧", "Cura", -1, 2, ["iryo_medusa"], 14, 14, "Passiva: técnicas de Iryō Ninjutsu gastam 10% menos chakra. Este desconto se combina com outras reduções de custo que você já possui."),
  jutsu("iryo_yin", "Redução e Cura de Ferimentos Yin", "A", "Cura", -1, 3, ["iryo_cura_economica"], 28, 28, "Tratamento preventivo que cura bastante e reduz Queimadura e Sangramento em 2 turnos."),
  passive("iryo_cura_precisa", "Diagnóstico Preciso", "🔬", "Cura", -1, 4, ["iryo_yin"], 31, 31, "Passiva: suas técnicas de Iryō Ninjutsu curam 10% a mais."),
  jutsu("iryo_cura_regenerativa", "Técnica da Cura Regenerativa", "A", "Cura", -1, 5, ["iryo_cura_precisa"], 33, 34, "Reconstrói lesões severas com enorme precisão e consumo de chakra; cura muita vida."),
  passive("iryo_cura_critica", "Cirurgia de Emergência", "❤️‍🩹", "Cura", -1, 6, ["iryo_cura_regenerativa"], 37, 37, "Passiva: em alvos com até 35% da vida, suas curas restauram 20% a mais."),
  jutsu("iryo_regeneracao", "Regeneração da Criação", "S", "Cura", -1, 7, ["iryo_cura_critica"], 40, 40, "Regeneração extrema: cura muito e remove Sangramento e Queimadura."),
  passive("iryo_mitose_acelerada", "Mitose Acelerada", "🧬", "Cura", -1, 8, ["iryo_regeneracao"], 45, 45, "Passiva: Regeneração da Criação gasta 15% menos chakra. Este desconto se combina com outras reduções de custo que você já possui."),

  jutsu("iryo_desintoxicacao", "Técnica de Desintoxicação", "C", "Purificação", 0, 1, ["iryo_palma_mistica"], 4, 4, "Infunde chakra médico para extrair completamente o Veneno do alvo."),
  jutsu("iryo_hemostatica", "Técnica Hemostática", "C", "Purificação", 0, 2, ["iryo_desintoxicacao"], 7, 7, "Estanca hemorragias e reduz Sangramento em 2 turnos como ação bônus."),
  passive("iryo_antidoto_eficiente", "Antídoto Eficiente", "🧪", "Purificação", 0, 3, ["iryo_hemostatica"], 11, 11, "Passiva: Desintoxicação e Mosquitos de Água gastam 15% menos chakra. Este desconto se combina com outras reduções de custo que você já possui."),
  jutsu("iryo_mosquitos", "Água Medicinal: Mosquitos de Água", "B", "Purificação", 0, 4, ["iryo_antidoto_eficiente"], 14, 14, "Mosquitos de água extraem toxinas: reduzem Queimadura e Veneno em 2 turnos."),
  passive("iryo_hemostasia_precisa", "Hemostasia Precisa", "🩸", "Purificação", 0, 5, ["iryo_mosquitos"], 18, 18, "Passiva: Técnica Hemostática e Cura Yin gastam 15% menos chakra. Este desconto se combina com outras reduções de custo que você já possui."),
  passive("iryo_triagem_rapida", "Triagem Rápida", "⚕️", "Purificação", 0, 6, ["iryo_hemostasia_precisa"], 24, 24, "Passiva: técnicas de purificação têm +1 casa de alcance."),

  jutsu("iryo_bisturi", "Bisturi de Chakra", "B", "Combate Médico", 1, 1, ["iryo_palma_mistica"], 18, 18, "Forma lâminas precisas de chakra nas mãos e fortalece os próximos golpes físicos."),
  passive("iryo_lamina_estavel", "Lâmina Estável", "🔪", "Combate Médico", 1, 2, ["iryo_bisturi"], 21, 21, "Passiva: Bisturi de Chakra dura 1 rodada adicional."),
  jutsu("iryo_choque_desorientacao", "Choque da Desorientação", "A", "Combate Médico", 1, 3, ["iryo_lamina_estavel"], 24, 24, "Impulso elétrico médico que embaralha os sinais nervosos e deixa o alvo Confuso por 2 rodadas."),
  passive("iryo_sinapses_caoticas", "Sinapses Caóticas", "⚡", "Combate Médico", 1, 4, ["iryo_choque_desorientacao"], 28, 28, "Passiva: Choque da Desorientação deixa Confusão por 1 rodada adicional."),
  passive("iryo_anatomia_combate", "Anatomia de Combate", "🫀", "Combate Médico", 1, 5, ["iryo_sinapses_caoticas"], 32, 32, "Passiva: Choque da Desorientação ganha +1 casa de alcance e gasta 10% menos chakra. Este desconto se combina com outras reduções de custo que você já possui."),
];
