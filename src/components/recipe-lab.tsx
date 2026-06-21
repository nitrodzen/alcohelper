"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  ListChecks,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Shuffle,
  Sparkles,
  XCircle,
} from "lucide-react";
import { clearRecipeGeneration, loadRecipeGeneration, saveRecipeGeneration } from "@/lib/generation-storage";
import type { GeneratedRecipe, InventoryItem, MakeabilityStatus, RecipeGeneration, RecipeLookupResult, SavedRecipe, SubstitutionOption } from "@/types/app";

type LabMode = "lookup" | "discover";

const makeabilityLabels: Record<MakeabilityStatus, string> = {
  AVAILABLE: "Можно сейчас",
  AVAILABLE_WITH_SUBSTITUTIONS: "Можно с малой заменой",
  NOT_RECOMMENDED: "Вкус сильно сместится",
  CANNOT_MAKE: "Собрать нельзя",
};

const makeabilityIcons: Record<MakeabilityStatus, typeof CheckCircle2> = {
  AVAILABLE: CheckCircle2,
  AVAILABLE_WITH_SUBSTITUTIONS: Shuffle,
  NOT_RECOMMENDED: AlertTriangle,
  CANNOT_MAKE: XCircle,
};

function recipeTitleKey(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function statusClass(status?: MakeabilityStatus) {
  return status ? status.toLowerCase() : "unknown";
}

function groupRecipes(recipes: GeneratedRecipe[]) {
  return {
    available: recipes.filter((recipe) => recipe.makeability === "AVAILABLE" || (!recipe.makeability && recipe.matchType !== "SUBSTITUTION")),
    substitutions: recipes.filter((recipe) => recipe.makeability === "AVAILABLE_WITH_SUBSTITUTIONS" || recipe.matchType === "SUBSTITUTION"),
    notRecommended: recipes.filter((recipe) => recipe.makeability === "NOT_RECOMMENDED"),
  };
}

function sourceStatusLabel(status?: RecipeLookupResult["sourceStatus"]) {
  if (status === "VERIFIED") {
    return "Источник проверен";
  }
  if (status === "UNVERIFIED") {
    return "Research-режим: рецепт найден, но источник не прошел строгую проверку";
  }
  return "Источник не найден";
}

function RecipeStatus({ status, impact }: { status?: MakeabilityStatus; impact?: GeneratedRecipe["tasteImpact"] }) {
  const resolved = status ?? "AVAILABLE";
  const Icon = makeabilityIcons[resolved];

  return (
    <div className={`makeability-chip ${statusClass(resolved)}`}>
      <Icon size={16} />
      <span>{makeabilityLabels[resolved]}</span>
      {impact?.level && impact.level !== "NONE" ? <small>{impact.summary}</small> : null}
    </div>
  );
}

function DetailList({ title, icon, items, empty }: { title: string; icon: ReactNode; items: string[]; empty: string }) {
  return (
    <div className="lookup-detail">
      <h3>
        {icon}
        {title}
      </h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={`${title}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function SubstitutionList({ substitutions }: { substitutions: SubstitutionOption[] }) {
  if (!substitutions.length) {
    return <p className="muted">Близких замен из текущего инвентаря нет.</p>;
  }

  return (
    <div className="substitution-list">
      {substitutions.map((substitution) => (
        <div key={`${substitution.original}-${substitution.substitute}`} className={`substitution-row ${substitution.recommended ? "recommended" : "risky"}`}>
          <strong>
            {substitution.original}
            {" -> "}
            {substitution.substitute}
          </strong>
          <span>{substitution.note ?? substitution.tasteImpact.summary}</span>
        </div>
      ))}
    </div>
  );
}

function RecipeCard({
  recipe,
  saved,
  onSave,
  saveLabel = "Сохранить",
}: {
  recipe: GeneratedRecipe;
  saved: boolean;
  onSave: () => void;
  saveLabel?: string;
}) {
  return (
    <article className="recipe-card">
      <div className="recipe-card-head">
        <div>
          <div className="title-row">
            <h2>{recipe.title}</h2>
            <RecipeStatus status={recipe.makeability} impact={recipe.tasteImpact} />
            {saved ? <span className="recipe-badge saved">У вас в рецептах</span> : null}
            {recipe.matchType === "SUBSTITUTION" ? <span className="recipe-badge substitution">С заменой</span> : null}
          </div>
          <p>{recipe.description}</p>
        </div>
        <button className="icon-action" type="button" title={saved ? "Уже сохранен" : saveLabel} onClick={onSave} disabled={saved}>
          {saved ? <Check size={19} /> : <Save size={19} />}
        </button>
      </div>
      <div className="recipe-columns">
        <div>
          <h3>Состав</h3>
          <ul>
            {recipe.ingredients.map((ingredient) => (
              <li key={`${recipe.title}-${ingredient.name}-${ingredient.amount}`}>
                <span>{ingredient.name}</span>
                <strong>{ingredient.amount}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Инструменты</h3>
          <ul>
            {recipe.tools.length ? (
              recipe.tools.map((tool) => (
                <li key={`${recipe.title}-${tool.name}`}>
                  <span>{tool.name}</span>
                  <strong>{tool.optional ? "опц." : "нужен"}</strong>
                </li>
              ))
            ) : (
              <li>
                <span>Без специнструмента</span>
                <strong>ок</strong>
              </li>
            )}
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
              <ExternalLink size={14} />
              {source.title ?? source.url}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function RecipeLab() {
  const [mode, setMode] = useState<LabMode>("lookup");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [generation, setGeneration] = useState<RecipeGeneration | null>(null);
  const [lookupResult, setLookupResult] = useState<RecipeLookupResult | null>(null);
  const [loadingMode, setLoadingMode] = useState<LabMode | null>(null);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<string>>(new Set());
  const [savedTitleKeys, setSavedTitleKeys] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [lookupPrompt, setLookupPrompt] = useState("коктейль черный русский");
  const [discoverPrompt, setDiscoverPrompt] = useState("");

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
      setDiscoverPrompt(restored.requestPrompt);
    }
    void loadInventory();
    void loadSavedRecipes();
  }, []);

  const inventoryStats = useMemo(
    () => ({
      total: inventory.length,
      alcohol: inventory.filter((item) => item.kind === "ALCOHOL").length,
      ingredients: inventory.filter((item) => item.kind === "INGREDIENT").length,
      tools: inventory.filter((item) => item.kind === "TOOL").length,
    }),
    [inventory],
  );
  const groupedRecipes = useMemo(() => groupRecipes(generation?.recipes ?? []), [generation]);
  const inventoryReady = inventory.some((item) => item.kind !== "TOOL");

  async function lookup() {
    setLoadingMode("lookup");
    setLookupResult(null);
    setMessage("Ищу страницу рецепта и сверяю с инвентарем.");

    const response = await fetch("/api/recipes/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: lookupPrompt }),
    });
    const data = await response.json();
    setLoadingMode(null);

    if (!response.ok && !data.recipe) {
      setMessage(data.error ?? "Не удалось найти рецепт.");
      return;
    }

    setLookupResult(data);
    setMessage(response.ok ? "" : data.error ?? "Источник не прошел проверку.");
  }

  async function generateDiscover() {
    setLoadingMode("discover");
    setGeneration(null);
    clearRecipeGeneration();
    setMessage("Ищу напитки, которые можно собрать сейчас или с малой заменой.");

    const response = await fetch("/api/recipes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: discoverPrompt, mode: "discover" }),
    });
    const data = await response.json();
    setLoadingMode(null);

    if (!response.ok) {
      setMessage(data.error ?? "Не удалось подобрать коктейли.");
      return;
    }

    const nextGeneration: RecipeGeneration = {
      mode: "discover",
      recipes: data.recipes ?? [],
      model: data.model,
      inventorySnapshot: data.inventorySnapshot ?? inventory,
      sources: data.sources ?? [],
      historyId: data.historyId,
      requestPrompt: data.requestPrompt ?? discoverPrompt,
      result: data.result,
    };

    setGeneration(nextGeneration);
    saveRecipeGeneration(nextGeneration);
    setInventory(nextGeneration.inventorySnapshot);
    setMessage(nextGeneration.recipes.length ? "" : "Сейчас не нашел подтвержденные варианты под текущий инвентарь.");
  }

  function resetCurrentMode() {
    setMessage("");
    if (mode === "lookup") {
      setLookupResult(null);
      setLookupPrompt("");
    } else {
      clearRecipeGeneration();
      setGeneration(null);
      setDiscoverPrompt("");
    }
    void loadInventory();
    void loadSavedRecipes();
  }

  async function save(recipe: GeneratedRecipe, context: RecipeGeneration | RecipeLookupResult | null) {
    if (!context || isSaved(recipe)) {
      return;
    }

    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipe,
        inventorySnapshot: context.inventorySnapshot,
        model: context.model,
        requestPrompt: context.requestPrompt,
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

  function renderLookupResult() {
    if (!lookupResult) {
      return null;
    }

    const missing = (lookupResult.missingIngredients ?? []).map((item) => `${item.name}${item.amount ? ` · ${item.amount}` : ""}`);
    const shopping = (lookupResult.shoppingList ?? []).map((item) => `${item.name}${item.amount ? ` · ${item.amount}` : ""}${item.note ? ` · ${item.note}` : ""}`);
    const adaptedRecipe = lookupResult.adaptedRecipe;
    const alternatives = lookupResult.alternatives ?? [];

    return (
      <div className="lookup-result">
        <div className={`lookup-summary ${statusClass(lookupResult.makeability)}`}>
          <RecipeStatus status={lookupResult.makeability} impact={lookupResult.tasteImpact} />
          <span>{sourceStatusLabel(lookupResult.sourceStatus)}</span>
        </div>
        <RecipeCard recipe={lookupResult.recipe} saved={isSaved(lookupResult.recipe)} onSave={() => save(lookupResult.recipe, lookupResult)} saveLabel="Сохранить оригинал" />
        <div className="lookup-grid">
          <DetailList title="Не хватает" icon={<AlertTriangle size={16} />} items={missing} empty="Оригинальный рецепт закрывается текущим инвентарем." />
          <DetailList title="Докупить" icon={<ShoppingCart size={16} />} items={shopping} empty="Список покупок пуст." />
          <div className="lookup-detail">
            <h3>
              <Shuffle size={16} />
              Замены из инвентаря
            </h3>
            <SubstitutionList substitutions={lookupResult.substitutionOptions} />
          </div>
        </div>
        {adaptedRecipe ? (
          <section className="result-section">
            <div className="section-heading compact">
              <h2>Адаптированная версия</h2>
            </div>
            <RecipeCard
              recipe={adaptedRecipe}
              saved={isSaved(adaptedRecipe)}
              onSave={() => save(adaptedRecipe, lookupResult)}
              saveLabel="Сохранить адаптацию"
            />
          </section>
        ) : null}
        {alternatives.length ? (
          <section className="result-section">
            <div className="section-heading compact">
              <h2>Похожие из инвентаря</h2>
              <span className="count-pill">{alternatives.length}</span>
            </div>
            <div className="recipe-grid">
              {alternatives.map((recipe) => (
                <RecipeCard key={`alternative-${recipe.title}`} recipe={recipe} saved={isSaved(recipe)} onSave={() => save(recipe, lookupResult)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderRecipeGroup(title: string, recipes: GeneratedRecipe[], empty?: string) {
    if (!recipes.length) {
      return empty ? (
        <section className="result-section">
          <div className="section-heading compact">
            <h2>{title}</h2>
          </div>
          <p className="muted">{empty}</p>
        </section>
      ) : null;
    }

    return (
      <section className="result-section">
        <div className="section-heading compact">
          <h2>{title}</h2>
          <span className="count-pill">{recipes.length}</span>
        </div>
        <div className="recipe-grid">
          {recipes.map((recipe) => (
            <RecipeCard key={`${title}-${recipe.title}`} recipe={recipe} saved={isSaved(recipe)} onSave={() => save(recipe, generation)} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="main-workspace">
      <section className="lab-topbar">
        <div>
          <h1>Барный подбор</h1>
          <p>Рецепт, инвентарь, нехватка и честные замены.</p>
        </div>
        <div className="status-strip compact-strip">
          <span>{inventoryStats.total} всего</span>
          <span>{inventoryStats.alcohol} алкоголь</span>
          <span>{inventoryStats.ingredients} ингредиенты</span>
          <span>{inventoryStats.tools} инструменты</span>
        </div>
      </section>

      <div className="mode-tabs" role="tablist" aria-label="Режим подбора">
        <button className={mode === "lookup" ? "mode-tab selected" : "mode-tab"} type="button" onClick={() => setMode("lookup")}>
          <Search size={18} />
          Найти рецепт
        </button>
        <button className={mode === "discover" ? "mode-tab selected" : "mode-tab"} type="button" onClick={() => setMode("discover")}>
          <ListChecks size={18} />
          Что можно собрать
        </button>
      </div>

      {mode === "lookup" ? (
        <section className="workflow-panel">
          <div className="prompt-row">
            <label>
              Название коктейля
              <input
                value={lookupPrompt}
                onChange={(event) => setLookupPrompt(event.target.value)}
                maxLength={1200}
                placeholder="Например: коктейль черный русский"
              />
            </label>
            <button className="primary-button large" type="button" onClick={lookup} disabled={loadingMode !== null || !lookupPrompt.trim()}>
              <Search size={19} />
              {loadingMode === "lookup" ? "Ищу..." : "Найти"}
            </button>
          </div>
          <div className="quick-prompts">
            {["коктейль черный русский", "джонни сильверхенд"].map((example) => (
              <button key={example} type="button" onClick={() => setLookupPrompt(example)}>
                {example}
              </button>
            ))}
          </div>
          {renderLookupResult()}
        </section>
      ) : (
        <section className="workflow-panel">
          <div className="prompt-row stacked">
            <label>
              Пожелание
              <textarea
                value={discoverPrompt}
                onChange={(event) => setDiscoverPrompt(event.target.value)}
                rows={3}
                maxLength={1200}
                placeholder="Например: шоты, не слишком сладкое, без сливок"
              />
            </label>
            <div className="prompt-actions compact-actions">
              <button className="primary-button large" type="button" onClick={generateDiscover} disabled={loadingMode !== null || !inventoryReady}>
                <Sparkles size={19} />
                {loadingMode === "discover" ? "Подбираю..." : "Подобрать"}
              </button>
              <button className="secondary-button large" type="button" onClick={resetCurrentMode} disabled={loadingMode !== null}>
                <RotateCcw size={18} />
                Очистить
              </button>
            </div>
          </div>
          {!inventoryReady ? (
            <div className="empty-state">
              <FlaskConical size={28} />
              <p>Добавьте хотя бы один алкоголь или ингредиент в инвентарь.</p>
            </div>
          ) : null}
          {generation ? (
            <>
              {renderRecipeGroup("Можно сейчас", groupedRecipes.available, "Точных совпадений пока нет.")}
              {renderRecipeGroup("Можно с малой заменой", groupedRecipes.substitutions)}
              {renderRecipeGroup("Не рекомендую из-за вкуса", groupedRecipes.notRecommended)}
            </>
          ) : null}
        </section>
      )}

      {message ? <div className={message.startsWith("Не удалось") || message.includes("не прошел") ? "form-error" : "form-note"}>{message}</div> : null}
    </div>
  );
}
