import { z } from "zod";
import { hasMatchingInventoryItem, type InventoryForAI } from "@/lib/inventory";

export const sourceLinkSchema = z.object({
  title: z.string().trim().max(180).optional(),
  url: z.string().trim().min(1).max(500),
});

export const makeabilityStatusSchema = z.enum(["AVAILABLE", "AVAILABLE_WITH_SUBSTITUTIONS", "NOT_RECOMMENDED", "CANNOT_MAKE"]);
export const sourceStatusSchema = z.enum(["VERIFIED", "UNVERIFIED", "FAILED"]);
export const tasteImpactLevelSchema = z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]);

export const tasteImpactSchema = z.object({
  level: tasteImpactLevelSchema,
  summary: z.string().trim().max(500),
});

export const missingIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.string().trim().max(80).optional(),
  kind: z.enum(["INGREDIENT", "TOOL"]).optional().default("INGREDIENT"),
});

export const shoppingListItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export const substitutionOptionSchema = z.object({
  original: z.string().trim().min(1).max(120),
  originalAmount: z.string().trim().max(80).optional(),
  substitute: z.string().trim().min(1).max(120),
  substituteInventoryItemId: z.string().trim().min(1).max(120).optional().nullable(),
  note: z.string().trim().max(500).optional(),
  tasteImpact: tasteImpactSchema,
  recommended: z.boolean().default(true),
});

export const generatedRecipeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600),
  savedRecipeId: z.string().trim().min(1).max(120).optional().nullable(),
  matchType: z.enum(["EXACT", "SUBSTITUTION", "SAVED"]).optional().nullable(),
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
  sources: z.array(sourceLinkSchema).max(5).optional().default([]),
  makeability: makeabilityStatusSchema.optional(),
  missingIngredients: z.array(missingIngredientSchema).max(24).optional(),
  shoppingList: z.array(shoppingListItemSchema).max(24).optional(),
  substitutionOptions: z.array(substitutionOptionSchema).max(20).optional(),
  tasteImpact: tasteImpactSchema.optional(),
  sourceStatus: sourceStatusSchema.optional(),
});

export const generatedRecipesSchema = z.object({
  recipes: z.array(generatedRecipeSchema).min(1).max(10),
});

export const availabilityStatusSchema = z.enum(["AVAILABLE", "AVAILABLE_WITH_SUBSTITUTIONS", "MISSING"]);

export const availabilitySubstitutionSchema = z.object({
  original: z.string().trim().min(1).max(120),
  substitute: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).optional(),
});

export const availabilityCheckSchema = z.object({
  recipeId: z.string().trim().min(1).max(120),
  status: availabilityStatusSchema,
  comment: z.string().trim().min(1).max(800),
  missingIngredients: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  substitutions: z.array(availabilitySubstitutionSchema).max(20).default([]),
  warnings: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  sources: z.array(sourceLinkSchema).max(5).default([]),
});

export const availabilityChecksSchema = z.object({
  checks: z.array(availabilityCheckSchema).max(100),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;
export type GeneratedRecipes = z.infer<typeof generatedRecipesSchema>;
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;
export type AvailabilityCheck = z.infer<typeof availabilityCheckSchema>;
export type MakeabilityStatus = z.infer<typeof makeabilityStatusSchema>;
export type SubstitutionOption = z.infer<typeof substitutionOptionSchema>;
export type TasteImpact = z.infer<typeof tasteImpactSchema>;

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
