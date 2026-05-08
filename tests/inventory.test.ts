import { describe, expect, it } from "vitest";
import { hasMatchingInventoryItem, heuristicNormalizeItem, inventoryUnitSchema, needsAIReview, normalizeText, uniqueAliases } from "@/lib/inventory";

describe("inventory helpers", () => {
  it("normalizes Russian text for matching", () => {
    expect(normalizeText("Лайм, свежий!")).toBe("лайм свежий");
    expect(normalizeText("Ёрш")).toBe("ерш");
  });

  it("deduplicates aliases by normalized form", () => {
    expect(uniqueAliases(["Лайм", " лайм ", "lime"])).toEqual(["Лайм", "lime"]);
  });

  it("detects common item categories", () => {
    const item = heuristicNormalizeItem({ name: "Свежий лайм", kind: "INGREDIENT" });
    expect(item.category).toBe("citrus");
    expect(item.icon).toBe("Lemon");
  });

  it("validates supported inventory units", () => {
    expect(inventoryUnitSchema.parse("мл")).toBe("мл");
    expect(inventoryUnitSchema.parse("кубики")).toBe("кубики");
    expect(() => inventoryUnitSchema.parse("ведро")).toThrow();
  });

  it("detects items that still need AI review", () => {
    expect(needsAIReview({ category: "custom", description: "", aliases: [], aiReviewedAt: null })).toBe(true);
    expect(needsAIReview({ category: "rum", description: "Белый ром", aliases: ["white rum"], aiReviewedAt: new Date() })).toBe(false);
  });

  it("matches required items against user aliases and descriptions", () => {
    expect(
      hasMatchingInventoryItem(
        "lime",
        [
          {
            kind: "INGREDIENT",
            name: "Лайм",
            category: "citrus",
            description: "Свежий зеленый цитрус",
            aliases: ["lime"],
          },
        ],
        ["INGREDIENT"],
      ),
    ).toBe(true);
  });
});
