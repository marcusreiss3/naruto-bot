// Passivas dos nos da arvore. CONTEUDO: sao modificadores declarativos que a
// engine sabe ler (services/combat/passives.ts agrega, a engine consome).
//
// Passiva NAO e' uma Ability: nao ocupa acao, nao tem custo e nao aparece no
// /jutsu. Vale enquanto o no estiver comprado.
//
// Ao criar uma passiva nova: se ela precisar de um modificador que ainda nao
// existe aqui, o campo tem que nascer em PassiveDef E ser consumido na engine —
// campo sem consumo e' passiva morta (o jogador paga e nao ganha nada).
import type { Category, EffectId, Element, Shape, TerrainKind } from "../../config/enums.js";

export interface PassiveDef {
  nodeId: string;
  // ausente pra passivas que nao pertencem a nenhum elemento (ex: arvore de
  // Genjutsu) — essas usam `crossCategory` pra achar a ability em vez de
  // comparar elemento.
  element?: Element;
  // ESCAPE HATCH: quando presente, a passiva vale pra QUALQUER ability desta
  // categoria (ex: "GENJUTSU"), independente de elemento — mesmo campo que
  // ClanPassiveDef.crossCategory ja usa pros clas (Chinoike/Olhos de Sangue).
  // Necessario pra arvores sem natureza de chakra (Genjutsu, Iryo): elas nao
  // tem `element` na Ability pra comparar. Ver passiveMods() em
  // services/combat/passives.ts.
  // Aceita um array quando a mesma passiva precisa valer pra mais de uma
  // categoria (ex: Assassinato Ninja, onde os buffs valem tanto pra Taijutsu
  // quanto pra Kenjutsu).
  crossCategory?: Category | Category[];
  // restringe a passiva a tecnicas ESPECIFICAS (por id), mesmo dentro da
  // categoria aberta por crossCategory — mesmo campo que ClanPassiveDef ja'
  // usa. Ex: um desconto de custo que so' vale pras 2 tecnicas do ramo
  // Ilusao/Fuga da arvore de Genjutsu, nao pra qualquer GENJUTSU.
  abilityIds?: string[];
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
  // igual ninjutsuDodgeBonus, mas vale contra QUALQUER ataque recebido —
  // físico ou não, e independente da reação escolhida (reflexo puro,
  // Substituição, Hidratação...). Mesmo raciocínio do Byakugan/Ketsuryuugan
  // em combat-engine.ts: soma direto na chance final, não é amarrado a
  // nenhuma técnica específica.
  dodgeBonus?: number;
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
  // acumulos extras de um efeito especifico por acerto (generico — mesmo
  // campo que ClanPassiveDef ja usa; extraBurnStacks/extraCrystalStacks
  // sao versoes antigas e dedicadas do mesmo conceito, mantidas por
  // compatibilidade. Novo efeito com acumulo deveria usar este em vez de
  // criar mais um campo dedicado).
  effectStacksBonus?: Partial<Record<EffectId, number>>;
  maxHpBonus?: number;
  hpRegenPerTurn?: number;
  // teto/reserva de energia; a engine limita o acumulado a +50% (150% total).
  maxEnergyBonus?: number;
  // casas adicionais na ação de movimento; aplicado antes de lentidão/terreno.
  moveBonus?: number;
  firstHitDamageMult?: number;
  mistDamageMult?: number;
  markOnFirstHit?: { duration: number };
  firstKenjutsuDamageMult?: number;
  decisiveKenjutsuDamageMult?: number;
  // reduz a chance final de Esquiva do alvo contra a técnica coberta, em
  // pontos percentuais. Mantido baixo porque esquiva é uma defesa universal.
  dodgePenalty?: number;
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
  // Maré Condutora dá força estável à Água; Fio d'Água recompensa o preparo.
  // Com a build completa: 1.4375x no seco e 2.15625x contra Encharcado.
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
    damageMult: 1.25,
    effectDurationBonus: { effectId: "WET", bonus: 1 },
  },
  {
    nodeId: "agua_fio",
    element: "AGUA",
    damageMultVsEffect: { effectId: "WET", mult: 1.5 }, // com raiz e Maré Condutora: 1.15 * 1.25 * 1.5
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

  // ---------------------------------------------------------------- GENJUTSU
  // Sem elemento (usa crossCategory, nao element) e sem damageMult: Genjutsu e'
  // arvore de CONTROLE, igual Nara/Hyuuga/Aburame — o valor vem de duracao e
  // chance de efeito, nunca de dano bruto (genjutsuScaling fica em 0 de
  // proposito, ver balance.ts). O atributo genjutsu ja' rende sozinho via
  // genjutsuDuration() (ligada em resolveHit, combat-engine.ts); estas
  // passivas sao o valor ADICIONAL de investir na arvore por cima disso.
  {
    // Sem custo reduzido de proposito (nao faz sentido a arvore abrir com
    // "desconto" antes de entregar qualquer identidade de combate) — em vez
    // disso, o mesmo par nao-ofensivo que Raio usa na propria raiz: le o
    // fluxo de chakra do adversario, esquiva mais e age mais cedo.
    // Nerf: comecou em 0.08 (copiado igual do raio_raiz), mas empilha com o
    // de Raio pra quem tiver as duas arvores (character-level, nao gated por
    // ability) e e' de graca no primeiro no' — cortado pra 0.03.
    nodeId: "gen_raiz",
    ninjutsuDodgeBonus: 0.03,
    initiativePriority: 1,
  },
  {
    // Ecos do Cativeiro: apenas as Imobilizacoes aplicadas por Genjutsus duram mais.
    nodeId: "gen_ecos_cativeiro",
    crossCategory: "GENJUTSU",
    effectDurationBonus: { effectId: "ROOT", bonus: 1 },
  },
  {
    // Dominio do Medo: suas ilusoes de panico/atordoamento pegam mais.
    nodeId: "gen_dominio_do_medo",
    crossCategory: "GENJUTSU",
    effectChanceBonus: { STUN: 0.2 },
  },
  {
    // Fluencia da Ilusao: as DUAS tecnicas do ramo Ilusao/Fuga custam menos —
    // abilityIds (nao crossCategory) de proposito, pra nao virar um desconto
    // generico de Genjutsu igual o da raiz que ja foi cortado.
    nodeId: "gen_fluencia_ilusao",
    abilityIds: ["gen_contra_genjutsu", "gen_substituicao_ilusoria"],
    costMult: 0.8,
  },

  // --------------------------------------------------- POEIRA (kekkei genkai)
  // O KKG MAIS FORTE do jogo (pedido explicito do usuario) — teto de dano
  // 1.40 * 1.55 = 2.17x, ACIMA do 2.025x que todo outro KKG (Cristal/Vapor/
  // Calor/Lava/Explosao) compartilha. As duas passivas do meio nao sao dano:
  // uma crava Desintegracao a mais por acerto (acelera o colapso — mesmo
  // papel que Faceta Cortante cumpre pro Cristal, so' que via
  // effectStacksBonus generico em vez de um campo dedicado), a outra corta
  // Bloqueio/Aparo mais que qualquer outro elemento (0.25 contra o 0.2 padrao
  // de Vento/Vapor/Calor/Lava) — coerente com "nada resiste ao Poeira".
  {
    nodeId: "poeira_raiz",
    element: "POEIRA",
    damageMult: 1.4,
  },
  {
    nodeId: "poeira_estilhaco",
    element: "POEIRA",
    effectStacksBonus: { DISINTEGRATION: 1 },
  },
  {
    nodeId: "poeira_erosao",
    element: "POEIRA",
    armorPierce: 0.25,
  },
  {
    nodeId: "poeira_apice",
    element: "POEIRA",
    damageMult: 1.55, // 1.40 * 1.55 = 2.17 — acima do teto 2.025 dos outros KKG de proposito
  },

  // ------------------------------------------------------ GELO (kekkei genkai)
  // Hyoton: ex-arvore de clã do Yuki, migrada pra kekkei genkai (pedido
  // explicito do usuario) — balanceada no MESMO nivel de Vapor/Calor/Lava:
  // raiz 1.35x + ápice 1.50x = 2.025x, o formato padrao (raiz/apice so' dano,
  // as passivas do meio so' utilidade). O desconto de custo que estava na
  // raiz original foi pra Reflexos Gélidos; o bonus de Defesa Reduzida extra
  // + Lentidão do ápice original ficou concentrado na Presença Silenciosa.
  {
    nodeId: "gelo_raiz",
    element: "GELO",
    damageMult: 1.35,
  },
  {
    nodeId: "gelo_presenca",
    element: "GELO",
    effectChanceBonus: { DEFENSE_DOWN: 0.15 },
    effectDurationBonus: { effectId: "SLOW", bonus: 1 },
  },
  {
    nodeId: "gelo_reflexos",
    element: "GELO",
    ninjutsuDodgeBonus: 0.08,
    costMult: 0.9,
  },
  {
    nodeId: "gelo_apice",
    element: "GELO",
    damageMult: 1.5, // 1.35 * 1.50 = 2.025, identico a Vapor/Calor/Lava
  },

  // ------------------------------------------------ TAIIJUTSU (arvore geral)
  { nodeId: "tai_pass_raiz", crossCategory: "TAIJUTSU", damageMult: 1.08 },
  { nodeId: "tai_pass_vigor", maxHpBonus: 0.10 },
  { nodeId: "tai_pass_corpo_temperado", maxHpBonus: 0.08 },
  { nodeId: "tai_pass_recuperacao", hpRegenPerTurn: 3 },
  { nodeId: "tai_pass_reserva", maxEnergyBonus: 0.25 },
  { nodeId: "tai_pass_reserva_profunda", maxEnergyBonus: 0.25 },
  { nodeId: "tai_pass_maestria", crossCategory: "TAIJUTSU", damageMult: 1.20 },
  { nodeId: "tai_pass_passada", moveBonus: 1 },
  { nodeId: "tai_pass_passo_silencioso", moveBonus: 1 },
  { nodeId: "tai_pass_reflexo_evasivo", dodgeBonus: 0.03 },
  { nodeId: "tai_pass_resistencia_fisica", maxHpBonus: 0.05, hpRegenPerTurn: 2 },

  // ------------------------------------------------ FUINJUTSU
  { nodeId: "fuin_raiz", crossCategory: "NINJUTSU", abilityIds: ["fuin_selo_cinco_elementos", "fuin_ligacao_pano"], effectChanceBonus: { NINJUTSU_BLOCK: 0.10 } },
  { nodeId: "fuin_traco_contencao", abilityIds: ["fuin_metodo_selamento_fogo", "fuin_selo_cinco_elementos"], costMult: 0.85 },
  { nodeId: "fuin_ancora_formula", abilityIds: ["fuin_formacao_cordas_luz", "fuin_ligacao_pano"], effectDurationBonus: { effectId: "ROOT", bonus: 1 } },

  // Igual Assassinato Ninja: sem damageMult incondicional a arvore inteira
  // era so' reduzir esquiva do ALVO — nunca aumentava o dano de quem comprou.
  { nodeId: "tai_agitacao_passos", crossCategory: "TAIJUTSU", damageMult: 1.05, dodgePenalty: 0.05 },
  { nodeId: "tai_agitacao_finta", crossCategory: "TAIJUTSU", damageMult: 1.05, dodgePenalty: 0.04 },
  { nodeId: "tai_agitacao_ritmo", crossCategory: "TAIJUTSU", damageMult: 1.06, dodgePenalty: 0.03 },

  { nodeId: "tai_forte_ritmo", abilityIds: ["tai_furacao_folha", "tai_vendaval_folha", "tai_grande_furacao_folha"], costMult: 0.85 },

  { nodeId: "tai_arhat_impacto", abilityIds: ["arhat_palmada_colapso", "arhat_ombro", "arhat_palmada_ascendente"], pushBonus: 1 },
  { nodeId: "tai_arhat_pressao", abilityIds: ["arhat_palma_compressao", "arhat_golpe_rocha"], damageMult: 1.12 },
  { nodeId: "tai_arhat_estabilidade", abilityIds: ["arhat_joelhada", "arhat_palma_compressao"], costMult: 0.88 },

  { nodeId: "tai_adamantino_controle", abilityIds: ["adamantino_pe_dor_celestial", "adamantino_impacto_flor_cerejeira", "adamantino_impacto_flor_florescimento", "adamantino_cem_forcas", "adamantino_destruicao_pilar", "adamantino_super_peteleco"], costMult: 0.88 },
  { nodeId: "tai_adamantino_ruptura", abilityIds: ["adamantino_impacto_flor_cerejeira", "adamantino_impacto_flor_florescimento", "adamantino_super_peteleco"], damageMult: 1.10 },
  { nodeId: "tai_adamantino_forca", abilityIds: ["adamantino_pe_dor_celestial", "adamantino_impacto_flor_cerejeira", "adamantino_impacto_flor_florescimento", "adamantino_destruicao_pilar", "adamantino_super_peteleco"], damageMult: 1.08 },

  { nodeId: "tai_ken_postura", crossCategory: "KENJUTSU", costMult: 0.90 },
  { nodeId: "tai_ken_fio", crossCategory: "KENJUTSU", damageMult: 1.10 },
  { nodeId: "tai_ken_geometria", crossCategory: "KENJUTSU", rangeBonus: 1, rangeShapes: ["LINE"], armorPierce: 0.10 },

  // Assassinato Ninja e' mais kenjutsu do que taijutsu na pratica (Kiri e'
  // vila de espadachins) — os 5 buffs abaixo valem pras DUAS categorias.
  // Saque Relampago/Corte Decisivo (Caminho da Lamina) ficam so' em KENJUTSU
  // de proposito: eles sao a especializacao pura de espada.
  // Passei a somar tambem um damageMult INCONDICIONAL em 3 nos (nao so'
  // situacional): sem isso a arvore inteira dependia de acertar o combo certo
  // (1o golpe, alvo marcado, alvo baixo de vida) pra valer o nivel/PN que pede
  // — diferente de todo elemento, que ja da' dano garantido desde a raiz.
  { nodeId: "tai_nevoa_primeiro_golpe", crossCategory: ["TAIJUTSU", "KENJUTSU"], damageMult: 1.08, firstHitDamageMult: 1.15 },
  { nodeId: "tai_nevoa_ponto_cego", crossCategory: ["TAIJUTSU", "KENJUTSU"], damageMult: 1.07, damageMultVsEffect: { effectId: "DEFENSE_DOWN", mult: 1.12 }, armorPierce: 0.12 },
  { nodeId: "tai_nevoa_ofuscante", crossCategory: ["TAIJUTSU", "KENJUTSU"], mistDamageMult: 1.10 },
  { nodeId: "tai_nevoa_marca", crossCategory: ["TAIJUTSU", "KENJUTSU"], markOnFirstHit: { duration: 3 }, damageMultVsEffect: { effectId: "MARKED", mult: 1.10 } },
  { nodeId: "tai_nevoa_misericordia", crossCategory: ["TAIJUTSU", "KENJUTSU"], damageMult: 1.06, executeBonus: { hpThreshold: 0.20, mult: 1.18 } },
  { nodeId: "tai_nevoa_saque", crossCategory: "KENJUTSU", firstKenjutsuDamageMult: 1.14, initiativePriority: 1 },
  { nodeId: "tai_nevoa_corte", crossCategory: "KENJUTSU", decisiveKenjutsuDamageMult: 1.18, armorPierce: 0.18 },
];

export const PASSIVE_INDEX: Map<string, PassiveDef> = new Map(PASSIVES.map((p) => [p.nodeId, p]));

export function getPassive(nodeId: string): PassiveDef | undefined {
  return PASSIVE_INDEX.get(nodeId);
}
