import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { generatedRecipeSchema } from "@/lib/recipe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const saveRecipeSchema = z.object({
  recipe: generatedRecipeSchema,
  inventorySnapshot: z.array(z.unknown()).max(200),
  model: z.string().trim().min(1).max(80),
  userNotes: z.string().trim().max(1200).optional().nullable(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const recipes = await prisma.savedRecipe.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    recipes: recipes.map((recipe) => ({
      ...recipe,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
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

  const saved = await prisma.savedRecipe.create({
    data: {
      userId,
      title: parsed.data.recipe.title,
      description: parsed.data.recipe.description,
      recipe: parsed.data.recipe as Prisma.InputJsonValue,
      inventorySnapshot: parsed.data.inventorySnapshot as Prisma.InputJsonValue,
      model: parsed.data.model,
      userNotes: parsed.data.userNotes,
    },
  });

  return NextResponse.json(
    {
      recipe: {
        ...saved,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
