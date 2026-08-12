// ============================================================================
// TRAITS — passiva permanente e unica por personagem, sorteada na criacao.
// ============================================================================
// Especificacao completa (orcamento, metodologia, simulacao): TRAITS.txt.
//
// COMO FUNCIONA NO MOTOR: trait NAO e' um sistema paralelo. Ela pega carona no
// de passivas — `mods` usa o mesmo vocabulario de PassiveDef, e o id da trait
// entra no array `flags.nodes` do participante junto com os nos comprados. O
// lookup em services/combat/passives.ts tenta, nesta ordem:
//     getPassive(id) ?? getClanPassive(id) ?? getTraitPassive(id)
// Entao qualquer campo que uma passiva de arvore sabe fazer, uma trait tambem
// sabe, sem tocar na engine.
//
// ESCOPO: passiveMods() SO' aplica a passiva se ela casar com a ability
// (element / crossCategory / clanId / abilityIds). Trait que vale "em tudo"
// declara `crossCategory: [...CATEGORIES]` — nao ha campo "vale sempre", e
// nao vale a pena criar um: listar as categorias e' explicito e nao quebra
// quando uma categoria nova nascer (o typecheck acusa).
//
// PP: o orcamento gasto. Nao e' lido pela engine — serve pra auditoria
// humana contra TRAITS.txt, e tests/traits.test.ts trava se algum PP sair da
// faixa da raridade (TRAIT_BUDGET).
import { CATEGORIES, type TraitRarity } from "../config/enums.js";
import type { PassiveDef } from "./element-trees/passives.js";

// Tudo o que uma passiva de arvore sabe fazer, menos a amarra ao no'.
export type TraitMods = Omit<PassiveDef, "nodeId">;

export interface TraitDef {
  id: string;
  name: string;
  rarity: TraitRarity;
  // Texto que o jogador le. Deve descrever SO' o que a trait faz — mesma regra
  // dos efeitos (ver CLAUDE.md): nao citar o que ela nao faz.
  description: string;
  // orcamento gasto, em pontos de poder. So' auditoria.
  pp: number;
  mods: TraitMods;
}

// Orcamento por raridade e a tolerancia aceita. Ha' buraco entre as faixas de
// proposito: garante que nenhuma comum encoste numa rara.
export const TRAIT_BUDGET: Record<TraitRarity, { alvo: number; min: number; max: number }> = {
  COMUM: { alvo: 2, min: 1, max: 3 },
  RARA: { alvo: 4, min: 3, max: 5 },
  EPICA: { alvo: 7, min: 6, max: 9 },
  LENDARIA: { alvo: 11, min: 10, max: 14 },
  MITICA: { alvo: 16, min: 15, max: 20 },
};

// "vale pra qualquer tecnica"
const TUDO = [...CATEGORIES];
// pilar fisico e pilar de chakra — as duas Celestiais se opoem por aqui.
const FISICO = ["TAIJUTSU", "BUKIJUTSU", "KENJUTSU"] as const;
const CHAKRA = ["NINJUTSU", "IRYO_NINJUTSU", "GENJUTSU"] as const;

export const TRAITS: TraitDef[] = [
  // ------------------------------------------------------------------ COMUM
  {
    id: "trait_especialista_ninjutsu",
    name: "Especialista em Ninjutsu",
    rarity: "COMUM",
    pp: 2,
    description: "Seus Ninjutsus causam 10% mais dano.",
    // damageMultScalingAttribute exclui os selos: Fuinjutsu tambem e'
    // category NINJUTSU, mas escala por `fuinjutsu`.
    mods: { crossCategory: "NINJUTSU", damageMultScalingAttribute: "ninjutsu", damageMult: 1.10 },
  },
  {
    id: "trait_especialista_taijutsu",
    name: "Especialista em Taijutsu",
    rarity: "COMUM",
    pp: 2,
    description: "Seus Taijutsus causam 10% mais dano.",
    mods: { crossCategory: "TAIJUTSU", damageMult: 1.10 },
  },
  {
    id: "trait_especialista_bukijutsu",
    name: "Especialista em Bukijutsu",
    rarity: "COMUM",
    pp: 2,
    description: "Seus Bukijutsus causam 10% mais dano.",
    mods: { crossCategory: "BUKIJUTSU", damageMult: 1.10 },
  },
  {
    id: "trait_especialista_genjutsu",
    name: "Especialista em Genjutsu",
    rarity: "COMUM",
    pp: 2,
    description:
      "Seus Genjutsus causam 5% mais dano e têm 5 pontos percentuais a mais de chance de aplicar seus efeitos.",
    mods: { crossCategory: "GENJUTSU", damageMult: 1.05, effectChanceBonusAll: 0.05 },
  },
  {
    id: "trait_especialista_fuinjutsu",
    name: "Especialista em Fuinjutsu",
    rarity: "COMUM",
    pp: 2,
    description: "Os efeitos dos seus Fuinjutsus duram 1 rodada a mais.",
    mods: {
      crossCategory: "NINJUTSU",
      damageMultScalingAttribute: "fuinjutsu",
      effectDurationBonusAll: 1,
    },
  },

  // ------------------------------------------------------------------- RARA
  {
    id: "trait_muralha",
    name: "O Mais Forte Escudo",
    rarity: "RARA",
    pp: 4,
    description: "Sua vida máxima é 10% maior, e seu Bloqueio e Aparo reduzem 10% mais dano.",
    mods: { maxHpBonus: 0.10, guardStrengthBonus: 0.10 },
  },
  {
    id: "trait_corredor",
    name: "Relâmpago Azul",
    rarity: "RARA",
    pp: 4,
    description:
      "Seu alcance de movimento aumenta em 1 casa e sua chance de fuga aumenta em 10 pontos percentuais.",
    mods: { moveBonus: 1, fleeBonus: 0.10 },
  },
  {
    id: "trait_determinacao",
    name: "Determinação",
    rarity: "RARA",
    pp: 4,
    description: "Seu chakra e sua energia máximos aumentam em 15%.",
    mods: { maxChakraBonus: 0.15, maxEnergyBonus: 0.15 },
  },
  {
    id: "trait_sangue_frio",
    name: "Sangue Frio",
    rarity: "RARA",
    pp: 4,
    description:
      "Os efeitos de controle aplicados em você duram 1 rodada a menos, sempre restando ao menos 1 rodada.",
    mods: { controlDurationResistance: 1 },
  },
  {
    id: "trait_instinto_caca",
    name: "Demônio da Névoa Oculta",
    rarity: "RARA",
    pp: 4,
    description: "Você causa 15% mais dano contra alvos abaixo de 30% da vida.",
    mods: { crossCategory: TUDO, executeBonus: { hpThreshold: 0.3, mult: 1.15 } },
  },
  {
    id: "trait_pacto_de_sangue",
    name: "Sábio das Invocações",
    rarity: "RARA",
    pp: 4,
    description: "Suas invocações e clones nascem com 25% mais vida e causam 15% mais dano.",
    mods: { summonHpBonus: 0.25, summonDamageBonus: 0.15 },
  },
  {
    id: "trait_faro_para_negocios",
    name: "Faro para Negócios",
    rarity: "RARA",
    pp: 4,
    description:
      "Você recebe 25% mais ryo de qualquer fonte, e suas técnicas que consomem item gastam 1 unidade a menos.",
    mods: { ryoBonus: 0.25, itemCostReduction: 1 },
  },

  // ------------------------------------------------------------------ EPICA
  {
    id: "trait_cacador_de_recompensas",
    name: "Ninja que Viveu em Cinco Guerras",
    rarity: "EPICA",
    pp: 7,
    description: "Você causa 20% mais dano contra NPCs e recebe 10% mais ryo de missão.",
    mods: { crossCategory: TUDO, damageMultVsNpc: 1.20, ryoBonus: 0.10 },
  },
  {
    id: "trait_ultimo_em_pe",
    name: "Imortal",
    rarity: "EPICA",
    pp: 7,
    description:
      "Abaixo de 50% da vida: você causa 15% mais dano, recupera 2 de vida por rodada e Concentrar Chakra e Recuperar o Fôlego devolvem 30 em vez de 20.",
    mods: {
      crossCategory: TUDO,
      woundedDamageMult: 1.15,
      woundedHpRegen: 2,
      woundedResourceRecoveryBonus: 10,
    },
  },
  {
    id: "trait_furia_crescente",
    name: "Monstro da Névoa Oculta",
    rarity: "EPICA",
    pp: 6,
    description:
      "Você causa 1% mais dano a cada 4% da sua vida perdida, até o limite de 20% (atingido com 80% da vida perdida).",
    mods: { crossCategory: TUDO, rageDamagePerHpLost: 0.25, rageDamageCap: 0.20 },
  },
  {
    id: "trait_lamina_sem_bainha",
    name: "Presa Branca",
    rarity: "EPICA",
    pp: 7,
    description: "Você causa 20% mais dano com tudo, mas sua vida máxima é 15% menor.",
    mods: { crossCategory: TUDO, damageMult: 1.20, maxHpBonus: -0.15 },
  },
  {
    id: "trait_lobo_solitario",
    name: "Caminho da Dor",
    rarity: "EPICA",
    pp: 7,
    description:
      "Enquanto houver mais inimigos vivos que aliados (contando você), você causa 20% mais dano e ganha 3 pontos percentuais de esquiva.",
    mods: { crossCategory: TUDO, outnumberedDamageMult: 1.20, outnumberedDodgeBonus: 0.03 },
  },
  {
    id: "trait_chakra_volatil",
    name: "Artista de Explosão",
    rarity: "EPICA",
    pp: 7,
    description: "Os efeitos que você aplica duram 1 rodada a mais, e suas técnicas custam 12% a mais.",
    mods: { crossCategory: TUDO, effectDurationBonusAll: 1, costMult: 1.12 },
  },

  // --------------------------------------------------------------- LENDARIA
  {
    id: "trait_corpo_celestial",
    name: "Besta Verde",
    rarity: "LENDARIA",
    pp: 12.7,
    description:
      "Seus Taijutsus, Bukijutsus e Kenjutsus causam 20% mais dano. Sua vida máxima é 15% maior e sua energia máxima, 15% maior. Seus Ninjutsus causam 30% menos dano e seu chakra máximo é 20% menor.",
    mods: {
      crossCategory: [...FISICO],
      damageMult: 1.20,
      maxHpBonus: 0.15,
      maxEnergyBonus: 0.15,
      maxChakraBonus: -0.20,
      // o nerf de Ninjutsu vive num campo proprio: `damageMult` ja' esta'
      // gasto no buff fisico, e os dois escopos sao opostos.
      offPillarCategories: ["NINJUTSU"],
      offPillarDamageMult: 0.70,
    },
  },
  {
    id: "trait_espirito_celestial",
    name: "O Professor",
    rarity: "LENDARIA",
    pp: 11.4,
    description:
      "Seus Ninjutsus, Iryō Ninjutsus, Genjutsus e Fuinjutsus causam 20% mais dano e custam 5% menos. Seu chakra máximo é 25% maior. Seus golpes físicos causam 30% menos dano, sua vida máxima é 10% menor e sua energia máxima, 20% menor.",
    mods: {
      crossCategory: [...CHAKRA],
      damageMult: 1.20,
      costMult: 0.95,
      maxChakraBonus: 0.25,
      maxHpBonus: -0.10,
      maxEnergyBonus: -0.20,
      offPillarCategories: [...FISICO],
      offPillarDamageMult: 0.70,
    },
  },
  {
    id: "trait_prodigio",
    name: "Prodígio Ninja",
    rarity: "LENDARIA",
    pp: 10.4,
    description:
      "Você causa 15% mais dano com tudo, sua vida e seus recursos máximos são 8% maiores, e você ganha 20% mais experiência.",
    mods: {
      crossCategory: TUDO,
      damageMult: 1.15,
      maxHpBonus: 0.08,
      maxChakraBonus: 0.08,
      maxEnergyBonus: 0.08,
      xpBonus: 0.20,
    },
  },
  {
    id: "trait_genio",
    name: "Gênio Ninja",
    rarity: "LENDARIA",
    pp: 11,
    description:
      "Você causa 10% mais dano com tudo, suas técnicas custam 5% menos, e você recebe 5 pontos em uma bolsa de atributo à sua escolha.",
    mods: { crossCategory: TUDO, damageMult: 1.10, costMult: 0.95, freeAttributePoints: 5 },
  },
  {
    id: "trait_herdeiro_de_sangue",
    name: "Fantasma do Clã",
    rarity: "LENDARIA",
    pp: 11,
    description:
      "O bônus de dano das passivas do seu clã é 25% maior — uma passiva que dava +20% passa a dar +25%. " +
      "Nós de árvores que não são do seu clã custam 1 ponto a mais.",
    mods: { clanPassiveAmplifier: 0.25, offClanNodeCostPenalty: 1 },
  },

  // ----------------------------------------------------------------- MITICA
  {
    id: "trait_indra",
    name: "Salvador do Mundo",
    rarity: "MITICA",
    pp: 16,
    description:
      "Você causa 30% mais dano com tudo e suas técnicas custam 15% menos. Você não recebe cura de técnicas de aliados.",
    mods: { crossCategory: TUDO, damageMult: 1.30, costMult: 0.85, refusesAllyHealing: true },
  },
  {
    id: "trait_ashura",
    name: "Deus Shinobi",
    rarity: "MITICA",
    pp: 16,
    description:
      "Sua vida máxima é 20% maior e seu chakra e energia máximos, 15% maiores. A cada rodada de combate você causa 3% mais dano, até o limite de 30%. Cada invocação ou clone vivo seu acelera esse limite em 2 rodadas.",
    mods: {
      crossCategory: TUDO,
      maxHpBonus: 0.20,
      maxChakraBonus: 0.15,
      maxEnergyBonus: 0.15,
      rampDamagePerRound: 0.03,
      rampDamageCap: 0.30,
      rampRoundsPerSummon: 2,
    },
  },
  {
    id: "trait_hamura",
    name: "Ascendente da Lua",
    rarity: "MITICA",
    pp: 16,
    description:
      "Você causa 20% mais dano com tudo e seus ataques ignoram 25% da redução de Bloqueio e Aparo. Suas técnicas à distância alcançam 2 casas a mais e sua linha de visão atravessa obstáculos. Seus efeitos têm 10 pontos percentuais a mais de chance.",
    mods: {
      crossCategory: TUDO,
      damageMult: 1.20,
      armorPierce: 0.25,
      rangeBonus: 2,
      // MELEE fica de fora de proposito: com ele, Punho Suave e katana
      // acertariam de 2 casas de distancia.
      rangeShapes: ["SINGLE_TARGET", "LINE", "CONE", "RADIUS"],
      piercesObstacles: true,
      effectChanceBonusAll: 0.10,
    },
  },
];

const TRAIT_INDEX = new Map(TRAITS.map((t) => [t.id, t]));

export function getTrait(id: string): TraitDef | undefined {
  return TRAIT_INDEX.get(id);
}

// Devolve os mods da trait no formato que services/combat/passives.ts consome
// (PassiveDef completo, com o id fazendo as vezes de nodeId).
export function getTraitPassive(id: string): PassiveDef | undefined {
  const t = TRAIT_INDEX.get(id);
  return t ? { nodeId: t.id, ...t.mods } : undefined;
}

export function traitsByRarity(rarity: TraitRarity): TraitDef[] {
  return TRAITS.filter((t) => t.rarity === rarity);
}
