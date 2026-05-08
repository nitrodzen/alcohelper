import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { checkSavedRecipesAvailability, type SavedRecipeForAI } from "@/lib/ai";
import type { InventoryForAI } from "@/lib/inventory";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { generatedRecipeSchema } from "@/lib/recipe";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  if (!checkRateLimit(`availability:${userId}`, 20)) {
    return NextResponse.json({ error: "Лимит AI-проверок на час исчерпан." }, { status: 429 });
  }

  const [items, savedRecipeRows] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    prisma.savedRecipe.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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

  if (savedRecipes.length === 0) {
    return NextResponse.json({ error: "Нет сохраненных рецептов для проверки." }, { status: 400 });
  }

  const result = await checkSavedRecipesAvailability(inventory, savedRecipes);

  if (result.status === "FAILED") {
    return NextResponse.json({ error: result.error ?? "Не удалось проверить доступность рецептов." }, { status: 502 });
  }

  const checkedAt = new Date();
  await prisma.$transaction(
    result.checks.map((check) =>
      prisma.savedRecipe.updateMany({
        where: { id: check.recipeId, userId },
        data: {
          availabilityStatus: check.status,
          availabilityComment: check.comment,
          availabilityDetails: check as unknown as Prisma.InputJsonValue,
          availabilityCheckedAt: checkedAt,
          availabilityInventorySnapshot: inventory as unknown as Prisma.InputJsonValue,
          availabilityModel: result.model,
        },
      }),
    ),
  );

  const recipes = await prisma.savedRecipe.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    checkedCount: result.checks.length,
    recipes: recipes.map((recipe) => ({
      ...recipe,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
      availabilityCheckedAt: recipe.availabilityCheckedAt?.toISOString() ?? null,
    })),
  });
}
