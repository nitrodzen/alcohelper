import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { inventoryInputSchema } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...item,
    quantity: item.quantity === null ? null : Number(item.quantity),
    abv: item.abv === null ? null : Number(item.abv),
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

  const parsed = inventoryInputSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля предмета." }, { status: 400 });
  }

  const item = await prisma.inventoryItem.create({
    data: {
      ...parsed.data,
      userId,
      quantity: parsed.data.quantity ?? null,
      abv: parsed.data.kind === "ALCOHOL" ? parsed.data.abv ?? null : null,
      unit: parsed.data.quantity == null ? null : parsed.data.unit,
    },
  });

  return NextResponse.json({ item: serializeItem(item) }, { status: 201 });
}
