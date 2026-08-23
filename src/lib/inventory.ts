import { z } from "zod";

export const inventoryKindSchema = z.enum(["ALCOHOL", "INGREDIENT", "TOOL"]);
export const inventoryUnits = ["мл", "л", "шт", "г", "кг", "капли", "кубики", "дольки", "ложки", "бутылка"] as const;
export const inventoryUnitSchema = z.enum(inventoryUnits);

export const inventoryInputSchema = z.object({
  kind: inventoryKindSchema,
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80).optional().default("custom"),
  quantity: z.union([z.null(), z.coerce.number().min(0).max(100000)]).optional().default(null),
  unit: inventoryUnitSchema.nullable().optional().default(null),
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
  const kind = input.kind ?? (
    raw.match(/шейкер|джиггер|лож|стрейнер|бокал|стакан|блендер|сифон/)
      ? "TOOL"
      : raw.match(/водк|vodka|джин|gin|ром|rum|текил|tequila|виски|whisk|бурбон|bourbon|коньяк|brandy|ликер|liqueur|вермут|vermouth|мартини|martini|вино|wine|пиво|beer|калуа|kahlua|baileys|бейлис|cointreau|triple sec|aperol|апероль|campari|кампари|amaretto|амаретто|absinthe|абсент/)
        ? "ALCOHOL"
        : "INGREDIENT"
  );

  let category = input.category?.trim();
  if (!category) {
    if (raw.match(/водк|vodka/)) category = "vodka";
    else if (raw.match(/джин|gin/)) category = "gin";
    else if (raw.match(/ром|rum/)) category = "rum";
    else if (raw.match(/текил|tequila/)) category = "tequila";
    else if (raw.match(/виски|bourbon|whiskey|whisky/)) category = "whiskey";
    else if (raw.match(/ликер|liqueur|triple sec|cointreau|калуа|kahlua|baileys|бейлис|amaretto|амаретто/)) category = "liqueur";
    else if (raw.match(/вермут|vermouth|мартини|martini/)) category = "vermouth";
    else if (raw.match(/aperol|апероль|campari|кампари/)) category = "aperitif";
    else if (raw.match(/лимон|лайм|апельсин|citrus/)) category = "citrus";
    else if (raw.match(/сок|juice/)) category = "juice";
    else if (raw.match(/сироп|syrup/)) category = "syrup";
    else if (kind === "TOOL" && raw.match(/бокал|стакан|glass/)) category = "glass";
    else if (kind === "TOOL") category = "tool";
    else category = kind === "ALCOHOL" ? "spirit" : "ingredient";
  }

  const aliases = uniqueAliases([name, ...(input.aliases ?? [])]);
  const icon = input.icon?.trim() || iconByCategory[category] || defaultIconForKind(kind);
  const quantity = input.quantity ?? null;

  return {
    kind,
    name,
    category,
    quantity,
    unit: quantity === null ? null : input.unit ?? defaultUnitForKind(kind),
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

export function defaultUnitForKind(kind: "ALCOHOL" | "INGREDIENT" | "TOOL"): (typeof inventoryUnits)[number] {
  if (kind === "ALCOHOL") {
    return "мл";
  }
  if (kind === "TOOL") {
    return "шт";
  }
  return "г";
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
  return findMatchingInventoryItem(requiredName, inventory, allowedKinds) !== null;
}

export function findMatchingInventoryItem<
  T extends Pick<InventoryForAI, "name" | "category" | "description" | "aliases" | "kind">,
>(
  requiredName: string,
  inventory: T[],
  allowedKinds: Array<"ALCOHOL" | "INGREDIENT" | "TOOL">,
): T | null {
  const required = normalizeText(requiredName);
  if (!required) {
    return null;
  }

  const genericTerms = new Set([
    "alcohol", "ingredient", "spirit", "liqueur", "ликер", "rum", "ром", "vodka", "водка",
    "gin", "джин", "tequila", "текила", "whiskey", "whisky", "виски", "vermouth", "вермут",
    "citrus", "цитрус", "juice", "сок", "syrup", "сироп", "mixer", "tool", "инструмент",
  ]);
  const containsPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

  return inventory.find((item) => {
    if (!allowedKinds.includes(item.kind)) {
      return false;
    }
    const identityTerms = uniqueAliases([item.name, ...item.aliases]).map(normalizeText);
    const identityMatch = identityTerms.some((term) => (
      term === required ||
      containsPhrase(term, required) ||
      (!genericTerms.has(term) && containsPhrase(required, term))
    ));
    if (identityMatch) {
      return true;
    }

    const category = normalizeText(item.category);
    if (category === required) {
      return true;
    }

    const description = normalizeText(item.description);
    return required.length >= 3 && containsPhrase(description, required);
  }) ?? null;
}

type NormalizedAmount = {
  family: "VOLUME" | "MASS" | "COUNT" | "DROPS" | "CUBES" | "WEDGES" | "SPOONS";
  value: number;
};

function normalizeAmount(value: number, unit: string): NormalizedAmount | null {
  const normalizedUnit = normalizeText(unit);
  const rules: Array<{ family: NormalizedAmount["family"]; multiplier: number; units: string[] }> = [
    { family: "VOLUME", multiplier: 1, units: ["мл", "ml"] },
    { family: "VOLUME", multiplier: 10, units: ["сл", "cl"] },
    { family: "VOLUME", multiplier: 1000, units: ["л", "l", "литр", "литра", "литров"] },
    { family: "MASS", multiplier: 1, units: ["г", "g", "гр", "gram", "grams"] },
    { family: "MASS", multiplier: 1000, units: ["кг", "kg"] },
    { family: "COUNT", multiplier: 1, units: ["шт", "штука", "штуки", "штук", "piece", "pieces"] },
    { family: "DROPS", multiplier: 1, units: ["капля", "капли", "капель", "drop", "drops"] },
    { family: "CUBES", multiplier: 1, units: ["кубик", "кубики", "кубиков", "cube", "cubes"] },
    { family: "WEDGES", multiplier: 1, units: ["долька", "дольки", "долек", "wedge", "wedges"] },
    { family: "SPOONS", multiplier: 1, units: ["ложка", "ложки", "ложек", "spoon", "spoons", "tsp", "tbsp"] },
  ];
  const rule = rules.find((candidate) => candidate.units.includes(normalizedUnit));
  return rule ? { family: rule.family, value: value * rule.multiplier } : null;
}

export function parseRecipeAmount(amount: string): NormalizedAmount | null {
  const normalized = amount.toLowerCase().replace(/(\d),(\d)/g, "$1.$2");
  const match = normalized.match(/(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(мл|ml|сл|cl|л|литр(?:а|ов)?|l|кг|kg|г|гр|g|grams?|шт|штук(?:а|и)?|pieces?|кап(?:ля|ли|ель)|drops?|кубик(?:и|ов)?|cubes?|дольк(?:а|и)|долек|wedges?|ложк(?:а|и|ек)|spoons?|tsp|tbsp)(?=\s|$|[.,;])/i);
  if (!match) {
    return null;
  }
  const value = Number(match[2] ?? match[1]);
  return Number.isFinite(value) ? normalizeAmount(value, match[3]) : null;
}

export function hasSufficientInventoryAmount(
  requiredAmount: string,
  item: Pick<InventoryForAI, "quantity" | "unit">,
): boolean | null {
  if (item.quantity === null || !item.unit) {
    return null;
  }
  const required = parseRecipeAmount(requiredAmount);
  const available = normalizeAmount(item.quantity, item.unit);
  if (!required || !available || required.family !== available.family) {
    return null;
  }
  return available.value >= required.value;
}

export function formatInventoryAmount(item: Pick<InventoryForAI, "quantity" | "unit">): string | undefined {
  return item.quantity === null ? undefined : `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
}
