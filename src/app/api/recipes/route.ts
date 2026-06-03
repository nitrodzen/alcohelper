import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { buildAvailabilityInventorySnapshot, isAvailabilityInventorySnapshotStale } from "@/lib/availability-freshness";
import { verifyGeneratedRecipeSources } from "@/lib/ai";
import type { InventoryForAI } from "@/lib/inventory";
import { generatedRecipeSchema } from "@/lib/recipe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const saveRecipeSchema = z.object({
  recipe: generatedRecipeSchema,
  inventorySnapshot: z.array(z.unknown()).max(200),
  model: z.string().trim().min(1).max(80),
  requestPrompt: z.string().trim().max(1200).optional().nullable(),
  userNotes: z.string().trim().max(1200).optional().nullable(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const [recipes, items] = await Promise.all([
    prisma.savedRecipe.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.inventoryItem.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  ]);
  const currentAvailabilitySnapshot = buildAvailabilityInventorySnapshot(
    items.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      category: item.category,
      quantity: item.quantity === null ? null : Number(item.quantity),
      unit: item.unit,
      abv: item.abv === null ? null : Number(item.abv),
      description: item.description,
      aliases: item.aliases,
    })),
  );

  return NextResponse.json({
    recipes: recipes.map((recipe) => ({
      ...recipe,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
      availabilityCheckedAt: recipe.availabilityCheckedAt?.toISOString() ?? null,
      availabilityIsStale: Boolean(
        recipe.availabilityCheckedAt && isAvailabilityInventorySnapshotStale(recipe.availabilityInventorySnapshot, currentAvailabilitySnapshot),
      ),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const parsed = saveRecipeSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Не удалось сохранить рецепт." }, { status: 400 });
  }
  const currentItems = await prisma.inventoryItem.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const inventory: InventoryForAI[] = currentItems.map((item) => ({
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
  const verifiedRecipes = await verifyGeneratedRecipeSources([parsed.data.recipe], { inventory });
  const verifiedRecipe = verifiedRecipes[0];

  if (!verifiedRecipe) {
    return NextResponse.json({ error: "Источник рецепта недоступен, рецепт не сохранен." }, { status: 400 });
  }

  const saved = await prisma.savedRecipe.create({
    data: {
      userId,
      title: verifiedRecipe.title,
      description: verifiedRecipe.description,
      recipe: verifiedRecipe as unknown as Prisma.InputJsonValue,
      inventorySnapshot: parsed.data.inventorySnapshot as unknown as Prisma.InputJsonValue,
      model: parsed.data.model,
      requestPrompt: parsed.data.requestPrompt,
      userNotes: parsed.data.userNotes,
    },
  });

  return NextResponse.json(
    {
      recipe: {
        ...saved,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
        availabilityCheckedAt: saved.availabilityCheckedAt?.toISOString() ?? null,
        availabilityIsStale: false,
      },
    },
    { status: 201 },
  );
}
