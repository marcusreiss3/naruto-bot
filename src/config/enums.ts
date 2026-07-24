// Enums centrais (SQLite nao tem enum nativo no Prisma; usamos strings + estes tipos).

// Os 5 elementos basicos + os kekkei genkai. Kekkei genkai e' um elemento como
// qualquer outro para a engine (arvore, requisitos, passivas); a diferenca e'
// que ele NAO e' sorteado: so entra via /admin. Ver KEKKEI_GENKAI abaixo.
export const ELEMENTS = ["FOGO", "AGUA", "VENTO", "TERRA", "RAIO", "CRISTAL", "VAPOR", "CALOR", "LAVA", "EXPLOSAO"] as const;
export type Element = (typeof ELEMENTS)[number];

// Subconjunto de ELEMENTS que e' kekkei genkai (linhagem sanguinea). Usado para
// rotular na UI e para separar a faixa de balanceamento no teste das passivas:
// KG bate mais forte que elemento basico de proposito.
export const KEKKEI_GENKAI = ["CRISTAL", "VAPOR", "CALOR", "LAVA", "EXPLOSAO"] as const;
export type KekkeiGenkai = (typeof KEKKEI_GENKAI)[number];

export function isKekkeiGenkai(element: Element): boolean {
  return (KEKKEI_GENKAI as readonly string[]).includes(element);
}

export const ELEMENT_LABELS: Record<Element, string> = {
  FOGO: "Fogo",
  AGUA: "Água",
  VENTO: "Vento",
  TERRA: "Terra",
  RAIO: "Raio",
  CRISTAL: "Cristal",
  VAPOR: "Vapor",
  CALOR: "Calor",
  LAVA: "Lava",
  EXPLOSAO: "Explosão",
};

// Os 9 atributos do personagem. Ordem = ordem de exibicao no /perfil e no menu.
export const ATTRIBUTES = [
  "ninjutsu",
  "taijutsu",
  "genjutsu",
  "bukijutsu",
  "iryoNinjutsu",
  "fuinjutsu",
  "kugutsu",
  "senjutsu",
  "dojutsu",
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

// Rotulo legivel de cada atributo (com acento) p/ UI.
export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  ninjutsu: "Ninjutsu",
  taijutsu: "Taijutsu",
  genjutsu: "Genjutsu",
  bukijutsu: "Bukijutsu",
  iryoNinjutsu: "Iryō Ninjutsu",
  fuinjutsu: "Fūinjutsu",
  kugutsu: "Kugutsu",
  senjutsu: "Senjutsu",
  dojutsu: "Dōjutsu",
};

// Categoria = que TIPO de jutsu e (dirige /jutsu <sub> e regras da engine:
// BURN corta dano de TAIJUTSU/BUKIJUTSU, NINJUTSU_BLOCK trava NINJUTSU...).
// Nao confundir com Attribute, que e o que ESCALA o jutsu: um jutsu de selo
// pode ser categoria NINJUTSU escalando por fuinjutsu.
export const CATEGORIES = [
  "NINJUTSU",
  "IRYO_NINJUTSU",
  "TAIJUTSU",
  "GENJUTSU",
  "BUKIJUTSU",
  "CLA",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const RESOURCES = ["chakra", "energia"] as const;
export type Resource = (typeof RESOURCES)[number];

export const MASTERY_LEVELS = ["BASICO", "CONTROLADO", "MESTRE"] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export const ACTION_TYPES = ["COMUM", "BONUS", "MOVIMENTO", "REACAO"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const SHAPES = [
  "MELEE",
  "LINE",
  "CONE",
  "RADIUS",
  "SINGLE_TARGET",
  "SELF",
  "ALLY",
  "GLOBAL_OR_SCENARIO",
] as const;
export type Shape = (typeof SHAPES)[number];

export const RANKS = ["D", "C", "B", "A"] as const;
export type Rank = (typeof RANKS)[number];

export const EFFECT_IDS = [
  "BURN", // queimadura
  "POISON", // veneno
  "BLEED", // sangramento
  "STUN", // atordoamento
  "SLOW", // lentidao
  "DISARM", // desarme
  "CONFUSION", // confusao
  "ROOT", // enraizado
  "NINJUTSU_BLOCK", // bloqueio mental de ninjutsu
  "DEFENSE_DOWN",
  "FLEE_LOCK", // impedido de fugir do combate
  "WET", // encharcado: conduz eletricidade e abre dano de Agua/Raio
  "SHIELD", // barreira: stacks = pontos de dano absorvidos antes do HP
  "CHAKRA_DRAIN", // perde chakra por turno
  "HASTE", // acelerado: mais movimento, esquiva e chance de fuga
  // ---- exclusivo do cla Nara ----
  "SHADOW_BOUND", // vinculo de sombra: sem dano, mas trava movimento E reacao (Esquivar/Bloquear/Aparar)
  // ---- exclusivos de kekkei genkai ----
  "CRYSTALLIZED", // cristalizado: acumulos de cristal travam esquiva e movimento; ao encher, selam
  "PRISM", // prisma: casulo de luz que reduz ninjutsu recebido e reflete parte, mas prende no lugar
  "CORROSION", // corrosao: nevoa de Vapor que da dano leve por turno e derrete Barreira do portador
  "DEHYDRATION", // desidratacao: Calor suga a agua do corpo, corta o dano de TUDO que o alvo causar (nao so tai/buki)
  "MAGMA", // magma: Lava acumula, queima leve, e ao encher endurece e prende (ROOT) o alvo
  "MINADO", // minado: Explosao planta uma carga no contato que detona sozinha ao fim da duracao
] as const;

// Terreno temporario criado por jutsu (camada por cima do cenario estatico).
export const TERRAIN_KINDS = [
  "FIRE", // celula em chamas: dano no fim do turno
  "WATER", // poca: move pela metade e conta como molhado
  "OBSTACLE", // muro/bloco: barra passagem e visao
  "SMOKE", // cortina: barra visao, deixa passar
  "SWAMP", // pantano: move pela metade
] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];
export type EffectId = (typeof EFFECT_IDS)[number];

export const EFFECT_LABELS: Record<EffectId, string> = {
  BURN: "Queimadura",
  POISON: "Veneno",
  BLEED: "Sangramento",
  STUN: "Atordoamento",
  SLOW: "Lentidão",
  DISARM: "Desarme",
  CONFUSION: "Confusão",
  ROOT: "Imobilização",
  NINJUTSU_BLOCK: "Bloqueio de Ninjutsu",
  DEFENSE_DOWN: "Defesa Reduzida",
  FLEE_LOCK: "Bloqueio de Fuga",
  WET: "Encharcado",
  SHIELD: "Barreira",
  CHAKRA_DRAIN: "Dreno de Chakra",
  HASTE: "Aceleração",
  SHADOW_BOUND: "Vínculo de Sombra",
  CRYSTALLIZED: "Cristalizado",
  PRISM: "Prisma",
  CORROSION: "Corrosão",
  DEHYDRATION: "Desidratação",
  MAGMA: "Magma",
  MINADO: "Minado",
};

export function effectLabel(effectId: string): string {
  return EFFECT_LABELS[effectId as EffectId] ?? effectId;
}
