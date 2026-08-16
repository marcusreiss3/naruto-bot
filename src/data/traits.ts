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
  // Lendaria e mitica revisadas em 12/08/2026 (eram 11 e 16). A escada antiga
  // desacelerava no topo "pra nao explodir" e o resultado medido foi o
  // oposto: epica, lendaria e mitica EMPATAVAM em 4,33-4,00 golpes ate matar.
  // Ver TRAITS.txt, secao "ORCAMENTO POR RARIDADE".
  LENDARIA: { alvo: 13, min: 11, max: 17 },
  MITICA: { alvo: 25, min: 21, max: 29 },
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
    pp: 7,
    description:
      "Você causa 1% mais dano a cada 4% da sua vida perdida, chegando a 25% quando está à beira da morte.",
    // A INCLINACAO NAO SOBE, de proposito: o desenho e' ficar mais forte
    // conforme a luta AVANCA, nao no meio dela. Dobrar a inclinacao poria o
    // pico com 40% da vida perdida, o que descaracteriza a trait.
    //
    // Por isso o teto e' que subiu, de 20% pra 25%. Consequencia honesta: o
    // teto vira assintotico (exigiria 100% da vida perdida), entao na pratica
    // o jogador ve +23% a +25% so' no fim de uma luta dura. E' exatamente o
    // fim de luta que a trait quer premiar.
    mods: { crossCategory: TUDO, rageDamagePerHpLost: 0.25, rageDamageCap: 0.25 },
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
    pp: 15.9,
    description:
      "Seus Taijutsus, Bukijutsus e Kenjutsus causam 30% mais dano. Sua vida máxima é 15% maior e sua energia máxima, 15% maior. Seus Ninjutsus causam 30% menos dano e seu chakra máximo é 20% menor.",
    mods: {
      crossCategory: [...FISICO],
      damageMult: 1.30,
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
    pp: 15.8,
    description:
      "Seus Ninjutsus, Iryō Ninjutsus, Genjutsus e Fuinjutsus causam 30% mais dano e custam 5% menos. Seu chakra máximo é 35% maior. Seus golpes físicos causam 30% menos dano, sua vida máxima é 10% menor e sua energia máxima, 20% menor.",
    mods: {
      crossCategory: [...CHAKRA],
      damageMult: 1.30,
      costMult: 0.95,
      maxChakraBonus: 0.35,
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
    pp: 11.8,
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
    pp: 13,
    description:
      "Você causa 15% mais dano com tudo, suas técnicas custam 5% menos, e você recebe 15 pontos em uma bolsa de atributo à sua escolha.",
    // 15 pontos de atributo valem 5,0 PP, nao 15. Mecanicamente +1 de atributo
    // e' +1 ponto de no' — mas a ancora precifica o ponto MARGINAL de uma
    // build sendo montada, e concessao unica nao e' isso: com
    // attributePointsPerLevel=4, os mesmos 15 pontos sao +37% de progressao no
    // nv10 e +8% no nv45. Ver TRAITS.txt, regra 3.
    mods: { crossCategory: TUDO, damageMult: 1.15, costMult: 0.95, freeAttributePoints: 15 },
  },
  {
    id: "trait_herdeiro_de_sangue",
    name: "Fantasma do Clã",
    rarity: "LENDARIA",
    pp: 12.9,
    description:
      "O bônus de dano das passivas do seu clã é 30% maior — uma passiva que dava +20% passa a dar +26%. " +
      "Você também causa 15% mais dano com tudo e sua vida máxima é 15% maior.",
    // REDESENHADA em 12/08/2026. A versao antiga cobrava +1 PN em todo no' fora
    // do cla, e isso era prejuizo liquido: 267 nos fora de cla, custo medio
    // 3,69 PN virando 4,69 = 27% menos arvore comprada pelo resto do jogo,
    // contra um ganho de ~+10% de dano num escopo estreito. Como 1 PP = 1 ponto
    // de no', efeito de +-1 PN sobre centenas de nos vale dezenas de PP e a
    // regua nao enxerga — ver TRAITS.txt, regra 2. NAO REINTRODUZIR.
    //
    // O dano e a vida entraram porque toda trait de faixa alta precisa de um
    // dos dois: sem isso o jogador nao SENTE a trait (regra 1).
    mods: {
      crossCategory: TUDO,
      clanPassiveAmplifier: 0.30,
      damageMult: 1.15,
      maxHpBonus: 0.15,
    },
  },

  // ----------------------------------------------------------------- MITICA
  {
    id: "trait_indra",
    name: "Salvador do Mundo",
    rarity: "MITICA",
    pp: 23,
    description:
      "Você causa 40% mais dano com tudo, sua vida máxima é 10% maior e suas técnicas custam 15% menos. Você não recebe cura de técnicas de aliados.",
    // A vida entrou em 12/08/2026 porque ele era o unico mitico 100% dano, e
    // sem corpo ficava ABAIXO de uma lendaria na metrica de poder (dano x
    // vida): Besta Verde 1,30 x 1,15 = 1,49 contra 1,40 x 1,00 dele.
    mods: {
      crossCategory: TUDO,
      damageMult: 1.40,
      maxHpBonus: 0.10,
      costMult: 0.85,
      refusesAllyHealing: true,
    },
  },
  {
    id: "trait_ashura",
    name: "Deus Shinobi",
    rarity: "MITICA",
    pp: 22.8,
    description:
      "Você causa 10% mais dano com tudo, sua vida máxima é 20% maior e seu chakra e energia máximos, 15% maiores. A cada rodada de combate você causa 4% mais dano, até o limite de 40%. Cada invocação ou clone vivo seu acelera esse limite em 2 rodadas.",
    // A TAXA SUBIU JUNTO COM O TETO (3%->4%, 30%->40%) e isso nao e' detalhe:
    // teto 40% a 3% levaria 13,3 rodadas (7,3 com tres invocacoes) e ele
    // ganharia um pico que quase nunca veria. A 4% sao 10 rodadas sozinho e 4
    // com tres invocacoes — o tempo do desenho original.
    //
    // O dano base de 10% existe pra ele nao ficar longe demais do Indra no
    // turno 1 depois que o Indra ganhou vida. Ele CONTINUA comecando atras
    // (0,86 do poder do Indra) e chega a 1,20 no pico, que e' o alvo do
    // desenho. Consequencia aceita: no pico o dano dele (1,10 x 1,40 = 1,54)
    // PASSA o do Indra (1,40) — a regra antiga de "nunca passa" foi revogada,
    // ver TRAITS.txt, "O TRIANGULO DOS TRES".
    mods: {
      crossCategory: TUDO,
      damageMult: 1.10,
      maxHpBonus: 0.20,
      maxChakraBonus: 0.15,
      maxEnergyBonus: 0.15,
      rampDamagePerRound: 0.04,
      rampDamageCap: 0.40,
      rampRoundsPerSummon: 2,
    },
  },
  {
    id: "trait_hamura",
    name: "Ascendente da Lua",
    rarity: "MITICA",
    pp: 25,
    description:
      "Você causa 35% mais dano com tudo, sua vida máxima é 10% maior e seus ataques ignoram 25% da redução de Bloqueio e Aparo. Suas técnicas à distância alcançam 2 casas a mais e sua linha de visão atravessa obstáculos. Seus efeitos têm 10 pontos percentuais a mais de chance.",
    // Unico mitico que NAO encosta no teto de +40% de dano da faixa: os ~8 PP
    // que ele gasta em utilidade exclusiva nao sobram pra isso. E' a troca dele.
    mods: {
      crossCategory: TUDO,
      damageMult: 1.35,
      maxHpBonus: 0.10,
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

// Identidade visual das traits. Fica junto do catalogo para que qualquer
// painel que mostre uma trait reutilize o mesmo emoji sem repetir IDs.
const TRAIT_EMOJIS: Record<string, string> = {
  trait_chakra_volatil: "<:artistadeexplosao:1537200917349146706>",
  trait_hamura: "<:ascendentedalua:1537200919668723793>",
  trait_corpo_celestial: "<:bestaverde:1537200921031741495>",
  trait_lobo_solitario: "<:caminhodador:1537200922503946402>",
  trait_instinto_caca: "<:demoniodanevoaoculta:1537200923909300354>",
  trait_determinacao: "<:determinacao:1537200925771436093>",
  trait_ashura: "<:deusshinobi:1537200927344164955>",
  trait_especialista_bukijutsu: "<:especialistabukijutsu:1537200928665505802>",
  trait_especialista_fuinjutsu: "<:especialistafuinjutsu:1537200930141773914>",
  trait_especialista_genjutsu: "<:especialistagenjutsu:1537200931693920276>",
  trait_especialista_ninjutsu: "<:especialistaninjutsu:1537200933396549763>",
  trait_especialista_taijutsu: "<:especialistataijutsu:1537200935288184894>",
  trait_herdeiro_de_sangue: "<:fantasmadocla:1537200936886214848>",
  trait_faro_para_negocios: "<:faroparanegocios:1537200938178056192>",
  trait_genio: "<:genioninja:1537200939935596704>",
  trait_ultimo_em_pe: "<:imortal:1537200942070636555>",
  trait_furia_crescente: "<:monstrodanevoaoculta:1537200944247472169>",
  trait_cacador_de_recompensas: "<:ninjaqueviveuemcincoguerras:1537200945916813343>",
  trait_muralha: "<:omaisforteescudo:1537200947485351936>",
  trait_espirito_celestial: "<:oprofessor:1537200948882055258>",
  trait_lamina_sem_bainha: "<:presabranca:1537200950412968006>",
  trait_prodigio: "<:prodigioninja:1537200952078237737>",
  trait_corredor: "<:relampagoazul:1537200953625673879>",
  trait_pacto_de_sangue: "<:sabiodasinvocacoes:1537200955085295637>",
  trait_indra: "<:salvadordomundo:1537200956897366026>",
  trait_sangue_frio: "<:sanguefrio:1537200958348726352>",
};

/** Emoji exclusivo da trait; cai no dado para entradas antigas ou desconhecidas. */
export function traitEmoji(traitId: string): string {
  return TRAIT_EMOJIS[traitId] ?? "🎲";
}

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
