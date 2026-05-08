import { describe, expect, it } from "vitest";
import { buildAvailabilityInventorySnapshot, isAvailabilityInventorySnapshotStale } from "@/lib/availability-freshness";

const item = {
  id: "ice",
  kind: "INGREDIENT",
  name: "Лед",
  category: "ice",
  quantity: 10,
  unit: "кубики",
  abv: null,
  description: "Кубики льда.",
  aliases: ["ice"],
};

describe("availability freshness helpers", () => {
  it("keeps a checked recipe fresh while availability-relevant inventory is unchanged", () => {
    const snapshot = buildAvailabilityInventorySnapshot([item]);

    expect(isAvailabilityInventorySnapshotStale(snapshot, [item])).toBe(false);
  });

  it("marks availability as stale when inventory is added, removed, or changed", () => {
    const snapshot = buildAvailabilityInventorySnapshot([item]);
    const soda = { ...item, id: "soda", name: "Содовая", category: "soda", unit: "мл", quantity: 500 };

    expect(isAvailabilityInventorySnapshotStale(snapshot, [item, soda])).toBe(true);
    expect(isAvailabilityInventorySnapshotStale(snapshot, [])).toBe(true);
    expect(isAvailabilityInventorySnapshotStale(snapshot, [{ ...item, quantity: 5 }])).toBe(true);
  });

  it("treats missing or invalid snapshots as stale", () => {
    expect(isAvailabilityInventorySnapshotStale(null, [item])).toBe(true);
    expect(isAvailabilityInventorySnapshotStale([{ id: "ice" }], [item])).toBe(true);
  });
});
