// Enums centrais (SQLite nao tem enum nativo no Prisma; usamos strings + estes tipos).

// Os 5 elementos basicos + os kekkei genkai. Kekkei genkai e' um elemento como
// qualquer outro para a engine (arvore, requisitos, passivas); a diferenca e'
// que ele NAO e' sorteado: so entra via /admin. Ver KEKKEI_GENKAI abaixo.
export const ELEMENTS = ["FOGO", "AGUA", "VENTO", "TERRA", "RAIO", "CRISTAL", "VAPOR", "CALOR", "LAVA", "EXPLOSAO", "POEIRA", "GELO"] as const;
export type Element = (typeof ELEMENTS)[number];

// Subconjunto de ELEMENTS que e' kekkei genkai (linhagem sanguinea). Usado para
// rotular na UI e para separar a faixa de balanceamento no teste das passivas:
// KG bate mais forte que elemento basico de proposito. Poeira (Jinton) e' o
// mais forte de todos os KKG — ver comentario no topo da secao POEIRA em
// element-trees/index.ts. Gelo (Hyoton, ex-arvore de clã do Yuki) fica no
// mesmo nível de Vapor/Calor/Lava (2.025x), ver secao GELO no mesmo arquivo.
export const KEKKEI_GENKAI = ["CRISTAL", "VAPOR", "CALOR", "LAVA", "EXPLOSAO", "POEIRA", "GELO"] as const;
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
  POEIRA: "Poeira",
  GELO: "Gelo",
};

// Estilos de luta de Taijutsu: cada um e' uma arvore de especializacao
// separada. O personagem NAO nasce com nenhum — sera ensinado por NPCs em
// RP (ainda nao implementado) ou concedido via /admin ate la. Assassinato
// Silencioso SOMA este requisito aos que ja tinha (elemento AGUA + vila
// Kiri) — nao substitui.
export const FIGHTING_STYLES = ["PUNHO_FORTE", "PUNHO_ARHAT", "PUNHO_ADAMANTINO", "TAIJUTSU_AGITACAO", "ASSASSINATO_SILENCIOSO"] as const;
export type FightingStyle = (typeof FIGHTING_STYLES)[number];

export const FIGHTING_STYLE_LABELS: Record<FightingStyle, string> = {
  PUNHO_FORTE: "Punho Forte",
  PUNHO_ARHAT: "Punho Arhat",
  PUNHO_ADAMANTINO: "Punho Adamantino",
  TAIJUTSU_AGITACAO: "Taijutsu de Agitação",
  ASSASSINATO_SILENCIOSO: "Assassinato Silencioso",
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
  // Kenjutsu = espadas, especificamente — separado de bukijutsu (armas em
  // geral: shuriken, kunai, senbon). Mesmo papel do ninjutsu: só pontos pra
  // desbloquear skill (reqAttribute em nós de árvore), 0% de escala de dano
  // (ver kenjutsuScaling em balance.ts).
  "kenjutsu",
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
  kenjutsu: "Kenjutsu",
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
  // BUKIJUTSU = arma em geral / arremesso (shuriken, kunai, senbon).
  // KENJUTSU  = espada empunhada, categoria separada. Os dois sao FISICOS
  // (ver isPhysicalCategory em combat/combat-math.ts) e os dois somam o dano
  // da arma equipada, mas so' BUKIJUTSU e' "projetil" — e' isso que decide se
  // a Explosao Defensiva consegue defletir o golpe de volta. Um corte de
  // katana nao e' projetil; um kunai arremessado e'.
  "BUKIJUTSU",
  "KENJUTSU",
  "DOJUTSU",
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
  "CONTRACT_SEAL", // bloqueia invocacoes e chakra de Bijuu vinculado a contrato
  "DEFENSE_DOWN",
  "FLEE_LOCK", // impedido de fugir do combate
  "WET", // encharcado: conduz eletricidade e abre dano de Agua/Raio
  "SHIELD", // barreira: stacks = pontos de dano absorvidos antes do HP
  "CHAKRA_DRAIN", // perde chakra por turno
  "HASTE", // acelerado: mais movimento, esquiva e chance de fuga
  "EMPOWERED", // sobrecarga: dano de saida multiplicado por tempo limitado (ex: Pilula Secreta do Akimichi)
  "MARKED", // alvo marcado para execucao/seguimento
  // ---- exclusivo do cla Nara ----
  "SHADOW_BOUND", // vinculo de sombra: sem dano, mas trava movimento E reacao (Esquivar/Bloquear/Aparar)
  // ---- exclusivos de kekkei genkai ----
  "CRYSTALLIZED", // cristalizado: acumulos de cristal travam esquiva e movimento; ao encher, selam
  "PRISM", // prisma: casulo de luz que reduz ninjutsu recebido e reflete parte, mas prende no lugar
  "CORROSION", // corrosao: nevoa de Vapor que da dano leve por turno e derrete Barreira do portador
  "DEHYDRATION", // desidratacao: Calor suga a agua do corpo, corta o dano de TUDO que o alvo causar (nao so tai/buki)
  "MAGMA", // magma: Lava acumula, queima leve, e ao encher endurece e prende (ROOT) o alvo
  "MINADO", // minado: Explosao planta uma carga no contato que detona sozinha ao fim da duracao
  "DISINTEGRATION", // desintegracao: Poeira derrete Barreira por turno E, ao encher, colapsa: zera toda Barreira restante e reduz a defesa
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
  CONTRACT_SEAL: "Selo de Contrato",
  DEFENSE_DOWN: "Defesa Reduzida",
  FLEE_LOCK: "Bloqueio de Fuga",
  WET: "Encharcado",
  SHIELD: "Barreira",
  CHAKRA_DRAIN: "Dreno de Chakra",
  HASTE: "Aceleração",
  EMPOWERED: "Sobrecarga",
  MARKED: "Marcado",
  SHADOW_BOUND: "Vínculo de Sombra",
  CRYSTALLIZED: "Cristalizado",
  PRISM: "Prisma",
  CORROSION: "Corrosão",
  DEHYDRATION: "Desidratação",
  MAGMA: "Magma",
  MINADO: "Minado",
  DISINTEGRATION: "Desintegração",
};

export function effectLabel(effectId: string): string {
  return EFFECT_LABELS[effectId as EffectId] ?? effectId;
}
