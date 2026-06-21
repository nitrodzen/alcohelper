import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookupRecipe: vi.fn(),
  findMany: vi.fn(),
  createHistory: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "user-1", email: "user@example.com" } })),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  getSessionUserId: () => "user-1",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => true,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventoryItem: {
      findMany: mocks.findMany,
    },
    recipeRequestHistory: {
      create: mocks.createHistory,
    },
  },
}));

vi.mock("@/lib/ai", () => ({
  lookupRecipe: mocks.lookupRecipe,
}));

import { POST } from "@/app/api/recipes/lookup/route";

const inventoryRows = [
  {
    id: "vodka",
    kind: "ALCOHOL",
    name: "Vodka",
    category: "vodka",
    quantity: 500,
    unit: "мл",
    abv: 40,
    description: "Vodka",
    icon: "BottleWine",
    aliases: ["vodka"],
    aiReviewedAt: null,
  },
];

function successfulLookup(title: string) {
  return {
    recipe: {
      title,
      description: "Verified recipe",
      savedRecipeId: null,
      matchType: null,
      ingredients: [{ name: "Vodka", amount: "50 мл", optional: false }],
      tools: [],
      steps: ["Pour", "Serve"],
      warnings: [],
      sources: [{ url: "https://www.diffordsguide.com/cocktails/recipe/example", title }],
      makeability: "AVAILABLE",
      missingIngredients: [],
      shoppingList: [],
      substitutionOptions: [],
      tasteImpact: { level: "NONE", summary: "Все есть." },
      sourceStatus: "VERIFIED",
    },
    adaptedRecipe: null,
    makeability: "AVAILABLE",
    missingIngredients: [],
    shoppingList: [],
    substitutionOptions: [],
    alternatives: [],
    tasteImpact: { level: "NONE", summary: "Все есть." },
    sourceStatus: "VERIFIED",
    sources: [{ url: "https://www.diffordsguide.com/cocktails/recipe/example", title }],
    model: "test-model",
    status: "SUCCESS",
  };
}

describe("POST /api/recipes/lookup", () => {
  beforeEach(() => {
    mocks.lookupRecipe.mockReset();
    mocks.findMany.mockReset();
    mocks.createHistory.mockReset();
    mocks.findMany.mockResolvedValue(inventoryRows);
    mocks.createHistory.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "history-1", ...data }));
  });

  it("handles a Black Russian lookup and stores mode plus full result", async () => {
    mocks.lookupRecipe.mockResolvedValue(successfulLookup("Black Russian"));

    const response = await POST(
      new Request("http://localhost/api/recipes/lookup", {
        method: "POST",
        body: JSON.stringify({ prompt: "коктейль черный русский" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recipe.title).toBe("Black Russian");
    expect(mocks.lookupRecipe).toHaveBeenCalledWith(expect.any(Array), "коктейль черный русский");
    expect(mocks.createHistory).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: "lookup",
        prompt: "коктейль черный русский",
        result: expect.objectContaining({ mode: "lookup", recipe: expect.objectContaining({ title: "Black Russian" }) }),
        status: "SUCCESS",
      }),
    });
  });

  it("handles a Johnny Silverhand lookup through the same route", async () => {
    mocks.lookupRecipe.mockResolvedValue(successfulLookup("Johnny Silverhand"));

    const response = await POST(
      new Request("http://localhost/api/recipes/lookup", {
        method: "POST",
        body: JSON.stringify({ prompt: "джонни сильверхенд" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recipe.title).toBe("Johnny Silverhand");
    expect(mocks.lookupRecipe).toHaveBeenCalledWith(expect.any(Array), "джонни сильверхенд");
  });

  it("returns a structured response instead of 502 for a friendly lookup failure", async () => {
    mocks.lookupRecipe.mockResolvedValue({
      recipe: {
        title: "Unknown",
        description: "Research did not find a reliable recipe.",
        savedRecipeId: null,
        matchType: null,
        ingredients: [],
        tools: [],
        steps: ["Try again", "Clarify the name"],
        warnings: [],
        sources: [],
        makeability: "CANNOT_MAKE",
        missingIngredients: [],
        shoppingList: [],
        substitutionOptions: [],
        tasteImpact: { level: "HIGH", summary: "No recipe found." },
        sourceStatus: "FAILED",
      },
      adaptedRecipe: null,
      makeability: "CANNOT_MAKE",
      missingIngredients: [],
      shoppingList: [],
      substitutionOptions: [],
      alternatives: [],
      tasteImpact: { level: "HIGH", summary: "No recipe found." },
      sourceStatus: "FAILED",
      sources: [],
      model: "test-model",
      status: "SUCCESS",
      error: "Не нашел рецепт по этому запросу.",
    });

    const response = await POST(
      new Request("http://localhost/api/recipes/lookup", {
        method: "POST",
        body: JSON.stringify({ prompt: "unknown cocktail" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.error).toBe("Не нашел рецепт по этому запросу.");
    expect(data.recipe.makeability).toBe("CANNOT_MAKE");
  });
});
