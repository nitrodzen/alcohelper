import { describe, expect, it } from "vitest";
import { filterRecipesByInventory } from "@/lib/recipe";
import type { InventoryForAI } from "@/lib/inventory";

const inventory: InventoryForAI[] = [
  {
    id: "rum",
    kind: "ALCOHOL",
    name: "Белый ром",
    category: "rum",
    quantity: 500,
    unit: "мл",
    abv: 40,
    description: "Светлый ром",
    icon: "Bottle",
    aliases: ["white rum"],
  },
  {
    id: "lime",
    kind: "INGREDIENT",
    name: "Лайм",
    category: "citrus",
    quantity: 4,
    unit: "шт",
    abv: null,
    description: "Свежий цитрус",
    icon: "Lemon",
    aliases: ["lime"],
  },
  {
    id: "shaker",
    kind: "TOOL",
    name: "Шейкер",
    category: "tool",
    quantity: 1,
    unit: "шт",
    abv: null,
    description: "",
    icon: "Wrench",
    aliases: ["shaker"],
  },
];

describe("recipe validation", () => {
  it("keeps recipes that only use available required items", () => {
    const recipes = filterRecipesByInventory(
      [
        {
          title: "Rum Lime",
          description: "Simple",
          ingredients: [
            { name: "white rum", amount: "50 мл", optional: false },
            { name: "lime", amount: "20 мл", optional: false },
          ],
          tools: [{ name: "shaker", optional: false }],
          steps: ["Add rum", "Shake"],
          warnings: [],
        },
      ],
      inventory,
    );

    expect(recipes).toHaveLength(1);
  });

  it("drops recipes with missing required ingredients", () => {
    const recipes = filterRecipesByInventory(
      [
        {
          title: "Missing Soda",
          description: "Nope",
          ingredients: [
            { name: "Белый ром", amount: "50 мл", optional: false },
            { name: "Содовая", amount: "100 мл", optional: false },
          ],
          tools: [{ name: "Шейкер", optional: false }],
          steps: ["Add", "Shake"],
          warnings: [],
        },
      ],
      inventory,
    );

    expect(recipes).toHaveLength(0);
  });
});
