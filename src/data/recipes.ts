// Catalogo central de receitas. Nenhum handler repete formula: /craft filtra
// `personal` e a administracao de loja da etapa 05 filtra `villageShop`.
//
// A separacao NAO e' cosmetica. O craft pessoal existe so' para o basico; aco,
// polvora, tinta, armas avancadas e alimentos preparados dependem das estruturas
// da vila. Uma receita `villageShop` nao pode ser acionada pelo /craft nem com
// customId forjado — quem garante isso e' personalRecipe(), unica porta de
// entrada do comando.

export type RecipeScope = "personal" | "villageShop";
export type RecipeStation = "FUNDICAO" | "ICHIRAKU" | "OFICINA_SELOS";

export interface RecipeIngredient {
  // Um dos dois: item fixo, ou lista de alternativas equivalentes (Lámen aceita
  // carne crua OU peixe cru).
  itemId?: string;
  anyOf?: string[];
  qty: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  scope: RecipeScope;
  // So' em villageShop: qual estrutura da vila produz.
  station?: RecipeStation;
  outputItemId: string;
  outputQty: number;
  ingredients: RecipeIngredient[];
}

function ing(itemId: string, qty = 1): RecipeIngredient {
  return { itemId, qty };
}

export const RECIPES: RecipeDef[] = [
  // ---------------- /craft pessoal ----------------
  // Processamento basico, sem custo de Ryo.
  {
    id: "lingote_ferro",
    name: "Lingote de Ferro",
    scope: "personal",
    outputItemId: "lingote_ferro",
    outputQty: 1,
    ingredients: [ing("minerio_ferro", 2), ing("carvao", 1)],
  },
  {
    id: "papel",
    name: "Papel",
    scope: "personal",
    outputItemId: "papel",
    outputQty: 1,
    ingredients: [ing("fibra_vegetal", 3)],
  },
  {
    id: "farinha",
    name: "Farinha",
    scope: "personal",
    outputItemId: "farinha",
    outputQty: 1,
    ingredients: [ing("grao", 2)],
  },
  {
    id: "lenha",
    name: "Lenha",
    scope: "personal",
    outputItemId: "lenha",
    outputQty: 1,
    ingredients: [ing("madeira", 2)],
  },
  {
    id: "kunai",
    name: "Kunai",
    scope: "personal",
    outputItemId: "kunai",
    outputQty: 1,
    ingredients: [ing("lingote_ferro"), ing("madeira"), ing("couro")],
  },
  {
    id: "shuriken",
    name: "Shuriken",
    scope: "personal",
    outputItemId: "shuriken",
    outputQty: 1,
    ingredients: [ing("lingote_ferro"), ing("carvao")],
  },
  {
    id: "senbon",
    name: "Senbon",
    scope: "personal",
    outputItemId: "senbon",
    outputQty: 3,
    ingredients: [ing("lingote_ferro")],
  },
  {
    id: "pao",
    name: "Pão",
    scope: "personal",
    outputItemId: "pao",
    outputQty: 1,
    ingredients: [ing("farinha", 2), ing("agua_limpa"), ing("lenha")],
  },

  // ---------------- Fundição Ninja (etapa 05) ----------------
  {
    id: "aco",
    name: "Aço",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "aco",
    outputQty: 1,
    ingredients: [ing("lingote_ferro", 2), ing("carvao")],
  },
  {
    id: "polvora",
    name: "Pólvora",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "polvora",
    outputQty: 1,
    ingredients: [ing("carvao"), ing("sal"), ing("fibra_vegetal")],
  },
  {
    id: "fuma_shuriken",
    name: "Fūma Shuriken",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "fuma_shuriken",
    outputQty: 1,
    ingredients: [ing("lingote_ferro", 4), ing("madeira_reforcada", 2), ing("couro")],
  },
  {
    id: "papel_bomba",
    name: "Papel Bomba",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "papel_bomba",
    outputQty: 1,
    ingredients: [ing("papel", 2), ing("polvora"), ing("fibra_vegetal")],
  },
  {
    id: "bomba_fumaca",
    name: "Bomba de Fumaça",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "bomba_fumaca",
    outputQty: 1,
    ingredients: [ing("argila"), ing("polvora"), ing("fibra_vegetal")],
  },
  {
    id: "fios_aco_ninja",
    name: "Fios de Aço Ninja",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "fios_aco_ninja",
    outputQty: 1,
    ingredients: [ing("aco", 2), ing("fibra_vegetal")],
  },
  // Declarada para o catalogo ficar completo, mas o jogador continua montando
  // pela combinacao existente (/usar Papel Bomba com Kunai) — ver
  // prepareExplosiveKunai em characters/inventory.ts.
  {
    id: "kunai_explosiva",
    name: "Kunai Explosiva",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "kunai_explosiva",
    outputQty: 1,
    ingredients: [ing("kunai"), ing("papel_bomba")],
  },
  {
    id: "katana",
    name: "Katana",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "katana",
    outputQty: 1,
    ingredients: [ing("aco", 8), ing("madeira_reforcada", 2), ing("couro", 2)],
  },
  {
    id: "lamina_chakra",
    name: "Lâmina de Chakra",
    scope: "villageShop",
    station: "FUNDICAO",
    outputItemId: "lamina_chakra",
    outputQty: 1,
    ingredients: [ing("aco", 12), ing("minerio_raro", 2), ing("papel"), ing("erva_medicinal", 3)],
  },

  // ---------------- Oficina de Selos (etapa 05) ----------------
  {
    id: "tinta_de_selo",
    name: "Tinta de Selo",
    scope: "villageShop",
    station: "OFICINA_SELOS",
    outputItemId: "tinta_de_selo",
    outputQty: 1,
    ingredients: [ing("carvao"), ing("erva_medicinal"), ing("agua_limpa")],
  },
  {
    id: "pergaminho_arsenal",
    name: "Pergaminho de Arsenal",
    scope: "villageShop",
    station: "OFICINA_SELOS",
    outputItemId: "pergaminho_arsenal",
    outputQty: 1,
    ingredients: [
      ing("papel", 8),
      ing("tinta_de_selo", 2),
      ing("madeira_reforcada"),
      ing("erva_medicinal"),
    ],
  },

  // ---------------- Ichiraku (etapa 05) ----------------
  {
    id: "caldo",
    name: "Caldo",
    scope: "villageShop",
    station: "ICHIRAKU",
    outputItemId: "caldo",
    outputQty: 1,
    ingredients: [ing("carne_crua"), ing("agua_limpa"), ing("lenha")],
  },
  {
    id: "tempero",
    name: "Tempero",
    scope: "villageShop",
    station: "ICHIRAKU",
    outputItemId: "tempero",
    outputQty: 1,
    ingredients: [ing("erva_medicinal"), ing("sal")],
  },
  {
    id: "carne_cozida",
    name: "Carne Cozida",
    scope: "villageShop",
    station: "ICHIRAKU",
    outputItemId: "carne_cozida",
    outputQty: 1,
    ingredients: [ing("carne_crua"), ing("lenha"), ing("sal")],
  },
  {
    id: "peixe_cozido",
    name: "Peixe Cozido",
    scope: "villageShop",
    station: "ICHIRAKU",
    outputItemId: "peixe_cozido",
    outputQty: 1,
    ingredients: [ing("peixe_cru"), ing("lenha"), ing("sal")],
  },
  {
    id: "ensopado",
    name: "Ensopado",
    scope: "villageShop",
    station: "ICHIRAKU",
    outputItemId: "ensopado",
    outputQty: 1,
    ingredients: [ing("carne_crua"), ing("fruta"), ing("agua_limpa"), ing("lenha")],
  },
  {
    id: "dango",
    name: "Dango",
    scope: "villageShop",
    station: "ICHIRAKU",
    outputItemId: "dango",
    outputQty: 1,
    ingredients: [ing("farinha", 2), ing("fruta")],
  },
  // UNICA receita canonica de Lámen (secao 5.3). Catalogo e Ichiraku usam esta.
  {
    id: "lamen",
    name: "Lámen",
    scope: "villageShop",
    station: "ICHIRAKU",
    outputItemId: "lamen",
    outputQty: 1,
    ingredients: [
      ing("farinha"),
      ing("caldo"),
      { anyOf: ["carne_crua", "peixe_cru"], qty: 1 },
      ing("agua_limpa"),
      ing("tempero"),
    ],
  },
];

const RECIPE_MAP = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

export function getRecipe(id: string): RecipeDef | undefined {
  return RECIPE_MAP.get(id);
}

export const PERSONAL_RECIPES = RECIPES.filter((recipe) => recipe.scope === "personal");

// Unica porta do /craft. Devolve undefined para qualquer receita municipal,
// inclusive quando o id chega por customId ou autocomplete forjado.
export function personalRecipe(id: string): RecipeDef | undefined {
  const recipe = RECIPE_MAP.get(id);
  return recipe?.scope === "personal" ? recipe : undefined;
}

export function villageShopRecipes(station: RecipeStation): RecipeDef[] {
  return RECIPES.filter((recipe) => recipe.scope === "villageShop" && recipe.station === station);
}
