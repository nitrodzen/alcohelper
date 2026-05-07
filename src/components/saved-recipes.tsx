"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { NotebookPen, Save, Trash2 } from "lucide-react";
import type { SavedRecipe } from "@/types/app";

export function SavedRecipes() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function loadRecipes() {
    const response = await fetch("/api/recipes", { cache: "no-store" });
    const data = await response.json();
    const loaded = data.recipes ?? [];
    setRecipes(loaded);
    setNotes(Object.fromEntries(loaded.map((recipe: SavedRecipe) => [recipe.id, recipe.userNotes ?? ""])));
    setLoading(false);
  }

  useEffect(() => {
    void loadRecipes();
  }, []);

  async function saveNotes(id: string) {
    await fetch(`/api/recipes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userNotes: notes[id] ?? "" }),
    });
  }

  async function remove(id: string) {
    const response = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    if (response.ok) {
      setRecipes((current) => current.filter((recipe) => recipe.id !== id));
    }
  }

  function updateNote(id: string, event: ChangeEvent<HTMLTextAreaElement>) {
    setNotes((current) => ({ ...current, [id]: event.target.value }));
  }

  if (loading) {
    return <p className="muted">Загружаю рецепты...</p>;
  }

  return (
    <section className="saved-page">
      <div className="section-heading">
        <div>
          <h1>Сохраненные рецепты</h1>
          <p>Здесь хранится инструкция, модель и снимок инвентаря на момент генерации.</p>
        </div>
        <NotebookPen size={24} />
      </div>
      {recipes.length === 0 ? <p className="muted">Сохраненных рецептов пока нет.</p> : null}
      <div className="recipe-grid single">
        {recipes.map((saved) => (
          <article key={saved.id} className="recipe-card">
            <div className="recipe-card-head">
              <div>
                <h2>{saved.title}</h2>
                <p>{saved.description}</p>
                <small>
                  {new Date(saved.createdAt).toLocaleString("ru-RU")} · {saved.model}
                </small>
              </div>
              <button className="icon-action danger" type="button" title="Удалить" onClick={() => remove(saved.id)}>
                <Trash2 size={19} />
              </button>
            </div>
            <div className="recipe-columns">
              <div>
                <h3>Состав</h3>
                <ul>
                  {saved.recipe.ingredients.map((ingredient) => (
                    <li key={`${saved.id}-${ingredient.name}`}>
                      <span>{ingredient.name}</span>
                      <strong>{ingredient.amount}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Инструменты</h3>
                <ul>
                  {saved.recipe.tools.map((tool) => (
                    <li key={`${saved.id}-${tool.name}`}>
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
                {saved.recipe.steps.map((step) => (
                  <li key={`${saved.id}-${step}`}>{step}</li>
                ))}
              </ol>
            </div>
            <label>
              Заметки
              <textarea value={notes[saved.id] ?? ""} onChange={(event) => updateNote(saved.id, event)} rows={3} />
            </label>
            <button className="secondary-button" type="button" onClick={() => saveNotes(saved.id)}>
              <Save size={18} />
              Сохранить заметку
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
