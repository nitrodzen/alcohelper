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
  aiReviewedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SourceLink = {
  title?: string;
  url: string;
};

export type GeneratedRecipe = {
  title: string;
  description: string;
  savedRecipeId?: string | null;
  matchType?: "EXACT" | "SUBSTITUTION" | "SAVED" | null;
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
  sources?: SourceLink[];
};

export type AvailabilityStatus = "AVAILABLE" | "AVAILABLE_WITH_SUBSTITUTIONS" | "MISSING";

export type AvailabilityDetails = {
  recipeId: string;
  status: AvailabilityStatus;
  comment: string;
  missingIngredients: string[];
  substitutions: Array<{
    original: string;
    substitute: string;
    note?: string;
  }>;
  warnings: string[];
  sources: SourceLink[];
};

export type SavedRecipe = {
  id: string;
  title: string;
  description: string;
  recipe: GeneratedRecipe;
  inventorySnapshot: unknown;
  model: string;
  requestPrompt: string | null;
  userNotes: string | null;
  availabilityStatus: AvailabilityStatus | null;
  availabilityComment: string | null;
  availabilityDetails: AvailabilityDetails | null;
  availabilityCheckedAt: string | null;
  availabilityIsStale: boolean;
  availabilityInventorySnapshot: unknown;
  availabilityModel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeGeneration = {
  recipes: GeneratedRecipe[];
  model: string;
  inventorySnapshot: InventoryItem[];
  sources: SourceLink[];
  historyId: string;
  requestPrompt: string;
};

export type RecipeRequestHistory = {
  id: string;
  prompt: string;
  inventorySnapshot: InventoryItem[];
  recipes: GeneratedRecipe[] | null;
  sources: SourceLink[];
  model: string;
  status: "SUCCESS" | "FAILED";
  error: string | null;
  createdAt: string;
};
