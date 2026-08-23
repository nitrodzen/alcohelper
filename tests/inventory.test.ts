import { describe, expect, it } from "vitest";
import { hasMatchingInventoryItem, hasSufficientInventoryAmount, heuristicNormalizeItem, inventoryUnitSchema, needsAIReview, normalizeText, parseRecipeAmount, uniqueAliases } from "@/lib/inventory";

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

  it("recognizes common branded liqueurs added through the quick form", () => {
    const item = heuristicNormalizeItem({ name: "Kahlua" });
    expect(item.kind).toBe("ALCOHOL");
    expect(item.category).toBe("liqueur");
    expect(item.quantity).toBeNull();
    expect(item.unit).toBeNull();
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

  it("does not treat a broad category as an exact style match", () => {
    expect(
      hasMatchingInventoryItem(
        "White rum",
        [{ kind: "ALCOHOL", name: "Dark rum", category: "rum", description: "Темный выдержанный ром", aliases: ["dark rum"] }],
        ["ALCOHOL"],
      ),
    ).toBe(false);
  });

  it("compares compatible recipe and inventory quantities", () => {
    expect(parseRecipeAmount("примерно 4 cl")).toEqual({ family: "VOLUME", value: 40 });
    expect(hasSufficientInventoryAmount("50 мл", { quantity: 40, unit: "мл" })).toBe(false);
    expect(hasSufficientInventoryAmount("30 мл", { quantity: 0.04, unit: "л" })).toBe(true);
    expect(hasSufficientInventoryAmount("50 мл", { quantity: null, unit: null })).toBeNull();
  });
});
