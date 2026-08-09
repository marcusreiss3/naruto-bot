import type { Ability } from "../types.js";

// ============================================================================
// Arsenal de NPC — conteudo real, nao placeholder.
// ============================================================================
// Marca de habilidade de NPC: **sem `requirements`**. `autoUnlockJutsus()`
// (character-service.ts) pula toda ability sem requisito, entao nada daqui cai
// no arsenal de jogador nenhum; so' entra em combate via
// `NpcTemplate.abilityIds` (src/data/npcs.ts).
//
// Duas familias aqui:
//
// 1. BICHOS — invocacoes e animais. Custo 0, como sempre foi.
//
// 2. KIT GENERICO `npc_*` — o que bandido, ronin e ninja renegado usam. Estas
//    sete moravam no `jutsus/support.ts` como habilidade de JOGADOR e eram
//    reusadas por 54 NpcTemplates. Quando o support.ts foi apagado (09/08/2026)
//    elas vieram pra ca' com os MESMOS numeros — dano, custo, alcance, efeito
//    e chance intactos — pra nenhum NPC mudar de forca. O que saiu foi so' o
//    `requirements`, que era o que fazia o jogador ganha-las de graca.
//    Os ids ganharam prefixo `npc_` pra ninguem confundir de novo com
//    conteudo de jogador.
//
// Ao balancear: estas sao conteudo de verdade, mas nao passam pela regua de
// custo (scripts/audit-jutsu-costs.ts as ignora — NPC nao tem economia de
// recurso pra respeitar). Ajuste pelo desafio que o NPC deve dar na missao.
// ============================================================================
export const NPC_ABILITIES: Ability[] = [
  // ---------------- kit generico de humanoide ----------------
  {
    id: "npc_soco",
    name: "Konoha Senpuu",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 15,
    actionType: "COMUM",
    baseDamage: 16,
    scalingAttribute: "taijutsu",
    range: 1,
    shape: "MELEE",
    tags: ["taijutsu", "fisico"],
    description: "Combo de golpes corpo a corpo.",
  },
  {
    id: "npc_corte_simples",
    name: "Corte Simples",
    category: "BUKIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 15,
    actionType: "COMUM",
    baseDamage: 16,
    scalingAttribute: "bukijutsu",
    range: 1,
    shape: "MELEE",
    tags: ["arma", "fisico"],
    description: "Golpe direto com a arma.",
  },
  {
    id: "npc_corte_linha",
    name: "Corte em Linha",
    category: "BUKIJUTSU",
    tier: 2,
    resource: "energia",
    cost: 20,
    actionType: "COMUM",
    baseDamage: 20,
    scalingAttribute: "bukijutsu",
    range: 3,
    shape: "LINE",
    effects: [{ effectId: "BLEED", duration: 2, chance: 0.5 }],
    tags: ["arma", "linha"],
    description: "Onda cortante em linha; pode causar Sangramento.",
  },
  {
    id: "npc_confusao",
    name: "Magen: Jubaku Satsu",
    category: "GENJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 14,
    actionType: "COMUM",
    range: 4,
    shape: "SINGLE_TARGET",
    scalingAttribute: "genjutsu",
    effects: [{ effectId: "CONFUSION", duration: 2 }],
    tags: ["genjutsu", "controle"],
    description: "Ilusão que confunde o alvo, fazendo-o atacar aleatoriamente.",
  },
  {
    id: "npc_bloqueio_ninjutsu",
    name: "Selo de Silêncio",
    category: "GENJUTSU",
    tier: 2,
    resource: "chakra",
    cost: 14,
    actionType: "COMUM",
    range: 4,
    shape: "SINGLE_TARGET",
    scalingAttribute: "genjutsu",
    effects: [{ effectId: "NINJUTSU_BLOCK", duration: 2 }],
    tags: ["genjutsu", "controle"],
    description: "Impede o alvo de usar Ninjutsu por algumas rodadas.",
  },
  {
    id: "npc_cura",
    name: "Chiyute no Jutsu",
    category: "IRYO_NINJUTSU",
    tier: 3,
    resource: "chakra",
    cost: 40,
    actionType: "COMUM",
    baseHeal: 40,
    scalingAttribute: "iryoNinjutsu",
    range: 2,
    shape: "ALLY",
    tags: ["cura"],
    description: "Cura avançada de grande volume, com custo alto.",
  },
  {
    id: "npc_remover_veneno",
    name: "Dokunuki no Jutsu",
    category: "IRYO_NINJUTSU",
    tier: 1,
    resource: "chakra",
    cost: 18,
    actionType: "COMUM",
    range: 1,
    shape: "ALLY",
    cleanses: ["POISON"],
    scalingAttribute: "iryoNinjutsu",
    tags: ["cura", "remocao"],
    description: "Extrai veneno do alvo.",
  },

  // ---------------- bichos ----------------
  {
    id: "pombo_bicada",
    name: "Bicada Irritante",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 0,
    actionType: "COMUM",
    baseDamage: 1,
    range: 1,
    shape: "MELEE",
    tags: ["pombo", "fisico"],
    unblockable: true,
    undodgeable: true,
    description: "Uma bicada Inevitável que causa exatamente 1 de dano.",
  },
  {
    id: "vespa_ferroada",
    name: "Ferroadas do Enxame",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 0,
    actionType: "COMUM",
    baseDamage: 4,
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "POISON", duration: 2, chance: 0.25 }],
    tags: ["vespa", "veneno", "fisico"],
    description: "Várias ferroadas pequenas, com chance baixa de envenenar.",
  },
  {
    id: "cao_ninja_mordida",
    name: "Mordida do Cão Ninja",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 0,
    actionType: "COMUM",
    baseDamage: 10,
    range: 1,
    shape: "MELEE",
    tags: ["cao", "inuzuka", "fisico"],
    description: "O cão ninja abocanha o alvo com força — ataque simples e confiável.",
  },
  {
    id: "abelha_gigante_ferroada",
    name: "Ferroada da Abelha Gigante",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 0,
    actionType: "COMUM",
    baseDamage: 14,
    range: 1,
    shape: "MELEE",
    effects: [{ effectId: "POISON", duration: 2, chance: 0.3 }],
    tags: ["abelha", "kamizuru", "fisico", "veneno"],
    description: "A abelha crava o ferrão mortal no alvo — chance de deixá-lo envenenado.",
  },
  {
    id: "abelha_gigante_mel",
    name: "Cuspe de Mel",
    category: "TAIJUTSU",
    tier: 1,
    resource: "energia",
    cost: 0,
    actionType: "COMUM",
    baseDamage: 0,
    range: 3,
    shape: "SINGLE_TARGET",
    effects: [{ effectId: "ROOT", duration: 2, chance: 0.5 }],
    tags: ["abelha", "kamizuru", "controle"],
    description: "Cospe uma grande quantidade de mel grudento da boca, prendendo o alvo no lugar.",
  },
];
