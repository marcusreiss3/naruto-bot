import type {
  ActionType,
  Attribute,
  Category,
  Element,
  Rank,
  Shape,
  EffectId,
  TerrainKind,
} from "../config/enums.js";

export interface AppliedEffect {
  effectId: EffectId;
  stacks?: number;
  duration?: number;
  chance?: number; // 0..1, default 1
  // Efeitos empilháveis (ex: SHIELD) normalmente SOMAM stacks vindos de
  // qualquer fonte. Um `replaceGroup` marca "isto é uma FORMA/estado, não um
  // reforço" — ao reaplicar, substitui só a própria contribuição anterior do
  // mesmo grupo (ex: Super Tamanho Múltiplo troca a Barreira do Tamanho
  // Múltiplo em vez de somar), mas Barreira de outras fontes/grupos continua
  // somando normalmente. Ver applyEffect() em combat-engine.ts.
  replaceGroup?: string;
  // Quando ESTE efeito expirar (duração chega a 0), aplica outro efeito no
  // mesmo alvo — ex: a Sobrecarga (EMPOWERED) da Pílula Secreta vira Defesa
  // Reduzida quando passa: o corpo cobra o preço depois do surto de força.
  onExpire?: { effectId: EffectId; stacks?: number; duration?: number };
  // Restringe a QUEM a Sobrecarga (EMPOWERED) vale, pra nao inflar dano sem
  // relacao com a fantasia da skill (ex: virar lobo nao deveria turbinar um
  // jutsu elemental sem nada a ver). So' tem efeito quando effectId ===
  // "EMPOWERED"; omitido = vale pra qualquer dano, como antes.
  //   "physical" -> categorias TAIJUTSU/KENJUTSU
  //   "taijutsu" -> somente TAIJUTSU (ex: Bisturi de Chakra nas maos)
  //   "ninjutsu" -> qualquer NINJUTSU (ex: Casulo de Insetos)
  //   "clan"     -> so' jutsu que exigem o MESMO cla de quem concedeu o
  //     efeito (Casulo do Aburame: so' golpes que exigem clanId "aburame",
  //     cobrindo a Mordida de Inseto mesmo sendo categoria NINJUTSU)
  empoweredScope?: "physical" | "taijutsu" | "ninjutsu" | "clan";
  // Alem de `stacks` fixo, soma round(hpMax * hpPercentStacks) de quem RECEBE
  // o efeito no momento da aplicacao. Usado pela Barreira (SHIELD) pra escalar
  // com o jogo em vez de ficar num numero fixo pra sempre — `stacks` vira o
  // piso minimo, isto soma por cima. So' faz sentido em efeitos empilhaveis
  // tipo SHIELD; omitido = comportamento antigo (so' o `stacks` fixo).
  hpPercentStacks?: number;
}

export interface AbilityRequirements {
  level?: number;
  attributes?: Partial<Record<Attribute, number>>;
  // Basta cumprir um dos atributos listados. Útil para fundamentos que podem
  // ser aprendidos por disciplinas equivalentes, como Aparo por Buki ou Ken.
  anyAttribute?: Partial<Record<Attribute, number>>;
  element?: Element;
  clanId?: string;
  // se true, nao desbloqueia por requisito automatico (so admin/arma/pergaminho)
  manualOnly?: boolean;
  // pre-requisito de OUTRO jutsu: so' pode USAR esta ability se ja conhecer o
  // jutsu com este id (checado ao vivo via ownedJutsuIds em useAbility, nao
  // so' no desbloqueio). Ex: Tecnica do Clone da Sombra de Shuriken exige
  // conhecer Clones das Sombras primeiro (a variante com arma parte do
  // principio da tecnica base).
  requiresAbilityId?: string;
}

export interface Ability {
  id: string;
  name: string;
  category: Category;
  element?: Element;
  tier: number;
  // recurso e custo base (antes da maestria)
  resource: "chakra" | "energia";
  cost: number; // percentual base
  actionType: ActionType;
  // Custo adicional de ação no mesmo turno, quando a técnica combina duas categorias.
  additionalActionType?: Exclude<ActionType, "REACAO">;
  baseDamage?: number;
  baseHeal?: number;
  // junto do baseHeal, tambem devolve recurso pro alvo curado (ex: Regeneracao
  // de Vigor do Uzumaki, que "energiza rapidamente" quem cura, nao so fecha
  // ferimento). Independente do `resource` que a PROPRIA ability gasta pra
  // ser usada.
  restoreResource?: { resource: "chakra" | "energia"; amount: number };
  // atributo que escala dano/cura
  scalingAttribute?: Attribute;
  range: number; // em celulas; 0 = self/melee adjacente
  shape: Shape;
  effects?: AppliedEffect[];
  // Efeitos que sempre vao pro PROPRIO ATOR quando a habilidade e' usada com
  // sucesso, independente de `shape`/alvo/acerto. Existe pra ataques que
  // tambem concedem um buff defensivo a quem os usa (ex: Parede de Terra e
  // Punho Rochoso dao Barreira a quem golpeia, nao a quem apanha) — `effects`
  // sozinho aplicaria isso no ALVO atingido, o que nunca e' a intencao.
  selfEffects?: AppliedEffect[];
  // remove efeitos do alvo (Iryo)
  cleanses?: EffectId[];
  // Reduz a duração dos efeitos sem removê-los necessariamente. Usado por
  // tratamentos médicos que aliviam uma condição, mas não a curam por inteiro.
  reduceEffectDuration?: { effectId: EffectId; turns: number }[];
  requirements?: AbilityRequirements;
  tags: string[];
  description: string;
  // Texto exclusivamente narrativo para o modal. Quando ausente, a descrição
  // antiga é filtrada para separar ambientação das regras.
  visualDescription?: string;
  // Ferramentas exigidas pela técnica. `consume` remove a quantidade da
  // mochila somente depois que todas as validações da ação passam.
  requiredItems?: { itemId: string; amount: number; consume?: boolean; exhaustToItemId?: string }[];
  // Ao menos um destes itens precisa estar equipado.
  equippedItemIds?: string[];
  // Técnica contínua ligada/desligada por comando. Estes dados também
  // alimentam a apresentação uniforme na árvore.
  toggleRules?: {
    command: string;
    dodgeBonus: number;
    upkeepPerTurn: number;
    disablesWithoutResource?: boolean;
    cloneDodgeReduction?: number;
  };
  // Portões internos: toggle de ação bônus com buff de Taijutsu e desgaste
  // fixo de HP no início de cada turno. O número do portão permite ampliar a
  // progressão sem criar um efeito novo para cada estágio.
  gateRules?: {
    command: string;
    gate: number;
    taijutsuDamageMult: number;
    selfDamagePerTurn: number;
    energyRecoveryPerTurn?: number;
  };
  // Alguns golpes dos Portões só podem ser executados enquanto o estágio
  // correspondente estiver aberto.
  requiresActiveGate?: number;
  // Alguns finalizadores de clã só existem enquanto o modo que os habilita
  // ainda está ativo (ex.: Modo Borboleta e Lobo de Três Cabeças).
  requiresActiveEffectFromAbilityId?: string;
  // flags especiais
  unblockable?: boolean;
  undodgeable?: boolean;
  // impede APENAS Bloquear/Aparar como reacao — Esquiva continua valendo.
  // Diferente de unblockable (mata as 3 reacoes) e undodgeable (mata so a
  // esquiva). Ex: Shintenshin no Jutsu (Yamanaka) — nao da pra "bloquear com
  // os bracos" uma transferencia de mente, so esquivar dela.
  unguardable?: boolean;
  // ao acertar (nao esquivado), concede controle mental do corpo do alvo em
  // vez de causar dano — ver establishControl() em combat-engine.ts. Pensada
  // pra abilities com baseDamage: 0 (captura, nao machuca). O multiplicador
  // de dano reduzido enquanto PILOTANDO um corpo emprestado nao mora aqui —
  // e' estado continuo (BALANCE.yamanaka.pilotedDamageMult), avaliado a cada
  // golpe enquanto actor.controlledById estiver setado.
  mindTransfer?: boolean;
  // quantos corpos essa ability pode controlar AO MESMO TEMPO por atacante
  // (establishControl rejeita alem do teto). Omitido = 1 (Shintenshin classico).
  // Ex: Clones de Transferencia de Mente (Yamanaka) = 3.
  mindTransferMax?: number;
  // se definido, o controle expira sozinho apos N turnos DO CORPO CONTROLADO
  // (sem a disputa por Genjutsu de yamanakaResistChance) — ver
  // processTurnStart em combat-engine.ts. Omitido = disputa normal por turno.
  mindTransferTurns?: number;
  // so' vale em shape SELF: em vez de buffar so' o ator, aplica `effects`
  // tambem em ate' `teamBuffMax` aliados vivos mais proximos (rede telepatica
  // do Yamanaka) — ver bloco SELF em useAbility, combat-engine.ts.
  teamBuff?: boolean;
  // teto de destinatarios do teamBuff, CONTANDO o proprio ator. Omitido = 1
  // (so' o ator, igual buff SELF normal). Ex: Transmissao de Mentes = 3.
  teamBuffMax?: number;
  // reacao PARRY contra jutsu de categoria BUKIJUTSU: em vez de reduzir o
  // dano, redireciona o golpe inteiro de volta no atacante (Explosao Defensiva)
  reflectsProjectiles?: boolean;
  // bonus fixo de esquiva (pontos percentuais 0..1) quando usada como reacao
  // DODGE (Tecnica de Substituicao)
  reactionDodgeBonus?: number;
  // marca reacoes DODGE que sao logro visual/corpo-falso (Substituicao,
  // Clones de Inseto) — Byakugan ativo no atacante enxerga atraves disso e
  // corta o reactionDodgeBonus (ver byakuganCloneSightMult em balance.ts).
  // NAO marcar reacoes que sao o corpo de verdade mudando (ex: Hidratacao).
  isCloneTrick?: boolean;
  // ignora obstaculos, arvores e fumaca na validacao da linha de visao
  pierceObstacles?: boolean;
  // exige um alvo inicial Encharcado e salta para todos os outros Encharcados
  chainWetTargets?: boolean;
  // exige chamas ativas no campo ou a passiva que forma nuvens de tempestade
  requiresStorm?: boolean;
  // exige uma invocacao viva do proprio ator em campo (flags.isSummon +
  // summonerId === ator) — ex: as tecnicas de combo do cao ninja (Inuzuka)
  // que nao funcionam se o cao ja morreu na luta.
  requiresPet?: boolean;
  // exige que o ALVO ja esteja sob pelo menos um destes efeitos pra poder
  // usar esta ability nele (captura previa) — mesma ideia do chainWetTargets,
  // generalizada. Ex: Genjutsu: Interrogatorio so funciona numa vitima ja
  // Imobilizada (ROOT) ou Atordoada (STUN) por outra tecnica.
  requiresTargetEffect?: EffectId[];
  // exige que o PROPRIO ator esteja com um dojutsu de toggle ligado no
  // momento do uso (ex: Palma de Vacuo do Hyuuga usa o Byakugan como mira;
  // Genjutsu Ketsuryuugan do Chinoike E' o proprio doujutsu agindo). O `flag`
  // bate com a chave em ParticipantRow.flags que /combate byakugan|ketsuryuugan
  // liga/desliga (ex: "byakuganActive"); `label` e' so' pra mensagem de erro.
  requiresActiveDoujutsu?: { flag: string; label: string };
  // pode ser usada uma unica vez por combate
  oncePerCombat?: boolean;
  reactionKind?: "BLOCK" | "DODGE" | "PARRY" | "JUTSU";
  // Dano aplicado ao atacante quando esta reação PARRY é bem-sucedida.
  counterDamage?: { baseDamage: number; scalingAttribute?: Attribute };
  // terreno que o jutsu deixa nas celulas atingidas (chamas, agua, muro, fumaca, pantano)
  terrain?: {
    kind: TerrainKind;
    duration?: number; // rodadas; padrao BALANCE.terrain.defaultDuration
  };
  // SELF: raio opcional do terreno criado em volta do usuário.
  selfTerrainRadius?: number;
  // SELF: efeito aplicado nos inimigos próximos sem ser um ataque de dano.
  nearbyEnemyEffect?: { effectId: EffectId; radius: number; duration: number };
  // remove um tipo de terreno das celulas atingidas (ex: fogo evapora agua)
  clearsTerrain?: TerrainKind;
  // desloca o alvo: >0 empurra p/ longe, <0 puxa p/ perto (em casas)
  push?: number;
  // invoca um aliado no grid (clone, golem). Ele age no turno com a IA de NPC.
  summon?: {
    templateId: string; // NpcTemplate usado como corpo da invocacao
    // vida proporcional a do invocador em vez do hpMax fixo do template (ex:
    // cao ninja do Inuzuka = 1/3 da vida do dono). Quando presente, IGNORA
    // tpl.hpMax; quando ausente, comportamento antigo (hpMax fixo).
    hpFraction?: number;
    // quantas copias do template invocar de uma vez (ex: a matilha de ninken
    // do Hatake — "varios caes", nao um so). Omitido = 1, comportamento antigo.
    count?: number;
    // clone reativo: ao sofrer dano, desfaz-se e pune quem o acertou
    onHit?: { effectId: EffectId; duration?: number };
    // o que acontece quando a invocacao morre (clone d'agua estoura molhando).
    // `stacks` e' especialmente importante para Barreira: representa a vida
    // do escudo concedido, em vez de depender do valor padrao de 1.
    onDeath?: { effectId: EffectId; radius: number; duration?: number; stacks?: number; hpPercentStacks?: number };
    // teto de invocacoes VIVAS deste mesmo templateId por invocador. Uma nova
    // criacao acima do teto e' recusada em useAbility (ver createSummon), mas
    // repor uma que morreu volta a ser permitido. Ex: Clones das Sombras (ate' 6).
    maxAlive?: number;
    // em vez do NpcTemplate.abilityIds fixo, a invocacao herda um snapshot dos
    // jutsu que o PROPRIO invocador ja possui no momento da criacao (ver
    // ownedJutsuIds em combat-engine.ts), filtrado a `maxCostPct` (custo base
    // da ability, sem maestria). Ex: Clones das Sombras usam o que o jogador
    // sabe, mas nao os jutsus mais caros que 35% de chakra.
    inheritOwnerJutsu?: { maxCostPct: number };
    // a invocacao entra no grid e pode se mover nesta rodada, mas so' pode
    // ATACAR a partir da rodada seguinte a que foi criada (ver firstActiveRound
    // em createSummon() e runNpcTurn() em npc-combat.ts).
    actsNextRound?: boolean;
    // ao morrer: reflete no invocador `overkillDamagePct` do dano que
    // EXCEDEU o hpMax da invocacao (ex: invocacao com 1 de vida toma 20 de
    // dano -> excedente 19), e cobra do invocador `jutsuCostPct` do custo
    // BASE de cada jutsu que a invocacao usou em vida (acumulado em
    // flags.chakraDebt a cada uso, cobrado de uma vez na morte). Ex: Clones
    // das Sombras (30%/30%).
    deathReflect?: { overkillDamagePct: number; jutsuCostPct: number };
  };
  // SELF apenas: ao usar, aplica `effectId` (ex: ROOT) em todo INIMIGO dentro
  // de `radius` casas (Chebyshev) do ator, por `duration` rodadas — ex: Domo
  // de Iceberg (Yuki), prendendo quem estiver perto quando o domo sobe. A
  // duracao normal e' o teto; se a Barreira (SHIELD) do ator chegar a ZERO
  // antes disso, quem estiver preso e' liberado na hora (ver consumeShield/
  // resolveHit em combat-engine.ts). Marca o alvo com flags.trappedBy = id do
  // ator, pra saber quem liberar quando a Barreira quebrar.
  trapField?: { effectId: EffectId; radius: number; duration: number };
}

export interface ClanAbilityHook {
  // pontos de extensao p/ logica propria (MVP: identificados por string)
  onCombatStart?: string;
  onTurnStart?: string;
  onAttacked?: string;
}

export interface ClanDef {
  id: string;
  name: string;
  description: string;
  requirements?: AbilityRequirements;
  passiveIds: string[]; // ids de abilities passivas
  activeIds: string[]; // ids de abilities ativas
  hooks?: ClanAbilityHook;
  // nos da arvore de cla que o personagem ja nasce possuindo ao escolher
  // este cla (ex: Inuzuka nasce com o cao ninja — nao desbloqueia upando,
  // ver setClan() em services/characters/character-service.ts). O no
  // continua aparecendo na arvore (normalmente isolado, sem requires),
  // so' que ja marcado como possuido.
  autoGrantedNodeIds?: string[];
}

export interface ScenarioCellMods {
  // celulas com modificadores; chave = "A1"
  trees?: string[];    // árvore 🌲 — alto, bloqueia linha
  height?: string[];   // terreno elevado ⬆️ — alto, walkable
  water?: string[];
  obstacles?: string[]; // bloqueiam linha
}

export interface ScenarioDef {
  id: string;
  name: string;
  channelId: string;
  rows: number; // A..(rows)
  cols: number; // 1..cols
  description: string;
  // terreno padrao das celulas vazias: grama (verde claro) ou areia (amarelo)
  terrain: "grass" | "sand";
  // arquivo de imagem de fundo em assets/maps (opcional)
  image?: string;
  cells: ScenarioCellMods;
  // bonus/custo elemental no cenario
  elementModifiers?: Partial<Record<Element, { costMult?: number; dmgMult?: number }>>;
}

export interface MissionObjectiveDef {
  id: string;
  description: string;
}

export interface MissionRewards {
  xp: number;
  ryo: number;
}

export interface MissionDef {
  id: string;
  name: string;
  rank: Rank;
  description: string;
  channelId: string;
  objectives: MissionObjectiveDef[];
  rewards: MissionRewards;
  // tipo controla o handler que roda a logica
  type:
    | "FETCH_CAT"
    | "BANDIT_FIGHT"
    | "ESCORT"
    | "CLEAN_VILLAGE"
    | "PURSE_THIEF"
    | "GENIN_COMEDY"
    | "DANGO_RUSH"
    | "ROOF_CLEANUP"
    | "ARCHIVE_SCROLLS"
    | "MEDICINAL_HERBS"
    | "FESTIVAL_PREP"
    | "NINKEN_TRACKING"
    | "MARKET_MEDIATION"
    | "DUMMY_SUBSTITUTION"
    | "WASP_NESTS"
    | "ICHIRAKU_DELIVERY"
    | "CLEAN_WATER"
    | "NIGHT_PATROL"
    | "CLONE_INVESTIGATION"
    | "URGENT_DELIVERIES"
    | "FESTIVAL_SECURITY"
    | "FALSE_NINJAS"
    | "SUPPLY_DEPOT_DEFENSE"
    | "MISSING_CHILD"
    | "CHAKRA_INSECT_PLAGUE"
    | "INTERCEPTED_CODE"
    | "CAVE_RESCUE"
    | "ITINERANT_FESTIVAL_GUARD"
    | "ROUTE_TRAPS"
    | "HOSPITAL_THEFT"
    | "DAMAGED_BRIDGE"
    | "DISTRICT_NIGHT_PATROL"
    | "ENEMY_OUTPOST_INFILTRATION"
    | "FLOOD_RESCUE"
    | "MARKET_FIRE"
    | "NUKENIN_HUNT"
    | "RIVER_SMUGGLING"
    | "DESERT_AMBUSH"
    | "BANDANA_COLLECTOR"
    | "YUKI_HEIR"
    | "CORPSE_PULSE"
    | "ELITE_MASK"
    | "FORBIDDEN_BELL";
  data?: Record<string, unknown>;
}

export interface NpcTemplate {
  id: string;
  name: string;
  level?: number;
  hpMax: number;
  attributes: Partial<Record<Attribute, number>>;
  abilityIds: string[];
  aiPersona?: string; // chave de persona p/ Groq
  image?: string; // arquivo de aparência em assets/enemies
}
