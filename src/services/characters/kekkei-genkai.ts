// Fusão de kekkei genkai: completar certas árvores de elemento básico até o
// fim concede automaticamente o kekkei genkai correspondente (pedido
// explícito do usuário). Puro e testável — quem grava no banco é buyNode()
// em skill-tree.ts, que chama isto depois de cada compra.
//
// Regras:
// - "Completar" uma árvore = possuir TODOS os nós dela (ELEMENT_TREES[el]).
// - Ter QUALQUER kekkei genkai bloqueia ganhar outro por fusão, mesmo
//   completando as árvores de outra combinação.
// - Onoki (dono do Jinton — Poeira), Bakurei (dono do Bakuton — Explosão) e
//   Yuki (dono do Hyoton — Gelo) só precisam de 25% de cada árvore envolvida
//   na PRÓPRIA combinação, não 100% — pedido explícito do usuário. O
//   desconto vale só pra essa combinação específica, não pras outras que
//   também usam os mesmos elementos base.
import { isKekkeiGenkai, type Element, type KekkeiGenkai } from "../../config/enums.js";
import { ELEMENT_TREES } from "../../data/element-trees/index.js";

export const KEKKEI_GENKAI_RECIPES: Partial<Record<KekkeiGenkai, Element[]>> = {
  CRISTAL: ["TERRA", "AGUA"],
  VAPOR: ["FOGO", "AGUA"],
  CALOR: ["FOGO", "VENTO"],
  LAVA: ["FOGO", "TERRA"],
  EXPLOSAO: ["TERRA", "RAIO"],
  POEIRA: ["FOGO", "TERRA", "VENTO"],
  GELO: ["AGUA", "VENTO"],
};

// Ordem de checagem: combinações com MAIS elementos primeiro, pra que
// completar Fogo+Terra+Vento resolva em Poeira (a fusão "completa") em vez
// de parar em Lava ou Calor no meio do caminho.
const RECIPE_ORDER: KekkeiGenkai[] = (Object.keys(KEKKEI_GENKAI_RECIPES) as KekkeiGenkai[]).sort(
  (a, b) => (KEKKEI_GENKAI_RECIPES[b]?.length ?? 0) - (KEKKEI_GENKAI_RECIPES[a]?.length ?? 0),
);

// clanId do dono -> kekkei genkai que ele funde com 25% em vez de 100%.
const CLAN_FUSION_DISCOUNT: Partial<Record<string, KekkeiGenkai>> = {
  onoki: "POEIRA",
  bakurei: "EXPLOSAO",
  yuki: "GELO",
};
const DISCOUNTED_THRESHOLD = 0.25;
const NORMAL_THRESHOLD = 1;

// Fração (0-1) da árvore de um elemento que o personagem já possui.
export function treeCompletion(element: Element, owned: ReadonlySet<string>): number {
  const tree = ELEMENT_TREES[element];
  if (!tree || tree.length === 0) return 0;
  const ownedCount = tree.filter((n) => owned.has(n.id)).length;
  return ownedCount / tree.length;
}

export interface KekkeiFusionInput {
  owned: ReadonlySet<string>;
  elements: Element[];
  clanId: string | null;
}

// Retorna o kekkei genkai que o personagem acabou de fundir, ou null.
// NAO grava nada — puro, pra ser testável sem banco.
export function eligibleKekkeiGenkai(input: KekkeiFusionInput): KekkeiGenkai | null {
  if (input.elements.some((el) => isKekkeiGenkai(el))) return null;

  for (const kg of RECIPE_ORDER) {
    const recipe = KEKKEI_GENKAI_RECIPES[kg];
    if (!recipe) continue;
    const threshold = CLAN_FUSION_DISCOUNT[input.clanId ?? ""] === kg ? DISCOUNTED_THRESHOLD : NORMAL_THRESHOLD;
    const met = recipe.every((el) => treeCompletion(el, input.owned) >= threshold);
    if (met) return kg;
  }
  return null;
}
