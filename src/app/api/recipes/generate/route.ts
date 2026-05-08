import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { generateRecipes, type SavedRecipeForAI } from "@/lib/ai";
import type { InventoryForAI } from "@/lib/inventory";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { generatedRecipeSchema } from "@/lib/recipe";

export const runtime = "nodejs";

const generateRequestSchema = z.object({
  prompt: z.string().trim().max(1200).optional().default(""),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  if (!checkRateLimit(`recipes:${userId}`, 30)) {
    return NextResponse.json({ error: "Лимит генераций на час исчерпан." }, { status: 429 });
  }

  const parsed = generateRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Комментарий слишком длинный." }, { status: 400 });
  }

  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  const inventory: InventoryForAI[] = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    category: item.category,
    quantity: item.quantity === null ? null : Number(item.quantity),
    unit: item.unit,
    abv: item.abv === null ? null : Number(item.abv),
    description: item.description,
    icon: item.icon,
    aliases: item.aliases,
    aiReviewedAt: item.aiReviewedAt,
  }));

  if (inventory.filter((item) => item.kind !== "TOOL").length === 0) {
    const history = await prisma.recipeRequestHistory.create({
      data: {
        userId,
        prompt: parsed.data.prompt,
        inventorySnapshot: inventory as unknown as Prisma.InputJsonValue,
        sources: [] as unknown as Prisma.InputJsonValue,
        model: "server-validation",
        status: "FAILED",
        error: "Добавьте хотя бы один алкоголь или ингредиент.",
      },
    });

    return NextResponse.json({ error: "Добавьте хотя бы один алкоголь или ингредиент.", historyId: history.id }, { status: 400 });
  }

  const savedRecipeRows = await prisma.savedRecipe.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const savedRecipes: SavedRecipeForAI[] = savedRecipeRows.flatMap((saved) => {
    const parsedRecipe = generatedRecipeSchema.safeParse(saved.recipe);
    if (!parsedRecipe.success) {
      return [];
    }

    return [
      {
        id: saved.id,
        title: saved.title,
        description: saved.description,
        recipe: parsedRecipe.data,
      },
    ];
  });

  const result = await generateRecipes(inventory, parsed.data.prompt, savedRecipes);
  const history = await prisma.recipeRequestHistory.create({
    data: {
      userId,
      prompt: parsed.data.prompt,
      inventorySnapshot: inventory as unknown as Prisma.InputJsonValue,
      recipes: result.status === "SUCCESS" ? (result.recipes as unknown as Prisma.InputJsonValue) : undefined,
      sources: result.sources as unknown as Prisma.InputJsonValue,
      model: result.model,
      status: result.status,
      error: result.error,
    },
  });

  if (result.status === "FAILED") {
    return NextResponse.json(
      {
        error: result.error ?? "Не удалось подобрать коктейли.",
        historyId: history.id,
        model: result.model,
        requestPrompt: parsed.data.prompt,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ...result,
    inventorySnapshot: inventory,
    historyId: history.id,
    requestPrompt: parsed.data.prompt,
    sources: result.sources.slice(0, 5),
  });
}
