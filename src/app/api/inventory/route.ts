import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { inventoryInputSchema } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { seedInitialInventoryForUser } from "@/lib/seed";

export const runtime = "nodejs";

const inventorySaveSchema = inventoryInputSchema.extend({
  aiReviewed: z.boolean().optional().default(false),
});

function serializeItem(item: {
  id: string;
  kind: string;
  name: string;
  category: string;
  quantity: unknown;
  unit: string | null;
  abv: unknown;
  description: string;
  icon: string;
  aliases: string[];
  aiReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...item,
    quantity: item.quantity === null ? null : Number(item.quantity),
    abv: item.abv === null ? null : Number(item.abv),
    aiReviewedAt: item.aiReviewedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  await seedInitialInventoryForUser(userId);

  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ items: items.map(serializeItem) });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const parsed = inventorySaveSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля предмета." }, { status: 400 });
  }

  const { aiReviewed, ...itemData } = parsed.data;
  const item = await prisma.inventoryItem.create({
    data: {
      ...itemData,
      userId,
      quantity: parsed.data.quantity ?? null,
      abv: parsed.data.kind === "ALCOHOL" ? parsed.data.abv ?? null : null,
      unit: parsed.data.unit,
      aiReviewedAt: aiReviewed ? new Date() : null,
    },
  });

  return NextResponse.json({ item: serializeItem(item) }, { status: 201 });
}
