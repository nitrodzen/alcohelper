import { z } from "zod";
import { hasMatchingInventoryItem, type InventoryForAI } from "@/lib/inventory";

export const generatedRecipeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        amount: z.string().trim().min(1).max(80),
        inventoryItemId: z.string().optional().nullable(),
        optional: z.boolean().optional().default(false),
      }),
    )
    .min(1)
    .max(16),
  tools: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        optional: z.boolean().optional().default(false),
      }),
    )
    .max(10),
  steps: z.array(z.string().trim().min(1).max(500)).min(2).max(14),
  warnings: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
});

export const generatedRecipesSchema = z.object({
  recipes: z.array(generatedRecipeSchema).min(1).max(6),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;
export type GeneratedRecipes = z.infer<typeof generatedRecipesSchema>;

export function validateRecipeAgainstInventory(recipe: GeneratedRecipe, inventory: InventoryForAI[]): GeneratedRecipe | null {
  const hasMissingIngredient = recipe.ingredients.some((ingredient) => {
    if (ingredient.optional) {
      return false;
    }
    return !hasMatchingInventoryItem(ingredient.name, inventory, ["ALCOHOL", "INGREDIENT"]);
  });

  if (hasMissingIngredient) {
    return null;
  }

  const requiredTools = recipe.tools.filter((tool) => !tool.optional);
  const hasMissingTool = requiredTools.some((tool) => !hasMatchingInventoryItem(tool.name, inventory, ["TOOL"]));

  if (hasMissingTool) {
    return null;
  }

  return recipe;
}

export function filterRecipesByInventory(recipes: GeneratedRecipe[], inventory: InventoryForAI[]): GeneratedRecipe[] {
  return recipes
    .map((recipe) => validateRecipeAgainstInventory(recipe, inventory))
    .filter((recipe): recipe is GeneratedRecipe => recipe !== null);
}
