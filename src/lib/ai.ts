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
  generatedRecipesSchema,
  type AvailabilityCheck,
  type GeneratedRecipe,
  type GeneratedRecipes,
} from "@/lib/recipe";

const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const webSearchTool = [{ type: "web_search" as const, search_context_size: "low" as const }];
const sourceSchema = z.object({
  title: z.string().trim().max(180).optional(),
  url: z.string().trim().url(),
});

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

const maxGeneratedRecipes = 10;
const minTargetRecipes = 8;
const maxSavedRecipesInGeneration = 2;

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
    if (!parsed.success || unique.has(parsed.data.url)) {
      continue;
    }
    unique.set(parsed.data.url, parsed.data);
    if (unique.size >= 5) {
      return [...unique.values()];
    }
  }

  return [...unique.values()];
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
  fallbackSources: SourceLink[] = [],
): GeneratedRecipe[] {
  const sanitizedFallbackSources = sanitizeSources(fallbackSources);
  const recipesWithCleanSources = recipes.map((recipe) => {
    const cleanSources = sanitizeSources(recipe.sources);
    return {
      ...recipe,
      sources: cleanSources.length ? cleanSources : sanitizedFallbackSources,
    };
  });
  const available = attachSavedRecipeMetadata(filterRecipesByInventory(recipesWithCleanSources, inventory), savedRecipes)
    .filter((recipe) => !hasInfeasibleRecipeMarker(recipe));
  const deduped = dedupeRecipesByTitle(available);
  const saved = deduped.filter((recipe) => recipe.savedRecipeId).slice(0, maxSavedRecipesInGeneration);
  const fresh = deduped.filter((recipe) => !recipe.savedRecipeId);

  return [...saved, ...fresh].slice(0, maxGeneratedRecipes);
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

export async function normalizeInventoryWithAI(input: Partial<InventoryInput>): Promise<InventoryAIResult> {
  const fallback = heuristicNormalizeItem(input);
  const client = getClient();

  if (!client) {
    return { item: fallback, aiReviewed: false, sources: [] };
  }

  try {
    const response = await client.responses.create({
      model,
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
      model,
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
    return { updates: parsed.items, sources: extractWebSources(response), model };
  } catch {
    return { updates: [], sources: [], model: "local-demo" };
  }
}

export function buildRecipeGenerationInstructions(options: RecipeGenerationOptions | boolean = {}): string {
  const resolvedOptions: RecipeGenerationOptions = typeof options === "boolean" ? { needMoreNewRecipes: options } : options;
  const instructions = [
    "Ты профессиональный шеф-бармен закрытого портала. Твоя задача - подбирать классические и известные коктейли строго на основе доступного inventory пользователя.",

    "### SEARCH & SOURCING (ПОИСК И ИСТОЧНИКИ)\n- Используй web search для поиска существующих, признанных рецептов, созданных людьми.\n- Приоритетные источники: https://www.diffordsguide.com/, https://www.liquor.com/, https://punchdrink.com/, https://imbibemagazine.com/, https://iba-world.com/, https://tuxedono2.com/, https://ru.inshaker.com/, https://scienceofdrinks.com/.\n- Прикладывай валидные ссылки на источники в recipe.sources.\n- Если источников для классического рецепта нет, помечай рецепт как адаптацию/аналог в description или warnings.",

    "### MATCHING STRATEGY (СТРАТЕГИЯ ПОДБОРА)\n- Сначала генерируй EXACT-match: рецепты, которые можно собрать без замен.\n- Затем SUBSTITUTION-match: рецепты с заменами, но только на предметы, которые есть в inventory.\n- Если пользователь не дал конкретный запрос, активно предлагай известные варианты по категориям: шоты, хайболы, сауэры, лонг-дринки, спритцы и простые миксы.\n- Учитывай savedRecipes как контекст и максимум 2 кандидата, а не как основную выдачу.\n- Если сохраненный рецепт можно сделать сейчас, верни его с savedRecipeId и matchType SAVED, затем продолжай искать новые известные варианты.\n- Если сохраненный рецепт можно сделать только с заменой из inventory, верни savedRecipeId, matchType SUBSTITUTION и явно опиши замену.",

    "### SUBSTITUTION QUALITY (КАЧЕСТВО ЗАМЕН)\n- Хорошая замена сохраняет роль компонента в коктейле: базовый алкоголь близкой семьи, ликер похожего вкусового профиля, цитрус на цитрус, сироп на близкий сироп.\n- Допустимые примеры: белый ром заменить имеющимся темным ромом; кофейный ликер заменить имеющимся шоколадным сливочным ликером, если это сохраняет десертный профиль.\n- Слабые или случайные замены не подходят. Не заменяй ключевой вкус несвязанным предметом только ради заполнения списка.\n- В description или warnings кратко объясняй каждую замену и ее влияние на вкус.",

    "### INVENTORY CONSTRAINTS (СТРОГИЕ ОГРАНИЧЕНИЯ ИНВЕНТАРЯ)\n- Возвращай только варианты, которые можно приготовить прямо сейчас из текущего inventory.\n- Все обязательные ингредиенты и инструменты в ответе должны присутствовать в inventory.\n- Лед, содовую, сахар, соки, гарнир и инструменты используй только когда такие предметы явно есть в inventory.\n- Если оригинальный компонент отсутствует, замена возможна только на существующий в inventory аналог; явно укажи замену в description или warnings.\n- Если для рецепта нет оригинального компонента и нет качественного аналога в inventory, просто пропусти этот рецепт и не добавляй его в recipes.\n- Не добавляй в ответ карточки с фразами вроде \"рецепт отбрасывается\", \"невозможно приготовить\", \"не хватает ингредиентов\".\n- Не предлагай докупить ингредиенты.",

    "### OUTPUT FORMAT (ФОРМАТ ВЫВОДА)\n- Верни до 10 сильных вариантов; не добивай список слабыми или невозможными рецептами.\n- Для каждого ingredient.name строго используй точное название name из inventory, если этот ингредиент обязателен.\n- Верни только валидный JSON без markdown по схеме: {\"recipes\":[{\"title\":\"\",\"description\":\"\",\"savedRecipeId\":null,\"matchType\":\"EXACT\",\"ingredients\":[{\"name\":\"\",\"amount\":\"\",\"inventoryItemId\":\"\",\"optional\":false}],\"tools\":[{\"name\":\"\",\"optional\":false}],\"steps\":[\"\"],\"warnings\":[\"\"],\"sources\":[{\"url\":\"\",\"title\":\"\"}]}]}.",
  ];

  if (resolvedOptions.needMoreNewRecipes) {
    instructions.push(
      [
        "### RETRY LOGIC (ЛОГИКА ДОБОРА)",
        "- Это повторный вызов для добора вариантов. Возвращай только новые осуществимые рецепты.",
        "- Исключи рецепты из списка excludeTitles.",
        "- Не возвращай savedRecipes как кандидатов.",
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
    savedRecipes: buildSavedRecipesPayload(savedRecipes),
    excludeTitles: options.excludeTitles ?? [],
    needMoreNewRecipes: options.needMoreNewRecipes ?? false,
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
      model,
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
        model,
        status: "FAILED",
        error: "OpenAI не вернул проверки для сохраненных рецептов.",
      };
    }

    return { checks, model, status: "SUCCESS" };
  } catch {
    return {
      checks: [],
      model,
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
    model,
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
      recipes: attachSavedRecipeMetadata(demoRecipes(inventory, savedRecipes), savedRecipes),
      sources: [],
      status: "SUCCESS",
    };
  }

  try {
    const first = await requestGeneratedRecipes(client, inventory, prompt, savedRecipes);
    let processed = postProcessGeneratedRecipes(first.parsed.recipes, inventory, savedRecipes, first.sources);
    let sources = limitSources(processed.flatMap((recipe) => recipe.sources ?? first.sources));

    if (processed.length < minTargetRecipes) {
      try {
        const retry = await requestGeneratedRecipes(client, inventory, prompt, savedRecipes, {
          excludeTitles: [...processed.map((recipe) => recipe.title), ...savedRecipes.map((recipe) => recipe.title)],
          needMoreNewRecipes: true,
          savedRecipeLimitReached: true,
          targetNewRecipes: maxGeneratedRecipes - processed.length,
        });
        processed = postProcessGeneratedRecipes([...processed, ...retry.parsed.recipes], inventory, savedRecipes, [...first.sources, ...retry.sources]);
        sources = limitSources(processed.flatMap((recipe) => recipe.sources ?? [...first.sources, ...retry.sources]));
      } catch {
        sources = limitSources(processed.flatMap((recipe) => recipe.sources ?? first.sources));
      }
    }

    if (processed.length > 0) {
      return { recipes: processed, model, sources, status: "SUCCESS" };
    }
  } catch (error) {
    return {
      model,
      recipes: [],
      sources: [],
      status: "FAILED",
      error: error instanceof Error && error.message.includes("parse failure")
        ? "Не удалось разобрать ответ AI. Попробуйте повторить подбор."
        : "AI не смог стабильно подобрать рецепты. Попробуйте еще раз.",
    };
  }

  return {
    model,
    recipes: [],
    sources: [],
    status: "FAILED",
    error: "Не удалось подобрать рецепт из доступного инвентаря.",
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
