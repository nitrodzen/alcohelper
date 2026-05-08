"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { NotebookPen, RefreshCw, Save, Trash2 } from "lucide-react";
import type { AvailabilityStatus, SavedRecipe } from "@/types/app";

const availabilityLabels: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Доступен",
  AVAILABLE_WITH_SUBSTITUTIONS: "Есть замены",
  MISSING: "Не хватает",
};

export function SavedRecipes() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

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

  async function checkAvailability() {
    setChecking(true);
    setMessage("AI сверяет сохраненные рецепты с текущим инвентарем.");
    const response = await fetch("/api/recipes/check-availability", { method: "POST" });
    const data = await response.json();
    setChecking(false);

    if (!response.ok) {
      setMessage(data.error ?? "Не удалось проверить доступность.");
      return;
    }

    const loaded = data.recipes ?? [];
    setRecipes(loaded);
    setNotes(Object.fromEntries(loaded.map((recipe: SavedRecipe) => [recipe.id, recipe.userNotes ?? ""])));
    setMessage(`Проверено рецептов: ${data.checkedCount ?? loaded.length}.`);
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
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={checkAvailability} disabled={checking || recipes.length === 0}>
            <RefreshCw size={18} />
            {checking ? "Проверяю..." : "Проверить доступность"}
          </button>
          <NotebookPen size={24} />
        </div>
      </div>
      {message ? <div className={message.startsWith("Не удалось") ? "form-error" : "form-note"}>{message}</div> : null}
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
                {saved.requestPrompt ? <p className="request-prompt">Запрос: {saved.requestPrompt}</p> : null}
              </div>
              <button className="icon-action danger" type="button" title="Удалить" onClick={() => remove(saved.id)}>
                <Trash2 size={19} />
              </button>
            </div>
            {saved.availabilityStatus ? (
              <div className={`availability-panel ${saved.availabilityStatus.toLowerCase()}`}>
                <div className="availability-head">
                  <strong>{availabilityLabels[saved.availabilityStatus]}</strong>
                  {saved.availabilityCheckedAt ? <span>{new Date(saved.availabilityCheckedAt).toLocaleString("ru-RU")}</span> : null}
                </div>
                {saved.availabilityComment ? <p>{saved.availabilityComment}</p> : null}
                {saved.availabilityDetails?.substitutions.length ? (
                  <div className="mini-list">
                    <h3>Замены</h3>
                    {saved.availabilityDetails.substitutions.map((substitution) => (
                      <span key={`${saved.id}-${substitution.original}-${substitution.substitute}`}>
                        {substitution.original}
                        {" -> "}
                        {substitution.substitute}
                        {substitution.note ? `: ${substitution.note}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
                {saved.availabilityDetails?.missingIngredients.length ? (
                  <div className="mini-list">
                    <h3>Не хватает</h3>
                    {saved.availabilityDetails.missingIngredients.map((item) => (
                      <span key={`${saved.id}-${item}`}>{item}</span>
                    ))}
                  </div>
                ) : null}
                {saved.availabilityDetails?.warnings.length ? <p className="warning-line">{saved.availabilityDetails.warnings.join(" ")}</p> : null}
              </div>
            ) : (
              <div className="availability-panel unchecked">
                <div className="availability-head">
                  <strong>Еще не проверялся</strong>
                </div>
                <p>Нажмите "Проверить доступность", чтобы сверить рецепт с текущим инвентарем.</p>
              </div>
            )}
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
            {saved.recipe.sources?.length ? (
              <div className="source-list">
                <h3>Источники</h3>
                {saved.recipe.sources.slice(0, 5).map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                    {source.title ?? source.url}
                  </a>
                ))}
              </div>
            ) : null}
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
