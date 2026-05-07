import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { generateRecipes } from "@/lib/ai";
import type { InventoryForAI } from "@/lib/inventory";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  if (!checkRateLimit(`recipes:${userId}`, 30)) {
    return NextResponse.json({ error: "Лимит генераций на час исчерпан." }, { status: 429 });
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
  }));

  if (inventory.filter((item) => item.kind !== "TOOL").length === 0) {
    return NextResponse.json({ error: "Добавьте хотя бы один алкоголь или ингредиент." }, { status: 400 });
  }

  const result = await generateRecipes(inventory);

  return NextResponse.json({
    ...result,
    inventorySnapshot: inventory,
  });
}
