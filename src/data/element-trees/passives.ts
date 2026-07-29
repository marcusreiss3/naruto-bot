// Passivas dos nos da arvore. CONTEUDO: sao modificadores declarativos que a
// engine sabe ler (services/combat/passives.ts agrega, a engine consome).
//
// Passiva NAO e' uma Ability: nao ocupa acao, nao tem custo e nao aparece no
// /jutsu. Vale enquanto o no estiver comprado.
//
// Ao criar uma passiva nova: se ela precisar de um modificador que ainda nao
// existe aqui, o campo tem que nascer em PassiveDef E ser consumido na engine —
// campo sem consumo e' passiva morta (o jogador paga e nao ganha nada).
import type { EffectId, Element, Shape, TerrainKind } from "../../config/enums.js";

export interface PassiveDef {
  nodeId: string;
  element: Element;
  // multiplica o dano dos jutsus do elemento (1.15 = +15%)
  damageMult?: number;
  // multiplica o dano SO quando o alvo tem o efeito (dano de quem monta jogada)
  damageMultVsEffect?: { effectId: EffectId; mult: number };
  // casas extras de empurrao/puxao dos jutsus do elemento
  pushBonus?: number;
  // estende a duracao de um efeito aplicado pelos jutsus do elemento
  effectDurationBonus?: { effectId: EffectId; bonus: number };
  // ignora parte do BLOQUEIO/APARO do alvo (0.2 = corta 20% da reducao dele)
  armorPierce?: number;
  // casas extras de alcance
  rangeBonus?: number;
  rangeShapes?: Shape[];
  // vento cruzando chamas propaga fogo (passa acumulo de Queimadura)
  spreadsBurn?: boolean;
  // vida extra das invocacoes do elemento (0.25 = +25%)
  summonHpBonus?: number;
  // rodadas extras no terreno criado pelos jutsus do elemento (muro, pantano)
  terrainDurationBonus?: number;
  // o dano do elemento passa direto pela Barreira do alvo
  ignoresShield?: boolean;
  // chance extra de aplicar efeitos especificos (0.20 = +20 pontos percentuais)
  effectChanceBonus?: Partial<Record<EffectId, number>>;
  // multiplicador contra alvos abaixo de certa fracao do HP maximo
  executeBonus?: { hpThreshold: number; mult: number };
  // modificadores do personagem, independentes do elemento do golpe recebido
  ninjutsuDodgeBonus?: number;
  initiativePriority?: number;
  // multiplica o custo de recurso dos jutsus do elemento (0.8 = -20%)
  costMult?: number;
  // se presente, o costMult so vale para estas formas
  costShapes?: Shape[];
  // acumulos extras de Queimadura por acerto
  extraBurnStacks?: number;
  // acumulos extras de Cristalizado por acerto (kekkei genkai de Cristal)
  extraCrystalStacks?: number;
  // sobrescreve o gatilho/dano da explosao de Queimadura
  burnExplodeAtStacks?: number;
  burnExplodeDamage?: number;
  // deixa terreno nas celulas atingidas por qualquer jutsu do elemento
  terrainOnHit?: { kind: TerrainKind; duration: number };
}

export const PASSIVES: PassiveDef[] = [
  // ---------------------------------------------------------------- FOGO
  // Os multiplicadores de dano sao a UNICA fonte de crescimento de dano do jogo
  // (as escalas por atributo estao em 0). O produto das passivas de dano de um
  // elemento deve ficar perto de 2.0 — foi assim que a curva de golpes-por-morte
  // ficou estavel (~3 a 4) do nivel 10 ao 50. Mexer aqui mexe no jogo inteiro.
  {
    nodeId: "fogo_raiz",
    element: "FOGO",
    damageMult: 1.3,
  },
  {
    nodeId: "fogo_brasas",
    element: "FOGO",
    extraBurnStacks: 1,
  },
  {
    nodeId: "fogo_combustao",
    element: "FOGO",
    burnExplodeAtStacks: 4,
    burnExplodeDamage: 60,
  },
  {
    nodeId: "fogo_pavio",
    element: "FOGO",
    terrainOnHit: { kind: "FIRE", duration: 2 },
  },
  {
    nodeId: "fogo_folego",
    element: "FOGO",
    damageMult: 1.55, // 1.30 * 1.55 = 2.015 no total
  },
  {
    nodeId: "fogo_sopro",
    element: "FOGO",
    costMult: 0.8,
    costShapes: ["CONE"],
  },

  // ---------------------------------------------------------------- AGUA
  // Agua nao ganha dano de graca como Fogo: ganha por MONTAR A JOGADA. Contra
  // alvo seco bate fraco (1.15x); contra Encharcado chega a 2.01x — a mesma
  // faixa do Fogo, so que condicionada ao setup. Ver o teste do ~2.0x.
  {
    nodeId: "agua_raiz",
    element: "AGUA",
    costMult: 0.85,
    damageMult: 1.15,
  },
  {
    nodeId: "agua_correnteza",
    element: "AGUA",
    pushBonus: 1,
  },
  {
    nodeId: "agua_condutora",
    element: "AGUA",
    effectDurationBonus: { effectId: "WET", bonus: 1 },
  },
  {
    nodeId: "agua_fio",
    element: "AGUA",
    damageMultVsEffect: { effectId: "WET", mult: 1.75 }, // 1.15 * 1.75 = 2.01
  },

  // ---------------------------------------------------------------- VENTO
  // Vento paga o dano em duas passivas de CORTE (raiz + Corte Profundo = 2.01x)
  // e gasta as outras tres em utilidade pura: impacto, alcance e combo com Fogo.
  {
    nodeId: "vento_raiz",
    element: "VENTO",
    damageMult: 1.3,
    armorPierce: 0.2, // o corte passa por bloqueio
  },
  {
    nodeId: "vento_corte",
    element: "VENTO",
    damageMult: 1.55, // 1.30 * 1.55 = 2.015
    effectDurationBonus: { effectId: "BLEED", bonus: 1 },
  },
  {
    // o dano de impacto em si e' lido pela engine (hasImpactPassive)
    nodeId: "vento_vacuo",
    element: "VENTO",
  },
  {
    nodeId: "vento_brasa",
    element: "VENTO",
    spreadsBurn: true,
  },
  {
    nodeId: "vento_alcance",
    element: "VENTO",
    rangeBonus: 2,
    rangeShapes: ["LINE"],
  },

  // ---------------------------------------------------------------- TERRA
  // Terra e' a fortaleza: o dano sai da raiz (que tambem da' Barreira) e do
  // Peso da Montanha (golpe pesado). As outras duas sao utilidade de defesa
  // e de invocacao — coerente com o elemento que decide ONDE a luta acontece.
  {
    nodeId: "terra_raiz",
    element: "TERRA",
    damageMult: 1.3,
    // o +1 de Barreira ao defender e' aplicado na engine (resolveHit)
  },
  {
    nodeId: "terra_firme",
    element: "TERRA",
    terrainDurationBonus: 1, // muros e cupulas duram mais
  },
  {
    nodeId: "terra_barro",
    element: "TERRA",
    summonHpBonus: 0.25,
  },
  {
    nodeId: "terra_peso",
    element: "TERRA",
    damageMult: 1.55, // 1.30 * 1.55 = 2.015
    effectDurationBonus: { effectId: "ROOT", bonus: 1 },
  },

  // ---------------------------------------------------------------- RAIO
  // No seco, Raio cresce pouco; contra Encharcado fecha a curva em 2.01x.
  {
    nodeId: "raio_raiz",
    element: "RAIO",
    damageMult: 1.15,
    ninjutsuDodgeBonus: 0.08,
    initiativePriority: 1,
  },
  {
    nodeId: "raio_sobrecarga",
    element: "RAIO",
    effectChanceBonus: { STUN: 0.2 },
  },
  {
    nodeId: "raio_nuvens",
    element: "RAIO",
    damageMultVsEffect: { effectId: "WET", mult: 1.75 },
  },
  {
    nodeId: "raio_perfurante",
    element: "RAIO",
    ignoresShield: true,
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
  },

  // ------------------------------------------------- CRISTAL (kekkei genkai)
  // KEKKEI GENKAI: raiz 1.35x + ápice 1.50x fecham em 2.025x.
  // Vapor, Calor, Lava e Explosão usam o mesmo teto. A vantagem adicional
  // vem do kit exclusivo de efeitos, controle e utilidade de cada linhagem.
  {
    nodeId: "cristal_raiz",
    element: "CRISTAL",
    damageMult: 1.35,
  },
  {
    nodeId: "cristal_faceta",
    element: "CRISTAL",
    damageMult: 1.5, // 1.35 * 1.50 = 2.025
  },
  {
    // Faceta Cortante: cada acerto crava um cristal a mais, entao o casulo
    // fecha em 2 golpes em vez de 4. E' o acelerador do plano de controle.
    nodeId: "cristal_estilhaco",
    element: "CRISTAL",
    extraCrystalStacks: 1,
  },
  {
    // Refracao: a luz presa nas facetas confunde a mira de quem lanca ninjutsu.
    nodeId: "cristal_refracao",
    element: "CRISTAL",
    ninjutsuDodgeBonus: 0.08,
  },
  {
    // Rede Cristalina: as paredes e prisoes de cristal demoram mais a ruir.
    nodeId: "cristal_rede",
    element: "CRISTAL",
    terrainDurationBonus: 1,
    effectDurationBonus: { effectId: "CRYSTALLIZED", bonus: 1 },
  },

  // --------------------------------------------------- VAPOR (kekkei genkai)
  // Árvore expandida: mesmo teto do Cristal (2.025x = 1.35 * 1.50),
  // em vez do multiplicador todo morar numa raiz so. As tres passivas do meio
  // sao utilidade pura (duracao/custo/perfuracao de guarda), nao dano.
  {
    nodeId: "vapor_raiz",
    element: "VAPOR",
    damageMult: 1.35,
  },
  {
    nodeId: "vapor_condensacao",
    element: "VAPOR",
    effectDurationBonus: { effectId: "CORROSION", bonus: 1 },
  },
  {
    nodeId: "vapor_pressurizacao",
    element: "VAPOR",
    costMult: 0.85,
    costShapes: ["MELEE"],
  },
  {
    nodeId: "vapor_instinto_termal",
    element: "VAPOR",
    armorPierce: 0.2,
  },
  {
    nodeId: "vapor_ebulicao_total",
    element: "VAPOR",
    damageMult: 1.5, // 1.35 * 1.50 = 2.025, idêntico ao Cristal
  },

  // ---------------------------------------------------- CALOR (kekkei genkai)
  // Mesmo formato do Vapor: raiz + ápice fecham 2.025x, as três do meio são
  // utilidade.
  {
    nodeId: "calor_raiz",
    element: "CALOR",
    damageMult: 1.35,
  },
  {
    nodeId: "calor_ressecamento",
    element: "CALOR",
    effectDurationBonus: { effectId: "DEHYDRATION", bonus: 1 },
  },
  {
    nodeId: "calor_ondas_termicas",
    element: "CALOR",
    costMult: 0.85,
    costShapes: ["RADIUS"],
  },
  {
    nodeId: "calor_pele_rachada",
    element: "CALOR",
    armorPierce: 0.2,
  },
  {
    nodeId: "calor_combustao_interna",
    element: "CALOR",
    damageMult: 1.5, // 1.35 * 1.50 = 2.025, idêntico ao Cristal
  },

  // ----------------------------------------------------- LAVA (kekkei genkai)
  // Pedido explicito do usuario: Lava/Explosao/Vapor/Calor no MESMO nivel do
  // Cristal agora (2.025x = 1.35 * 1.50), custando um pouco menos (52 PN
  // contra 62). As tres passivas do meio sao utilidade.
  {
    nodeId: "lava_raiz",
    element: "LAVA",
    damageMult: 1.35,
  },
  {
    nodeId: "lava_calor_residual",
    element: "LAVA",
    effectDurationBonus: { effectId: "MAGMA", bonus: 1 },
  },
  {
    nodeId: "lava_crosta",
    element: "LAVA",
    costMult: 0.85,
    costShapes: ["LINE"],
  },
  {
    nodeId: "lava_pele_basaltica",
    element: "LAVA",
    armorPierce: 0.2,
  },
  {
    nodeId: "lava_apice",
    element: "LAVA",
    damageMult: 1.5, // 1.35 * 1.50 = 2.025, idêntico ao Cristal
  },

  // ------------------------------------------------- EXPLOSAO (kekkei genkai)
  // Mesmo formato do Lava: 2.025x = 1.35 * 1.50.
  {
    nodeId: "explosao_raiz",
    element: "EXPLOSAO",
    damageMult: 1.35,
  },
  {
    nodeId: "explosao_polvora",
    element: "EXPLOSAO",
    effectChanceBonus: { MINADO: 0.15 },
  },
  {
    nodeId: "explosao_fragmentacao",
    element: "EXPLOSAO",
    costMult: 0.85,
    costShapes: ["RADIUS"],
  },
  {
    nodeId: "explosao_blindagem",
    element: "EXPLOSAO",
    ignoresShield: true,
  },
  {
    nodeId: "explosao_apice",
    element: "EXPLOSAO",
    damageMult: 1.5, // 1.35 * 1.50 = 2.025, idêntico ao Cristal
  },
];

export const PASSIVE_INDEX: Map<string, PassiveDef> = new Map(PASSIVES.map((p) => [p.nodeId, p]));

export function getPassive(nodeId: string): PassiveDef | undefined {
  return PASSIVE_INDEX.get(nodeId);
}
