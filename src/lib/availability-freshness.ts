type AvailabilitySnapshotInput = {
  id: string;
  kind: string;
  name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  abv: number | null;
  description: string;
  aliases: string[];
};

export type AvailabilityInventorySnapshotItem = AvailabilitySnapshotInput;

function normalizeSnapshotItem(item: AvailabilitySnapshotInput): AvailabilityInventorySnapshotItem {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    abv: item.abv,
    description: item.description,
    aliases: [...item.aliases].sort((a, b) => a.localeCompare(b)),
  };
}

export function buildAvailabilityInventorySnapshot(items: AvailabilitySnapshotInput[]): AvailabilityInventorySnapshotItem[] {
  return items
    .map(normalizeSnapshotItem)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function parseSnapshot(snapshot: unknown): AvailabilityInventorySnapshotItem[] | null {
  if (!Array.isArray(snapshot)) {
    return null;
  }

  const items: AvailabilityInventorySnapshotItem[] = [];

  for (const item of snapshot) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.kind !== "string" ||
      typeof record.name !== "string" ||
      typeof record.category !== "string" ||
      typeof record.description !== "string" ||
      !(record.quantity === null || typeof record.quantity === "number") ||
      !(record.unit === null || typeof record.unit === "string") ||
      !(record.abv === null || typeof record.abv === "number") ||
      !Array.isArray(record.aliases) ||
      !record.aliases.every((alias) => typeof alias === "string")
    ) {
      return null;
    }

    items.push(
      normalizeSnapshotItem({
        id: record.id,
        kind: record.kind,
        name: record.name,
        category: record.category,
        quantity: record.quantity,
        unit: record.unit,
        abv: record.abv,
        description: record.description,
        aliases: record.aliases,
      }),
    );
  }

  return items.sort((a, b) => a.id.localeCompare(b.id));
}

export function isAvailabilityInventorySnapshotStale(snapshot: unknown, currentItems: AvailabilitySnapshotInput[]): boolean {
  const parsedSnapshot = parseSnapshot(snapshot);

  if (!parsedSnapshot) {
    return true;
  }

  return JSON.stringify(parsedSnapshot) !== JSON.stringify(buildAvailabilityInventorySnapshot(currentItems));
}
