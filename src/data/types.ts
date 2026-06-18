import type { ActionType, Attribute, Category, Element, Rank, Shape, EffectId } from "../config/enums.js";

export interface AppliedEffect {
  effectId: EffectId;
  stacks?: number;
  duration?: number;
  chance?: number; // 0..1, default 1
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
  reactionKind?: "BLOCK" | "DODGE" | "PARRY" | "JUTSU";
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
  items?: { itemId: string; name: string; qty: number }[];
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
    | "WASP_NESTS";
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
