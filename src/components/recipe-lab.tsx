"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  FlaskConical,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Shuffle,
  Sparkles,
  XCircle,
} from "lucide-react";
import { errorMessage, requestJson } from "@/lib/client-api";
import { clearRecipeGeneration, loadRecipeGeneration, saveRecipeGeneration } from "@/lib/generation-storage";
import type { GeneratedRecipe, InventoryItem, MakeabilityStatus, RecipeGeneration, RecipeLookupResult, SavedRecipe, SubstitutionOption } from "@/types/app";

type LabMode = "lookup" | "discover";

const makeabilityLabels: Record<MakeabilityStatus, string> = {
  AVAILABLE: "Можно сейчас",
  AVAILABLE_WITH_SUBSTITUTIONS: "Можно с заменой",
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
    substitutions: recipes.filter((recipe) => recipe.makeability === "AVAILABLE_WITH_SUBSTITUTIONS" || (!recipe.makeability && recipe.matchType === "SUBSTITUTION")),
    notRecommended: recipes.filter((recipe) => recipe.makeability === "NOT_RECOMMENDED"),
  };
}

function sourceStatusLabel(status?: RecipeLookupResult["sourceStatus"]) {
  if (status === "VERIFIED") {
    return "Источник проверен";
  }
  if (status === "UNVERIFIED") {
    return "Источник найден, но не прошел строгую проверку";
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
  compact = false,
}: {
  recipe: GeneratedRecipe;
  saved: boolean;
  onSave: () => void;
  saveLabel?: string;
  compact?: boolean;
}) {
  const missingByName = new Map((recipe.missingIngredients ?? []).map((item) => [recipeTitleKey(item.name), item]));
  const substitutionsByName = new Map(
    (recipe.substitutionOptions ?? []).flatMap((item) => [
      [recipeTitleKey(item.original), item] as const,
      [recipeTitleKey(item.substitute), item] as const,
    ]),
  );

  return (
    <article className={compact ? "recipe-card compact" : "recipe-card"}>
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
        <button className="icon-action" type="button" title={saved ? "Уже сохранен" : saveLabel} aria-label={saved ? "Уже сохранен" : saveLabel} onClick={onSave} disabled={saved}>
          {saved ? <Check size={19} /> : <Save size={19} />}
        </button>
      </div>
      <div className="recipe-ingredients">
        <h3>Состав</h3>
        <ul>
          {recipe.ingredients.map((ingredient) => {
            const key = recipeTitleKey(ingredient.name);
            const missing = missingByName.get(key);
            const substitution = substitutionsByName.get(key);
            const state = substitution ? "substitution" : missing ? "missing" : "available";
            const StateIcon = substitution ? Shuffle : missing ? AlertTriangle : CheckCircle2;
            return (
              <li key={`${recipe.title}-${ingredient.name}-${ingredient.amount}`} className={`ingredient-row ${state}`}>
                <span className="ingredient-name">
                  <StateIcon size={15} />
                  <span>
                    {ingredient.name}
                    {missing?.reason === "INSUFFICIENT" ? <small>Есть {missing.availableAmount ?? "меньше нужного"}</small> : null}
                  </span>
                </span>
                <strong>{ingredient.amount}</strong>
              </li>
            );
          })}
        </ul>
      </div>
      <details className="recipe-method" open={compact ? undefined : true}>
        <summary>
          Приготовление и инструменты
          <ChevronDown size={18} />
        </summary>
        <div className="recipe-method-body">
          <div className="recipe-tools">
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
          <div className="steps">
            <h3>Шаги</h3>
            <ol>
              {recipe.steps.map((step) => (
                <li key={`${recipe.title}-${step}`}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </details>
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
    try {
      const response = await requestJson<{ items?: InventoryItem[] }>("/api/inventory", { cache: "no-store" }, 30_000);
      if (response.ok) {
        setInventory(response.data.items ?? []);
      }
    } catch {
      setMessage("Не удалось обновить инвентарь. Перезагрузите страницу.");
    }
  }

  async function loadSavedRecipes() {
    try {
      const response = await requestJson<{ recipes?: SavedRecipe[] }>("/api/recipes", { cache: "no-store" }, 30_000);
      const loaded = response.ok ? response.data.recipes ?? [] : [];
      setSavedRecipeIds(new Set(loaded.map((recipe) => recipe.id)));
      setSavedTitleKeys(new Set(loaded.map((recipe) => recipeTitleKey(recipe.title))));
    } catch {
      setMessage("Не удалось обновить сохраненные рецепты.");
    }
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

  async function runLookup(prompt: string, options: { switchMode?: boolean; loading?: boolean } = {}) {
    if (options.switchMode) {
      setMode("lookup");
    }
    if (options.loading ?? true) {
      setLoadingMode("lookup");
    }
    setLookupResult(null);
    setMessage("Ищу страницу рецепта и сверяю с инвентарем.");

    try {
      const response = await requestJson<Partial<RecipeLookupResult> & { error?: string }>("/api/recipes/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok && !response.data.recipe) {
        setMessage(response.data.error ?? "Не удалось найти рецепт.");
        return null;
      }
      const data = response.data as RecipeLookupResult;
      setLookupResult(data);
      setMessage(response.ok && !data.error ? "" : data.error ?? "Показываю результат с ограниченной проверкой источника.");
      return data;
    } catch (error) {
      setMessage(errorMessage(error, "Поиск прервался. Попробуйте еще раз."));
      return null;
    } finally {
      if (options.loading ?? true) {
        setLoadingMode(null);
      }
    }
  }

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    await runLookup(lookupPrompt);
  }

  async function generateDiscover(event?: FormEvent) {
    event?.preventDefault();
    setLoadingMode("discover");
    setGeneration(null);
    clearRecipeGeneration();
    setMessage("Ищу напитки, которые можно собрать сейчас или с малой заменой.");

    if (!inventoryReady && discoverPrompt.trim()) {
      setMessage("Инвентарь пока пуст. Показываю разбор конкретного запроса.");
      await runLookup(discoverPrompt, { loading: false });
      setLoadingMode(null);
      return;
    }
    if (!inventoryReady) {
      setMessage("Добавьте хотя бы один напиток или ингредиент в инвентарь.");
      setLoadingMode(null);
      return;
    }

    try {
      const response = await requestJson<Partial<RecipeGeneration> & { error?: string }>("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: discoverPrompt, mode: "discover" }),
      });
      const data = response.data;
      if (!response.ok) {
        if (discoverPrompt.trim()) {
          setMessage("Готовых вариантов из инвентаря не нашел. Показываю разбор запроса.");
          await runLookup(discoverPrompt, { loading: false });
        } else {
          setMessage(data.error ?? "Не удалось подобрать коктейли.");
        }
        return;
      }

      const nextGeneration: RecipeGeneration = {
        mode: "discover",
        recipes: data.recipes ?? [],
        model: data.model ?? "unknown",
        inventorySnapshot: data.inventorySnapshot ?? inventory,
        sources: data.sources ?? [],
        historyId: data.historyId ?? "",
        requestPrompt: data.requestPrompt ?? discoverPrompt,
        result: data.result,
      };
      setGeneration(nextGeneration);
      saveRecipeGeneration(nextGeneration);
      setInventory(nextGeneration.inventorySnapshot);
      if (nextGeneration.recipes.length === 0 && discoverPrompt.trim()) {
        setMessage("Готовых вариантов нет. Показываю разбор запроса.");
        await runLookup(discoverPrompt, { loading: false });
      } else {
        setMessage(nextGeneration.recipes.length ? "" : "Подтвержденных вариантов под текущий инвентарь пока нет.");
      }
    } catch (error) {
      setMessage(errorMessage(error, "Подбор прервался. Попробуйте еще раз."));
    } finally {
      setLoadingMode(null);
    }
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

    try {
      const response = await requestJson<{ recipe?: { id: string }; error?: string }>("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe,
          inventorySnapshot: context.inventorySnapshot,
          model: context.model,
          requestPrompt: context.requestPrompt,
        }),
      }, 30_000);
      if (!response.ok || !response.data.recipe) {
        setMessage(response.data.error ?? "Не удалось сохранить рецепт.");
        return;
      }
      setSavedRecipeIds((current) => new Set([...current, response.data.recipe!.id]));
      setSavedTitleKeys((current) => new Set([...current, recipeTitleKey(recipe.title)]));
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось сохранить рецепт."));
    }
  }

  function isSaved(recipe: GeneratedRecipe) {
    return Boolean((recipe.savedRecipeId && savedRecipeIds.has(recipe.savedRecipeId)) || savedTitleKeys.has(recipeTitleKey(recipe.title)));
  }

  function renderLookupResult() {
    if (!lookupResult) {
      return null;
    }

    const missing = (lookupResult.missingIngredients ?? []).map((item) => `${item.name}${item.amount ? ` · нужно ${item.amount}` : ""}${item.reason === "INSUFFICIENT" ? ` · есть ${item.availableAmount ?? "меньше"}` : ""}`);
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
                <RecipeCard key={`alternative-${recipe.title}`} recipe={recipe} saved={isSaved(recipe)} onSave={() => save(recipe, lookupResult)} compact />
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
            <RecipeCard key={`${title}-${recipe.title}`} recipe={recipe} saved={isSaved(recipe)} onSave={() => save(recipe, generation)} compact />
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
        <button className={mode === "lookup" ? "mode-tab selected" : "mode-tab"} type="button" role="tab" aria-selected={mode === "lookup"} onClick={() => setMode("lookup")}>
          <Search size={18} />
          Найти рецепт
        </button>
        <button className={mode === "discover" ? "mode-tab selected" : "mode-tab"} type="button" role="tab" aria-selected={mode === "discover"} onClick={() => setMode("discover")}>
          <ListChecks size={18} />
          Что можно собрать
        </button>
      </div>

      {mode === "lookup" ? (
        <section className="workflow-panel">
          <form className="prompt-row" onSubmit={lookup}>
            <label>
              Название коктейля
              <input
                value={lookupPrompt}
                onChange={(event) => setLookupPrompt(event.target.value)}
                maxLength={1200}
                placeholder="Например: коктейль черный русский"
              />
            </label>
            <button className="primary-button large" type="submit" disabled={loadingMode !== null || !lookupPrompt.trim()}>
              <Search size={19} />
              {loadingMode === "lookup" ? "Ищу..." : "Найти"}
            </button>
          </form>
          <div className="quick-prompts">
            {["коктейль черный русский", "джонни сильверхенд"].map((example) => (
              <button key={example} type="button" onClick={() => { setLookupPrompt(example); void runLookup(example); }} disabled={loadingMode !== null}>
                {example}
              </button>
            ))}
          </div>
          {renderLookupResult()}
        </section>
      ) : (
        <section className="workflow-panel">
          <form className="prompt-row stacked" onSubmit={generateDiscover}>
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
              <button className="primary-button large" type="submit" disabled={loadingMode !== null || (!inventoryReady && !discoverPrompt.trim())}>
                <Sparkles size={19} />
                {loadingMode === "discover" ? "Подбираю..." : inventoryReady ? "Подобрать" : "Исследовать"}
              </button>
              <button className="secondary-button large" type="button" onClick={resetCurrentMode} disabled={loadingMode !== null}>
                <RotateCcw size={18} />
                Очистить
              </button>
            </div>
          </form>
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
          {lookupResult ? (
            <section className="result-section">
              <div className="section-heading compact">
                <h2>Разбор запроса</h2>
              </div>
              {renderLookupResult()}
            </section>
          ) : null}
        </section>
      )}

      {message ? (
        <div className={message.startsWith("Не удалось") || message.includes("прервался") || message.includes("не прошел") ? "form-error" : "form-note"} aria-live="polite">
          {loadingMode ? <LoaderCircle className="spin" size={18} /> : null}
          {message}
        </div>
      ) : null}
    </div>
  );
}
