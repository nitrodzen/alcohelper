"use client";

import { useEffect, useState } from "react";
import { Check, FlaskConical, RotateCcw, Save, Sparkles } from "lucide-react";
import { clearRecipeGeneration, loadRecipeGeneration, saveRecipeGeneration } from "@/lib/generation-storage";
import type { GeneratedRecipe, InventoryItem, RecipeGeneration, SavedRecipe } from "@/types/app";

function recipeTitleKey(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

export function RecipeLab() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [generation, setGeneration] = useState<RecipeGeneration | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<string>>(new Set());
  const [savedTitleKeys, setSavedTitleKeys] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState("");

  async function loadInventory() {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const data = await response.json();
    setInventory(data.items ?? []);
  }

  async function loadSavedRecipes() {
    const response = await fetch("/api/recipes", { cache: "no-store" });
    const data = await response.json();
    const loaded: SavedRecipe[] = data.recipes ?? [];
    setSavedRecipeIds(new Set(loaded.map((recipe) => recipe.id)));
    setSavedTitleKeys(new Set(loaded.map((recipe) => recipeTitleKey(recipe.title))));
  }

  useEffect(() => {
    const restored = loadRecipeGeneration();
    if (restored) {
      setGeneration(restored);
      setPrompt(restored.requestPrompt);
    }
    void loadInventory();
    void loadSavedRecipes();
  }, []);

  async function generate() {
    setLoading(true);
    setGeneration(null);
    clearRecipeGeneration();
    setMessage("AI ищет рецепты и проверяет доступные компоненты.");

    const response = await fetch("/api/recipes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.error ?? "Не удалось подобрать коктейли.");
      return;
    }

    const nextGeneration: RecipeGeneration = {
      recipes: data.recipes ?? [],
      model: data.model,
      inventorySnapshot: data.inventorySnapshot ?? inventory,
      sources: data.sources ?? [],
      historyId: data.historyId,
      requestPrompt: data.requestPrompt ?? prompt,
    };

    setGeneration(nextGeneration);
    saveRecipeGeneration(nextGeneration);
    setInventory(nextGeneration.inventorySnapshot);
    if (nextGeneration.recipes.length === 0) {
      setMessage("Нужно больше данных: добавьте алкоголь, ингредиенты и инструмент.");
    } else {
      setMessage("");
    }
  }

  function resetGeneration() {
    clearRecipeGeneration();
    setGeneration(null);
    setPrompt("");
    setMessage("");
    void loadInventory();
    void loadSavedRecipes();
  }

  async function save(recipe: GeneratedRecipe) {
    if (!generation || isSaved(recipe)) {
      return;
    }

    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipe,
        inventorySnapshot: generation.inventorySnapshot,
        model: generation.model,
        requestPrompt: generation.requestPrompt,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setSavedRecipeIds((current) => new Set([...current, data.recipe.id]));
      setSavedTitleKeys((current) => new Set([...current, recipeTitleKey(recipe.title)]));
    }
  }

  function isSaved(recipe: GeneratedRecipe) {
    return Boolean((recipe.savedRecipeId && savedRecipeIds.has(recipe.savedRecipeId)) || savedTitleKeys.has(recipeTitleKey(recipe.title)));
  }

  const inventoryReady = inventory.some((item) => item.kind !== "TOOL") && inventory.some((item) => item.kind === "TOOL");

  return (
    <div className="main-workspace">
      <section className="recipe-hero">
        <div>
          <h1>Что можно смешать сейчас</h1>
          <p>AI смотрит на ваш инвентарь как есть, ищет существующие рецепты и отмечает аналоги, если оригинальных компонентов нет.</p>
        </div>
        <div className="prompt-box">
          <label>
            Комментарий к подбору
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              maxLength={1200}
              placeholder="Например: хочу Б-52, шот, подбери аналоги из того что есть"
            />
          </label>
          <div className="prompt-actions">
            <button className="primary-button large" type="button" onClick={generate} disabled={loading}>
              <Sparkles size={19} />
              {loading ? "Подбираю..." : "Подобрать коктейли"}
            </button>
            <button className="secondary-button large" type="button" onClick={resetGeneration} disabled={loading}>
              <RotateCcw size={18} />
              Очистить поле для новых идей
            </button>
          </div>
        </div>
      </section>
      <section className="status-strip">
        <span>{inventory.length} предметов в инвентаре</span>
        <span>{inventory.filter((item) => item.kind === "ALCOHOL").length} алкоголь</span>
        <span>{inventory.filter((item) => item.kind === "INGREDIENT").length} ингредиенты</span>
        <span>{inventory.filter((item) => item.kind === "TOOL").length} инструменты</span>
      </section>
      {!inventoryReady ? (
        <div className="empty-state">
          <FlaskConical size={28} />
          <p>Для уверенного подбора добавьте хотя бы один алкоголь, один ингредиент и один инструмент в разделе инвентаря.</p>
        </div>
      ) : null}
      {message ? <div className="form-note">{message}</div> : null}
      <div className="recipe-grid">
        {generation?.recipes.map((recipe) => (
          <article key={recipe.title} className="recipe-card">
            <div className="recipe-card-head">
              <div>
                <div className="title-row">
                  <h2>{recipe.title}</h2>
                  {isSaved(recipe) ? <span className="recipe-badge saved">У вас в рецептах</span> : null}
                  {recipe.matchType === "SUBSTITUTION" ? <span className="recipe-badge substitution">С заменой</span> : null}
                </div>
                <p>{recipe.description}</p>
              </div>
              <button className="icon-action" type="button" title={isSaved(recipe) ? "Уже сохранен" : "Сохранить рецепт"} onClick={() => save(recipe)} disabled={isSaved(recipe)}>
                {isSaved(recipe) ? <Check size={19} /> : <Save size={19} />}
              </button>
            </div>
            <div className="recipe-columns">
              <div>
                <h3>Состав</h3>
                <ul>
                  {recipe.ingredients.map((ingredient) => (
                    <li key={`${recipe.title}-${ingredient.name}`}>
                      <span>{ingredient.name}</span>
                      <strong>{ingredient.amount}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Инструменты</h3>
                <ul>
                  {recipe.tools.map((tool) => (
                    <li key={`${recipe.title}-${tool.name}`}>
                      <span>{tool.name}</span>
                      <strong>{tool.optional ? "опц." : "нужен"}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="steps">
              <h3>Шаги</h3>
              <ol>
                {recipe.steps.map((step) => (
                  <li key={`${recipe.title}-${step}`}>{step}</li>
                ))}
              </ol>
            </div>
            {recipe.warnings.length ? <p className="warning-line">{recipe.warnings.join(" ")}</p> : null}
            {recipe.sources?.length ? (
              <div className="source-list">
                <h3>Источники</h3>
                {recipe.sources.slice(0, 5).map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                    {source.title ?? source.url}
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
