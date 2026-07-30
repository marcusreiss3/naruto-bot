import type { SkillNodeDef } from "./element-trees/index.js";

// ============================================================================
// Árvore de Genjutsu — sem `element` (natureza de chakra nao se aplica; ver
// iryo-ninjutsu-tree.ts pro mesmo padrao). Paga em `genjutsu`, igual as
// arvores de cla pagam no atributo que a tecnica realmente e'.
//
// Identidade: arvore de CONTROLE (Nara/Hyuuga/Aburame), sem damageMult de
// dano bruto — o atributo genjutsu rende via genjutsuDuration() (ligada em
// resolveHit, combat-engine.ts): +1 rodada de efeito a cada 10 pontos de
// genjutsu. As passivas daqui (element-trees/passives.ts, secao GENJUTSU)
// somam valor ADICIONAL em cima disso (duracao/chance/custo especificos).
//
// Raiz -> 3 ramos, cada um com identidade propria (mesmo formato da arvore de
// Iryo: cada ramo e' uma "disciplina" diferente dentro da mesma arvore):
//   Aprisionamento — prende UM alvo, cada vez mais forte (Raizes Obscuras ->
//     Ecos do Cativeiro -> Arvore Assassina -> Interrogatorio, que so'
//     funciona na vitima ja presa).
//   Ilusao/Fuga — defensivo/reativo: sair de um golpe (Substituicao
//     Ilusoria) ou de uma ilusao alheia (Contra-Genjutsu). Nao converge no
//     apice de proposito — e' utilidade, nao dano.
//   Pesadelo — controle de AREA que escala pro controle da PROPRIA luta
//     (Penas Caidas adormece varios -> Dominio do Medo -> Dominio do Mundo
//     Obscuro isola a dupla do resto do combate).
// O apice (Visao do Inferno) converge Aprisionamento + Pesadelo.
// ============================================================================
const cost = (rank: NonNullable<SkillNodeDef["rank"]>) => (rank === "S" ? 10 : rank === "A" ? 6 : rank === "B" ? 4 : 3);
const jutsu = (id: string, name: string, rank: NonNullable<SkillNodeDef["rank"]>, icon: string, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string): SkillNodeDef => ({ id, name, kind: "JUTSU", rank, icon, pool: "genjutsu", cost: cost(rank), branch, col, row, requires, reqLevel, reqPool, grantsAbilityId: id, desc });
const passive = (id: string, name: string, icon: string, branch: string, col: number, row: number, requires: string[], reqLevel: number, reqPool: number, desc: string, root = false): SkillNodeDef => ({ id, name, kind: "PASSIVE", icon, pool: "genjutsu", cost: root ? 1 : 2, branch, col, row, requires, reqLevel, reqPool, desc });

export const GENJUTSU_TREE: SkillNodeDef[] = [
  passive("gen_raiz", "Véu da Mente", "🌫️", "Raiz", 0, 0, [], 1, 1, "Passiva sempre ativa: você lê o fluxo de chakra do adversário — ganha +3 pontos percentuais de esquiva contra Ninjutsu/Genjutsu e age mais cedo na ordem do turno.", true),

  // ------------------------------------------------------- Aprisionamento
  jutsu("gen_raizes_obscuras", "Raízes Obscuras", "C", "🌱", "Aprisionamento", -1, 1, ["gen_raiz"], 4, 4, "Uma raiz surge do solo e vira uma árvore crescente que se enrola no alvo, prendendo-o (Imobilização)."),
  passive("gen_ecos_cativeiro", "Ecos do Cativeiro", "⛓️", "Aprisionamento", -1, 2, ["gen_raizes_obscuras"], 8, 7, "Passiva: a Imobilização que você aplica dura 1 rodada a mais."),
  jutsu("gen_arvore_assassina", "Aprisionamento da Árvore Assassina", "B", "🌳", "Aprisionamento", -1, 3, ["gen_ecos_cativeiro"], 14, 12, "Você some como névoa para chegar sem ser detectado. Ao alcançar o alvo, a árvore o prende por completo: Atordoado e Imobilizado por 2 rodadas (mas consciente). Não pode ser esquivado."),
  jutsu("gen_interrogatorio", "Genjutsu: Interrogatório", "B", "🕯️", "Aprisionamento", -1, 4, ["gen_arvore_assassina"], 20, 17, "Só funciona numa vítima já Imobilizada ou Atordoada: quebra a força de vontade do capturado e drena o chakra dele a cada rodada."),

  // ------------------------------------------------------------ Ilusão/Fuga
  jutsu("gen_contra_genjutsu", "Contra-Genjutsu", "C", "🔓", "Ilusão/Fuga", 0, 1, ["gen_raiz"], 3, 3, "Interrompe o fluxo de chakra que alimenta uma ilusão. Remove Confusão, Bloqueio de Ninjutsu e Defesa Reduzida de si mesmo ou de um aliado."),
  jutsu("gen_substituicao_ilusoria", "Substituição Ilusória", "C", "👻", "Ilusão/Fuga", 0, 2, ["gen_contra_genjutsu"], 6, 5, "Planta uma ilusão na cabeça do inimigo no instante do golpe: ele ataca uma cópia sua que nunca existiu. Reação: +20% de chance de esquiva."),
  passive("gen_fluencia_ilusao", "Fluência da Ilusão", "🌊", "Ilusão/Fuga", 0, 3, ["gen_substituicao_ilusoria"], 10, 8, "Passiva: Contra-Genjutsu e Substituição Ilusória custam 20% menos chakra."),

  // ---------------------------------------------------------------- Pesadelo
  jutsu("gen_penas_caidas", "Penas Caídas", "B", "🪶", "Pesadelo", 1, 1, ["gen_raiz"], 8, 8, "Solta uma chuva de penas no ambiente: todos os adversários na área sentem sono repentino e podem cair Atordoados."),
  passive("gen_dominio_do_medo", "Domínio do Medo", "😨", "Pesadelo", 1, 2, ["gen_penas_caidas"], 18, 16, "Passiva: seus jutsus de Genjutsu têm +20 pontos percentuais de chance de Atordoar."),
  jutsu("gen_dominio_mundo_obscuro", "Domínio do Mundo Obscuro", "A", "🌑", "Pesadelo", 1, 3, ["gen_dominio_do_medo"], 26, 20, "Envolve todo o local numa ilusão que separa você e o alvo do mundo exterior: a luta vira um mano a mano do qual não há como fugir. É Inevitável."),

  // ------------------------------------------------------------------- Ápice
  jutsu("gen_visao_inferno", "Ilusão Demoníaca: Visão do Inferno", "S", "👹", "Ápice", 0, 5, ["gen_interrogatorio", "gen_dominio_mundo_obscuro"], 34, 28, "Revela à vítima o medo mais profundo escondido nela e a faz acreditar que é real. O terror a paralisa e destrói sua defesa. É Inevitável."),
];
