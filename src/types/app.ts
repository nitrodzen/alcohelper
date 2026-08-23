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

export type MakeabilityStatus = "AVAILABLE" | "AVAILABLE_WITH_SUBSTITUTIONS" | "NOT_RECOMMENDED" | "CANNOT_MAKE";
export type SourceStatus = "VERIFIED" | "UNVERIFIED" | "FAILED";
export type TasteImpact = {
  level: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  summary: string;
};
export type MissingIngredient = {
  name: string;
  amount?: string;
  kind?: "INGREDIENT" | "TOOL";
  reason?: "ABSENT" | "INSUFFICIENT";
  availableAmount?: string;
};
export type ShoppingListItem = {
  name: string;
  amount?: string;
  note?: string;
};
export type SubstitutionOption = {
  original: string;
  originalAmount?: string;
  substitute: string;
  substituteInventoryItemId?: string | null;
  note?: string;
  tasteImpact: TasteImpact;
  recommended: boolean;
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
  makeability?: MakeabilityStatus;
  missingIngredients?: MissingIngredient[];
  shoppingList?: ShoppingListItem[];
  substitutionOptions?: SubstitutionOption[];
  tasteImpact?: TasteImpact;
  sourceStatus?: SourceStatus;
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
  mode?: "discover";
  recipes: GeneratedRecipe[];
  model: string;
  inventorySnapshot: InventoryItem[];
  sources: SourceLink[];
  historyId: string;
  requestPrompt: string;
  result?: unknown;
};

export type RecipeLookupResult = {
  mode: "lookup";
  recipe: GeneratedRecipe;
  adaptedRecipe: GeneratedRecipe | null;
  makeability: MakeabilityStatus;
  missingIngredients: MissingIngredient[];
  shoppingList: ShoppingListItem[];
  substitutionOptions: SubstitutionOption[];
  alternatives: GeneratedRecipe[];
  tasteImpact: TasteImpact;
  sourceStatus: SourceStatus;
  sources: SourceLink[];
  model: string;
  inventorySnapshot: InventoryItem[];
  historyId: string;
  requestPrompt: string;
  status?: "SUCCESS" | "FAILED";
  error?: string;
};

export type RecipeRequestHistory = {
  id: string;
  mode?: "discover" | "lookup";
  prompt: string;
  inventorySnapshot: InventoryItem[];
  recipes: GeneratedRecipe[] | null;
  result?: RecipeGeneration | RecipeLookupResult | null;
  sources: SourceLink[];
  model: string;
  status: "SUCCESS" | "FAILED";
  error: string | null;
  createdAt: string;
};
