import type { SkillNodeDef } from "./element-trees/index.js";

type Pool = SkillNodeDef["pool"];
const passive = (
  id: string, name: string, branch: string, pool: Pool, col: number, row: number,
  requires: string[], reqLevel: number, reqPool: number, desc: string,
  extra: Partial<SkillNodeDef> = {},
): SkillNodeDef => ({ id, name, kind: "PASSIVE", icon: "🥋", pool, cost: id === "tai_pass_raiz" ? 1 : 2, branch, col, row, requires, reqLevel, reqPool, desc, ...extra });

// Árvore de progressão genérica de Taijutsu (vida, energia, mobilidade,
// esquiva — vale pra qualquer estilo). As passivas específicas de UM estilo
// (Punho Forte, Arhat, Adamantino) moraram aqui antes, mas foram pra dentro
// da própria árvore do estilo: ver taijutsu-tree.ts, arhat-tree.ts e
// adamantino-tree.ts.
//
// Custos revisados em 09/08/2026: a arvore inteira cobrava 2 PN por no',
// independente do tamanho do bonus, enquanto as duas Reservas ja' cobravam 3 e
// 4 — precedente de que recurso global vale mais. Subiu pra 3 PN tudo que da'
// bonus GLOBAL e permanente (vida, movimento, regeneracao) e pra 4 a Maestria
// Marcial, que multiplica TODO o Taijutsu por 1.20 (mais do que um jutsu rank
// B entrega, e rank B custa 4). Ficaram em 2 so' o Reflexo Evasivo (3 pontos
// percentuais, o menor efeito daqui) e a raiz. Total da arvore: 24 -> 32 PN.
// Conferido: nenhum `effectiveReqPool` muda, porque o reqPool declarado de
// cada no' ja' e' maior que o custo da cadeia obrigatoria (a Maestria pede 40
// e a arvore inteira custa 32) — a mudanca nao tem cascata.
//
// Tronco central (raiz -> vigor) e depois 3 ramos lado a lado: esquerda e
// meio com 3 nós cada (10 -> 20 -> 30), direita com só 2 (20 -> 30, sem
// etapa de nível 10 — pedido assim de propósito). No fim, Maestria Marcial
// exige os TRÊS topos ao mesmo tempo, fechando a árvore de volta ao centro.
export const TAIJUTSU_PASSIVES_TREE: SkillNodeDef[] = [
  passive("tai_pass_raiz", "Disciplina Corporal", "Fundamento", "taijutsu", 0, 0, [], 1, 1, "Passiva sempre ativa: +8% de dano em todas as técnicas de Taijutsu."),
  passive("tai_pass_vigor", "Vigor de Combate", "Fundamento", "taijutsu", 0, 1, ["tai_pass_raiz"], 5, 5, "Passiva sempre ativa: sua vida máxima é 10% maior.", { cost: 3 }),

  // Esquerda: mobilidade e esquiva.
  passive("tai_pass_passada", "Passada Leve", "Esquerda", "taijutsu", -1.25, 2, ["tai_pass_vigor"], 10, 10, "Passiva: em combate, seu alcance de movimento aumenta em 1 casa.", { cost: 3 }),
  passive("tai_pass_passo_silencioso", "Passo Silencioso", "Esquerda", "taijutsu", -1.25, 3, ["tai_pass_passada"], 20, 20, "Passiva: seu alcance de movimento aumenta mais 1 casa.", { cost: 3 }),
  // "Nova skill" pedida: esquiva GERAL (dodgeBonus em
  // services/combat/passives.ts), nao so' contra Ninjutsu/Genjutsu.
  passive("tai_pass_reflexo_evasivo", "Reflexo Evasivo", "Esquerda", "taijutsu", -1.25, 4, ["tai_pass_passo_silencioso"], 30, 30, "Passiva sempre ativa: sua chance de esquiva aumenta em 3 pontos percentuais contra qualquer ataque."),

  // Meio: corpo — vida e regeneração.
  passive("tai_pass_corpo_temperado", "Corpo Temperado", "Meio", "taijutsu", 0, 2, ["tai_pass_vigor"], 10, 10, "Passiva sempre ativa: sua vida máxima é mais 8% maior.", { cost: 3 }),
  passive("tai_pass_recuperacao", "Recuperação Marcial", "Meio", "taijutsu", 0, 3, ["tai_pass_corpo_temperado"], 20, 20, "Passiva: no começo de cada rodada, você recupera 3 de vida, sem ultrapassar sua vida máxima.", { cost: 3 }),
  // "Nova skill" pedida: um pouco de vida + um pouco de regen, empilhando
  // com Vigor/Corpo Temperado/Recuperação Marcial.
  passive("tai_pass_resistencia_fisica", "Resistência Física", "Meio", "taijutsu", 0, 4, ["tai_pass_recuperacao"], 30, 30, "Passiva sempre ativa: sua vida máxima é mais 5% maior e você recupera mais 2 de vida no início de cada rodada.", { cost: 3 }),

  // Direita: só energia, 2 etapas (sem nível 10).
  passive("tai_pass_reserva", "Reserva Física", "Direita", "taijutsu", 1.25, 2, ["tai_pass_vigor"], 20, 20, "Passiva: sua energia máxima aumenta 25%.", { cost: 3 }),
  passive("tai_pass_reserva_profunda", "Reserva Física Profunda", "Direita", "taijutsu", 1.25, 3, ["tai_pass_reserva"], 30, 30, "Passiva: sua energia máxima ganha mais 25%.", { cost: 4 }),

  // Depois de completar as três ramificações, elas convergem de novo.
  passive("tai_pass_maestria", "Maestria Marcial", "Fundamento", "taijutsu", 0, 5,
    ["tai_pass_reflexo_evasivo", "tai_pass_resistencia_fisica", "tai_pass_reserva_profunda"],
    40, 40, "Passiva: +20% de dano em todas as técnicas de Taijutsu.", { cost: 4 }),
];
