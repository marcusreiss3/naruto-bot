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
  // multiplica o dano dos jutsus de clã (1.3 = +30%). Todo clã OFENSIVO tem
  // um, escalado pelo custo total da arvore em PN (arvore cara entrega mais
  // dano — ver "Custo total vs dano" na skill jutsu-authoring), e descontado
  // quando o clã ja' paga em largura de kit (Raikage). Clã de SUPORTE puro
  // (Nara, Aburame, Uzumaki, Kamizuru, Hozuki) segue sem nenhum: eles ganham
  // por controle/dreno, nao por multiplicador bruto.
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
  // esquiva geral (qualquer ataque, qualquer reação) — ver o mesmo campo em
  // element-trees/passives.ts.
  dodgeBonus?: number;
  // casas extras na ação de movimento do personagem. Aplicado antes de
  // lentidão/terreno pelo mesmo agregador das passivas gerais de Taijutsu.
  moveBonus?: number;
  // ESCAPE HATCH do gate normal de clanId: quando presente, esta passiva
  // vale pra QUALQUER ability desta categoria (ex: "GENJUTSU"), mesmo sem
  // clanId nenhum ou de OUTRO cla/arvore de fundamentos — nao so' as do
  // proprio dono. Pedido explicito do Chinoike: os olhos de sangue leem
  // qualquer ilusao que o personagem conjure, nao so' a Genjutsu Ketsuryuugan
  // do proprio cla. Ver passiveMods() em services/combat/passives.ts.
  // aceita array quando a passiva precisa valer pra mais de uma categoria —
  // ver o mesmo campo em element-trees/passives.ts.
  crossCategory?: Category | Category[];
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
  // acumulos extras de Queimadura por acerto — mesmo campo que Brasas
  // Persistentes (Fogo) ja usa em element-trees/passives.ts; aqui e' a
  // versao de clã (Sarutobi).
  extraBurnStacks?: number;
  // vento cruzando chamas propaga fogo — mesmo campo que Vento em Brasa
  // (Vento) ja usa em element-trees/passives.ts; aqui e' a versao de clã
  // (Sarutobi), concedida sem precisar comprar o no' elemental equivalente.
  spreadsBurn?: boolean;
  // rodadas extras no terreno criado pelos jutsus de clã (muro, pantano) —
  // mesmo campo que Terreno Firme (Terra) ja usa em element-trees/passives.ts;
  // aqui e' a versao de clã (Sarutobi).
  terrainDurationBonus?: number;
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
  // O clã ganha por ATRAVESSAR defesa (perfura Barreira, ignora escudo) e por
  // SELAR chakra (Bloqueio de Ninjutsu), porque o Punho Suave sempre foi
  // descrito como "atinge por dentro" no material de origem. A raiz é passiva
  // (percepção do clã, ativa mesmo sem o Byakugan ligado); o ápice é o
  // pagamento do Punho Suave: ele ignora Barreira e finaliza melhor alvos já
  // feridos. Essas três coisas seguem sendo a identidade — o que mudou é que
  // elas deixaram de ser o UNICO pagamento: a raiz agora também multiplica
  // dano (ver a nota nela), porque sem isso o clã ficava em último lugar.
  {
    nodeId: "hyuuga_raiz",
    clanId: "hyuuga",
    // 1.45 (37 PN, na curva do Raikage/Kaguya). O cla passou muito tempo em
    // 1.00x apostando so' em ATRAVESSAR defesa (ignoresShield + execucao +
    // Bloqueio de Ninjutsu) — ver o comentario acima. Medido depois do
    // rebalanceamento dos clas de dano, isso deixou o Hyuuga com pico 36
    // contra 41-70 dos outros: ultimo lugar. Perfuracao vale contra Terra e
    // contra quem usa escudo, mas nao cobre 40% de dano a menos contra o
    // resto do jogo. A identidade continua nos outros tres campos; o
    // multiplicador so' o poe na curva.
    damageMult: 1.15,
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
    damageMult: 1.2,
    ignoresShield: true,
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
    effectDurationBonus: { effectId: "NINJUTSU_BLOCK", bonus: 1 },
  },

  // ------------------------------------------------------------------ LEE
  // A raiz entrega o bônus pequeno e universal pedido; os ramos seguintes
  // não empilham dano geral, só melhoram grupos definidos do Punho Forte.
  { nodeId: "lee_raiz", clanId: "lee", crossCategory: "TAIJUTSU", damageMult: 1.05, maxHpBonus: 0.05 },
  { nodeId: "lee_folha_furacao", clanId: "lee", abilityIds: ["tai_furacao_folha", "tai_vendaval_folha", "tai_grande_furacao_folha"], damageMult: 1.10 },
  { nodeId: "lee_entrada_dinamica", clanId: "lee", abilityIds: ["tai_entrada_dinamica", "tai_acao_dinamica", "tai_vento_ascendente_folha"], damageMult: 1.10 },
  { nodeId: "lee_pesos", clanId: "lee", abilityIds: ["tai_furacao_folha", "tai_entrada_dinamica", "tai_vendaval_folha", "tai_acao_dinamica", "tai_grande_furacao_folha", "tai_vento_ascendente_folha", "tai_luz_rotatoria_folha", "tai_rajada_leoes", "tai_lotus_frontal", "tai_lotus_oculta"], costMult: 0.90 },
  { nodeId: "lee_lotus", clanId: "lee", abilityIds: ["tai_rajada_leoes", "tai_lotus_frontal", "tai_lotus_oculta"], damageMult: 1.12 },
  { nodeId: "lee_condicionamento", clanId: "lee", maxHpBonus: 0.05 },
  { nodeId: "lee_recuperacao", clanId: "lee", hpRegenPerTurn: 2 },
  { nodeId: "lee_passos", clanId: "lee", moveBonus: 1 },
  { nodeId: "lee_reflexos", clanId: "lee", dodgeBonus: 0.03 },

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
    // 1.60: arvore mais cara do jogo (49 PN) e o cla explicitamente de dano
    // bruto, entao ele encabeca a curva de dano de cla. Ver a nota de
    // rebalanceamento no fim do arquivo.
    damageMult: 1.25,
    pushBonus: 1,
  },
  {
    nodeId: "akimichi_conversao_calorica",
    clanId: "akimichi",
    damageMult: 1.25,
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
    // 1.50 novo: a arvore custa 46 PN (2a mais cara) e tem 5 jutsus de dano,
    // mas entregava 1.00x — furava a relacao "arvore cara entrega dano" que o
    // resto do arquivo segue. O bonus entra no VINCULO (raiz) porque e' a
    // matilha atacando junto, nao forca bruta do ninja sozinho.
    damageMult: 1.2,
    costMult: 0.9,
    summonHpBonus: 0.3,
  },
  {
    nodeId: "inuzuka_apice",
    clanId: "inuzuka",
    damageMult: 1.2,
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
    damageMult: 1.2,
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
    damageMult: 1.1,
    costMult: 0.9,
    hpRegenPerTurn: 4,
  },
  {
    nodeId: "hozuki_fluidez",
    clanId: "hozuki",
    damageMult: 1.1,
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
    damageMult: 1.15,
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
    executeBonus: { hpThreshold: 0.3, mult: 1.25 },
  },
  {
    nodeId: "kaguya_apice",
    clanId: "kaguya",
    damageMult: 1.15,
    effectChanceBonus: { BLEED: 0.15 },
    rangeBonus: 1,
    rangeShapes: ["SINGLE_TARGET", "LINE"],
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
    damageMult: 1.15,
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
    damageMult: 1.2,
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
    // O arsenal inteiro tambem recebe Vento. Dois bonus modestos evitam que
    // a arvore barata volte a ser o maior pico/PN quando ambos se combinam.
    damageMult: 1.05,
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
    damageMult: 1.05,
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
    // o Raikage entrega 7 jutsus, 4 tipos de efeito e 2 utilidades pelo mesmo
    // preco, entao paga o kit largo com multiplicador menor.
    costMult: 0.9,
  },
  {
    nodeId: "raikage_apice",
    clanId: "raikage",
    damageMult: 1.1,
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
  { nodeId: "senju_controle_chakra", clanId: "senju", crossCategory: "NINJUTSU", costMult: 0.92, chakraRegenPerTurn: 3 },
  { nodeId: "senju_heranca", clanId: "senju", maxHpBonus: 0.05, hpRegenPerTurn: 5 },
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

  // -------------------------------------------------------------- SARUTOBI
  // "O Professor": sem jutsu proprio, entao os 5 nos crossElement (1 por
  // natureza basica) tinham TODOS o mesmo truque (+20% de dano) — nao tem
  // identidade nenhuma, so' 5 copias do mesmo numero pintadas de cores
  // diferentes. Reescrito pra cada natureza roubar um mecanismo DIFERENTE
  // do que ja existe no jogo (o mesmo espirito da Lâmina da Luz Branca do
  // Hatake: nao e' "+X% de dano", e' um comportamento novo emprestado de
  // outro lugar) — coerente com Hiruzen ser o unico shinobi a dominar as
  // cinco naturezas: cada uma vira um truque de mestre, nao um numero.
  // sarutobi_raiz NAO entra aqui: e' um marcador de mecanica (dobra o
  // sorteio de elemento em buyNode), nao um modificador de combate.
  {
    // Fogo do Professor: mesmo truque de Brasas Persistentes (fogo_brasas),
    // so' que de graça — cada acerto de Katon crava 1 acumulo de Queimadura
    // a mais, empurrando o alvo mais rapido pra explosao (burnExplodeAtStacks).
    nodeId: "sarutobi_katon",
    clanId: "sarutobi",
    crossElement: "FOGO",
    extraBurnStacks: 1,
  },
  {
    // Vento que Aviva as Chamas: a combinacao canonica de Hiruzen (a Bola de
    // Fogo do Dragao usa Fuuton pra alimentar o Katon) — mesmo campo que
    // Vento em Brasa (vento_brasa) usa na propria arvore de Vento, so' que
    // concedido aqui sem precisar comprar aquele no'.
    nodeId: "sarutobi_futon",
    clanId: "sarutobi",
    crossElement: "VENTO",
    spreadsBurn: true,
  },
  {
    // Trovao Certeiro: controle puro em vez de dano — chance extra de
    // Atordoar, menor que a Sobrecarga (raio_sobrecarga, +20pp) do proprio
    // Raio de proposito (nerf pedido pelo usuario: 25pp -> 10pp).
    nodeId: "sarutobi_raiton",
    clanId: "sarutobi",
    crossElement: "RAIO",
    effectChanceBonus: { STUN: 0.1 },
  },
  {
    // Correnteza Perene: economia de chakra, nao dano — nerf pedido pelo
    // usuario (20% -> 10%), fica um pouco abaixo do desconto da propria raiz
    // de Agua (agua_raiz, -15%).
    nodeId: "sarutobi_suiton",
    clanId: "sarutobi",
    crossElement: "AGUA",
    costMult: 0.9,
  },
  {
    // Muralha do Professor: as paredes, cupulas e pantanos de Terra do
    // personagem duram mais tempo em campo — dobro do bonus de Terreno Firme
    // (terra_firme, +1 rodada) da propria arvore de Terra.
    nodeId: "sarutobi_doton",
    clanId: "sarutobi",
    crossElement: "TERRA",
    terrainDurationBonus: 2,
  },

  // ----------------------------------------------------------------- ONOKI
  // Numeros COPIADOS do ramo de Água do Senju (senju_dominio_suiton/
  // senju_cachoeira/senju_muralha, ver acima) — mesmo crossElement
  // damageMult 1.1, mesmo push/alcance +1, mesmo costMult 0.9 — so' que
  // divididos entre Terra E Poeira em vez de concentrados num elemento so'.
  { nodeId: "onoki_raiz", clanId: "onoki", maxHpBonus: 0.08, hpRegenPerTurn: 3 },
  { nodeId: "onoki_doton", clanId: "onoki", crossElement: "TERRA", damageMult: 1.1 },
  { nodeId: "onoki_jinton", clanId: "onoki", crossElement: "POEIRA", damageMult: 1.1 },
  { nodeId: "onoki_peso_montanha", clanId: "onoki", crossElement: "TERRA", pushBonus: 1, rangeBonus: 1 },
  { nodeId: "onoki_particula_primordial", clanId: "onoki", crossElement: "POEIRA", costMult: 0.9 },

  // --------------------------------------------------------------- YOTSUKI
  // Numeros baseados no ramo de Água do Senju (crossElement 1.1x na raiz do
  // ramo, abilityIds especificos 1.15x + utilidade dali em diante). Diferente
  // do Senju, aqui as 4 passivas de Raio miram tecnicas ESPECIFICAS via
  // abilityIds (pedido explicito: "não só o elemento... só em si"), NUNCA
  // raiton_kirin (pedido explicito de exclusao — o apice da arvore de Raio
  // fica de fora de proposito). O par de Kenjutsu continua em seu proprio
  // ramo, separado da linha que melhora as quatro tecnicas eletricas.
  { nodeId: "yotsuki_raiz", clanId: "yotsuki", maxHpBonus: 0.08, hpRegenPerTurn: 3 },
  { nodeId: "yotsuki_raiton", clanId: "yotsuki", crossElement: "RAIO", damageMult: 1.1 },
  { nodeId: "yotsuki_esfera", clanId: "yotsuki", abilityIds: ["raiton_esfera_relampago"], damageMult: 1.15, effectChanceBonus: { STUN: 0.15 } },
  { nodeId: "yotsuki_kenjutsu_1", clanId: "yotsuki", crossCategory: "KENJUTSU", damageMult: 1.15 },
  { nodeId: "yotsuki_pilares", clanId: "yotsuki", abilityIds: ["raiton_prisao_quatro_pilares"], damageMult: 1.15, rangeBonus: 1 },
  { nodeId: "yotsuki_kenjutsu_2", clanId: "yotsuki", crossCategory: "KENJUTSU", ignoresShield: true, executeBonus: { hpThreshold: 0.3, mult: 1.15 } },
  { nodeId: "yotsuki_armadura", clanId: "yotsuki", abilityIds: ["raiton_armadura_ataque_relampago"], costMult: 0.9, effectDurationBonus: { effectId: "HASTE", bonus: 1 } },
  { nodeId: "yotsuki_assassinato", clanId: "yotsuki", abilityIds: ["raiton_assassinato_eletromagnetico"], damageMult: 1.15, armorPierce: 0.2 },

  // ---------------------------------------------------------------- BAKUREI
  // Hibrido Onoki (dual crossElement, 1.1x cada) + Yotsuki (abilityIds
  // especificos, 1.15x + utilidade). Terra e Explosão, nunca o apice de
  // nenhuma das duas arvores (terra_golem/explosao_mina fora de proposito).
  // Raiz e' so' vida maxima (nao vida+regen como Senju/Onoki/Yotsuki) — um
  // pouco mais forte no unico numero que tem (10% contra o 8% padrao) pra
  // compensar nao vir com hpRegenPerTurn junto. Pedido explicito do usuario:
  // nada de mecanica nova aqui, so' "mais vida, um pouco mais que antes".
  { nodeId: "bakurei_raiz", clanId: "bakurei", maxHpBonus: 0.1 },
  { nodeId: "bakurei_doton", clanId: "bakurei", crossElement: "TERRA", damageMult: 1.1 },
  { nodeId: "bakurei_bakuton", clanId: "bakurei", crossElement: "EXPLOSAO", damageMult: 1.1 },
  { nodeId: "bakurei_punho_rochoso", clanId: "bakurei", abilityIds: ["doton_punho_rochoso"], damageMult: 1.15, effectStacksBonus: { SHIELD: 8 } },
  { nodeId: "bakurei_impacto", clanId: "bakurei", abilityIds: ["explosao_impacto"], damageMult: 1.15, pushBonus: 1 },
  { nodeId: "bakurei_dragao_terra", clanId: "bakurei", abilityIds: ["doton_dragao"], damageMult: 1.15, effectDurationBonus: { effectId: "SLOW", bonus: 1 } },
  { nodeId: "bakurei_cortina", clanId: "bakurei", abilityIds: ["explosao_cortina_fumaca"], costMult: 0.9, terrainDurationBonus: 1 },
  { nodeId: "bakurei_cupula", clanId: "bakurei", abilityIds: ["doton_cupula"], costMult: 0.9, effectDurationBonus: { effectId: "CHAKRA_DRAIN", bonus: 1 } },

  // ------------------------------------------------------------------ YUKI
  // Clã reconstruido do zero (o antigo kit virou o kekkei genkai Gelo, ver
  // element-trees/passives.ts) — mesmo hibrido Onoki+Yotsuki: dual
  // crossElement (Água + Gelo, 1.1x cada) e DOIS ramos simetricos de
  // abilityIds (2 Água + 2 Gelo, pedido explicito do usuario — Ondas
  // Furiosas saiu pra abrir espaço pras 2 novas de Gelo), numeros copiados
  // do ramo de Água do Senju.
  { nodeId: "yuki_raiz", clanId: "yuki", crossCategory: "NINJUTSU", costMult: 0.92 },
  { nodeId: "yuki_agua", clanId: "yuki", crossElement: "AGUA", damageMult: 1.1 },
  { nodeId: "yuki_hyoton", clanId: "yuki", crossElement: "GELO", damageMult: 1.1 },
  { nodeId: "yuki_prisao", clanId: "yuki", abilityIds: ["suiton_prisao"], costMult: 0.9, effectDurationBonus: { effectId: "WET", bonus: 1 } },
  { nodeId: "yuki_dragao", clanId: "yuki", abilityIds: ["suiton_suiryuudan"], damageMult: 1.15, rangeBonus: 1 },
  { nodeId: "yuki_espelho_amplificado", clanId: "yuki", abilityIds: ["gelo_espelho"], damageMult: 1.15, effectChanceBonus: { DEFENSE_DOWN: 0.1 } },
  { nodeId: "yuki_chuva_amplificada", clanId: "yuki", abilityIds: ["gelo_chuva_agulhas"], damageMult: 1.15, effectDurationBonus: { effectId: "SLOW", bonus: 1 } },

  // ------------------------------------------------------------ BUKIJUTSU
  // Catálogo genérico: o clanId serve apenas para o formato comum das
  // passivas; crossCategory faz o bônus valer para a escola de armas.
  { nodeId: "buki_fundamentos", clanId: "bukijutsu", crossCategory: "BUKIJUTSU", damageMult: 1.15 },
  {
    nodeId: "buki_manipulacao_fios", clanId: "bukijutsu",
    abilityIds: ["buki_moinho", "buki_meteoro_anexado", "buki_camara_tortura"],
    damageMult: 1.1,
  },
  {
    nodeId: "buki_arsenal_selado", clanId: "bukijutsu",
    abilityIds: ["buki_dragoes_gemeos", "buki_esfera_explosiva", "buki_cadeia_desastre"],
    costMult: 0.9,
  },
  {
    nodeId: "buki_lamina_chakra", clanId: "bukijutsu",
    abilityIds: ["item_lamina_chakra_cortar", "buki_voo_andorinha"], armorPierce: 0.2,
  },
  {
    nodeId: "buki_maestria_arremesso", clanId: "bukijutsu",
    abilityIds: [
      "item_kunai_arremessar",
      "item_shuriken_arremessar",
      "item_fuma_shuriken_arremessar",
      "item_senbon_arremessar",
      "item_kunai_explosiva_arremessar",
      "buki_moinho",
      "buki_dragoes_gemeos",
      "buki_clone_shuriken",
      "buki_esfera_explosiva",
      "buki_cadeia_desastre",
    ],
    damageMult: 1.15, rangeBonus: 1, rangeShapes: ["SINGLE_TARGET", "LINE", "RADIUS"],
  },
  {
    nodeId: "buki_resma_explosiva", clanId: "bukijutsu",
    abilityIds: ["buki_esfera_explosiva", "item_kunai_explosiva_arremessar"], damageMult: 1.2,
  },
  // --------------------------------------------------------- IRYO NINJUTSU
  // Árvore genérica: crossCategory permite que os nós funcionem sem exigir
  // um clã específico, como já acontece com Bukijutsu acima.
  // Desconto de custo do Iryo: eram 4 nos (1 geral + 3 amarrados a tecnicas
  // especificas), que empilhavam ate' -23,5% numa tecnica so'. Virou UM no'
  // geral de -12% em tudo — teto bem menor e sem nada escondido.
  { nodeId: "iryo_antidoto_eficiente", clanId: "iryo", crossCategory: "IRYO_NINJUTSU", costMult: 0.88 },
  { nodeId: "iryo_cura_precisa", clanId: "iryo", crossCategory: "IRYO_NINJUTSU", healMult: 1.1 },
  { nodeId: "iryo_cura_critica", clanId: "iryo", crossCategory: "IRYO_NINJUTSU", criticalHealBonus: { hpThreshold: 0.35, mult: 1.2 } },
  // Triagem Rapida absorveu o +1 de alcance da antiga "Anatomia de Combate"
  // (que so' valia no Choque): a lista abaixo e' a UNIAO exata das duas, sem
  // ganhar escopo novo.
  { nodeId: "iryo_triagem_rapida", clanId: "iryo", abilityIds: ["iryo_desintoxicacao", "iryo_hemostatica", "iryo_mosquitos", "iryo_yin", "iryo_choque_desorientacao"], rangeBonus: 1 },
  { nodeId: "iryo_lamina_estavel", clanId: "iryo", abilityIds: ["iryo_bisturi"], effectDurationBonus: { effectId: "EMPOWERED", bonus: 1 } },
  { nodeId: "iryo_sinapses_caoticas", clanId: "iryo", abilityIds: ["iryo_choque_desorientacao"], effectDurationBonus: { effectId: "CONFUSION", bonus: 1 } },
];

const CLAN_PASSIVE_INDEX: Map<string, ClanPassiveDef> = new Map(CLAN_PASSIVES.map((p) => [p.nodeId, p]));

export function getClanPassive(nodeId: string): ClanPassiveDef | undefined {
  return CLAN_PASSIVE_INDEX.get(nodeId);
}
