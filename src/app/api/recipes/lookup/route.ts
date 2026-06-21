import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { lookupRecipe } from "@/lib/ai";
import type { InventoryForAI } from "@/lib/inventory";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const lookupRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  if (!checkRateLimit(`recipe-lookup:${userId}`, 30)) {
    return NextResponse.json({ error: "Лимит поисков на час исчерпан." }, { status: 429 });
  }

  const parsed = lookupRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите название коктейля." }, { status: 400 });
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

  const result = await lookupRecipe(inventory, parsed.data.prompt);
  const responseResult = {
    mode: "lookup" as const,
    ...result,
    inventorySnapshot: inventory,
    requestPrompt: parsed.data.prompt,
  };
  const history = await prisma.recipeRequestHistory.create({
    data: {
      userId,
      mode: "lookup",
      prompt: parsed.data.prompt,
      inventorySnapshot: inventory as unknown as Prisma.InputJsonValue,
      recipes: result.status === "SUCCESS" ? ([result.recipe, result.adaptedRecipe].filter(Boolean) as unknown as Prisma.InputJsonValue) : undefined,
      result: responseResult as unknown as Prisma.InputJsonValue,
      sources: result.sources as unknown as Prisma.InputJsonValue,
      model: result.model,
      status: result.status,
      error: result.error,
    },
  });

  return NextResponse.json({
    ...responseResult,
    historyId: history.id,
    sources: result.sources.slice(0, 5),
  });
}
