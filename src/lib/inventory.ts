import { z } from "zod";

export const inventoryKindSchema = z.enum(["ALCOHOL", "INGREDIENT", "TOOL"]);
export const inventoryUnits = ["мл", "л", "шт", "г", "кг", "капли", "кубики", "дольки", "ложки", "бутылка"] as const;
export const inventoryUnitSchema = z.enum(inventoryUnits);

export const inventoryInputSchema = z.object({
  kind: inventoryKindSchema,
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80).optional().default("custom"),
  quantity: z.coerce.number().min(0).max(100000),
  unit: inventoryUnitSchema,
  abv: z.coerce.number().min(0).max(96).optional().nullable(),
  description: z.string().trim().max(1200).optional().default(""),
  icon: z.string().trim().max(48).optional().default("Package"),
  aliases: z.array(z.string().trim().min(1).max(80)).max(12).optional().default([]),
});

export type InventoryInput = z.infer<typeof inventoryInputSchema>;

export type InventoryForAI = Omit<InventoryInput, "quantity" | "unit"> & {
  id: string;
  quantity: number | null;
  unit: string | null;
  aiReviewedAt?: string | Date | null;
};

const iconByCategory: Record<string, string> = {
  vodka: "BottleWine",
  gin: "BottleWine",
  rum: "BottleWine",
  tequila: "BottleWine",
  whiskey: "Wine",
  liqueur: "GlassWater",
  citrus: "Lemon",
  juice: "CupSoda",
  syrup: "Droplets",
  bitter: "Droplets",
  garnish: "Cherry",
  tool: "Wrench",
  glass: "Wine",
};

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function heuristicNormalizeItem(input: Partial<InventoryInput>): InventoryInput {
  const name = input.name?.trim() || "Новый предмет";
  const raw = normalizeText(`${name} ${input.description ?? ""}`);
  const kind = input.kind ?? (raw.match(/шейкер|джиггер|лож|стрейнер|бокал|стакан/) ? "TOOL" : "INGREDIENT");

  let category = input.category?.trim();
  if (!category) {
    if (raw.match(/водк|vodka/)) category = "vodka";
    else if (raw.match(/джин|gin/)) category = "gin";
    else if (raw.match(/ром|rum/)) category = "rum";
    else if (raw.match(/текил|tequila/)) category = "tequila";
    else if (raw.match(/виски|bourbon|whiskey|whisky/)) category = "whiskey";
    else if (raw.match(/ликер|liqueur|triple sec|cointreau/)) category = "liqueur";
    else if (raw.match(/лимон|лайм|апельсин|citrus/)) category = "citrus";
    else if (raw.match(/сок|juice/)) category = "juice";
    else if (raw.match(/сироп|syrup/)) category = "syrup";
    else if (kind === "TOOL" && raw.match(/бокал|стакан|glass/)) category = "glass";
    else if (kind === "TOOL") category = "tool";
    else category = kind === "ALCOHOL" ? "spirit" : "ingredient";
  }

  const aliases = uniqueAliases([name, ...(input.aliases ?? [])]);
  const icon = input.icon?.trim() || iconByCategory[category] || defaultIconForKind(kind);

  return {
    kind,
    name,
    category,
    quantity: input.quantity ?? 1,
    unit: input.unit ?? "шт",
    abv: kind === "ALCOHOL" ? input.abv ?? null : null,
    description: input.description?.trim() ?? "",
    icon,
    aliases,
  };
}

export function defaultIconForKind(kind: "ALCOHOL" | "INGREDIENT" | "TOOL"): string {
  if (kind === "ALCOHOL") {
    return "BottleWine";
  }
  if (kind === "TOOL") {
    return "GlassWater";
  }
  return "Package";
}

export function needsAIReview(item: Pick<InventoryForAI, "category" | "description" | "aliases" | "aiReviewedAt"> & { abv?: number | null }): boolean {
  return (
    !item.aiReviewedAt ||
    !item.category ||
    item.category === "custom" ||
    !item.description ||
    item.aliases.length === 0
  );
}

export function itemSearchTerms(item: Pick<InventoryForAI, "name" | "category" | "description" | "aliases">): string[] {
  return uniqueAliases([item.name, item.category, item.description, ...item.aliases]).map(normalizeText);
}

export function hasMatchingInventoryItem(
  requiredName: string,
  inventory: Array<Pick<InventoryForAI, "name" | "category" | "description" | "aliases" | "kind">>,
  allowedKinds: Array<"ALCOHOL" | "INGREDIENT" | "TOOL">,
): boolean {
  const required = normalizeText(requiredName);
  if (!required) {
    return false;
  }

  return inventory.some((item) => {
    if (!allowedKinds.includes(item.kind)) {
      return false;
    }
    return itemSearchTerms(item).some((term) => term === required || term.includes(required) || required.includes(term));
  });
}
