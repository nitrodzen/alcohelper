import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { lookupRecipe } from "@/lib/ai";
import type { InventoryForAI } from "@/lib/inventory";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const researchRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
  includeInventory: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  if (!checkRateLimit(`recipe-research:${userId}`, 40)) {
    return NextResponse.json({ error: "Лимит research-запросов на час исчерпан." }, { status: 429 });
  }

  const parsed = researchRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите текстовый запрос." }, { status: 400 });
  }

  let inventory: InventoryForAI[] = [];
  if (parsed.data.includeInventory) {
    const items = await prisma.inventoryItem.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    inventory = items.map((item) => ({
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
  }

  const result = await lookupRecipe(inventory, parsed.data.prompt);
  return NextResponse.json({
    mode: "research",
    ...result,
    requestPrompt: parsed.data.prompt,
    inventoryUsed: parsed.data.includeInventory,
  });
}
