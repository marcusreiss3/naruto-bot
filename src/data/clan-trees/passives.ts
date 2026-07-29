// Passivas dos nós PASSIVE das árvores de CLÃ. Mesmo contrato de
// element-trees/passives.ts (services/combat/passives.ts agrega, a engine
// consome) — só troca `element` por `clanId`, porque habilidades de clã
// (categoria CLA) não têm `element` na Ability.
//
// Ao criar uma passiva nova: se ela precisar de um modificador que ainda nao
// existe aqui, o campo tem que nascer aqui E ser consumido em
// services/combat/passives.ts — campo sem consumo é passiva morta.
import type { Attribute, Category, EffectId, Element, Shape } from "../../config/enums.js";

export interface ClanPassiveDef {
  nodeId: string;
  clanId: string;
  // multiplica o dano dos jutsus de clã (1.3 = +30%) — Akimichi e' o unico
  // clã que ganha dano de graça igual os elementos; Nara/Hyuuga ganham por
  // controle/perfuracao, nao por multiplicador bruto.
  damageMult?: number;
  // restringe damageMult + ignoresShield + executeBonus deste no' a
  // abilities que escalam por UM atributo especifico. Use SO' quando nao
  // houver uma categoria propria pra discriminar (ex: apice do Chinoike —
  // dentro dos GENJUTSU do clã, so' a Genjutsu Ketsuryuugan deve ganhar).
  // Pra "so' espada", prefira crossCategory: "KENJUTSU": trava por
  // categoria, entao espada nova nasce coberta mesmo sem scalingAttribute.
  damageMultScalingAttribute?: Attribute;
  // multiplica o custo de recurso dos jutsus de clã (0.85 = -15%)
  costMult?: number;
  costShapes?: Shape[];
  // multiplica a cura produzida por tecnicas medicas cobertas pela passiva.
  healMult?: number;
  // bonus adicional de cura quando o alvo ja esta gravemente ferido.
  criticalHealBonus?: { hpThreshold: number; mult: number };
  // chance extra de aplicar efeitos especificos (0.15 = +15 pontos percentuais)
  effectChanceBonus?: Partial<Record<EffectId, number>>;
  effectStacksBonus?: Partial<Record<EffectId, number>>;
  // estende a duracao de um efeito aplicado pelos jutsus de clã
  effectDurationBonus?: { effectId: EffectId; bonus: number };
  // casas extras de alcance
  rangeBonus?: number;
  rangeShapes?: Shape[];
  // o dano dos jutsus de clã passa direto pela Barreira do alvo
  ignoresShield?: boolean;
  // ignora parte do BLOQUEIO/APARO do alvo (0.2 = corta 20% da reducao dele)
  // — mesmo campo que element-trees/passives.ts ja usa pro Vento (Fio de
  // Navalha); aqui e' a versao de clã (Lâmina Viva, do Kamaitachi).
  armorPierce?: number;
  // multiplicador contra alvos abaixo de certa fração do HP máximo
  executeBonus?: { hpThreshold: number; mult: number };
  // casas extras de empurrao/puxao dos jutsus de clã
  pushBonus?: number;
  // multiplica a vida da invocacao do clã (0.3 = +30%) — mesmo campo que
  // Vinculo de Barro (Terra) ja usa em element-trees/passives.ts, so que
  // aqui e' o cao ninja do Inuzuka em vez de um clone elemental.
  summonHpBonus?: number;
  // multiplica a vida MAXIMA do proprio personagem (0.08 = +8%) — aplicado
  // uma vez, ao entrar em combate (ver startCombat em combat-engine.ts).
  // Varias passivas do MESMO dono somam entre si antes de multiplicar.
  maxHpBonus?: number;
  // cura fixa no INICIO do proprio turno do dono, todo turno (ver
  // processTurnStart em combat-engine.ts) — o oposto de BURN/BLEED: em vez
  // de tickar dano, ticka cura. Nao e' um EffectId (nao aparece em
  // status/efeitos do alvo, e' passiva pura, sempre ativa).
  hpRegenPerTurn?: number;
  // reduz, em rodadas, efeitos negativos específicos recebidos pelo dono.
  receivedEffectDurationReduction?: Partial<Record<EffectId, number>>;
  // restaura X pontos percentuais de chakra no INICIO do proprio turno do
  // dono, todo turno (mesmo tick de hpRegenPerTurn, so' que no pool de
  // chakra em vez de vida — capado em 100). So' faz sentido pra dono cujo
  // jutsu principal gasta chakra (nao energia).
  chakraRegenPerTurn?: number;
  // dano fixo devolvido em quem acerta o DONO com um golpe fisico corpo a
  // corpo (ex: Armadura de Espinhos do Kaguya — espinhos de osso furando
  // quem encosta). Ver resolveHit() em combat-engine.ts.
  meleeCounterDamage?: number;
  // chance extra de esquivar de QUALQUER jutsu de Ninjutsu (nao so' os do
  // proprio dono) — mesmo campo que Raio/Cristal ja usam em
  // element-trees/passives.ts (ver characterPassiveMods() em
  // services/combat/passives.ts, que le os dois catalogos sem distinguir).
  ninjutsuDodgeBonus?: number;
  // ESCAPE HATCH do gate normal de clanId: quando presente, esta passiva
  // vale pra QUALQUER ability desta categoria (ex: "GENJUTSU"), mesmo sem
  // clanId nenhum ou de OUTRO cla/arvore de fundamentos — nao so' as do
  // proprio dono. Pedido explicito do Chinoike: os olhos de sangue leem
  // qualquer ilusao que o personagem conjure, nao so' a Genjutsu Ketsuryuugan
  // do proprio cla. Ver passiveMods() em services/combat/passives.ts.
  crossCategory?: Category;
  // abre o alcance para qualquer tecnica do elemento indicado.
  crossElement?: Element;
  // restringe a passiva a tecnicas especificas, mesmo fora do proprio cla.
  abilityIds?: string[];
  // multiplica o custo de upkeep por turno do controle mental do Yamanaka
  // (BALANCE.yamanaka.upkeepPerTurn, cobrado uma vez por turno de quem
  // estiver controlando pelo menos 1 corpo — 0.8 = -20%). So' faz sentido em
  // quem possui nos Yamanaka. Ver processTurnStart em combat-engine.ts.
  mindControlUpkeepMult?: number;
  // multiplica o upkeep de chakra do Sharingan ativo (0.85 = -15%).
  // As duas passivas Uchiha acumulam multiplicativamente.
  sharinganUpkeepMult?: number;
  // bonus fixo de Ninjutsu EFETIVO so' pra disputa de controle mental
  // (yamanakaResistChance, combat-math.ts) — ajuda tanto quando o dono esta
  // CONTROLANDO (mais dificil pra vitima resistir) quanto quando esta SENDO
  // controlado (mais facil de resistir de volta). Ver processTurnStart.
  mindControlNinjutsuBonus?: number;
  // +N corpos simultaneos ALEM do mindTransferMax da propria ability — so'
  // importa pra abilities com mindTransfer (Clones de Transferencia de
  // Mente, Yamanaka). Ver establishControl(), chamado a partir de resolveHit
  // em combat-engine.ts.
  mindTransferMaxBonus?: number;
}

export const CLAN_PASSIVES: ClanPassiveDef[] = [
  // -------------------------------------------------------------- UCHIHA
  {
    nodeId: "uchiha_controle_ocular",
    clanId: "uchiha",
    sharinganUpkeepMult: 0.85,
  },
  {
    nodeId: "uchiha_economia_visual",
    clanId: "uchiha",
    sharinganUpkeepMult: 0.85,
  },

  // ---------------------------------------------------------------- NARA
  // Nara não ganha dano de graça como os elementos — o clã é controle, não
  // rajada. A raiz corta custo (o clã é lendário em precisão de chakra); o
  // ápice estende o alcance da sombra e a duração da imobilização (o mesmo
  // papel que "Peso da Montanha" cumpre pra Terra, só que sem multiplicador
  // de dano).
  {
    nodeId: "nara_raiz",
    clanId: "nara",
    costMult: 0.85,
    // ROOT (Enforcamento/Costura, que ainda causam dano de verdade) e
    // SHADOW_BOUND (a família de imitação, sem dano) — os dois "prendem".
    effectChanceBonus: { ROOT: 0.15, SHADOW_BOUND: 0.15 },
  },
  {
    nodeId: "nara_apice",
    clanId: "nara",
    rangeBonus: 2,
    rangeShapes: ["LINE", "SINGLE_TARGET"],
    // so estende o Vínculo de Sombra (a marca do ápice da árvore) — Enforcamento
    // e Costura não ganham esse +1 de ROOT, só o clone de imitação.
    effectDurationBonus: { effectId: "SHADOW_BOUND", bonus: 1 },
  },

  // -------------------------------------------------------------- HYUUGA
  // O clã não ganha dano de graça igual os elementos — ganha por ATRAVESSAR
  // defesa (perfura Barreira, ignora escudo) e por SELAR chakra (Bloqueio de
  // Ninjutsu), porque o Punho Suave sempre foi descrito como "atinge por
  // dentro" no material de origem. A raiz é passiva (percepção do clã, ativa
  // mesmo sem o Byakugan ligado); o ápice é o pagamento do Punho Suave: ele
  // ignora Barreira e finaliza melhor alvos já feridos.
  {
    nodeId: "hyuuga_raiz",
    clanId: "hyuuga",
    costMult: 0.9,
    effectChanceBonus: { NINJUTSU_BLOCK: 0.1 },
  },
  {
    // Guarda Perpétua: fecha o ramo Defensivo (abaixo da Palma Rotativa) —
    // esquiva permanente contra Ninjutsu, e a Barreira que a Palma Rotativa
    // concede dura mais.
    nodeId: "hyuuga_guarda_perpetua",
    clanId: "hyuuga",
    ninjutsuDodgeBonus: 0.08,
    effectDurationBonus: { effectId: "SHIELD", bonus: 1 },
  },
  {
    nodeId: "hyuuga_apice",
    clanId: "hyuuga",
    ignoresShield: true,
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
    effectDurationBonus: { effectId: "NINJUTSU_BLOCK", bonus: 1 },
  },

  // ------------------------------------------------------------ AKIMICHI
  // Diferente de Nara (controle) e Hyuuga (perfuração), o Akimichi é o clã
  // de dano bruto — "usar o peso pra bater mais forte". Só a raiz é passiva
  // permanente (+30% de dano, sempre ativo); o ápice ("Pílula Secreta") NÃO
  // é passiva — virou skill com duração (efeito EMPOWERED) porque um +55%
  // de dano permanente de graça ficava forte demais. Ver o jutsu em
  // clans/index.ts e o nó em clan-trees/index.ts (kind: JUTSU, não PASSIVE).
  {
    nodeId: "akimichi_raiz",
    clanId: "akimichi",
    damageMult: 1.3,
    pushBonus: 1,
  },

  // ------------------------------------------------------------- ABURAME
  // Terceiro clã sem dano de graça (como Nara e Hyuuga) — a identidade e'
  // DRENAR chakra (kikaichu) e ENVENENAR (rinkaichu, os insetos de Torune),
  // nao multiplicador bruto. A raiz sobe a chance do dreno (o ramo Kikaichu,
  // que abre a arvore); o apice, ja dono dos dois ramos, estende a duracao
  // do dreno E soma chance de Veneno — cobrindo o ramo Rinkaichu que nao tem
  // passiva propria. Ver os nos em clan-trees/index.ts e as habilidades em
  // clans/index.ts.
  {
    nodeId: "aburame_raiz",
    clanId: "aburame",
    costMult: 0.9,
    effectChanceBonus: { CHAKRA_DRAIN: 0.15 },
  },
  {
    nodeId: "aburame_apice",
    clanId: "aburame",
    effectChanceBonus: { POISON: 0.15 },
    effectDurationBonus: { effectId: "CHAKRA_DRAIN", bonus: 1 },
  },

  // ------------------------------------------------------------- INUZUKA
  // Clã de trabalho em equipe com o cão ninja — nem controle puro (Nara/
  // Hyuuga/Aburame) nem dano de graça (Akimichi): a raiz fortalece o VÍNCULO
  // (custo menor + cão mais resistente, via summonHpBonus — mesmo campo que
  // Vinculo de Barro usa pro clone de Terra); o ápice e' o instinto de
  // matilha caçando presa ferida (executa alvos machucados, some chance de
  // Atordoar nas mordidas/Presas). Ver os nos em clan-trees/index.ts e as
  // habilidades em clans/index.ts.
  {
    nodeId: "inuzuka_raiz",
    clanId: "inuzuka",
    costMult: 0.9,
    summonHpBonus: 0.3,
  },
  {
    nodeId: "inuzuka_apice",
    clanId: "inuzuka",
    executeBonus: { hpThreshold: 0.3, mult: 1.3 },
    effectChanceBonus: { STUN: 0.15 },
  },

  // ------------------------------------------------------------- UZUMAKI
  // Pedido explicito: passivas de VITALIDADE e CHAKRA, mais de uma pra dar
  // sensacao de evolucao — por isso 3 passivas (nao as 2 de sempre), cada
  // uma somando um pouco mais de vida maxima/regeneracao (de vida E de
  // chakra) em cima da anterior (maxHpBonus/hpRegenPerTurn/chakraRegenPerTurn
  // de varios nos do MESMO dono somam entre si, ver characterPassiveMods em
  // services/combat/passives.ts). "Reservas do Redemoinho" (meio) e' onde o
  // chakra vasto do clã entra de verdade — o nome bate literalmente com
  // "reservas". O ápice tambem reforça a chance dos efeitos das Correntes
  // Adamantinas (dreno + prisao), fechando o ciclo vitalidade-controle.
  {
    nodeId: "uzumaki_raiz",
    clanId: "uzumaki",
    maxHpBonus: 0.08,
    costMult: 0.92,
  },
  {
    nodeId: "uzumaki_reservas",
    clanId: "uzumaki",
    maxHpBonus: 0.05,
    hpRegenPerTurn: 5,
    chakraRegenPerTurn: 6,
  },
  {
    nodeId: "uzumaki_apice",
    clanId: "uzumaki",
    maxHpBonus: 0.07,
    hpRegenPerTurn: 7,
    chakraRegenPerTurn: 4,
    effectChanceBonus: { CHAKRA_DRAIN: 0.15, ROOT: 0.15 },
  },

  // -------------------------------------------------------------- HATAKE
  // Dois ramos curtos que convergem no ápice: Matilha (Cães Ninja -> Cerco
  // da Matilha -> Elo com a Matilha) e Lâmina (só a Lâmina da Luz Branca,
  // mas de tier alto — o golpe de assinatura não precisa de uma cadeia
  // longa pra justificar o peso). A raiz cuida do vínculo com os cães
  // (summonHpBonus, mesmo campo do Inuzuka); o ápice e' o pedido explícito
  // do dano de Kenjutsu — crossCategory: "KENJUTSU" faz o bônus valer em
  // QUALQUER katana/espada (de outro clã ou de árvore genérica futura), não
  // só a Lâmina da Luz Branca, e ao mesmo tempo impede que ele encoste na
  // invocação dos cães ou no Cerco da Matilha (que são NINJUTSU do clã).
  {
    nodeId: "hatake_raiz",
    clanId: "hatake",
    costMult: 0.9,
    summonHpBonus: 0.25,
  },
  {
    nodeId: "hatake_elo_matilha",
    clanId: "hatake",
    effectChanceBonus: { ROOT: 0.15, STUN: 0.15 },
  },
  {
    nodeId: "hatake_apice",
    clanId: "hatake",
    crossCategory: "KENJUTSU",
    damageMult: 1.15, // rebalanceado: arvore do Hatake e' barata (15 PN); ver
    // "Custo total vs dano" na skill jutsu-authoring — nao pode dar dano de
    // clã caro (Akimichi/Kaguya, 38-49 PN) por preço de clã barato.
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
  },

  // ------------------------------------------------------------ HOSHIGAKI
  // Primeiro clã de Kirigakure. Diferente de Nara/Hyuuga/Aburame, o clã
  // GANHA dano de graça (raiz) — Kisame e' fisicamente monstruoso, não é um
  // clã de controle puro. A passiva do meio (tronco) e' o "instinto de
  // tubarão" (sangramento + alcance). As de Kenjutsu ficam numa RAMIFICAÇÃO
  // separada (ver clan-trees/index.ts) — pedido explícito do usuário, mas
  // o clã NÃO nasce com espada (sem jutsu de Kenjutsu aqui de propósito).
  // crossCategory: "KENJUTSU" faz o bônus valer em QUALQUER katana/espada
  // — de outro clã, de árvore genérica — não só num jutsu exclusivo do
  // Hoshigaki (que nem existe). Eram uma passiva só (+30% dano, ignora
  // Barreira, +25% execução); separei em duas mais fracas (Fio Afiado /
  // Golpe Certeiro) pra não ficar quebrado quando as duas somam.
  {
    nodeId: "hoshigaki_raiz",
    clanId: "hoshigaki",
    damageMult: 1.15,
    costMult: 0.9,
  },
  {
    nodeId: "hoshigaki_fome_voraz",
    clanId: "hoshigaki",
    effectChanceBonus: { BLEED: 0.15 },
    rangeBonus: 1,
    rangeShapes: ["CONE", "RADIUS"],
  },
  {
    nodeId: "hoshigaki_fio_afiado",
    clanId: "hoshigaki",
    crossCategory: "KENJUTSU",
    damageMult: 1.15,
  },
  {
    nodeId: "hoshigaki_golpe_certeiro",
    clanId: "hoshigaki",
    crossCategory: "KENJUTSU",
    ignoresShield: true,
    executeBonus: { hpThreshold: 0.3, mult: 1.15 },
  },

  // -------------------------------------------------------------- HOZUKI
  // Segundo clã de Kirigakure. Identidade e' o corpo líquido: raiz cura
  // sozinha aos poucos (hpRegenPerTurn, igual o Uzumaki) em vez de dar dano
  // de graça — o clã sobrevive por fluidez/regeneração, não por força bruta.
  // A passiva do meio (tronco) e' a conexão com a água do ambiente — mais
  // chance de Encharcar e mais alcance nos jutsus à distância. As de
  // Kenjutsu (Suigetsu carrega a Kubikiribōchō) ficam numa RAMIFICAÇÃO
  // separada (mesmo padrão do Hoshigaki), sem jutsu de clã que escale por
  // kenjutsu de propósito — crossCategory: "KENJUTSU" faz o bônus valer
  // em QUALQUER katana/espada, de outro clã ou de arma genérica. Já nasce
  // dividida em duas (mesma regra do Hoshigaki: uma só ficaria forte
  // demais somada).
  {
    nodeId: "hozuki_raiz",
    clanId: "hozuki",
    costMult: 0.9,
    hpRegenPerTurn: 4,
  },
  {
    nodeId: "hozuki_fluidez",
    clanId: "hozuki",
    effectChanceBonus: { WET: 0.2 },
    rangeBonus: 1,
    rangeShapes: ["SINGLE_TARGET", "LINE"],
  },
  {
    nodeId: "hozuki_lamina_liquida",
    clanId: "hozuki",
    crossCategory: "KENJUTSU",
    damageMult: 1.15,
  },
  {
    nodeId: "hozuki_corte_sem_peso",
    clanId: "hozuki",
    crossCategory: "KENJUTSU",
    ignoresShield: true,
    executeBonus: { hpThreshold: 0.3, mult: 1.15 },
  },

  // -------------------------------------------------------------- KAGUYA
  // Terceiro clã de Kirigakure. Pedido explícito: passivas de sobrevivência
  // óssea. A raiz cuida da regeneração ("recuperação acelerada, ossos novos
  // e fortes" — hpRegenPerTurn, mesmo campo do Uzumaki/Hozuki). A "armadura
  // de espinhos contra ataques físicos" virou mecânica nova de verdade
  // (meleeCounterDamage, ver services/combat/passives.ts e resolveHit() em
  // combat-engine.ts) — nao existia nenhum campo pra "devolver dano de
  // contato" como passiva permanente, so' o efeito HASTE tinha isso
  // (temporario). Fio de Osso e' a passiva de Kenjutsu (a Dança das
  // Camélias é uma espada de osso de verdade — combinada, nao dividida em
  // duas, porque o clã já tem o jutsu pra justificar o peso, igual o
  // Hatake). crossCategory: "KENJUTSU" estende o bônus pra QUALQUER
  // katana/espada, não só a Camélias. O ápice converge os dois ramos
  // (Impulso da Flor + Fio de Osso) antes da Dança da Flor.
  {
    nodeId: "kaguya_raiz",
    clanId: "kaguya",
    costMult: 0.9,
    hpRegenPerTurn: 5,
  },
  {
    nodeId: "kaguya_armadura_espinhos",
    clanId: "kaguya",
    meleeCounterDamage: 10,
  },
  {
    nodeId: "kaguya_fio_osso",
    clanId: "kaguya",
    crossCategory: "KENJUTSU",
    damageMult: 1.3,
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
  },
  {
    nodeId: "kaguya_apice",
    clanId: "kaguya",
    effectChanceBonus: { BLEED: 0.15 },
    rangeBonus: 1,
    rangeShapes: ["SINGLE_TARGET", "LINE"],
  },

  // ---------------------------------------------------------------- YUKI
  // Terceiro clã de Kirigakure. Mesmo nível de dano do Hoshigaki (raiz +15%,
  // sem multiplicador extra no ápice) — 34 PN de custo total, dano médio,
  // não o mais forte do jogo. O ápice e' puramente controle (mais chance de
  // Defesa Reduzida + Lentidão mais longa), coerente com a identidade de
  // "distração + precisão" do clã, em vez de mais um multiplicador de dano.
  {
    nodeId: "yuki_raiz",
    clanId: "yuki",
    damageMult: 1.15,
    costMult: 0.9,
  },
  {
    nodeId: "yuki_presenca",
    clanId: "yuki",
    effectChanceBonus: { DEFENSE_DOWN: 0.15 },
  },
  {
    nodeId: "yuki_reflexos",
    clanId: "yuki",
    ninjutsuDodgeBonus: 0.08,
  },
  {
    nodeId: "yuki_apice",
    clanId: "yuki",
    effectChanceBonus: { DEFENSE_DOWN: 0.1 },
    effectDurationBonus: { effectId: "SLOW", bonus: 1 },
  },

  // ------------------------------------------------------------ CHINOIKE
  // Primeiro clã de Kumogakure. Identidade dupla: Ketsuryuugan (doujutsu de
  // sangue, especialista em Genjutsu que causa dano real) e Suiton explosivo
  // (Chuva de Granizo/Bolhas de Água). A raiz é vitalidade (sangue que se
  // regenera sozinho, mesmo campo do Uzumaki/Hozuki/Kaguya). "Olhos de
  // Sangue" é a passiva pedida explicitamente pelo usuário pra abranger
  // Genjutsu fora do próprio clã — usa crossCategory pra valer em QUALQUER
  // jutsu de Genjutsu (inclusive os genéricos de fundamentos), não só a
  // Genjutsu Ketsuryuugan. "Sangue Fervente" é o contraponto: só o ramo de
  // Suiton explosivo. O ápice inverte a lógica de Olhos de Sangue — em vez
  // de largo e raso, é estreito (só a Genjutsu Ketsuryuugan) e fundo (dano
  // multiplicado de verdade), igual o padrão de Kenjutsu do Hatake/Kaguya.
  {
    nodeId: "chinoike_raiz",
    clanId: "chinoike",
    costMult: 0.9,
    hpRegenPerTurn: 4,
  },
  {
    nodeId: "chinoike_olhos_sangue",
    clanId: "chinoike",
    crossCategory: "GENJUTSU",
    effectChanceBonus: { CONFUSION: 0.1, STUN: 0.1 },
  },
  {
    nodeId: "chinoike_sangue_fervente",
    clanId: "chinoike",
    effectChanceBonus: { BURN: 0.15 },
    rangeBonus: 1,
    rangeShapes: ["RADIUS", "LINE"],
  },
  {
    nodeId: "chinoike_apice",
    clanId: "chinoike",
    damageMult: 1.15, // rebalanceado: arvore do Chinoike e' barata (29 PN); ver
    // "Custo total vs dano" na skill jutsu-authoring.
    damageMultScalingAttribute: "genjutsu",
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
  },

  // ------------------------------------------------------------ KAMAITACHI
  // Clã do vento de Suna. Mesmo nível de dano do Hoshigaki/Yuki (raiz +15%,
  // sem multiplicador extra no ápice) — 30 PN de custo total, dano médio. O
  // ápice e' controle (alcance + chance de Sangramento), coerente com a
  // identidade de precisão do Vento, em vez de mais um multiplicador de dano.
  {
    nodeId: "kamaitachi_raiz",
    clanId: "kamaitachi",
    damageMult: 1.15,
    costMult: 0.9,
  },
  {
    nodeId: "kamaitachi_corte_profundo",
    clanId: "kamaitachi",
    effectDurationBonus: { effectId: "BLEED", bonus: 1 },
  },
  {
    nodeId: "kamaitachi_lamina_viva",
    clanId: "kamaitachi",
    armorPierce: 0.2,
  },
  {
    nodeId: "kamaitachi_apice",
    clanId: "kamaitachi",
    rangeBonus: 1,
    rangeShapes: ["LINE"],
    effectChanceBonus: { BLEED: 0.1 },
  },

  // ------------------------------------------------------------ YAMANAKA
  // Clã não tem damageMult NENHUM — todas as 4 abilities do clã sao
  // baseDamage: 0 (controle/buff puro, sem dano de graca). O poder do clã
  // mora inteiro nos campos novos de controle mental (mindControlUpkeepMult/
  // mindControlNinjutsuBonus/mindTransferMaxBonus, ver ClanPassiveDef acima),
  // consumidos so' em processTurnStart/resolveHit (combat-engine.ts) — nao em
  // passiveMods() feito pros outros clas. costMult continua na raiz, igual
  // todo mundo. Ápice combina o bonus de disputa com +1 corpo simultâneo pros
  // Clones — a arvore fecha em 27 PN (perto do Hozuki, 27), coerente com "sem
  // dano bruto nenhum" na tabela de "Custo total vs dano" da skill
  // jutsu-authoring.
  {
    nodeId: "yamanaka_raiz",
    clanId: "yamanaka",
    costMult: 0.9,
    effectDurationBonus: { effectId: "CONFUSION", bonus: 1 },
  },
  {
    nodeId: "yamanaka_dominio_mental",
    clanId: "yamanaka",
    mindControlUpkeepMult: 0.8,
  },
  {
    nodeId: "yamanaka_elo_telepatico",
    clanId: "yamanaka",
    effectDurationBonus: { effectId: "HASTE", bonus: 1 },
  },
  {
    nodeId: "yamanaka_apice",
    clanId: "yamanaka",
    mindControlNinjutsuBonus: 6,
    mindTransferMaxBonus: 1,
  },

  // -------------------------------------------------------------- RAIKAGE
  // Clã de dano bruto corpo a corpo (raio + taijutsu), mesmo nível de dano de
  // raiz que Hoshigaki/Hozuki/Yuki/Kamaitachi (+15%, sem multiplicador extra
  // no ápice) — 35 PN de custo total, dano alto pro preço. O ápice é
  // execução (bate mais forte em quem já está no chão), coerente com a
  // identidade de finalizador físico do clã, em vez de mais um multiplicador
  // de dano bruto empilhado em cima da raiz.
  {
    nodeId: "raikage_raiz",
    clanId: "raikage",
    damageMult: 1.15,
    costMult: 0.9,
  },
  {
    nodeId: "raikage_apice",
    clanId: "raikage",
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
  },

  // ------------------------------------------------------------- KAMIZURU
  // Se baseia no Aburame (pedido explícito): mesma raiz (custo -10%, +15pp de
  // Dreno de Chakra) — reusa quase literalmente o texto/numeros do Aburame,
  // já que os dois clãs "são" a mesma coisa em espírito (enxame de chakra).
  // Ápice tematicamente distinto (Imobilizar em vez de Veneno na chance
  // extra, já que ROOT é o fio condutor do ramo Enxame do próprio clã).
  {
    nodeId: "kamizuru_raiz",
    clanId: "kamizuru",
    costMult: 0.9,
    effectChanceBonus: { CHAKRA_DRAIN: 0.15 },
  },
  {
    nodeId: "kamizuru_apice",
    clanId: "kamizuru",
    effectChanceBonus: { ROOT: 0.15 },
    effectDurationBonus: { effectId: "POISON", bonus: 1 },
  },

  // ---------------------------------------------------------------- SENJU
  { nodeId: "senju_vitalidade", clanId: "senju", maxHpBonus: 0.08, hpRegenPerTurn: 3 },
  { nodeId: "senju_controle_chakra", clanId: "senju", crossCategory: "NINJUTSU", costMult: 0.92 },
  { nodeId: "senju_heranca", clanId: "senju", chakraRegenPerTurn: 3 },
  { nodeId: "senju_dominio_suiton", clanId: "senju", crossElement: "AGUA", damageMult: 1.1 },
  { nodeId: "senju_dragao_mare", clanId: "senju", abilityIds: ["suiton_suiryuudan"], damageMult: 1.15, rangeBonus: 1 },
  { nodeId: "senju_muralha", clanId: "senju", abilityIds: ["suiton_suijinheki"], costMult: 0.9, effectStacksBonus: { SHIELD: 12 } },
  { nodeId: "senju_cachoeira", clanId: "senju", abilityIds: ["suiton_cachoeira"], damageMult: 1.15, rangeBonus: 1, pushBonus: 1 },
  { nodeId: "senju_chuva", clanId: "senju", abilityIds: ["suiton_choro_celestial"], damageMult: 1.15, costMult: 0.9, effectDurationBonus: { effectId: "WET", bonus: 1 } },
  { nodeId: "senju_diagnostico", clanId: "senju", crossCategory: "IRYO_NINJUTSU", costMult: 0.9 },
  { nodeId: "senju_cirurgia", clanId: "senju", crossCategory: "IRYO_NINJUTSU", criticalHealBonus: { hpThreshold: 0.35, mult: 1.25 } },
  { nodeId: "senju_imunidade", clanId: "senju", receivedEffectDurationReduction: { POISON: 1, STUN: 1 } },
  { nodeId: "senju_regenerativo", clanId: "senju", crossCategory: "IRYO_NINJUTSU", healMult: 1.15 },
  { nodeId: "senju_especialista", clanId: "senju", crossCategory: "IRYO_NINJUTSU", healMult: 1.15, costMult: 0.9 },
];

const CLAN_PASSIVE_INDEX: Map<string, ClanPassiveDef> = new Map(CLAN_PASSIVES.map((p) => [p.nodeId, p]));

export function getClanPassive(nodeId: string): ClanPassiveDef | undefined {
  return CLAN_PASSIVE_INDEX.get(nodeId);
}
