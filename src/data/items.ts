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
  // Saciedade devolvida por unidade em /comer. So' alimentos tem.
  satiety?: number;
  // Material raro: nunca sai de producao passiva nem e' capturado
  // automaticamente por ordem de coleta, e nao e' vendido a NPC.
  rare?: boolean;
}

// Atalhos para o bloco de materiais/alimentos: todos empilhaveis, sem acao de
// combate. Sem eles o catalogo vira parede de boilerplate.
function mat(id: string, name: string, description: string): ItemDef {
  return { id, name, description, category: "MATERIAL", stackable: true, actions: [] };
}

function food(id: string, name: string, description: string, satiety: number): ItemDef {
  return { id, name, description, category: "FOOD", stackable: true, actions: [], satiety };
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
  // Pergaminho unico (09/08/2026). Antes existiam 3 ranks (B/A/S) x 2 estados
  // = 6 entradas de inventario pra uma mecanica so'. O rank nao gateava nada
  // — nenhuma tecnica exigia "rank A ou melhor", cada uma exigia um rank
  // exato — entao so' enchia a mochila. Agora a tecnica mais forte pede MAIS
  // pergaminhos (`amount`) em vez de um pergaminho mais raro, o que preserva
  // o custo crescente: com ryoValue 300, restaurar os 3 da Cadeia do Desastre
  // custa os mesmos 450 ryo do antigo pergaminho rank S.
  {
    id: "pergaminho_arsenal",
    name: "Pergaminho de Arsenal",
    description: "Pergaminho preparado para armazenar e convocar grandes quantidades de ferramentas ninja. Após ser usado, fica gasto até ser restaurado.",
    category: "NINJA_TOOL",
    stackable: false,
    actions: [],
    ryoValue: 300,
  },
  {
    id: "pergaminho_arsenal_gasto",
    name: "Pergaminho de Arsenal (gasto)",
    description: "Pergaminho de Arsenal sem chakra selado. Pode ser restaurado por metade do valor do pergaminho.",
    category: "NINJA_TOOL",
    stackable: false,
    actions: [],
    ryoValue: 300,
    restoresItemId: "pergaminho_arsenal",
  },
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

  // ---------------- Materiais comuns (coleta) ----------------
  // Todos empilhaveis e sem acao: viram produto pelo /craft ou pela loja da
  // vila. Preco de NPC e' da etapa 05; nada aqui tem ryoValue ainda.
  mat("madeira", "Madeira", "Toras cortadas de árvores comuns, base de qualquer construção ninja."),
  mat("pedra", "Pedra", "Blocos brutos arrancados da rocha, usados em obras e muros."),
  mat("minerio_ferro", "Minério de Ferro", "Rocha com veios metálicos, ainda impura, pronta para a fundição."),
  mat("carvao", "Carvão", "Combustível escuro que sustenta forjas e fogueiras."),
  mat("argila", "Argila", "Barro úmido moldável, matéria-prima de cápsulas e recipientes."),
  mat("fibra_vegetal", "Fibra Vegetal", "Talos fibrosos trançáveis em cordas, papel e estopim."),
  mat("erva_medicinal", "Erva Medicinal", "Folhas de propriedades curativas colhidas em matas e encostas."),
  mat("grao", "Grão", "Sementes colhidas em campo aberto, moídas em farinha."),
  mat("agua_limpa", "Água Limpa", "Água potável recolhida de rios e nascentes subterrâneas."),
  mat("couro", "Couro", "Pele curtida de caça, usada em cabos, alças e proteções."),
  mat("sal", "Sal", "Cristais extraídos de solo árido, conservam alimento e entram na pólvora."),

  // ---------------- Materiais raros ----------------
  // 5% fixo por acao, cada ocorrencia da' exatamente 1 unidade. Minerio Raro so'
  // de mineracao; Madeira Reforcada so' de coleta natural.
  {
    id: "minerio_raro",
    name: "Minério Raro",
    description: "Veio metálico incomum, denso e frio ao toque. Só aparece nas profundezas da rocha.",
    category: "MATERIAL",
    stackable: true,
    actions: [],
    rare: true,
  },
  {
    id: "madeira_reforcada",
    name: "Madeira Reforçada",
    description: "Cerne de árvore antiga, duro como metal. Só aparece na coleta de matas fechadas.",
    category: "MATERIAL",
    stackable: true,
    actions: [],
    rare: true,
  },

  // ---------------- Materiais processados ----------------
  mat("lingote_ferro", "Lingote de Ferro", "Ferro fundido e moldado em barra, pronto para a bancada."),
  mat("aco", "Aço", "Liga endurecida na fundição da vila, base das lâminas sérias."),
  mat("papel", "Papel", "Folhas prensadas de fibra vegetal, suporte de selos e explosivos."),
  mat("polvora", "Pólvora", "Mistura instável que transforma uma cápsula em arma."),
  mat("farinha", "Farinha", "Grão moído fino, base de pão, dango e lámen."),
  mat("lenha", "Lenha", "Madeira rachada em toras curtas, queima limpa no fogão."),
  mat("caldo", "Caldo", "Fundo de carne apurado com água e fogo brando."),
  mat("tempero", "Tempero", "Mistura de erva e sal que dá caráter ao prato."),
  mat(
    "tinta_de_selo",
    "Tinta de Selo",
    "Tinta condutora de chakra. Só a Oficina de Selos da vila sabe prepará-la.",
  ),

  // ---------------- Alimentos ----------------
  // `satiety` e' o que /comer devolve por unidade, limitado a 100.
  food("carne_crua", "Carne Crua", "Corte fresco de caça. Sustenta, mas o sabor cobra o preço.", 4),
  food("peixe_cru", "Peixe Cru", "Pescado ainda escorrendo do rio.", 4),
  food("fruta", "Fruta", "Fruta madura colhida no galho.", 8),
  food("pao", "Pão", "Pão assado em forno de lenha, denso e simples.", 16),
  food("carne_cozida", "Carne Cozida", "Carne selada com sal sobre a brasa.", 18),
  food("peixe_cozido", "Peixe Cozido", "Peixe assado inteiro, temperado com sal.", 16),
  food("ensopado", "Ensopado", "Panela de carne e fruta cozidas devagar.", 25),
  food("dango", "Dango", "Bolinhos doces espetados, três por vareta.", 22),
  food("lamen", "Lámen", "Tigela completa: caldo apurado, macarrão e carne. O prato do ninja.", 40),
];

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]));

export function getItem(id: string): ItemDef | undefined {
  return ITEM_MAP.get(id);
}

export const FOOD_ITEMS: ItemDef[] = ITEMS.filter((item) => typeof item.satiety === "number");

export function isRareResource(id: string): boolean {
  return getItem(id)?.rare === true;
}
