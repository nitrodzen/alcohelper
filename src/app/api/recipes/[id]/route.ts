import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const notesSchema = z.object({
  userNotes: z.string().trim().max(1200).optional().nullable(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  const { id } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const parsed = notesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Заметка слишком длинная." }, { status: 400 });
  }

  const exists = await prisma.savedRecipe.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "Рецепт не найден." }, { status: 404 });
  }

  const recipe = await prisma.savedRecipe.update({
    where: { id },
    data: { userNotes: parsed.data.userNotes },
  });

  return NextResponse.json({
    recipe: {
      ...recipe,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  const { id } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const exists = await prisma.savedRecipe.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "Рецепт не найден." }, { status: 404 });
  }

  await prisma.savedRecipe.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
