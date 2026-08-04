import type { SkillNodeDef } from "./element-trees/index.js";

type Pool = SkillNodeDef["pool"];
const passive = (
  id: string, name: string, branch: string, pool: Pool, col: number, row: number,
  requires: string[], reqLevel: number, reqPool: number, desc: string,
  extra: Partial<SkillNodeDef> = {},
): SkillNodeDef => ({ id, name, kind: "PASSIVE", icon: "🥋", pool, cost: id === "tai_pass_raiz" ? 1 : 2, branch, col, row, requires, reqLevel, reqPool, desc, ...extra });

// Árvore transversal: seus nós fortalecem estilos já aprendidos; ela não
// substitui as árvores ativas de Punho Forte, Arhat, Adamantino e Hyūga.
export const TAIJUTSU_PASSIVES_TREE: SkillNodeDef[] = [
  passive("tai_pass_raiz", "Disciplina Corporal", "Fundamento", "taijutsu", 0, 0, [], 1, 1, "Passiva sempre ativa: +8% de dano em todas as técnicas de Taijutsu."),
  // Dois ramos principais: corpo à esquerda e reserva/ritmo à direita. Os
  // estilos saem desses dois lados como sub-ramos, sem abrir uma coluna isolada
  // para cada categoria.
  passive("tai_pass_vigor", "Vigor de Combate", "Fundamento", "taijutsu", 0, 1, ["tai_pass_raiz"], 8, 8, "Passiva: sua vida máxima aumenta 10% ao entrar em combate."),
  passive("tai_pass_corpo_temperado", "Corpo Temperado", "Fundamento", "taijutsu", -1, 2, ["tai_pass_vigor"], 16, 16, "Passiva: sua vida máxima aumenta mais 8% ao entrar em combate."),
  passive("tai_pass_recuperacao", "Recuperação Marcial", "Fundamento", "taijutsu", -1.2, 3, ["tai_pass_corpo_temperado"], 26, 26, "Passiva: no começo de cada rodada, você recupera 3 de vida, sem ultrapassar sua vida máxima."),
  passive("tai_pass_reserva", "Reserva Física", "Fundamento", "taijutsu", 1, 2, ["tai_pass_vigor"], 25, 25, "Passiva: sua energia máxima aumenta 25% (até 125%).", { cost: 3 }),
  passive("tai_pass_reserva_profunda", "Reserva Física Profunda", "Fundamento", "taijutsu", 1, 3, ["tai_pass_reserva"], 42, 42, "Passiva: sua energia máxima ganha mais 25%, chegando ao limite de 150%.", { cost: 4 }),
  passive("tai_pass_maestria", "Maestria Marcial", "Fundamento", "taijutsu", 0.1, 4, ["tai_pass_reserva_profunda"], 44, 44, "Passiva: +10% de dano em todas as técnicas de Taijutsu."),
  passive("tai_pass_passada", "Passada Leve", "Mobilidade", "taijutsu", -0.1, 3, ["tai_pass_vigor"], 18, 18, "Passiva: em combate, seu alcance de movimento aumenta em 1 casa."),

  passive("tai_forte_ritmo", "Ritmo da Folha", "Punho Forte", "taijutsu", 2.5, 3, ["tai_pass_vigor"], 8, 8, "Passiva: Furacão da Folha, Vendaval da Folha e Grande Furacão da Folha gastam 15% menos energia. Este desconto se combina com outros descontos de custo."),

  passive("tai_arhat_impacto", "Palma de Impacto", "Punho Arhat", "taijutsu", -2.8, 3, ["tai_pass_vigor"], 8, 8, "Passiva: Palmada do Colapso, Ombrada e Palmada Ascendente empurram 1 casa adicional."),
  passive("tai_arhat_pressao", "Pressão Esmagadora", "Punho Arhat", "taijutsu", -2.8, 4, ["tai_arhat_impacto"], 18, 18, "Passiva: Palma de Compressão e Golpe de Rocha causam 12% mais dano."),
  passive("tai_arhat_estabilidade", "Base Inabalável", "Punho Arhat", "taijutsu", -2.8, 5, ["tai_arhat_pressao"], 28, 28, "Passiva: Joelhada e Palma de Compressão gastam 12% menos energia. Este desconto se combina com outros descontos de custo."),

  passive("tai_adamantino_controle", "Controle de Chakra Preciso", "Punho Adamantino", "iryoNinjutsu", 3.8, 3, ["tai_pass_vigor"], 12, 12, "Passiva: técnicas do Punho Adamantino gastam 12% menos energia ou chakra. Este desconto se combina com outros descontos de custo.", { reqAttribute: { attribute: "taijutsu", value: 14 } }),
  passive("tai_adamantino_ruptura", "Ruptura Concentrada", "Punho Adamantino", "iryoNinjutsu", 3.8, 4, ["tai_adamantino_controle"], 22, 22, "Passiva: Impacto da Flor de Cerejeira, Florescimento e Super Peteleco causam 10% mais dano.", { reqAttribute: { attribute: "taijutsu", value: 24 } }),
  passive("tai_adamantino_forca", "Força Acumulada", "Punho Adamantino", "iryoNinjutsu", 3.8, 5, ["tai_adamantino_ruptura"], 32, 32, "Passiva: seus golpes de Punho Adamantino causam 8% mais dano; ela se combina com a Sobrecarga de Cem Forças.", { reqAttribute: { attribute: "taijutsu", value: 32 } }),

];
