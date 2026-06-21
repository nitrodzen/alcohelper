import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  hasMatchingInventoryItem,
  heuristicNormalizeItem,
  inventoryInputSchema,
  inventoryUnits,
  normalizeText,
  type InventoryForAI,
  type InventoryInput,
} from "@/lib/inventory";
import {
  filterRecipesByInventory,
  generatedRecipeSchema,
  generatedRecipesSchema,
  makeabilityStatusSchema,
  missingIngredientSchema,
  shoppingListItemSchema,
  substitutionOptionSchema,
  tasteImpactSchema,
  type AvailabilityCheck,
  type GeneratedRecipe,
  type GeneratedRecipes,
  type MakeabilityStatus,
  type SubstitutionOption,
  type TasteImpact,
} from "@/lib/recipe";

const inventoryModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const recipeModel = process.env.OPENAI_RECIPE_MODEL || "gpt-5.4";
const webSearchTool = [{ type: "web_search" as const, search_context_size: "low" as const }];
const sourceSchema = z.object({
  title: z.string().trim().max(180).optional(),
  url: z.string().trim().url(),
});
const trustedRecipeSourceDomains = [
  "diffordsguide.com",
  "liquor.com",
  "punchdrink.com",
  "imbibemagazine.com",
  "iba-world.com",
  "tuxedono2.com",
  "ru.inshaker.com",
  "scienceofdrinks.com",
];

const normalizedInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  abv: z.coerce.number().min(0).max(96).nullable().optional(),
  description: z.string().trim().min(12).max(1200),
  icon: z.string().trim().min(1).max(48),
  aliases: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
});

const normalizedInventoryBatchSchema = z.object({
  items: z.array(
    normalizedInventoryItemSchema.extend({
      id: z.string().trim().min(1),
    }),
  ),
});

const aiGeneratedRecipeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600),
  savedRecipeId: z.string().trim().min(1).max(120).nullable(),
  matchType: z.enum(["EXACT", "SUBSTITUTION", "SAVED"]).nullable(),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        amount: z.string().trim().min(1).max(80),
        inventoryItemId: z.string().trim().min(1).max(120).nullable(),
        optional: z.boolean(),
      }),
    )
    .min(1)
    .max(16),
  tools: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        optional: z.boolean(),
      }),
    )
    .max(10),
  steps: z.array(z.string().trim().min(1).max(500)).min(2).max(14),
  warnings: z.array(z.string().trim().min(1).max(300)).max(6),
  sources: z
    .array(
      z.object({
        title: z.string().trim().max(180).nullable(),
        url: z.string().trim().min(1).max(500),
      }),
    )
    .max(5),
});

const aiGeneratedRecipesSchema = z.object({
  recipes: z.array(aiGeneratedRecipeSchema).min(1).max(10),
});

const aiAvailabilityCheckSchema = z.object({
  recipeId: z.string().trim().min(1).max(120),
  status: z.enum(["AVAILABLE", "AVAILABLE_WITH_SUBSTITUTIONS", "MISSING"]),
  comment: z.string().trim().min(1).max(800),
  missingIngredients: z.array(z.string().trim().min(1).max(120)).max(20),
  substitutions: z
    .array(
      z.object({
        original: z.string().trim().min(1).max(120),
        substitute: z.string().trim().min(1).max(120),
        note: z.string().trim().max(300).nullable(),
      }),
    )
    .max(20),
  warnings: z.array(z.string().trim().min(1).max(300)).max(8),
  sources: z
    .array(
      z.object({
        title: z.string().trim().max(180).nullable(),
        url: z.string().trim().min(1).max(500),
      }),
    )
    .max(5),
});

const aiAvailabilityChecksSchema = z.object({
  checks: z.array(aiAvailabilityCheckSchema).max(100),
});

const recipeSourceCandidatesSchema = z.object({
  canonicalName: z.string().trim().min(1).max(120),
  sources: z.array(sourceSchema).min(1).max(8),
});

const sourceContentValidationSchema = z.object({
  verdict: z.enum(["VALID_EXACT", "VALID_SUBSTITUTION", "INVALID_SOURCE_MISMATCH", "INVALID_INGREDIENT_MISMATCH", "INVALID_NO_RECIPE_CONTENT"]),
  reason: z.string().trim().min(1).max(600),
  matchedRecipeTitle: z.string().trim().max(180).nullable(),
  matchedIngredients: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
  substitutions: z
    .array(
      z.object({
        original: z.string().trim().min(1).max(120),
        substitute: z.string().trim().min(1).max(120),
        valid: z.boolean(),
      }),
    )
    .max(16)
    .default([]),
});

const recipeLookupAssessmentSchema = z.object({
  makeability: makeabilityStatusSchema,
  missingIngredients: z.array(missingIngredientSchema).max(24).default([]),
  shoppingList: z.array(shoppingListItemSchema).max(24).default([]),
  substitutionOptions: z.array(substitutionOptionSchema).max(20).default([]),
  tasteImpact: tasteImpactSchema,
  warnings: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  adaptedRecipe: aiGeneratedRecipeSchema.nullable(),
});

export type NormalizedInventoryUpdate = z.infer<typeof normalizedInventoryBatchSchema>["items"][number];
export type SourceLink = z.infer<typeof sourceSchema>;
export type InventoryAIResult = {
  item: InventoryInput;
  aiReviewed: boolean;
  sources: SourceLink[];
};
export type SavedRecipeForAI = {
  id: string;
  title: string;
  description: string;
  recipe: GeneratedRecipe;
};

export type AvailabilityAIResult = {
  checks: AvailabilityCheck[];
  model: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
};
export type RecipeGenerationOptions = {
  excludeTitles?: string[];
  needMoreNewRecipes?: boolean;
  needMoreSubstitutionRecipes?: boolean;
  savedRecipeLimitReached?: boolean;
  targetNewRecipes?: number;
};
type RecipeGenerationResult = {
  recipes: GeneratedRecipe[];
  model: string;
  sources: SourceLink[];
  status: "SUCCESS" | "FAILED";
  error?: string;
};
export type MissingIngredient = z.infer<typeof missingIngredientSchema>;
export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;
export type RecipeLookupResult = {
  recipe: GeneratedRecipe;
  adaptedRecipe: GeneratedRecipe | null;
  makeability: MakeabilityStatus;
  missingIngredients: MissingIngredient[];
  shoppingList: ShoppingListItem[];
  substitutionOptions: SubstitutionOption[];
  tasteImpact: TasteImpact;
  sourceStatus: "VERIFIED" | "FAILED";
  sources: SourceLink[];
  model: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
};
export type RecipeInventoryAssessment = Omit<RecipeLookupResult, "recipe" | "sourceStatus" | "sources" | "model" | "status" | "error"> & {
  warnings: string[];
};
type SourceContentValidationResult = z.infer<typeof sourceContentValidationSchema>;
type SourceContentValidator = (input: {
  recipe: GeneratedRecipe;
  source: SourceLink;
  sourceContent: string;
  inventory: InventoryForAI[];
}) => Promise<SourceContentValidationResult>;
type SourceVerificationOptions = {
  fallbackSources?: SourceLink[];
  fetchImpl?: FetchLike;
  inventory?: InventoryForAI[];
  validator?: SourceContentValidator;
};
type VerifiedSourceContent = {
  source: SourceLink;
  sourceContent: string;
};

const maxGeneratedRecipes = 10;
const minTargetRecipes = 8;
const maxSavedRecipesInGeneration = 2;
const sourceVerificationTimeoutMs = 4500;

type FetchLike = typeof fetch;

function heuristicFromInventoryForAI(item: InventoryForAI): NormalizedInventoryUpdate {
  const normalized = heuristicNormalizeItem({
    kind: item.kind,
    name: item.name,
    category: item.category,
    quantity: item.quantity ?? undefined,
    unit: item.unit && (inventoryUnits as readonly string[]).includes(item.unit) ? (item.unit as InventoryInput["unit"]) : undefined,
    abv: item.abv,
    description: item.description,
    icon: item.icon,
    aliases: item.aliases,
  });

  return {
    id: item.id,
    name: normalized.name,
    category: normalized.category,
    abv: normalized.abv,
    description: normalized.description || item.name,
    icon: normalized.icon,
    aliases: normalized.aliases,
  };
}

export function isValidNormalizedInventoryUpdate(update: Partial<NormalizedInventoryUpdate> | null | undefined): update is NormalizedInventoryUpdate {
  return Boolean(update?.name?.trim() && update?.category?.trim() && update?.description?.trim());
}

export function createNormalizedInventoryPatch(
  item: InventoryForAI,
  update: Partial<NormalizedInventoryUpdate> | null | undefined,
  reviewedAt: Date,
) {
  if (!isValidNormalizedInventoryUpdate(update)) {
    return null;
  }

  return {
    name: update.name,
    category: update.category,
    abv: item.kind === "ALCOHOL" ? update.abv ?? null : null,
    description: update.description,
    aliases: update.aliases,
    icon: update.icon,
    aiReviewedAt: reviewedAt,
  };
}

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const json = start >= 0 && end >= start ? text.slice(start, end + 1) : text;
  return schema.parse(JSON.parse(json));
}

function extractWebSources(response: { output?: unknown }): SourceLink[] {
  const output = Array.isArray(response.output) ? response.output : [];
  const urls = new Map<string, SourceLink>();

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const action = "action" in item ? (item as { action?: unknown }).action : undefined;
    if (!action || typeof action !== "object") {
      continue;
    }
    const sources = "sources" in action ? (action as { sources?: unknown }).sources : undefined;
    if (!Array.isArray(sources)) {
      continue;
    }
    for (const source of sources) {
      if (!source || typeof source !== "object") {
        continue;
      }
      const rawUrl = "url" in source ? (source as { url?: unknown }).url : undefined;
      if (typeof rawUrl !== "string" || urls.has(rawUrl)) {
        continue;
      }
      const rawTitle = "title" in source ? (source as { title?: unknown }).title : undefined;
      const parsed = sourceSchema.safeParse({ url: rawUrl, title: typeof rawTitle === "string" ? rawTitle : undefined });
      if (parsed.success) {
        urls.set(rawUrl, parsed.data);
      }
      if (urls.size >= 5) {
        return [...urls.values()];
      }
    }
  }

  return [...urls.values()];
}

function limitSources(sources: SourceLink[]): SourceLink[] {
  const unique = new Map<string, SourceLink>();

  for (const source of sources) {
    if (!unique.has(source.url)) {
      unique.set(source.url, source);
    }
    if (unique.size >= 5) {
      return [...unique.values()];
    }
  }

  return [...unique.values()];
}

function sanitizeSources(sources: SourceLink[] | undefined): SourceLink[] {
  const unique = new Map<string, SourceLink>();

  for (const source of sources ?? []) {
    const parsed = sourceSchema.safeParse(source);
    if (!parsed.success || unique.has(parsed.data.url) || !isHttpSourceUrl(parsed.data.url)) {
      continue;
    }
    unique.set(parsed.data.url, parsed.data);
    if (unique.size >= 5) {
      return [...unique.values()];
    }
  }

  return [...unique.values()];
}

function isHttpSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isTrustedRecipeSourceUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    return trustedRecipeSourceDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function fetchWithTimeout(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sourceVerificationTimeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractSourceContent(html: string): string {
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const meta = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:title|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .join("\n");
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities([title, meta, jsonLd, visible].join("\n"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14000);
}

async function fetchVerifiedSourceContent(source: SourceLink, fetchImpl: FetchLike): Promise<VerifiedSourceContent | null> {
  if (!isHttpSourceUrl(source.url) || !isTrustedRecipeSourceUrl(source.url)) {
    return null;
  }

  try {
    const head = await fetchWithTimeout(fetchImpl, source.url, { method: "HEAD" });
    if (!(head.status >= 200 && head.status < 400) && ![403, 405, 429, 501].includes(head.status)) {
      return null;
    }
  } catch {
    // Some recipe sites block HEAD; retry with GET before rejecting the source.
  }

  try {
    const get = await fetchWithTimeout(fetchImpl, source.url, { method: "GET" });
    if (!(get.status >= 200 && get.status < 400)) {
      return null;
    }
    const sourceContent = extractSourceContent(await get.text());
    return sourceContent.length >= 80 ? { source, sourceContent } : null;
  } catch {
    return null;
  }
}

async function verifySources(
  sources: SourceLink[],
  fetchImpl: FetchLike,
  cache: Map<string, Promise<VerifiedSourceContent | null>>,
): Promise<VerifiedSourceContent[]> {
  const sanitized = sanitizeSources(sources);
  const verified = await Promise.all(
    sanitized.map((source) => {
      const cached = cache.get(source.url);
      if (cached) {
        return cached;
      }
      const promise = fetchVerifiedSourceContent(source, fetchImpl);
      cache.set(source.url, promise);
      return promise;
    }),
  );

  return verified.filter((source): source is VerifiedSourceContent => source !== null).slice(0, 5);
}

function recipeTitleKey(title: string): string {
  return normalizeText(title);
}

function dedupeRecipesByTitle(recipes: GeneratedRecipe[]): GeneratedRecipe[] {
  const seen = new Set<string>();

  return recipes.filter((recipe) => {
    const key = recipeTitleKey(recipe.title);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function attachSavedRecipeMetadata(recipes: GeneratedRecipe[], savedRecipes: SavedRecipeForAI[]): GeneratedRecipe[] {
  const savedIds = new Set(savedRecipes.map((recipe) => recipe.id));
  const savedByTitle = new Map(savedRecipes.map((recipe) => [recipeTitleKey(recipe.title), recipe.id]));

  return recipes.map((recipe) => {
    const validSavedId = recipe.savedRecipeId && savedIds.has(recipe.savedRecipeId) ? recipe.savedRecipeId : null;
    const titleMatchId = savedByTitle.get(recipeTitleKey(recipe.title)) ?? null;
    const savedRecipeId = validSavedId ?? titleMatchId;

    if (!savedRecipeId) {
      return { ...recipe, savedRecipeId: null };
    }

    return {
      ...recipe,
      savedRecipeId,
      matchType: recipe.matchType ?? "SAVED",
    };
  });
}

function hasInfeasibleRecipeMarker(recipe: GeneratedRecipe): boolean {
  const text = normalizeText(
    [
      recipe.title,
      recipe.description,
      ...recipe.warnings,
      ...recipe.steps,
    ].join(" "),
  );
  const markers = [
    "рецепт отбрасывается",
    "вариант отбрасывается",
    "невозможно собрать",
    "невозможно приготовить",
    "нельзя приготовить",
    "нет ингредиентов",
    "не хватает ингредиентов",
    "отсутствует обязательный",
    "нет подходящей замены",
    "cannot be made",
    "not feasible",
    "missing required",
  ];

  return markers.some((marker) => text.includes(normalizeText(marker)));
}

export function postProcessGeneratedRecipes(
  recipes: GeneratedRecipe[],
  inventory: InventoryForAI[],
  savedRecipes: SavedRecipeForAI[],
  _fallbackSources: SourceLink[] = [],
): GeneratedRecipe[] {
  const recipesWithCleanSources = recipes.map((recipe) => {
    const cleanSources = sanitizeSources(recipe.sources);
    return {
      ...recipe,
      sources: cleanSources,
    };
  });
  const available = attachSavedRecipeMetadata(filterRecipesByInventory(recipesWithCleanSources, inventory), savedRecipes)
    .filter((recipe) => !hasInfeasibleRecipeMarker(recipe));
  const deduped = dedupeRecipesByTitle(available);
  const saved = deduped.filter((recipe) => recipe.savedRecipeId).slice(0, maxSavedRecipesInGeneration);
  const fresh = deduped.filter((recipe) => !recipe.savedRecipeId);

  return [...saved, ...fresh].slice(0, maxGeneratedRecipes);
}

export async function validateRecipeSourceContentWithAI(input: {
  recipe: GeneratedRecipe;
  source: SourceLink;
  sourceContent: string;
  inventory: InventoryForAI[];
}): Promise<SourceContentValidationResult> {
  const client = getClient();

  if (!client) {
    return {
      verdict: "INVALID_NO_RECIPE_CONTENT",
      reason: "OPENAI_API_KEY is not configured for source content validation.",
      matchedRecipeTitle: null,
      matchedIngredients: [],
      substitutions: [],
    };
  }

  try {
    const response = await client.responses.parse({
      model: recipeModel,
      text: {
        format: zodTextFormat(sourceContentValidationSchema, "recipe_source_validation"),
      },
      input: [
        {
          role: "system",
          content:
            "Ты проверяешь, что страница источника действительно является источником конкретного коктейля. Верни VALID_EXACT только если название и ингредиенты страницы совпадают с рецептом. Верни VALID_SUBSTITUTION только если страница содержит базовый оригинальный рецепт, а отличия в карточке являются небольшими заменами из inventory и явно описаны. Если ссылка ведет на другой рецепт, категорию, поиск, главную страницу или состав страницы не совпадает, верни INVALID_*.",
        },
        {
          role: "user",
          content: JSON.stringify({
            recipe: input.recipe,
            source: input.source,
            inventory: buildInventoryPayload(input.inventory),
            sourceContent: input.sourceContent,
          }),
        },
      ],
    });

    return response.output_parsed ?? {
      verdict: "INVALID_NO_RECIPE_CONTENT",
      reason: "Empty source validation response.",
      matchedRecipeTitle: null,
      matchedIngredients: [],
      substitutions: [],
    };
  } catch {
    return {
      verdict: "INVALID_NO_RECIPE_CONTENT",
      reason: "Source validation failed.",
      matchedRecipeTitle: null,
      matchedIngredients: [],
      substitutions: [],
    };
  }
}

function isValidSourceContentValidation(result: SourceContentValidationResult): boolean {
  if (result.verdict === "VALID_EXACT") {
    return true;
  }
  if (result.verdict !== "VALID_SUBSTITUTION") {
    return false;
  }
  return result.substitutions.length > 0 && result.substitutions.every((substitution) => substitution.valid);
}

export async function verifyGeneratedRecipeSources(recipes: GeneratedRecipe[], options: SourceVerificationOptions = {}): Promise<GeneratedRecipe[]> {
  const fallbackSources = options.fallbackSources ?? [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const inventory = options.inventory ?? [];
  const validator = options.validator ?? validateRecipeSourceContentWithAI;
  const cache = new Map<string, Promise<VerifiedSourceContent | null>>();
  const canUseFallbackForSingleRecipe = recipes.length === 1;
  const verifiedRecipes = await Promise.all(
    recipes.map(async (recipe) => {
      const recipeSources = sanitizeSources(recipe.sources);
      const candidates = recipeSources.length ? recipeSources : canUseFallbackForSingleRecipe ? sanitizeSources(fallbackSources) : [];
      const reachableSources = await verifySources(candidates, fetchImpl, cache);
      const validSources: SourceLink[] = [];

      for (const reachable of reachableSources) {
        const validation = await validator({
          recipe,
          source: reachable.source,
          sourceContent: reachable.sourceContent,
          inventory,
        });
        if (isValidSourceContentValidation(validation)) {
          validSources.push(reachable.source);
        }
      }

      if (validSources.length === 0) {
        return null;
      }

      return {
        ...recipe,
        sources: limitSources(validSources),
      };
    }),
  );

  return verifiedRecipes.filter((recipe): recipe is GeneratedRecipe => recipe !== null);
}

function buildInventoryPayload(inventory: InventoryForAI[]) {
  return inventory.map((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    abv: item.abv,
    description: item.description,
    aliases: item.aliases,
  }));
}

function buildSavedRecipesPayload(savedRecipes: SavedRecipeForAI[]) {
  return savedRecipes.slice(0, 50).map((saved) => ({
    id: saved.id,
    title: saved.title,
    description: saved.description,
    ingredients: saved.recipe.ingredients,
    tools: saved.recipe.tools,
    warnings: saved.recipe.warnings,
    sources: saved.recipe.sources ?? [],
  }));
}

function ingredientRoleFromText(value: string): string | null {
  const text = normalizeText(value);

  if (text.match(/white rum|dark rum|rum|ром/)) return "rum";
  if (text.match(/vodka|водк/)) return "vodka";
  if (text.match(/gin|джин/)) return "gin";
  if (text.match(/tequila|текил/)) return "tequila";
  if (text.match(/whiskey|whisky|bourbon|виски|бурбон/)) return "whiskey";
  if (text.match(/kahlua|coffee|кофе|калуа/)) return "coffee-liqueur";
  if (text.match(/orange|triple sec|cointreau|curacao|curaçao|апельсин/)) return "orange-liqueur";
  if (text.match(/chocolate|cream|сливоч|шоколад|baileys|бейлис/)) return "dessert-liqueur";
  if (text.match(/vermouth|martini|вермут/)) return "vermouth";
  if (text.match(/bitters|angostura|bitter|биттер|ангостур/)) return "bitter";
  if (text.match(/lime|lemon|citrus|лайм|лимон|цитрус/)) return "citrus";
  if (text.match(/syrup|сироп/)) return "syrup";
  if (text.match(/cola|tonic|soda|sprite|газ|тоник|кола/)) return "sparkling-mixer";
  if (text.match(/juice|сок/)) return "juice";

  return null;
}

function inventoryRole(item: Pick<InventoryForAI, "kind" | "name" | "category" | "description" | "aliases">): string | null {
  if (item.kind === "TOOL") {
    return null;
  }
  return ingredientRoleFromText([item.name, item.category, item.description, ...item.aliases].join(" "));
}

function buildSubstitutionHints(inventory: InventoryForAI[]) {
  const candidates = inventory
    .map((item) => ({ id: item.id, name: item.name, role: inventoryRole(item) }))
    .filter((item): item is { id: string; name: string; role: string } => Boolean(item.role));
  const hints: Array<{ originalRole: string; availableSubstitutes: string[] }> = [];

  for (const role of [...new Set(candidates.map((candidate) => candidate.role))]) {
    const names = candidates.filter((candidate) => candidate.role === role).map((candidate) => candidate.name);
    if (names.length > 0) {
      hints.push({ originalRole: role, availableSubstitutes: names });
    }
  }

  return hints.slice(0, 30);
}

function tasteImpact(level: TasteImpact["level"], summary: string): TasteImpact {
  return { level, summary };
}

function maxTasteImpact(impacts: TasteImpact[]): TasteImpact {
  if (impacts.length === 0) {
    return tasteImpact("NONE", "Оригинальный вкус сохраняется: замены не нужны.");
  }

  const order: Record<TasteImpact["level"], number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
  return impacts.reduce((max, current) => (order[current.level] > order[max.level] ? current : max));
}

function conservativeRoleCompatibility(originalRole: string | null, substituteRole: string | null): TasteImpact | null {
  if (!originalRole || !substituteRole) {
    return null;
  }
  if (originalRole === substituteRole) {
    return tasteImpact("LOW", "Замена остается в той же вкусовой роли, вкус должен измениться слабо.");
  }
  if (originalRole === "coffee-liqueur" && substituteRole === "dessert-liqueur") {
    return tasteImpact("MEDIUM", "Кофейная горечь уйдет в шоколадно-сливочный профиль; это заметная, но понятная десертная замена.");
  }
  if (originalRole === "dessert-liqueur" && substituteRole === "coffee-liqueur") {
    return tasteImpact("MEDIUM", "Сладкий десертный профиль станет более кофейным и горьким, но роль ликера сохраняется.");
  }
  if (originalRole === "citrus" && substituteRole === "juice") {
    return tasteImpact("MEDIUM", "Кислотность станет мягче и слаще, поэтому баланс заметно изменится.");
  }
  return null;
}

function findConservativeSubstitution(
  missing: MissingIngredient,
  inventory: InventoryForAI[],
): SubstitutionOption | null {
  if (missing.kind === "TOOL") {
    return null;
  }

  const originalRole = ingredientRoleFromText(missing.name);
  const candidates = inventory
    .filter((item) => item.kind !== "TOOL")
    .map((item) => ({
      item,
      impact: conservativeRoleCompatibility(originalRole, inventoryRole(item)),
    }))
    .filter((candidate): candidate is { item: InventoryForAI; impact: TasteImpact } => Boolean(candidate.impact));

  const candidate = candidates.sort((a, b) => {
    const order: Record<TasteImpact["level"], number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
    return order[a.impact.level] - order[b.impact.level];
  })[0];

  if (!candidate) {
    return null;
  }

  return {
    original: missing.name,
    originalAmount: missing.amount,
    substitute: candidate.item.name,
    substituteInventoryItemId: candidate.item.id,
    note: candidate.impact.summary,
    tasteImpact: candidate.impact,
    recommended: candidate.impact.level !== "HIGH",
  };
}

function applySubstitutionsToRecipe(recipe: GeneratedRecipe, substitutions: SubstitutionOption[]): GeneratedRecipe {
  const substitutionsByOriginal = new Map(substitutions.map((substitution) => [normalizeText(substitution.original), substitution]));
  const warnings = [
    ...recipe.warnings,
    ...substitutions.map((substitution) => `Замена: ${substitution.original} -> ${substitution.substitute}. ${substitution.note ?? substitution.tasteImpact.summary}`),
  ].slice(0, 6);

  return {
    ...recipe,
    matchType: "SUBSTITUTION",
    ingredients: recipe.ingredients.map((ingredient) => {
      const substitution = substitutionsByOriginal.get(normalizeText(ingredient.name));
      if (!substitution) {
        return ingredient;
      }
      return {
        ...ingredient,
        name: substitution.substitute,
        inventoryItemId: substitution.substituteInventoryItemId ?? ingredient.inventoryItemId ?? null,
      };
    }),
    warnings,
  };
}

export function buildLocalRecipeInventoryAssessment(recipe: GeneratedRecipe, inventory: InventoryForAI[]): RecipeInventoryAssessment {
  const missingIngredients = recipe.ingredients
    .filter((ingredient) => !ingredient.optional && !hasMatchingInventoryItem(ingredient.name, inventory, ["ALCOHOL", "INGREDIENT"]))
    .map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
      kind: "INGREDIENT" as const,
    }));
  const missingTools = recipe.tools
    .filter((tool) => !tool.optional && !hasMatchingInventoryItem(tool.name, inventory, ["TOOL"]))
    .map((tool) => ({
      name: tool.name,
      kind: "TOOL" as const,
    }));
  const missing = [...missingIngredients, ...missingTools];
  const shoppingList = missing.map((item) => ({
    name: item.name,
    amount: "amount" in item ? item.amount : undefined,
    note: item.kind === "TOOL" ? "Нужен инструмент для корректной подачи/приготовления." : "Нужен для оригинального рецепта.",
  }));

  if (missing.length === 0) {
    return {
      adaptedRecipe: null,
      makeability: "AVAILABLE",
      missingIngredients: [],
      shoppingList: [],
      substitutionOptions: [],
      tasteImpact: tasteImpact("NONE", "Все обязательные компоненты есть в инвентаре."),
      warnings: [],
    };
  }

  const substitutions = missingIngredients
    .map((item) => findConservativeSubstitution(item, inventory))
    .filter((item): item is SubstitutionOption => item !== null);
  const substitutedOriginals = new Set(substitutions.filter((item) => item.recommended && item.tasteImpact.level !== "HIGH").map((item) => normalizeText(item.original)));
  const allIngredientGapsCovered = missingIngredients.every((item) => substitutedOriginals.has(normalizeText(item.name)));
  const hasMissingTools = missingTools.length > 0;

  if (!hasMissingTools && allIngredientGapsCovered && substitutions.length > 0) {
    const adaptedRecipe = applySubstitutionsToRecipe(recipe, substitutions);
    const impact = maxTasteImpact(substitutions.map((substitution) => substitution.tasteImpact));
    return {
      adaptedRecipe,
      makeability: impact.level === "HIGH" ? "NOT_RECOMMENDED" : "AVAILABLE_WITH_SUBSTITUTIONS",
      missingIngredients: missing,
      shoppingList,
      substitutionOptions: substitutions,
      tasteImpact: impact,
      warnings: adaptedRecipe.warnings,
    };
  }

  return {
    adaptedRecipe: null,
    makeability: "CANNOT_MAKE",
    missingIngredients: missing,
    shoppingList,
    substitutionOptions: substitutions,
    tasteImpact: tasteImpact("HIGH", "Без недостающих компонентов или надежных близких замен рецепт собрать честно нельзя."),
    warnings: ["Нет достаточно близкой замены для всех обязательных компонентов."],
  };
}

function normalizeAiAssessment(
  recipe: GeneratedRecipe,
  inventory: InventoryForAI[],
  local: RecipeInventoryAssessment,
  parsed: z.infer<typeof recipeLookupAssessmentSchema>,
): RecipeInventoryAssessment {
  if (local.makeability === "AVAILABLE") {
    return local;
  }

  const inventoryByName = new Map(inventory.map((item) => [normalizeText(item.name), item]));
  const missingIngredientKeys = new Set(local.missingIngredients.filter((item) => item.kind !== "TOOL").map((item) => normalizeText(item.name)));
  const validSubstitutions: SubstitutionOption[] = [];
  for (const substitution of parsed.substitutionOptions) {
    const item = inventoryByName.get(normalizeText(substitution.substitute));
    if (!item || !missingIngredientKeys.has(normalizeText(substitution.original))) {
      continue;
    }
    validSubstitutions.push({
      ...substitution,
      substitute: item.name,
      substituteInventoryItemId: item.id,
    });
  }
  const recommendedSubstitutions = validSubstitutions.filter((item) => item.recommended && item.tasteImpact.level !== "HIGH");
  const highImpactSubstitutions = validSubstitutions.filter((item) => !item.recommended || item.tasteImpact.level === "HIGH");
  const recommendedOriginals = new Set(recommendedSubstitutions.map((item) => normalizeText(item.original)));
  const missingIngredients = local.missingIngredients.filter((item) => item.kind !== "TOOL");
  const hasMissingTools = local.missingIngredients.some((item) => item.kind === "TOOL");
  const allCovered = missingIngredients.length > 0 && missingIngredients.every((item) => recommendedOriginals.has(normalizeText(item.name)));

  if (hasMissingTools) {
    return {
      ...local,
      substitutionOptions: validSubstitutions.length ? validSubstitutions : local.substitutionOptions,
      warnings: [...local.warnings, ...parsed.warnings].slice(0, 8),
    };
  }

  if (highImpactSubstitutions.length > 0 && !allCovered) {
    return {
      adaptedRecipe: null,
      makeability: "NOT_RECOMMENDED",
      missingIngredients: local.missingIngredients,
      shoppingList: local.shoppingList,
      substitutionOptions: validSubstitutions,
      tasteImpact: maxTasteImpact(highImpactSubstitutions.map((substitution) => substitution.tasteImpact)),
      warnings: parsed.warnings.length ? parsed.warnings : ["Есть только замена с сильным сдвигом вкуса, такой вариант не рекомендую."],
    };
  }

  if (allCovered) {
    const adaptedRecipe = parsed.adaptedRecipe ? normalizeAiGeneratedRecipes({ recipes: [parsed.adaptedRecipe] }).recipes[0] : applySubstitutionsToRecipe(recipe, recommendedSubstitutions);
    const impact = maxTasteImpact(recommendedSubstitutions.map((substitution) => substitution.tasteImpact));
    return {
      adaptedRecipe: {
        ...adaptedRecipe,
        makeability: "AVAILABLE_WITH_SUBSTITUTIONS",
        missingIngredients: local.missingIngredients,
        shoppingList: local.shoppingList,
        substitutionOptions: recommendedSubstitutions,
        tasteImpact: impact,
        sourceStatus: "VERIFIED",
        sources: recipe.sources ?? [],
      },
      makeability: "AVAILABLE_WITH_SUBSTITUTIONS",
      missingIngredients: local.missingIngredients,
      shoppingList: local.shoppingList,
      substitutionOptions: recommendedSubstitutions,
      tasteImpact: impact,
      warnings: parsed.warnings.length ? parsed.warnings : adaptedRecipe.warnings,
    };
  }

  return {
    ...local,
    substitutionOptions: validSubstitutions.length ? validSubstitutions : local.substitutionOptions,
    warnings: parsed.warnings.length ? parsed.warnings : local.warnings,
  };
}

async function assessRecipeAgainstInventoryWithAI(
  client: OpenAI,
  recipe: GeneratedRecipe,
  inventory: InventoryForAI[],
  local: RecipeInventoryAssessment,
): Promise<RecipeInventoryAssessment> {
  if (local.makeability === "AVAILABLE") {
    return local;
  }

  try {
    const response = await client.responses.parse({
      model: recipeModel,
      text: {
        format: zodTextFormat(recipeLookupAssessmentSchema, "recipe_inventory_assessment"),
      },
      input: [
        {
          role: "system",
          content:
            "Ты шеф-бармен и проверяешь конкретный подтвержденный рецепт против inventory. Политика conservative: хорошая замена сохраняет роль и основной вкус; если замена сильно меняет вкус, верни NOT_RECOMMENDED, а не AVAILABLE_WITH_SUBSTITUTIONS. Инструменты не заменяй случайными предметами. substitute всегда должен быть точным name из inventory. Если нельзя покрыть все обязательные ингредиенты близкими заменами, верни CANNOT_MAKE.",
        },
        {
          role: "user",
          content: JSON.stringify({
            recipe,
            inventory: buildInventoryPayload(inventory),
            localAssessment: local,
            substitutionHints: buildSubstitutionHints(inventory),
          }),
        },
      ],
    });

    return response.output_parsed ? normalizeAiAssessment(recipe, inventory, local, response.output_parsed) : local;
  } catch {
    return local;
  }
}

function annotateRecipeWithAssessment(recipe: GeneratedRecipe, assessment: RecipeInventoryAssessment, sourceStatus: "VERIFIED" | "UNVERIFIED" | "FAILED" = "VERIFIED"): GeneratedRecipe {
  return {
    ...recipe,
    makeability: assessment.makeability,
    missingIngredients: assessment.missingIngredients,
    shoppingList: assessment.shoppingList,
    substitutionOptions: assessment.substitutionOptions,
    tasteImpact: assessment.tasteImpact,
    sourceStatus,
  };
}

function annotateDiscoveredRecipe(recipe: GeneratedRecipe, inventory: InventoryForAI[]): GeneratedRecipe {
  const local = buildLocalRecipeInventoryAssessment(recipe, inventory);

  if (local.makeability !== "AVAILABLE") {
    return annotateRecipeWithAssessment(recipe, local, recipe.sources?.length ? "VERIFIED" : "UNVERIFIED");
  }

  const isSubstitution = recipe.matchType === "SUBSTITUTION";
  const assessment: RecipeInventoryAssessment = {
    ...local,
    makeability: isSubstitution ? "AVAILABLE_WITH_SUBSTITUTIONS" : "AVAILABLE",
    tasteImpact: isSubstitution
      ? tasteImpact("LOW", "Рецепт уже адаптирован под имеющийся инвентарь; замена должна быть небольшой.")
      : local.tasteImpact,
    warnings: recipe.warnings,
  };

  return annotateRecipeWithAssessment(recipe, assessment, recipe.sources?.length ? "VERIFIED" : "UNVERIFIED");
}

function normalizeAiGeneratedRecipes(parsed: z.infer<typeof aiGeneratedRecipesSchema>): GeneratedRecipes {
  return {
    recipes: parsed.recipes.map((recipe) => ({
      ...recipe,
      savedRecipeId: recipe.savedRecipeId ?? null,
      matchType: recipe.matchType ?? null,
      sources: recipe.sources.map((source) => ({
        url: source.url,
        title: source.title ?? undefined,
      })),
    })),
  };
}

function normalizeAiAvailabilityChecks(parsed: z.infer<typeof aiAvailabilityChecksSchema>) {
  return {
    checks: parsed.checks.map((check) => ({
      ...check,
      substitutions: check.substitutions.map((substitution) => ({
        original: substitution.original,
        substitute: substitution.substitute,
        note: substitution.note ?? undefined,
      })),
      sources: sanitizeSources(
        check.sources.map((source) => ({
          url: source.url,
          title: source.title ?? undefined,
        })),
      ),
    })),
  };
}

async function searchRecipeSourceCandidates(client: OpenAI, prompt: string): Promise<SourceLink[]> {
  const response = await client.responses.parse({
    model: recipeModel,
    tools: webSearchTool,
    include: ["web_search_call.action.sources"],
    text: {
      format: zodTextFormat(recipeSourceCandidatesSchema, "recipe_source_candidates"),
    },
    input: [
      {
        role: "system",
        content:
          "Найди прямые страницы существующего коктейльного рецепта по запросу пользователя. Верни только реальные страницы рецептов, не главные страницы, не поиск, не категории. Приоритет: Difford's Guide, Liquor.com, Punch, Imbibe, IBA, Tuxedo No. 2, Inshaker, Science of Drinks. Если рецепт из поп-культуры, ищи человеческие опубликованные рецепты, а не выдумывай состав.",
      },
      {
        role: "user",
        content: JSON.stringify({ prompt }),
      },
    ],
  });

  const parsedSources = response.output_parsed?.sources ?? [];
  return limitSources([...parsedSources, ...extractWebSources(response)]);
}

async function parseCanonicalRecipeFromSource(
  client: OpenAI,
  prompt: string,
  source: SourceLink,
  sourceContent: string,
): Promise<GeneratedRecipe | null> {
  try {
    const response = await client.responses.parse({
      model: recipeModel,
      text: {
        format: zodTextFormat(aiGeneratedRecipeSchema, "canonical_cocktail_recipe"),
      },
      input: [
        {
          role: "system",
          content:
            "Извлеки из sourceContent канонический рецепт коктейля, который соответствует запросу. Не адаптируй под inventory, не заменяй ингредиенты и не добавляй покупки. Если страница содержит рецепт, верни его как JSON. ingredient.name должен быть названием оригинального ингредиента из источника. sources должен содержать только переданный source.",
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            source,
            sourceContent,
          }),
        },
      ],
    });

    if (!response.output_parsed) {
      return null;
    }

    const recipe = normalizeAiGeneratedRecipes({ recipes: [response.output_parsed] }).recipes[0];
    const parsed = generatedRecipeSchema.safeParse({
      ...recipe,
      savedRecipeId: null,
      matchType: null,
      sources: [source],
      sourceStatus: "VERIFIED",
    });

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function findVerifiedCanonicalRecipe(
  client: OpenAI,
  prompt: string,
  inventory: InventoryForAI[],
  fetchImpl: FetchLike,
): Promise<{ recipe: GeneratedRecipe; sources: SourceLink[] } | null> {
  const candidates = await searchRecipeSourceCandidates(client, prompt);
  const cache = new Map<string, Promise<VerifiedSourceContent | null>>();
  const verifiedSources = await verifySources(candidates, fetchImpl, cache);

  for (const verified of verifiedSources) {
    const recipe = await parseCanonicalRecipeFromSource(client, prompt, verified.source, verified.sourceContent);
    if (!recipe) {
      continue;
    }

    const validation = await validateRecipeSourceContentWithAI({
      recipe,
      source: verified.source,
      sourceContent: verified.sourceContent,
      inventory,
    });

    if (isValidSourceContentValidation(validation)) {
      return {
        recipe: {
          ...recipe,
          sources: [verified.source],
          sourceStatus: "VERIFIED",
        },
        sources: [verified.source],
      };
    }
  }

  return null;
}

export async function lookupRecipe(
  inventory: InventoryForAI[],
  prompt = "",
  options: { fetchImpl?: FetchLike } = {},
): Promise<RecipeLookupResult> {
  const client = getClient();
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    return {
      recipe: annotateRecipeWithAssessment(
        {
          title: "Пустой запрос",
          description: "Введите название коктейля, чтобы найти подтвержденный рецепт.",
          savedRecipeId: null,
          matchType: null,
          ingredients: [],
          tools: [],
          steps: ["Введите название коктейля.", "Повторите поиск."],
          warnings: [],
          sources: [],
        },
        {
          adaptedRecipe: null,
          makeability: "CANNOT_MAKE",
          missingIngredients: [],
          shoppingList: [],
          substitutionOptions: [],
          tasteImpact: tasteImpact("HIGH", "Без названия рецепта нечего проверять."),
          warnings: [],
        },
        "FAILED",
      ),
      adaptedRecipe: null,
      makeability: "CANNOT_MAKE",
      missingIngredients: [],
      shoppingList: [],
      substitutionOptions: [],
      tasteImpact: tasteImpact("HIGH", "Без названия рецепта нечего проверять."),
      sourceStatus: "FAILED",
      sources: [],
      model: "server-validation",
      status: "FAILED",
      error: "Введите название коктейля.",
    };
  }

  if (!client) {
    return {
      recipe: annotateRecipeWithAssessment(
        {
          title: trimmedPrompt,
          description: "OPENAI_API_KEY не задан, поэтому нельзя найти и проверить источник рецепта.",
          savedRecipeId: null,
          matchType: null,
          ingredients: [],
          tools: [],
          steps: ["Настройте OPENAI_API_KEY.", "Повторите поиск."],
          warnings: [],
          sources: [],
        },
        {
          adaptedRecipe: null,
          makeability: "CANNOT_MAKE",
          missingIngredients: [],
          shoppingList: [],
          substitutionOptions: [],
          tasteImpact: tasteImpact("HIGH", "Источник рецепта не был найден и проверен."),
          warnings: [],
        },
        "FAILED",
      ),
      adaptedRecipe: null,
      makeability: "CANNOT_MAKE",
      missingIngredients: [],
      shoppingList: [],
      substitutionOptions: [],
      tasteImpact: tasteImpact("HIGH", "Источник рецепта не был найден и проверен."),
      sourceStatus: "FAILED",
      sources: [],
      model: "local-demo",
      status: "FAILED",
      error: "OPENAI_API_KEY не задан, поэтому нельзя найти подтвержденный рецепт с рабочим источником.",
    };
  }

  try {
    const found = await findVerifiedCanonicalRecipe(client, trimmedPrompt, inventory, options.fetchImpl ?? fetch);
    if (!found) {
      return {
        recipe: annotateRecipeWithAssessment(
          {
            title: trimmedPrompt,
            description: "Не удалось найти подтвержденную страницу рецепта в доверенных источниках.",
            savedRecipeId: null,
            matchType: null,
            ingredients: [],
            tools: [],
            steps: ["Попробуйте уточнить название коктейля.", "Например: Black Russian или Johnny Silverhand cocktail."],
            warnings: [],
            sources: [],
          },
          {
            adaptedRecipe: null,
            makeability: "CANNOT_MAKE",
            missingIngredients: [],
            shoppingList: [],
            substitutionOptions: [],
            tasteImpact: tasteImpact("HIGH", "Без проверенного источника портал не показывает рецепт."),
            warnings: [],
          },
          "FAILED",
        ),
        adaptedRecipe: null,
        makeability: "CANNOT_MAKE",
        missingIngredients: [],
        shoppingList: [],
        substitutionOptions: [],
        tasteImpact: tasteImpact("HIGH", "Без проверенного источника портал не показывает рецепт."),
        sourceStatus: "FAILED",
        sources: [],
        model: recipeModel,
        status: "FAILED",
        error: "Не нашел подтвержденную страницу рецепта в доверенных источниках.",
      };
    }

    const localAssessment = buildLocalRecipeInventoryAssessment(found.recipe, inventory);
    const assessment = await assessRecipeAgainstInventoryWithAI(client, found.recipe, inventory, localAssessment);
    const recipe = annotateRecipeWithAssessment(found.recipe, assessment, "VERIFIED");
    const adaptedRecipe = assessment.adaptedRecipe
      ? annotateRecipeWithAssessment(assessment.adaptedRecipe, assessment, "VERIFIED")
      : null;

    return {
      recipe,
      adaptedRecipe,
      makeability: assessment.makeability,
      missingIngredients: assessment.missingIngredients,
      shoppingList: assessment.shoppingList,
      substitutionOptions: assessment.substitutionOptions,
      tasteImpact: assessment.tasteImpact,
      sourceStatus: "VERIFIED",
      sources: found.sources,
      model: recipeModel,
      status: "SUCCESS",
    };
  } catch {
    return {
      recipe: annotateRecipeWithAssessment(
        {
          title: trimmedPrompt,
          description: "Поиск рецепта завершился ошибкой.",
          savedRecipeId: null,
          matchType: null,
          ingredients: [],
          tools: [],
          steps: ["Попробуйте повторить поиск чуть позже.", "Если ошибка повторится, уточните название рецепта."],
          warnings: [],
          sources: [],
        },
        {
          adaptedRecipe: null,
          makeability: "CANNOT_MAKE",
          missingIngredients: [],
          shoppingList: [],
          substitutionOptions: [],
          tasteImpact: tasteImpact("HIGH", "Рецепт не был найден и проверен."),
          warnings: [],
        },
        "FAILED",
      ),
      adaptedRecipe: null,
      makeability: "CANNOT_MAKE",
      missingIngredients: [],
      shoppingList: [],
      substitutionOptions: [],
      tasteImpact: tasteImpact("HIGH", "Рецепт не был найден и проверен."),
      sourceStatus: "FAILED",
      sources: [],
      model: recipeModel,
      status: "FAILED",
      error: "Не удалось стабильно найти и проверить рецепт.",
    };
  }
}

export async function normalizeInventoryWithAI(input: Partial<InventoryInput>): Promise<InventoryAIResult> {
  const fallback = heuristicNormalizeItem(input);
  const client = getClient();

  if (!client) {
    return { item: fallback, aiReviewed: false, sources: [] };
  }

  try {
    const response = await client.responses.create({
      model: inventoryModel,
      tools: webSearchTool,
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content:
            "Ты нормализуешь предмет домашнего бара строго по обязательному полю name. Можно исправить name до официального/канонического названия продукта. Верни только JSON без markdown. Обязательные поля ответа: name, category, abv, description, icon, aliases. category должна быть короткой на английском, например aperitif, vodka, citrus, glass, tool. description на русском, конкретное и полезное. abv только для алкоголя, иначе null. icon выбирай из lucide-react: BottleWine, GlassWater, Package, Citrus, CupSoda, Droplets, Cherry, Wine, Wrench, Utensils, Beaker, Snowflake.",
        },
        {
          role: "user",
          content: JSON.stringify(fallback),
        },
      ],
    });

    const normalized = parseJson(response.output_text, normalizedInventoryItemSchema);
    const item = inventoryInputSchema.parse({
      ...fallback,
      ...normalized,
      abv: fallback.kind === "ALCOHOL" ? normalized.abv ?? null : null,
    });

    return {
      item,
      aiReviewed: true,
      sources: extractWebSources(response),
    };
  } catch {
    return { item: fallback, aiReviewed: false, sources: [] };
  }
}

export async function normalizeInventoryBatchWithAI(inventory: InventoryForAI[]): Promise<{ updates: NormalizedInventoryUpdate[]; sources: SourceLink[]; model: string }> {
  const client = getClient();

  if (!client || inventory.length === 0) {
    return { updates: [], sources: [], model: "local-demo" };
  }

  try {
    const response = await client.responses.create({
      model: inventoryModel,
      tools: webSearchTool,
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content:
            "Ты нормализуешь инвентарь домашнего бара строго по полю name. Используй web search только если это помогает определить конкретный алкоголь, крепость или тип продукта. Можно исправить name до официального/канонического названия. Верни только JSON без markdown: {\"items\":[{\"id\":\"\",\"name\":\"\",\"category\":\"\",\"abv\":null,\"description\":\"\",\"icon\":\"\",\"aliases\":[\"\"]}]}. id строго скопируй из входа. abv заполняй только для алкоголя, иначе null. description на русском, конкретное и полезное. icon выбирай из lucide-react: BottleWine, GlassWater, Package, Citrus, CupSoda, Droplets, Cherry, Wine, Wrench, Utensils, Beaker, Snowflake.",
        },
        {
          role: "user",
          content: JSON.stringify({
            items: inventory.map((item, index) => ({
              number: index + 1,
              id: item.id,
              kind: item.kind,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              currentCategory: item.category,
              currentAbv: item.abv,
              currentDescription: item.description,
              currentAliases: item.aliases,
            })),
          }),
        },
      ],
    });

    const parsed = parseJson(response.output_text, normalizedInventoryBatchSchema);
    return { updates: parsed.items, sources: extractWebSources(response), model: inventoryModel };
  } catch {
    return { updates: [], sources: [], model: "local-demo" };
  }
}

export function buildRecipeGenerationInstructions(options: RecipeGenerationOptions | boolean = {}): string {
  const resolvedOptions: RecipeGenerationOptions = typeof options === "boolean" ? { needMoreNewRecipes: options } : options;
  const instructions = [
    "Ты профессиональный шеф-бармен закрытого портала. Твоя задача - подбирать классические и известные коктейли строго на основе доступного inventory пользователя.",

    "### SEARCH & SOURCING (ПОИСК И ИСТОЧНИКИ)\n- Используй web search для поиска существующих, признанных рецептов, созданных людьми.\n- Возвращай только рецепты, для которых найден реальный web source с рабочим URL.\n- Приоритетные источники: https://www.diffordsguide.com/, https://www.liquor.com/, https://punchdrink.com/, https://imbibemagazine.com/, https://iba-world.com/, https://tuxedono2.com/, https://ru.inshaker.com/, https://scienceofdrinks.com/.\n- В recipe.sources указывай прямые страницы рецептов, а не поиск, главную страницу, категорию или тег.\n- Если нет рабочего источника базового рецепта, не возвращай этот рецепт вообще.",

    "### MATCHING STRATEGY (СТРАТЕГИЯ ПОДБОРА)\n- Сначала генерируй EXACT-match: рецепты, которые можно собрать без замен.\n- Затем SUBSTITUTION-match: рецепты с заменами, но только на предметы, которые есть в inventory.\n- Если оригинальный рецепт найден, но часть ингредиентов заменена из inventory, это допустимо только как matchType SUBSTITUTION с объяснением замены.\n- Если пользователь не дал конкретный запрос, активно предлагай известные варианты по категориям: шоты, хайболы, сауэры, лонг-дринки, спритцы и простые миксы.\n- Учитывай savedRecipes как контекст и максимум 2 кандидата, а не как основную выдачу.\n- Если сохраненный рецепт можно сделать сейчас, верни его с savedRecipeId и matchType SAVED, затем продолжай искать новые известные варианты.\n- Если сохраненный рецепт можно сделать только с заменой из inventory, верни savedRecipeId, matchType SUBSTITUTION и явно опиши замену.",

    "### SUBSTITUTION QUALITY (КАЧЕСТВО ЗАМЕН)\n- Если exact-рецептов мало, активно используй substitutionHints из user payload, чтобы найти известные рецепты с небольшими корректными заменами.\n- Хорошая замена сохраняет роль компонента в коктейле: базовый алкоголь близкой семьи, ликер похожего вкусового профиля, цитрус на цитрус, сироп на близкий сироп, газированный миксер на похожий миксер.\n- Допустимые примеры: белый ром заменить имеющимся темным ромом; кофейный ликер заменить имеющимся шоколадным сливочным ликером, если это сохраняет десертный профиль.\n- Слабые или случайные замены не подходят. Не заменяй ключевой вкус несвязанным предметом только ради заполнения списка.\n- В description или warnings кратко объясняй каждую замену и ее влияние на вкус.",

    "### INVENTORY CONSTRAINTS (СТРОГИЕ ОГРАНИЧЕНИЯ ИНВЕНТАРЯ)\n- Возвращай только варианты, которые можно приготовить прямо сейчас из текущего inventory.\n- Все обязательные ингредиенты и инструменты в ответе должны присутствовать в inventory.\n- Лед, содовую, сахар, соки, гарнир и инструменты используй только когда такие предметы явно есть в inventory.\n- Если оригинальный компонент отсутствует, замена возможна только на существующий в inventory аналог; явно укажи замену в description или warnings.\n- Если для рецепта нет оригинального компонента и нет качественного аналога в inventory, просто пропусти этот рецепт и не добавляй его в recipes.\n- Не добавляй в ответ карточки с фразами вроде \"рецепт отбрасывается\", \"невозможно приготовить\", \"не хватает ингредиентов\".\n- Не предлагай докупить ингредиенты.",

    "### OUTPUT FORMAT (ФОРМАТ ВЫВОДА)\n- Верни до 10 сильных вариантов; не добивай список слабыми или невозможными рецептами.\n- Для каждого ingredient.name строго используй точное название name из inventory, если этот ингредиент обязателен.\n- Не пиши в description или warnings текст вида \"источник не найден\", \"адаптация без источника\" или \"нет рабочей ссылки\".\n- Верни только валидный JSON без markdown по схеме: {\"recipes\":[{\"title\":\"\",\"description\":\"\",\"savedRecipeId\":null,\"matchType\":\"EXACT\",\"ingredients\":[{\"name\":\"\",\"amount\":\"\",\"inventoryItemId\":\"\",\"optional\":false}],\"tools\":[{\"name\":\"\",\"optional\":false}],\"steps\":[\"\"],\"warnings\":[\"\"],\"sources\":[{\"url\":\"\",\"title\":\"\"}]}]}.",
  ];

  if (resolvedOptions.needMoreNewRecipes) {
    instructions.push(
      [
        "### RETRY LOGIC (ЛОГИКА ДОБОРА)",
        "- Это повторный вызов для добора вариантов. Возвращай только новые осуществимые рецепты.",
        "- Исключи рецепты из списка excludeTitles.",
        "- Не возвращай savedRecipes как кандидатов.",
        resolvedOptions.needMoreSubstitutionRecipes ? "- Exact-вариантов осталось мало: ищи известные рецепты с небольшими корректными заменами из substitutionHints и inventory." : "",
        resolvedOptions.savedRecipeLimitReached ? "- Установи savedRecipeId = null для всех новых рецептов." : "",
        resolvedOptions.targetNewRecipes ? `- Сгенерируй до ${resolvedOptions.targetNewRecipes} новых вариантов, если это физически возможно из inventory.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return instructions.filter(Boolean).join("\n\n");
}

export function buildRecipeGenerationPayload(
  inventory: InventoryForAI[],
  prompt = "",
  savedRecipes: SavedRecipeForAI[] = [],
  options: RecipeGenerationOptions = {},
) {
  return {
    userPrompt: prompt,
    inventory: buildInventoryPayload(inventory),
    substitutionHints: buildSubstitutionHints(inventory),
    savedRecipes: buildSavedRecipesPayload(savedRecipes),
    excludeTitles: options.excludeTitles ?? [],
    needMoreNewRecipes: options.needMoreNewRecipes ?? false,
    needMoreSubstitutionRecipes: options.needMoreSubstitutionRecipes ?? false,
    savedRecipeLimitReached: options.savedRecipeLimitReached ?? false,
    targetNewRecipes: options.targetNewRecipes ?? null,
  };
}

export function buildAvailabilityCheckInstructions(): string {
  return [
    "Ты система валидации рецептов. Твоя задача - проверить сохраненные рецепты на соответствие текущему inventory домашнего бара.",

    "### DECISION MATRIX (МАТРИЦА СТАТУСОВ)\n- AVAILABLE: назначается, когда все обязательные ингредиенты и инструменты присутствуют в inventory.\n- AVAILABLE_WITH_SUBSTITUTIONS: назначается, когда отсутствует оригинальный компонент, но в inventory есть логичная и подходящая замена.\n- MISSING: назначается, когда отсутствует обязательный компонент и в inventory нет подходящей замены.",

    "### CONSTRAINTS (ОГРАНИЧЕНИЯ)\n- Верни строго один check на каждый recipeId из входящих данных.\n- Проверяй рецепт как есть: не меняй исходный рецепт и не предлагай покупку недостающих ингредиентов.\n- Для каждой замены укажи original и substitute.\n- Поле substitute должно содержать строго точное название name предмета из текущего inventory.",

    "### OUTPUT FORMAT (ФОРМАТ ВЫВОДА)\n- Верни только валидный JSON без markdown по схеме: {\"checks\":[{\"recipeId\":\"\",\"status\":\"AVAILABLE\",\"comment\":\"\",\"missingIngredients\":[\"\"],\"substitutions\":[{\"original\":\"\",\"substitute\":\"\",\"note\":\"\"}],\"warnings\":[\"\"],\"sources\":[{\"url\":\"\",\"title\":\"\"}]}]}.",
  ].join("\n\n");
}

export function buildAvailabilityCheckPayload(inventory: InventoryForAI[], savedRecipes: SavedRecipeForAI[]) {
  return {
    inventory: buildInventoryPayload(inventory),
    savedRecipes: buildSavedRecipesPayload(savedRecipes),
  };
}

function localAvailabilityChecks(inventory: InventoryForAI[], savedRecipes: SavedRecipeForAI[]): AvailabilityCheck[] {
  return savedRecipes.map((saved) => {
    const missingIngredients = saved.recipe.ingredients
      .filter((ingredient) => !ingredient.optional && !hasMatchingInventoryItem(ingredient.name, inventory, ["ALCOHOL", "INGREDIENT"]))
      .map((ingredient) => ingredient.name);
    const missingTools = saved.recipe.tools
      .filter((tool) => !tool.optional && !hasMatchingInventoryItem(tool.name, inventory, ["TOOL"]))
      .map((tool) => tool.name);
    const missing = [...missingIngredients, ...missingTools];

    return {
      recipeId: saved.id,
      status: missing.length === 0 ? "AVAILABLE" : "MISSING",
      comment: missing.length === 0 ? "Все обязательные компоненты есть в текущем инвентаре." : "В текущем инвентаре не хватает обязательных компонентов.",
      missingIngredients: missing,
      substitutions: [],
      warnings: [],
      sources: [],
    };
  });
}

export async function checkSavedRecipesAvailability(inventory: InventoryForAI[], savedRecipes: SavedRecipeForAI[]): Promise<AvailabilityAIResult> {
  const client = getClient();

  if (savedRecipes.length === 0) {
    return { checks: [], model: "local-demo", status: "SUCCESS" };
  }

  if (!client) {
    return { checks: localAvailabilityChecks(inventory, savedRecipes), model: "local-demo", status: "SUCCESS" };
  }

  try {
    const response = await client.responses.parse({
      model: recipeModel,
      tools: webSearchTool,
      include: ["web_search_call.action.sources"],
      text: {
        format: zodTextFormat(aiAvailabilityChecksSchema, "recipe_availability_checks"),
      },
      input: [
        {
          role: "system",
          content: buildAvailabilityCheckInstructions(),
        },
        {
          role: "user",
          content: JSON.stringify(buildAvailabilityCheckPayload(inventory, savedRecipes)),
        },
      ],
    });

    if (!response.output_parsed) {
      throw new Error("parse failure: empty availability response");
    }

    const parsed = normalizeAiAvailabilityChecks(response.output_parsed);
    const validIds = new Set(savedRecipes.map((recipe) => recipe.id));
    const sources = extractWebSources(response);
    const checks = parsed.checks
      .filter((check) => validIds.has(check.recipeId))
      .map((check) => ({ ...check, sources: check.sources.length ? check.sources : sanitizeSources(sources) }));

    if (checks.length === 0) {
      return {
        checks: [],
        model: recipeModel,
        status: "FAILED",
        error: "OpenAI не вернул проверки для сохраненных рецептов.",
      };
    }

    return { checks, model: recipeModel, status: "SUCCESS" };
  } catch {
    return {
      checks: [],
      model: recipeModel,
      status: "FAILED",
      error: "OpenAI не вернул валидную проверку доступности.",
    };
  }
}

async function requestGeneratedRecipes(
  client: OpenAI,
  inventory: InventoryForAI[],
  prompt: string,
  savedRecipes: SavedRecipeForAI[],
  options: RecipeGenerationOptions = {},
) {
  const response = await client.responses.parse({
    model: recipeModel,
    tools: webSearchTool,
    include: ["web_search_call.action.sources"],
    text: {
      format: zodTextFormat(aiGeneratedRecipesSchema, "cocktail_recipes"),
    },
    input: [
      {
        role: "system",
        content: buildRecipeGenerationInstructions(options),
      },
      {
        role: "user",
        content: JSON.stringify(buildRecipeGenerationPayload(inventory, prompt, savedRecipes, options)),
      },
    ],
  });

  if (!response.output_parsed) {
    throw new Error("parse failure: empty parsed response");
  }

  return {
    parsed: normalizeAiGeneratedRecipes(response.output_parsed),
    sources: extractWebSources(response),
  };
}

export async function generateRecipes(
  inventory: InventoryForAI[],
  prompt = "",
  savedRecipes: SavedRecipeForAI[] = [],
): Promise<RecipeGenerationResult> {
  const client = getClient();

  if (!client) {
    return {
      model: "local-demo",
      recipes: [],
      sources: [],
      status: "FAILED",
      error: "OPENAI_API_KEY не задан, поэтому нельзя найти подтвержденные рецепты с рабочими источниками.",
    };
  }

  try {
    const first = await requestGeneratedRecipes(client, inventory, prompt, savedRecipes);
    const firstProcessed = postProcessGeneratedRecipes(first.parsed.recipes, inventory, savedRecipes);
    let processed = await verifyGeneratedRecipeSources(firstProcessed, { fallbackSources: first.sources, inventory });
    let sources = limitSources(processed.flatMap((recipe) => recipe.sources ?? []));

    if (processed.length < minTargetRecipes) {
      try {
        const retry = await requestGeneratedRecipes(client, inventory, prompt, savedRecipes, {
          excludeTitles: [...firstProcessed.map((recipe) => recipe.title), ...savedRecipes.map((recipe) => recipe.title)],
          needMoreNewRecipes: true,
          needMoreSubstitutionRecipes: true,
          savedRecipeLimitReached: true,
          targetNewRecipes: maxGeneratedRecipes - processed.length,
        });
        const retryProcessed = postProcessGeneratedRecipes(retry.parsed.recipes, inventory, savedRecipes);
        const retryVerified = await verifyGeneratedRecipeSources(retryProcessed, { fallbackSources: retry.sources, inventory });
        processed = postProcessGeneratedRecipes([...processed, ...retryVerified], inventory, savedRecipes);
        sources = limitSources(processed.flatMap((recipe) => recipe.sources ?? []));
      } catch {
        sources = limitSources(processed.flatMap((recipe) => recipe.sources ?? []));
      }
    }

    if (processed.length > 0) {
      return { recipes: processed.map((recipe) => annotateDiscoveredRecipe(recipe, inventory)), model: recipeModel, sources, status: "SUCCESS" };
    }
  } catch (error) {
    return {
      model: recipeModel,
      recipes: [],
      sources: [],
      status: "FAILED",
      error: error instanceof Error && error.message.includes("parse failure")
        ? "Не удалось разобрать ответ AI. Попробуйте повторить подбор."
        : "AI не смог стабильно подобрать рецепты. Попробуйте еще раз.",
    };
  }

  return {
    model: recipeModel,
    recipes: [],
    sources: [],
    status: "FAILED",
    error: "Не нашел подтвержденные рецепты с рабочими источниками под текущий инвентарь.",
  };
}

function demoRecipes(inventory: InventoryForAI[], savedRecipes: SavedRecipeForAI[] = []): GeneratedRecipe[] {
  const savedMatch = savedRecipes.find((saved) => filterRecipesByInventory([saved.recipe], inventory).length > 0);
  if (savedMatch) {
    return [{ ...savedMatch.recipe, savedRecipeId: savedMatch.id, matchType: "SAVED" }];
  }

  const alcohol = inventory.find((item) => item.kind === "ALCOHOL");
  const mixer = inventory.find((item) => item.kind === "INGREDIENT");
  const tool = inventory.find((item) => item.kind === "TOOL");

  if (!alcohol || !mixer || !tool) {
    return [];
  }

  return [
    {
      title: `Простой микс: ${alcohol.name} и ${mixer.name}`,
      description: "Локальный демо-рецепт, потому что OPENAI_API_KEY не задан.",
      ingredients: [
        { name: alcohol.name, amount: "50 мл", inventoryItemId: alcohol.id, optional: false },
        { name: mixer.name, amount: "100 мл", inventoryItemId: mixer.id, optional: false },
      ],
      tools: [{ name: tool.name, optional: false }],
      steps: [
        `Подготовьте ${tool.name}.`,
        `Добавьте ${alcohol.name}.`,
        `Добавьте ${mixer.name} и аккуратно перемешайте.`,
        "Подавайте сразу после приготовления.",
      ],
      warnings: ["Пейте ответственно и учитывайте крепость напитка."],
      sources: [],
    },
  ];
}
