import { prisma } from "../../db/client.js";
import { getItem } from "../../data/items.js";
import { personalRecipe, type RecipeDef, type RecipeIngredient } from "../../data/recipes.js";
import { addInventoryItem, getInventoryQty, removeInventoryItem } from "../characters/inventory.js";
import { EconomyError, runEconomy } from "./errors.js";
import type { Tx } from "./ledger.js";

export interface ResolvedIngredient {
  itemId: string;
  qty: number;
}

export function ingredientLabel(ingredient: RecipeIngredient): string {
  const nome = (id: string) => getItem(id)?.name ?? id;
  const alvo = ingredient.itemId
    ? nome(ingredient.itemId)
    : (ingredient.anyOf ?? []).map(nome).join(" ou ");
  return `${ingredient.qty}x ${alvo}`;
}

export function describeRecipe(recipe: RecipeDef): string {
  const saida = getItem(recipe.outputItemId)?.name ?? recipe.outputItemId;
  const quantidade = recipe.outputQty > 1 ? ` ×${recipe.outputQty}` : "";
  return `**${saida}${quantidade}** — ${recipe.ingredients.map(ingredientLabel).join(" + ")}`;
}

// Resolve `anyOf` escolhendo a alternativa que o personagem realmente tem.
// Devolve null quando falta ingrediente — e' o que impede consumo parcial:
// resolvemos TUDO antes de retirar QUALQUER coisa.
async function resolveIngredients(
  tx: Tx,
  charId: string,
  recipe: RecipeDef,
  vezes: number,
): Promise<{ ok: true; itens: ResolvedIngredient[] } | { ok: false; faltando: string }> {
  const itens: ResolvedIngredient[] = [];

  for (const ingredient of recipe.ingredients) {
    const necessario = ingredient.qty * vezes;
    const candidatos = ingredient.itemId ? [ingredient.itemId] : (ingredient.anyOf ?? []);

    let escolhido: string | null = null;
    for (const candidato of candidatos) {
      if ((await getInventoryQty(tx, charId, candidato)) >= necessario) {
        escolhido = candidato;
        break;
      }
    }
    if (!escolhido) return { ok: false, faltando: ingredientLabel({ ...ingredient, qty: necessario }) };
    itens.push({ itemId: escolhido, qty: necessario });
  }

  return { ok: true, itens };
}

export interface CraftResult {
  recipe: RecipeDef;
  vezes: number;
  consumido: ResolvedIngredient[];
  produzido: number;
}

// Craft pessoal. Sem custo de Ryo, mas ainda numa transacao: ou consome tudo e
// cria o produto, ou nao encosta em nada.
//
// `personalRecipe()` e' a unica porta: uma receita municipal (aço, pólvora,
// tinta, Lámen, Pergaminho de Arsenal...) nao existe aqui nem com id forjado.
export async function craftPersonal(
  charId: string,
  recipeId: string,
  vezes = 1,
): Promise<{ ok: true; result: CraftResult } | { ok: false; error: string }> {
  if (!Number.isInteger(vezes) || vezes < 1) {
    return { ok: false, error: "Quantidade inválida." };
  }
  const recipe = personalRecipe(recipeId);
  if (!recipe) {
    return {
      ok: false,
      error: "Esta receita não pode ser feita por conta própria — ela pertence a uma estrutura da vila.",
    };
  }

  const outcome = await runEconomy(async () => {
    const consumido = await prisma.$transaction(async (tx) => {
      const resolvido = await resolveIngredients(tx, charId, recipe, vezes);
      if (!resolvido.ok) {
        throw new EconomyError(`Faltam ingredientes: ${resolvido.faltando}.`);
      }
      for (const item of resolvido.itens) {
        await removeInventoryItem(tx, charId, item.itemId, item.qty);
      }
      await addInventoryItem(tx, charId, recipe.outputItemId, recipe.outputQty * vezes);
      await tx.economyActionLog.create({
        data: {
          charId,
          action: "CRAFT",
          detailsJson: JSON.stringify({ recipeId: recipe.id, vezes, consumido: resolvido.itens }),
        },
      });
      return resolvido.itens;
    });
    return { consumido };
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };
  return {
    ok: true,
    result: {
      recipe,
      vezes,
      consumido: outcome.consumido,
      produzido: recipe.outputQty * vezes,
    },
  };
}
