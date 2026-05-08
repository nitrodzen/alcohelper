import { describe, expect, it } from "vitest";
import {
  buildAvailabilityCheckInstructions,
  buildRecipeGenerationInstructions,
  buildRecipeGenerationPayload,
  createNormalizedInventoryPatch,
  isValidNormalizedInventoryUpdate,
  postProcessGeneratedRecipes,
} from "@/lib/ai";
import type { GeneratedRecipe } from "@/lib/recipe";
import type { InventoryForAI } from "@/lib/inventory";

const martiniWithBadAutofields: InventoryForAI = {
  id: "martini",
  kind: "ALCOHOL",
  name: "Martini Fiero",
  category: "ice",
  quantity: 750,
  unit: "мл",
  abv: null,
  description: "Кубики льда для охлаждения и встряхивания коктейлей.",
  icon: "Snowflake",
  aliases: ["ice"],
  aiReviewedAt: null,
};

function recipe(title: string, extra: Partial<GeneratedRecipe> = {}): GeneratedRecipe {
  return {
    title,
    description: "Test recipe",
    ingredients: [{ name: "Martini Fiero", amount: "30 мл", optional: false }],
    tools: [],
    steps: ["Pour", "Serve"],
    warnings: [],
    sources: [],
    ...extra,
  };
}

describe("AI normalization helpers", () => {
  it("requires useful category and description before an item is considered reviewed", () => {
    expect(isValidNormalizedInventoryUpdate(null)).toBe(false);
    expect(isValidNormalizedInventoryUpdate({ id: "x", name: "Martini Fiero", category: "aperitif", description: "" })).toBe(false);
    expect(
      isValidNormalizedInventoryUpdate({
        id: "x",
        name: "Martini Fiero",
        category: "aperitif",
        description: "Итальянский красно-оранжевый аперитив на основе вина.",
        icon: "BottleWine",
        aliases: ["Martini Fiero"],
      }),
    ).toBe(true);
  });

  it("overwrites stale autofields with the validated AI result", () => {
    const reviewedAt = new Date("2026-05-07T10:00:00.000Z");
    const patch = createNormalizedInventoryPatch(
      martiniWithBadAutofields,
      {
        id: "martini",
        name: "Martini Fiero",
        category: "aperitif",
        abv: 14.9,
        description: "Итальянский красно-оранжевый аперитив на основе вина с цитрусовым профилем.",
        icon: "BottleWine",
        aliases: ["Martini Fiero", "Fiero"],
      },
      reviewedAt,
    );

    expect(patch).toEqual({
      name: "Martini Fiero",
      category: "aperitif",
      abv: 14.9,
      description: "Итальянский красно-оранжевый аперитив на основе вина с цитрусовым профилем.",
      icon: "BottleWine",
      aliases: ["Martini Fiero", "Fiero"],
      aiReviewedAt: reviewedAt,
    });
  });
});

describe("recipe generation prompt helpers", () => {
  it("passes the user comment and full inventory without changing item data", () => {
    const payload = buildRecipeGenerationPayload([martiniWithBadAutofields], "хочу Б-52 или похожий шот", [
      {
        id: "saved-b52",
        title: "B-52",
        description: "Layered shot",
        recipe: {
          title: "B-52",
          description: "Layered shot",
          ingredients: [{ name: "Martini Fiero", amount: "20 мл", optional: false }],
          tools: [],
          steps: ["Pour", "Serve"],
          warnings: [],
          sources: [],
        },
      },
    ]);

    expect(payload.userPrompt).toBe("хочу Б-52 или похожий шот");
    expect(payload.inventory[0]).toMatchObject({
      id: "martini",
      name: "Martini Fiero",
      category: "ice",
      description: "Кубики льда для охлаждения и встряхивания коктейлей.",
      aliases: ["ice"],
    });
    expect(payload.savedRecipes[0]).toMatchObject({ id: "saved-b52", title: "B-52" });

    const retryPayload = buildRecipeGenerationPayload([martiniWithBadAutofields], "", [], {
      excludeTitles: ["B-52"],
      needMoreNewRecipes: true,
      savedRecipeLimitReached: true,
      targetNewRecipes: 6,
    });
    expect(retryPayload).toMatchObject({
      excludeTitles: ["B-52"],
      needMoreNewRecipes: true,
      savedRecipeLimitReached: true,
      targetNewRecipes: 6,
    });
  });

  it("tells the model to use sources and not invent recipes", () => {
    const instructions = buildRecipeGenerationInstructions();

    expect(instructions).toContain("### SEARCH & SOURCING");
    expect(instructions).toContain("### MATCHING STRATEGY");
    expect(instructions).toContain("### INVENTORY CONSTRAINTS");
    expect(instructions).toContain("### OUTPUT FORMAT");
    expect(instructions).toContain("web search");
    expect(instructions).toContain("recipe.sources");
    expect(instructions).toContain("адаптацию/аналог");
    expect(instructions).toContain("рецепт отбрасывается");
    expect(instructions).toContain("savedRecipes");
    expect(instructions).toContain("до 10");
    expect(instructions).toContain("\n\n###");
  });

  it("adds retry instructions with concrete retry options", () => {
    const instructions = buildRecipeGenerationInstructions({
      needMoreNewRecipes: true,
      excludeTitles: ["B-52"],
      savedRecipeLimitReached: true,
      targetNewRecipes: 6,
    });

    expect(instructions).toContain("### RETRY LOGIC");
    expect(instructions).toContain("excludeTitles");
    expect(instructions).toContain("Не возвращай savedRecipes");
    expect(instructions).toContain("savedRecipeId = null");
    expect(instructions).toContain("до 6");
  });

  it("builds strict availability check instructions", () => {
    const instructions = buildAvailabilityCheckInstructions();

    expect(instructions).toContain("### DECISION MATRIX");
    expect(instructions).toContain("### CONSTRAINTS");
    expect(instructions).toContain("recipeId");
    expect(instructions).toContain("AVAILABLE_WITH_SUBSTITUTIONS");
    expect(instructions).toContain("MISSING");
    expect(instructions).toContain("Поле substitute");
  });

  it("limits saved recipes to two and keeps new recipes in the generated list", () => {
    const savedRecipes = [1, 2, 3].map((index) => ({
      id: `saved-${index}`,
      title: `Saved ${index}`,
      description: "Saved recipe",
      recipe: recipe(`Saved ${index}`),
    }));
    const processed = postProcessGeneratedRecipes(
      [...savedRecipes.map((saved) => ({ ...saved.recipe, savedRecipeId: saved.id, matchType: "SAVED" as const })), recipe("Fresh 1"), recipe("Fresh 2")],
      [martiniWithBadAutofields],
      savedRecipes,
    );

    expect(processed.filter((item) => item.savedRecipeId)).toHaveLength(2);
    expect(processed.map((item) => item.title)).toEqual(["Saved 1", "Saved 2", "Fresh 1", "Fresh 2"]);
  });

  it("dedupes titles, keeps up to 10 options, and drops invalid sources", () => {
    const recipes = Array.from({ length: 11 }, (_, index) =>
      recipe(index === 1 ? "Fresh 0" : `Fresh ${index}`, {
        sources: index === 0 ? [{ url: "not-a-url" }, { url: "https://example.com/recipe" }] : [],
      }),
    );

    const processed = postProcessGeneratedRecipes(recipes, [martiniWithBadAutofields], [], [{ url: "also-invalid" }]);

    expect(processed).toHaveLength(10);
    expect(processed.filter((item) => item.title === "Fresh 0")).toHaveLength(1);
    expect(processed[0].sources).toEqual([{ url: "https://example.com/recipe" }]);
  });
});
