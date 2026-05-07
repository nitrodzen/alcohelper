import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { inventoryInputSchema } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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

  const parsed = inventoryInputSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля предмета." }, { status: 400 });
  }

  const exists = await prisma.inventoryItem.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "Предмет не найден." }, { status: 404 });
  }

  const item = await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...parsed.data,
      quantity: parsed.data.quantity ?? null,
      abv: parsed.data.kind === "ALCOHOL" ? parsed.data.abv ?? null : null,
      unit: parsed.data.quantity == null ? null : parsed.data.unit,
    },
  });

  return NextResponse.json({
    item: {
      ...item,
      quantity: item.quantity === null ? null : Number(item.quantity),
      abv: item.abv === null ? null : Number(item.abv),
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
