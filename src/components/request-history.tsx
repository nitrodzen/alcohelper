"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, ExternalLink, RotateCcw } from "lucide-react";
import { saveRecipeGeneration } from "@/lib/generation-storage";
import type { RecipeLookupResult, RecipeRequestHistory } from "@/types/app";

export function RequestHistory() {
  const router = useRouter();
  const [requests, setRequests] = useState<RecipeRequestHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/requests", { cache: "no-store" });
      const data = await response.json();
      setRequests(data.requests ?? []);
      setLoading(false);
    }

    void load();
  }, []);

  function restoreToMain(request: RecipeRequestHistory) {
    if (request.mode === "lookup" || !request.recipes?.length) {
      return;
    }

    saveRecipeGeneration({
      recipes: request.recipes,
      inventorySnapshot: request.inventorySnapshot,
      sources: request.sources ?? [],
      model: request.model,
      historyId: request.id,
      requestPrompt: request.prompt,
    });
    router.push("/");
  }

  function lookupResult(request: RecipeRequestHistory): RecipeLookupResult | null {
    if (request.mode !== "lookup" || !request.result || typeof request.result !== "object") {
      return null;
    }
    const result = request.result as Partial<RecipeLookupResult>;
    return result.recipe && result.mode === "lookup" ? (result as RecipeLookupResult) : null;
  }

  if (loading) {
    return <p className="muted">Загружаю историю...</p>;
  }

  return (
    <section className="saved-page">
      <div className="section-heading">
        <div>
          <h1>История запросов</h1>
          <p>Каждый подбор сохраняет комментарий, снимок инвентаря, результат, источники и ошибку, если она была.</p>
        </div>
        <Clock3 size={24} />
      </div>
      {requests.length === 0 ? <p className="muted">История пока пустая.</p> : null}
      <div className="recipe-grid single">
        {requests.map((request) => (
          <article key={request.id} className="recipe-card">
            <div className="recipe-card-head">
              <div>
                <h2>{request.prompt || "Подбор без комментария"}</h2>
                <small>
                  {new Date(request.createdAt).toLocaleString("ru-RU")} · {request.mode === "lookup" ? "поиск рецепта" : "что можно собрать"} · {request.model} ·{" "}
                  {request.status === "SUCCESS" ? "успешно" : "ошибка"}
                </small>
              </div>
              {request.mode !== "lookup" && request.recipes?.length ? (
                <button className="secondary-button" type="button" onClick={() => restoreToMain(request)}>
                  <RotateCcw size={18} />
                  На главную
                </button>
              ) : null}
            </div>
            {request.error ? <p className="warning-line">{request.error}</p> : null}
            {lookupResult(request) ? (
              <div className="history-recipes">
                <h3>Проверка рецепта</h3>
                <div className="history-recipe-row">
                  <strong>{lookupResult(request)?.recipe.title}</strong>
                  <span>{lookupResult(request)?.recipe.description}</span>
                  <span>{lookupResult(request)?.makeability ? `Статус: ${lookupResult(request)?.makeability}` : ""}</span>
                </div>
              </div>
            ) : null}
            {request.recipes?.length ? (
              <div className="history-recipes">
                <h3>{request.mode === "lookup" ? "Версии" : "Найдено"}</h3>
                {request.recipes.map((recipe) => (
                  <div key={`${request.id}-${recipe.title}`} className="history-recipe-row">
                    <strong>{recipe.title}</strong>
                    <span>{recipe.description}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {request.sources?.length ? (
              <div className="source-list">
                <h3>Источники</h3>
                {request.sources.slice(0, 5).map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    {source.title ?? source.url}
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
