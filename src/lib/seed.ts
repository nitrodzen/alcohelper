import type { Prisma } from "@prisma/client";
import { normalizeText } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

const initialInventory: Array<Omit<Prisma.InventoryItemUncheckedCreateInput, "id" | "userId" | "createdAt" | "updatedAt">> = [
  {
    kind: "TOOL",
    name: "Стакан",
    category: "glass",
    quantity: 1,
    unit: "шт",
    abv: null,
    description: "Универсальный стакан для подачи и смешивания простых напитков.",
    icon: "GlassWater",
    aliases: ["glass", "highball"],
    aiReviewedAt: new Date(),
  },
  {
    kind: "TOOL",
    name: "Барная ложка",
    category: "tool",
    quantity: 1,
    unit: "шт",
    abv: null,
    description: "Длинная ложка для перемешивания коктейлей.",
    icon: "Utensils",
    aliases: ["bar spoon", "ложка"],
    aiReviewedAt: new Date(),
  },
  {
    kind: "INGREDIENT",
    name: "Соль",
    category: "seasoning",
    quantity: 50,
    unit: "г",
    abv: null,
    description: "Соль для кромки бокала и вкусового баланса.",
    icon: "Package",
    aliases: ["salt"],
    aiReviewedAt: new Date(),
  },
  {
    kind: "INGREDIENT",
    name: "Лед",
    category: "ice",
    quantity: 10,
    unit: "кубики",
    abv: null,
    description: "Кубики льда для охлаждения и встряхивания коктейлей.",
    icon: "Snowflake",
    aliases: ["ice"],
    aiReviewedAt: new Date(),
  },
];

export async function seedInitialInventoryForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inventorySeededAt: true },
  });

  if (!user || user.inventorySeededAt) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const lockedUser = await tx.user.findUnique({
      where: { id: userId },
      select: { inventorySeededAt: true },
    });

    if (!lockedUser || lockedUser.inventorySeededAt) {
      return;
    }

    const existingItems = await tx.inventoryItem.findMany({
      where: { userId },
      select: { name: true },
    });
    const existingNames = new Set(existingItems.map((item) => normalizeText(item.name)));
    const missingItems = initialInventory.filter((item) => !existingNames.has(normalizeText(item.name)));

    if (missingItems.length > 0) {
      await tx.inventoryItem.createMany({
        data: missingItems.map((item) => ({
          ...item,
          userId,
        })),
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: { inventorySeededAt: new Date() },
    });
  });
}

export function getInitialInventoryForTests() {
  return initialInventory;
}
