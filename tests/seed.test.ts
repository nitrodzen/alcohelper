import { describe, expect, it } from "vitest";
import { getInitialInventoryForTests } from "@/lib/seed";

describe("initial inventory seed", () => {
  it("contains the default beginner bar items once", () => {
    const items = getInitialInventoryForTests();
    expect(items.map((item) => item.name)).toEqual(["Стакан", "Барная ложка", "Соль", "Лед"]);
    expect(new Set(items.map((item) => item.name)).size).toBe(items.length);
  });

  it("uses the supported quantity units for seeded items", () => {
    const units = getInitialInventoryForTests().map((item) => item.unit);
    expect(units).toEqual(["шт", "шт", "г", "кубики"]);
  });
});
