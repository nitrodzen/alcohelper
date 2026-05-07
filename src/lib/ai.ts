import OpenAI from "openai";
import { z } from "zod";
import { heuristicNormalizeItem, inventoryInputSchema, type InventoryForAI, type InventoryInput } from "@/lib/inventory";
import { filterRecipesByInventory, generatedRecipesSchema, type GeneratedRecipe } from "@/lib/recipe";

const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

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

export async function normalizeInventoryWithAI(input: Partial<InventoryInput>): Promise<InventoryInput> {
  const fallback = heuristicNormalizeItem(input);
  const client = getClient();

  if (!client) {
    return fallback;
  }

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "Ты нормализуешь предметы домашнего бара. Верни только JSON без markdown. Поля: kind, name, category, quantity, unit, abv, description, icon, aliases. kind: ALCOHOL, INGREDIENT или TOOL. icon должен быть названием lucide-react иконки.",
        },
        {
          role: "user",
          content: JSON.stringify(fallback),
        },
      ],
    });

    return inventoryInputSchema.parse({
      ...fallback,
      ...parseJson(response.output_text, inventoryInputSchema),
    });
  } catch {
    return fallback;
  }
}

export async function generateRecipes(inventory: InventoryForAI[]): Promise<{ recipes: GeneratedRecipe[]; model: string }> {
  const client = getClient();

  if (!client) {
    return {
      model: "local-demo",
      recipes: demoRecipes(inventory),
    };
  }

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "Ты профессиональный бармен для закрытого портала. Генерируй коктейли только из предметов инвентаря пользователя. Не добавляй лед, содовую, сахар, соки, гарнир или инструменты, если их нет в инвентаре. Верни только валидный JSON без markdown по схеме: {\"recipes\":[{\"title\":\"\",\"description\":\"\",\"ingredients\":[{\"name\":\"\",\"amount\":\"\",\"inventoryItemId\":\"\",\"optional\":false}],\"tools\":[{\"name\":\"\",\"optional\":false}],\"steps\":[\"\"],\"warnings\":[\"\"]}]} . Для каждого ingredient.name используй название из инвентаря, если возможно.",
        },
        {
          role: "user",
          content: JSON.stringify({
            inventory: inventory.map((item) => ({
              id: item.id,
              kind: item.kind,
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              unit: item.unit,
              abv: item.abv,
              description: item.description,
              aliases: item.aliases,
            })),
          }),
        },
      ],
    });

    const parsed = parseJson(response.output_text, generatedRecipesSchema);
    const filtered = filterRecipesByInventory(parsed.recipes, inventory);

    if (filtered.length > 0) {
      return { recipes: filtered, model };
    }
  } catch {
    return {
      model: "local-demo",
      recipes: demoRecipes(inventory),
    };
  }

  return {
    model,
    recipes: demoRecipes(inventory),
  };
}

function demoRecipes(inventory: InventoryForAI[]): GeneratedRecipe[] {
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
    },
  ];
}
