import type { RecipeGeneration } from "@/types/app";

const storageKey = "alco-helper:last-generation";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecipeGeneration(value: unknown): value is RecipeGeneration {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecipeGeneration>;
  return (
    Array.isArray(candidate.recipes) &&
    Array.isArray(candidate.inventorySnapshot) &&
    Array.isArray(candidate.sources) &&
    typeof candidate.model === "string" &&
    typeof candidate.historyId === "string" &&
    typeof candidate.requestPrompt === "string"
  );
}

export function loadRecipeGeneration() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return isRecipeGeneration(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRecipeGeneration(generation: RecipeGeneration) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(generation));
}

export function clearRecipeGeneration() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(storageKey);
}
