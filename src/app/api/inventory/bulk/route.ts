import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { heuristicNormalizeItem, normalizeText } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bulkInventorySchema = z.object({
  names: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }
  if (!checkRateLimit(`inventory-bulk:${userId}`, 20)) {
    return NextResponse.json({ error: "Лимит массовых добавлений на час исчерпан." }, { status: 429 });
  }

  const parsed = bulkInventorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Добавьте от 1 до 30 названий." }, { status: 400 });
  }

  const uniqueNames = [...new Map(parsed.data.names.map((name) => [normalizeText(name), name.trim()])).values()];
  const existing = await prisma.inventoryItem.findMany({ where: { userId }, select: { name: true } });
  const existingNames = new Set(existing.map((item) => normalizeText(item.name)));
  const items = uniqueNames
    .filter((name) => !existingNames.has(normalizeText(name)))
    .map((name) => heuristicNormalizeItem({ name }));

  if (items.length > 0) {
    await prisma.inventoryItem.createMany({
      data: items.map((item) => ({ ...item, userId, aiReviewedAt: null })),
    });
  }

  return NextResponse.json({ createdCount: items.length, skippedCount: uniqueNames.length - items.length });
}
