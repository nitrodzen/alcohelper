"use client";

import { useEffect, useState } from "react";
import { Check, FlaskConical, Save, Sparkles } from "lucide-react";
import type { GeneratedRecipe, InventoryItem } from "@/types/app";

type Generation = {
  recipes: GeneratedRecipe[];
  model: string;
  inventorySnapshot: InventoryItem[];
};

export function RecipeLab() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  async function loadInventory() {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const data = await response.json();
    setInventory(data.items ?? []);
  }

  useEffect(() => {
    void loadInventory();
  }, []);

  async function generate() {
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/recipes/generate", { method: "POST" });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.error ?? "Не удалось подобрать коктейли.");
      return;
    }

    setGeneration(data);
    if ((data.recipes ?? []).length === 0) {
      setMessage("Нужно больше данных: добавьте алкоголь, ингредиенты и инструмент.");
    }
  }

  async function save(recipe: GeneratedRecipe) {
    if (!generation) {
      return;
    }

    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipe,
        inventorySnapshot: generation.inventorySnapshot,
        model: generation.model,
      }),
    });

    if (response.ok) {
      setSavedTitles((current) => new Set([...current, recipe.title]));
    }
  }

  const inventoryReady = inventory.some((item) => item.kind !== "TOOL") && inventory.some((item) => item.kind === "TOOL");

  return (
    <div className="main-workspace">
      <section className="recipe-hero">
        <div>
          <h1>Что можно смешать сейчас</h1>
          <p>AI смотрит на ваш инвентарь, названия, описания и пользовательские правки. Рецепты проходят серверную проверку на отсутствующие обязательные компоненты.</p>
        </div>
        <button className="primary-button large" type="button" onClick={generate} disabled={loading}>
          <Sparkles size={19} />
          {loading ? "Подбираю..." : "Подобрать коктейли"}
        </button>
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
                <h2>{recipe.title}</h2>
                <p>{recipe.description}</p>
              </div>
              <button className="icon-action" type="button" title="Сохранить рецепт" onClick={() => save(recipe)}>
                {savedTitles.has(recipe.title) ? <Check size={19} /> : <Save size={19} />}
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
          </article>
        ))}
      </div>
    </div>
  );
}
