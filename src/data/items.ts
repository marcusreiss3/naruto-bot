export const ITEM_CATEGORIES = [
  "WEAPON",
  "NINJA_TOOL",
  "CONSUMABLE",
  "FOOD",
  "MATERIAL",
  "KEY_ITEM",
  "OTHER",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemAction = "EQUIP" | "THROW" | "USE";

export const ITEM_ACTION_LABELS: Record<ItemAction, string> = {
  EQUIP: "Equipar",
  THROW: "Arremessar",
  USE: "Usar",
};

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  WEAPON: "Armas",
  NINJA_TOOL: "Ferramentas Ninja",
  CONSUMABLE: "Consumíveis",
  FOOD: "Comidas",
  MATERIAL: "Materiais",
  KEY_ITEM: "Itens Importantes",
  OTHER: "Outros",
};

export const ITEM_CATEGORY_ICONS: Record<ItemCategory, string> = {
  WEAPON: "⚔️",
  NINJA_TOOL: "🧰",
  CONSUMABLE: "🧪",
  FOOD: "🍙",
  MATERIAL: "🧱",
  KEY_ITEM: "🔑",
  OTHER: "📦",
};

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  stackable: boolean;
  actions: ItemAction[];
  basicAbilityId?: string;
  throwAbilityId?: string;
  ryoValue?: number;
  restoresItemId?: string;
}

export const ITEMS: ItemDef[] = [
  {
    id: "kunai",
    name: "Kunai",
    description:
      "Lâmina ninja que pode ser usada em combate corpo a corpo ou arremessada contra o oponente.",
    category: "WEAPON",
    stackable: true,
    actions: ["EQUIP", "THROW"],
    basicAbilityId: "item_kunai_perfurar",
    throwAbilityId: "item_kunai_arremessar",
  },
  {
    id: "shuriken",
    name: "Shuriken",
    description:
      "Estrela metálica de arremesso usada para atacar, distrair ou limitar os movimentos do inimigo.",
    category: "WEAPON",
    stackable: true,
    actions: ["THROW"],
    throwAbilityId: "item_shuriken_arremessar",
  },
  {
    id: "fuma_shuriken",
    name: "Fūma Shuriken",
    description:
      "Versão muito maior da shuriken comum, com lâminas dobráveis. Causa mais dano, mas é mais difícil de transportar e lançar.",
    category: "WEAPON",
    stackable: true,
    actions: ["THROW"],
    throwAbilityId: "item_fuma_shuriken_arremessar",
  },
  {
    id: "senbon",
    name: "Senbon",
    description:
      "Agulha fina e longa usada em ataques rápidos e precisos, capaz de atingir pontos vitais.",
    category: "WEAPON",
    stackable: true,
    actions: ["THROW"],
    throwAbilityId: "item_senbon_arremessar",
  },
  {
    id: "kunai_explosiva",
    name: "Kunai Explosiva",
    description:
      "Kunai preparada com um Papel Bomba, combinando o arremesso da lâmina com uma explosão.",
    category: "WEAPON",
    stackable: true,
    actions: ["THROW"],
    throwAbilityId: "item_kunai_explosiva_arremessar",
  },
  {
    id: "papel_bomba",
    name: "Papel Bomba",
    description:
      "Papel marcado com uma fórmula de chakra que detona após ser ativada, causando uma explosão.",
    category: "NINJA_TOOL",
    stackable: true,
    actions: ["USE"],
    basicAbilityId: "item_papel_bomba_preparar",
  },
  {
    id: "bomba_fumaca",
    name: "Bomba de Fumaça",
    description:
      "Pequena cápsula que libera fumaça densa para esconder movimentos, facilitar fugas ou confundir o inimigo.",
    category: "NINJA_TOOL",
    stackable: true,
    actions: ["USE"],
    basicAbilityId: "item_bomba_fumaca_usar",
  },
  {
    id: "fios_aco_ninja",
    name: "Fios de Aço Ninja",
    description:
      "Fios resistentes usados para prender inimigos, manipular armas à distância ou preparar armadilhas.",
    category: "NINJA_TOOL",
    stackable: true,
    actions: ["USE"],
    basicAbilityId: "item_fios_aco_usar",
  },
  {
    id: "katana",
    name: "Katana",
    description:
      "Espada usada por ninjas especializados em Kenjutsu, ideal para combates de curta distância.",
    category: "WEAPON",
    stackable: false,
    actions: ["EQUIP"],
  },
  {
    id: "lamina_chakra",
    name: "Lâmina de Chakra",
    description: "Lâmina de metal especial capaz de receber e prolongar o chakra do usuário.",
    category: "WEAPON",
    stackable: false,
    actions: ["EQUIP"],
    basicAbilityId: "item_lamina_chakra_cortar",
  },
  {
    id: "pergaminho_arsenal",
    name: "Pergaminho de Arsenal",
    description: "Pergaminho preparado para armazenar e convocar grandes quantidades de ferramentas ninja.",
    category: "NINJA_TOOL",
    stackable: false,
    actions: [],
  },
  // So' B, A e S: as tecnicas de pergaminho da arvore de Bukijutsu comecam no
  // rank B (Dragoes Gemeos), entao pergaminho D e C nao eram usados por skill
  // nenhuma — eram item morto na loja.
  ...(["B", "A", "S"] as const).flatMap((rank, index) => {
    const values = [280, 500, 900];
    const activeId = `pergaminho_rank_${rank.toLowerCase()}`;
    return [
      { id: activeId, name: `Pergaminho Rank ${rank}`, description: `Pergaminho de Bukijutsu Rank ${rank}. Após ser usado, fica gasto até ser restaurado.`, category: "NINJA_TOOL" as const, stackable: false, actions: [], ryoValue: values[index] },
      { id: `${activeId}_gasto`, name: `Pergaminho Rank ${rank} (gasto)`, description: `Pergaminho Rank ${rank} sem chakra selado. Pode ser restaurado por metade do valor do pergaminho.`, category: "NINJA_TOOL" as const, stackable: false, actions: [], ryoValue: values[index], restoresItemId: activeId },
    ];
  }),
  {
    id: "corrente_ferro",
    name: "Corrente de Ferro",
    description: "Corrente resistente armazenada para técnicas de contenção e impacto.",
    category: "NINJA_TOOL",
    stackable: false,
    actions: [],
  },
  {
    id: "esfera_explosiva",
    name: "Esfera Explosiva",
    description: "Munição selada que explode e espalha kunai ao redor do impacto.",
    category: "NINJA_TOOL",
    stackable: true,
    actions: [],
  },
];

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]));

export function getItem(id: string): ItemDef | undefined {
  return ITEM_MAP.get(id);
}
