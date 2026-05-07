export type InventoryKind = "ALCOHOL" | "INGREDIENT" | "TOOL";

export type InventoryItem = {
  id: string;
  kind: InventoryKind;
  name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  abv: number | null;
  description: string;
  icon: string;
  aliases: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type GeneratedRecipe = {
  title: string;
  description: string;
  ingredients: Array<{
    name: string;
    amount: string;
    inventoryItemId?: string | null;
    optional?: boolean;
  }>;
  tools: Array<{
    name: string;
    optional?: boolean;
  }>;
  steps: string[];
  warnings: string[];
};

export type SavedRecipe = {
  id: string;
  title: string;
  description: string;
  recipe: GeneratedRecipe;
  inventorySnapshot: unknown;
  model: string;
  userNotes: string | null;
  createdAt: string;
  updatedAt: string;
};
