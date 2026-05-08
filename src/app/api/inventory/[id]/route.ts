import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { inventoryInputSchema } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const inventorySaveSchema = inventoryInputSchema.extend({
  aiReviewed: z.boolean().optional().default(false),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  const { id } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const parsed = inventorySaveSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля предмета." }, { status: 400 });
  }

  const exists = await prisma.inventoryItem.findFirst({ where: { id, userId } });
  if (!exists) {
    return NextResponse.json({ error: "Предмет не найден." }, { status: 404 });
  }

  const aiRelevantChanged =
    exists.name !== parsed.data.name ||
    exists.kind !== parsed.data.kind ||
    exists.category !== parsed.data.category ||
    (exists.abv === null ? null : Number(exists.abv)) !== (parsed.data.kind === "ALCOHOL" ? parsed.data.abv ?? null : null) ||
    exists.description !== parsed.data.description ||
    exists.icon !== parsed.data.icon ||
    JSON.stringify(exists.aliases) !== JSON.stringify(parsed.data.aliases);

  const { aiReviewed, ...itemData } = parsed.data;
  const item = await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...itemData,
      quantity: parsed.data.quantity ?? null,
      abv: parsed.data.kind === "ALCOHOL" ? parsed.data.abv ?? null : null,
      unit: parsed.data.unit,
      aiReviewedAt: aiReviewed ? new Date() : aiRelevantChanged ? null : exists.aiReviewedAt,
    },
  });

  return NextResponse.json({
    item: {
      ...item,
      quantity: item.quantity === null ? null : Number(item.quantity),
      abv: item.abv === null ? null : Number(item.abv),
      aiReviewedAt: item.aiReviewedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
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

  const exists = await prisma.inventoryItem.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "Предмет не найден." }, { status: 404 });
  }

  await prisma.inventoryItem.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
