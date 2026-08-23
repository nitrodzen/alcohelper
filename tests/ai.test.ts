import { describe, expect, it } from "vitest";
import {
  buildAvailabilityCheckInstructions,
  buildLocalRecipeInventoryAssessment,
  buildRecipeSearchQueries,
  extractUrlsFromText,
  buildRecipeGenerationInstructions,
  buildRecipeGenerationPayload,
  createNormalizedInventoryPatch,
  isSafeExternalSourceUrl,
  isValidNormalizedInventoryUpdate,
  postProcessGeneratedRecipes,
  verifyGeneratedRecipeSources,
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

function html(title: string, ingredients: string): string {
  return `<html><head><title>${title}</title><meta name="description" content="${ingredients}"></head><body><h1>${title}</h1><p>${ingredients}</p><p>This trusted recipe page has enough visible recipe content for validation.</p></body></html>`;
}

const validSourceValidator = async () => ({
  verdict: "VALID_EXACT" as const,
  reason: "Source title and ingredients match.",
  matchedRecipeTitle: "Matched",
  matchedIngredients: ["Martini Fiero"],
  substitutions: [],
});

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
  it("extracts direct recipe URLs from user text", () => {
    expect(
      extractUrlsFromText("вот рецепт https://alcofan.com/alkogolnye-koktejli-iz-igry-cyberpunk-2077.html?ysclid=test."),
    ).toContainEqual({ url: "https://alcofan.com/alkogolnye-koktejli-iz-igry-cyberpunk-2077.html?ysclid=test" });
  });

  it("builds broader search queries for pop-culture cocktail names", () => {
    const queries = buildRecipeSearchQueries("джонни сильверхенд");

    expect(queries).toContain("Джонни Сильверхенд коктейль Cyberpunk 2077 рецепт");
    expect(queries).toContain("Johnny Silverhand cocktail Cyberpunk 2077 recipe");
    expect(queries.some((query) => query.includes("cocktail recipe"))).toBe(true);
  });

  it("adds English search queries for Russian classic cocktail names", () => {
    expect(buildRecipeSearchQueries("коктейль черный русский")).toContain("Black Russian cocktail recipe");
    expect(buildRecipeSearchQueries("белый русский")).toContain("White Russian cocktail recipe");
  });

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
      needMoreSubstitutionRecipes: true,
      savedRecipeLimitReached: true,
      targetNewRecipes: 6,
    });
    expect(retryPayload).toMatchObject({
      excludeTitles: ["B-52"],
      needMoreNewRecipes: true,
      needMoreSubstitutionRecipes: true,
      savedRecipeLimitReached: true,
      targetNewRecipes: 6,
    });
    const substitutionPayload = buildRecipeGenerationPayload([{ ...martiniWithBadAutofields, name: "Dark rum", category: "rum", aliases: ["dark rum"] }]);
    expect(substitutionPayload.substitutionHints).toContainEqual({ originalRole: "rum-dark", availableSubstitutes: ["Dark rum"] });
  });

  it("tells the model to use sources and not invent recipes", () => {
    const instructions = buildRecipeGenerationInstructions();

    expect(instructions).toContain("### SEARCH & SOURCING");
    expect(instructions).toContain("### MATCHING STRATEGY");
    expect(instructions).toContain("### SUBSTITUTION QUALITY");
    expect(instructions).toContain("### INVENTORY CONSTRAINTS");
    expect(instructions).toContain("### OUTPUT FORMAT");
    expect(instructions).toContain("web search");
    expect(instructions).toContain("diffordsguide.com");
    expect(instructions).toContain("liquor.com");
    expect(instructions).toContain("tuxedono2.com");
    expect(instructions).toContain("ru.inshaker.com");
    expect(instructions).toContain("scienceofdrinks.com");
    expect(instructions).toContain("recipe.sources");
    expect(instructions).toContain("реальный web source");
    expect(instructions).toContain("рабочим URL");
    expect(instructions).toContain("прямые страницы рецептов");
    expect(instructions).toContain("просто пропусти этот рецепт");
    expect(instructions).toContain("Слабые или случайные замены не подходят");
    expect(instructions).toContain("savedRecipes");
    expect(instructions).toContain("до 10");
    expect(instructions).toContain("\n\n###");
  });

  it("adds retry instructions with concrete retry options", () => {
    const instructions = buildRecipeGenerationInstructions({
      needMoreNewRecipes: true,
      needMoreSubstitutionRecipes: true,
      excludeTitles: ["B-52"],
      savedRecipeLimitReached: true,
      targetNewRecipes: 6,
    });

    expect(instructions).toContain("### RETRY LOGIC");
    expect(instructions).toContain("excludeTitles");
    expect(instructions).toContain("Не возвращай savedRecipes");
    expect(instructions).toContain("substitutionHints");
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

  it("dedupes titles, keeps up to 10 options, and drops invalid source URLs", () => {
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

  it("does not spread fallback web search sources across multiple recipe cards", () => {
    const processed = postProcessGeneratedRecipes(
      [recipe("Fresh 1"), recipe("Fresh 2")],
      [martiniWithBadAutofields],
      [],
      [{ url: "https://example.com/fallback" }],
    );

    expect(processed.map((item) => item.sources)).toEqual([[], []]);
  });

  it("keeps only recipes with verified working sources", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("ok")) {
        return new Response(html("OK", "Martini Fiero"), { status: 200 });
      }
      if (url.includes("redirect")) {
        return new Response(html("Redirect", "Martini Fiero"), { status: 301 });
      }
      if (url.includes("head-blocked")) {
        return new Response(init?.method === "HEAD" ? "" : html("Head blocked", "Martini Fiero"), { status: init?.method === "HEAD" ? 405 : 200 });
      }
      if (url.includes("network")) {
        throw new Error("network");
      }
      return new Response("", { status: 404 });
    };

    const verified = await verifyGeneratedRecipeSources(
      [
        recipe("OK", { sources: [{ url: "https://www.diffordsguide.com/ok" }, { url: "https://www.diffordsguide.com/missing" }] }),
        recipe("Redirect", { sources: [{ url: "https://www.diffordsguide.com/redirect" }] }),
        recipe("Head blocked", { sources: [{ url: "https://www.diffordsguide.com/head-blocked" }] }),
        recipe("Missing", { sources: [{ url: "https://www.diffordsguide.com/missing" }] }),
        recipe("Network", { sources: [{ url: "https://www.diffordsguide.com/network" }] }),
        recipe("No source"),
      ],
      { fetchImpl, validator: validSourceValidator },
    );

    expect(verified.map((item) => item.title)).toEqual(["OK", "Redirect", "Head blocked"]);
    expect(verified[0].sources).toEqual([{ url: "https://www.diffordsguide.com/ok" }]);
  });

  it("uses verified fallback sources only for a single recipe without own sources", async () => {
    const fetchImpl: typeof fetch = async () => new Response(html("Single", "Martini Fiero"), { status: 200 });

    const single = await verifyGeneratedRecipeSources([recipe("Single")], {
      fallbackSources: [{ url: "https://www.diffordsguide.com/fallback" }],
      fetchImpl,
      validator: validSourceValidator,
    });
    const multiple = await verifyGeneratedRecipeSources([recipe("First"), recipe("Second")], {
      fallbackSources: [{ url: "https://www.diffordsguide.com/fallback" }],
      fetchImpl,
      validator: validSourceValidator,
    });

    expect(single).toHaveLength(1);
    expect(single[0].sources).toEqual([{ url: "https://www.diffordsguide.com/fallback" }]);
    expect(multiple).toEqual([]);
  });

  it("rejects sources outside the trusted recipe domains", async () => {
    const fetchImpl: typeof fetch = async () => new Response(html("OK", "Martini Fiero"), { status: 200 });
    const verified = await verifyGeneratedRecipeSources(
      [recipe("OK", { sources: [{ url: "https://example.com/ok" }] })],
      { fetchImpl, validator: validSourceValidator },
    );

    expect(verified).toEqual([]);
  });

  it("rejects a trusted source page when it describes another cocktail", async () => {
    const fetchImpl: typeof fetch = async () => new Response(html("Z Martini", "75 ml Ketel One Vodka 37.5 ml Cockburn's Tawny Port"), { status: 200 });
    const validator = async ({ recipe: checkedRecipe, sourceContent }: { recipe: GeneratedRecipe; sourceContent: string }) => ({
      verdict: checkedRecipe.title === "Vodka & Cola" && sourceContent.includes("Z Martini") ? "INVALID_SOURCE_MISMATCH" as const : "VALID_EXACT" as const,
      reason: "Source page is for a different cocktail.",
      matchedRecipeTitle: "Z Martini",
      matchedIngredients: ["Ketel One Vodka", "Cockburn's Tawny Port"],
      substitutions: [],
    });
    const verified = await verifyGeneratedRecipeSources(
      [
        recipe("Vodka & Cola", {
          ingredients: [
            { name: "Martini Fiero", amount: "50 мл", optional: false },
            { name: "Coca-Cola", amount: "120 мл", optional: false },
          ],
          sources: [{ url: "https://www.diffordsguide.com/cocktails/recipe/2118/z-martini" }],
        }),
      ],
      { fetchImpl, validator },
    );

    expect(verified).toEqual([]);
  });

  it("accepts a validated small substitution when the substitute is in inventory", async () => {
    const fetchImpl: typeof fetch = async () => new Response(html("Daiquiri", "White rum lime juice sugar syrup"), { status: 200 });
    const validator = async () => ({
      verdict: "VALID_SUBSTITUTION" as const,
      reason: "Dark rum is a close rum-family substitute for white rum.",
      matchedRecipeTitle: "Daiquiri",
      matchedIngredients: ["White rum", "lime juice", "sugar syrup"],
      substitutions: [{ original: "White rum", substitute: "Dark rum", valid: true }],
    });
    const verified = await verifyGeneratedRecipeSources(
      [
        recipe("Daiquiri", {
          ingredients: [{ name: "Dark rum", amount: "50 мл", optional: false }],
          warnings: ["Замена: Dark rum вместо White rum даст более плотный вкус."],
          sources: [{ url: "https://www.diffordsguide.com/cocktails/recipe/700/daiquiri" }],
        }),
      ],
      {
        fetchImpl,
        validator,
        inventory: [{ ...martiniWithBadAutofields, id: "dark-rum", name: "Dark rum", category: "rum", aliases: ["dark rum"] }],
      },
    );

    expect(verified.map((item) => item.title)).toEqual(["Daiquiri"]);
  });

  it("drops recipes where the model returned an infeasible service message", () => {
    const processed = postProcessGeneratedRecipes(
      [
        recipe("Impossible", {
          description: "Этот рецепт отбрасывается. Нет подходящей замены в инвентаре.",
        }),
        recipe("Possible"),
      ],
      [martiniWithBadAutofields],
      [],
    );

    expect(processed.map((item) => item.title)).toEqual(["Possible"]);
  });

  it("keeps a canonical recipe assessment even when an original ingredient is missing", () => {
    const assessment = buildLocalRecipeInventoryAssessment(
      {
        title: "Black Russian",
        description: "Vodka and coffee liqueur.",
        ingredients: [
          { name: "Vodka", amount: "50 мл", optional: false },
          { name: "Coffee liqueur", amount: "25 мл", optional: false },
        ],
        tools: [],
        steps: ["Build over ice", "Stir"],
        warnings: [],
        sources: [{ url: "https://www.diffordsguide.com/cocktails/recipe/316/black-russian" }],
      },
      [
        { ...martiniWithBadAutofields, id: "vodka", name: "Vodka", category: "vodka", aliases: ["vodka"] },
      ],
    );

    expect(assessment.makeability).toBe("CANNOT_MAKE");
    expect(assessment.missingIngredients).toContainEqual({ name: "Coffee liqueur", amount: "25 мл", kind: "INGREDIENT", reason: "ABSENT" });
    expect(assessment.shoppingList.map((item) => item.name)).toContain("Coffee liqueur");
  });

  it("allows a conservative dessert-liqueur substitute for missing coffee liqueur", () => {
    const assessment = buildLocalRecipeInventoryAssessment(
      {
        title: "Black Russian",
        description: "Vodka and coffee liqueur.",
        ingredients: [
          { name: "Vodka", amount: "50 мл", optional: false },
          { name: "Coffee liqueur", amount: "25 мл", optional: false },
        ],
        tools: [],
        steps: ["Build over ice", "Stir"],
        warnings: [],
        sources: [],
      },
      [
        { ...martiniWithBadAutofields, id: "vodka", name: "Vodka", category: "vodka", aliases: ["vodka"] },
        {
          ...martiniWithBadAutofields,
          id: "choco",
          name: "Chocolate cream liqueur",
          category: "dessert-liqueur",
          aliases: ["chocolate liqueur", "cream liqueur"],
        },
      ],
    );

    expect(assessment.makeability).toBe("AVAILABLE_WITH_SUBSTITUTIONS");
    expect(assessment.substitutionOptions).toContainEqual(
      expect.objectContaining({
        original: "Coffee liqueur",
        substitute: "Chocolate cream liqueur",
        tasteImpact: expect.objectContaining({ level: "MEDIUM" }),
      }),
    );
    expect(assessment.adaptedRecipe?.ingredients.map((ingredient) => ingredient.name)).toContain("Chocolate cream liqueur");
  });

  it("does not mark a distant spirit as a small replacement for coffee liqueur", () => {
    const assessment = buildLocalRecipeInventoryAssessment(
      {
        title: "Black Russian",
        description: "Vodka and coffee liqueur.",
        ingredients: [
          { name: "Vodka", amount: "50 мл", optional: false },
          { name: "Coffee liqueur", amount: "25 мл", optional: false },
        ],
        tools: [],
        steps: ["Build over ice", "Stir"],
        warnings: [],
        sources: [],
      },
      [
        { ...martiniWithBadAutofields, id: "vodka", name: "Vodka", category: "vodka", aliases: ["vodka"] },
        { ...martiniWithBadAutofields, id: "gin", name: "London Dry Gin", category: "gin", aliases: ["gin"] },
      ],
    );

    expect(assessment.makeability).toBe("CANNOT_MAKE");
    expect(assessment.substitutionOptions).toEqual([]);
  });

  it("marks a tracked but insufficient ingredient as unavailable without inventing a replacement", () => {
    const assessment = buildLocalRecipeInventoryAssessment(
      recipe("Short vodka", { ingredients: [{ name: "Vodka", amount: "50 мл", optional: false }] }),
      [{ ...martiniWithBadAutofields, id: "vodka", name: "Vodka", category: "vodka", aliases: ["vodka"], quantity: 20 }],
    );

    expect(assessment.makeability).toBe("CANNOT_MAKE");
    expect(assessment.missingIngredients).toContainEqual(expect.objectContaining({
      name: "Vodka",
      reason: "INSUFFICIENT",
      availableAmount: "20 мл",
    }));
    expect(assessment.substitutionOptions).toEqual([]);
  });

  it("does not recommend cola as a small replacement for tonic", () => {
    const assessment = buildLocalRecipeInventoryAssessment(
      recipe("Vodka tonic", {
        ingredients: [
          { name: "Vodka", amount: "50 мл", optional: false },
          { name: "Tonic water", amount: "120 мл", optional: false },
        ],
      }),
      [
        { ...martiniWithBadAutofields, id: "vodka", name: "Vodka", category: "vodka", aliases: ["vodka"] },
        { ...martiniWithBadAutofields, id: "cola", name: "Cola", category: "mixer", aliases: ["cola"] },
      ],
    );

    expect(assessment.makeability).toBe("CANNOT_MAKE");
    expect(assessment.substitutionOptions).toContainEqual(expect.objectContaining({
      original: "Tonic water",
      substitute: "Cola",
      recommended: false,
      tasteImpact: expect.objectContaining({ level: "HIGH" }),
    }));
  });

  it("marks several medium substitutions as not recommended", () => {
    const assessment = buildLocalRecipeInventoryAssessment(
      recipe("Changed Daiquiri", {
        ingredients: [
          { name: "White rum", amount: "50 мл", optional: false },
          { name: "Lime juice", amount: "25 мл", optional: false },
        ],
      }),
      [
        { ...martiniWithBadAutofields, id: "dark-rum", name: "Dark rum", category: "rum", aliases: ["dark rum"] },
        { ...martiniWithBadAutofields, id: "lemon", name: "Lemon juice", category: "citrus", aliases: ["lemon juice"] },
      ],
    );

    expect(assessment.makeability).toBe("NOT_RECOMMENDED");
    expect(assessment.substitutionOptions).toHaveLength(2);
    expect(assessment.tasteImpact.level).toBe("HIGH");
  });

  it("rejects local addresses and redirects from trusted sources to local services", async () => {
    expect(isSafeExternalSourceUrl("http://127.0.0.1:3000/admin")).toBe(false);
    expect(isSafeExternalSourceUrl("http://db:5432")).toBe(false);
    expect(isSafeExternalSourceUrl("https://www.diffordsguide.com/cocktails/recipe/316/black-russian")).toBe(true);

    const fetchedUrls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      fetchedUrls.push(String(input));
      return new Response("", { status: 302, headers: { location: "http://127.0.0.1:3000/private" } });
    };
    const verified = await verifyGeneratedRecipeSources(
      [recipe("Redirected", { sources: [{ url: "https://www.diffordsguide.com/redirected" }] })],
      { fetchImpl, validator: validSourceValidator },
    );

    expect(verified).toEqual([]);
    expect(fetchedUrls.some((url) => url.includes("127.0.0.1"))).toBe(false);
  });
});
