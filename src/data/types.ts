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
  //   "physical" -> so' categoria TAIJUTSU/BUKIJUTSU (Lobo de Duas/Tres
  //     Cabecas, Grande Braco de Agua, Pilula Secreta)
  //   "clan"     -> so' jutsu que exigem o MESMO cla de quem concedeu o
  //     efeito (Casulo do Aburame: so' golpes que exigem clanId "aburame",
  //     cobrindo a Mordida de Inseto mesmo sendo categoria NINJUTSU)
  empoweredScope?: "physical" | "clan";
}

export interface AbilityRequirements {
  level?: number;
  attributes?: Partial<Record<Attribute, number>>;
  element?: Element;
  clanId?: string;
  // se true, nao desbloqueia por requisito automatico (so admin/arma/pergaminho)
  manualOnly?: boolean;
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
  // remove efeitos do alvo (Iryo)
  cleanses?: EffectId[];
  requirements?: AbilityRequirements;
  tags: string[];
  description: string;
  // flags especiais
  unblockable?: boolean;
  undodgeable?: boolean;
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
  // exige que o PROPRIO ator esteja com um dojutsu de toggle ligado no
  // momento do uso (ex: Palma de Vacuo do Hyuuga usa o Byakugan como mira;
  // Genjutsu Ketsuryuugan do Chinoike E' o proprio doujutsu agindo). O `flag`
  // bate com a chave em ParticipantRow.flags que /combate byakugan|ketsuryuugan
  // liga/desliga (ex: "byakuganActive"); `label` e' so' pra mensagem de erro.
  requiresActiveDoujutsu?: { flag: string; label: string };
  // pode ser usada uma unica vez por combate
  oncePerCombat?: boolean;
  reactionKind?: "BLOCK" | "DODGE" | "PARRY" | "JUTSU";
  // terreno que o jutsu deixa nas celulas atingidas (chamas, agua, muro, fumaca, pantano)
  terrain?: {
    kind: TerrainKind;
    duration?: number; // rodadas; padrao BALANCE.terrain.defaultDuration
  };
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
    // o que acontece quando a invocacao morre (clone d'agua estoura molhando)
    onDeath?: { effectId: EffectId; radius: number; duration?: number };
  };
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
  hpMax: number;
  attributes: Partial<Record<Attribute, number>>;
  abilityIds: string[];
  aiPersona?: string; // chave de persona p/ Groq
  image?: string; // arquivo de aparência em assets/enemies
}
