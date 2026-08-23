"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { ItemIcon, selectableIcons } from "@/components/icon";
import { errorMessage, requestJson } from "@/lib/client-api";
import type { InventoryItem, InventoryKind } from "@/types/app";

const units = ["мл", "л", "шт", "г", "кг", "капли", "кубики", "дольки", "ложки", "бутылка"] as const;

const kindLabels: Record<InventoryKind, string> = {
  ALCOHOL: "Алкоголь",
  INGREDIENT: "Ингредиент",
  TOOL: "Инструмент",
};

const emptyForm = {
  kind: "ALCOHOL" as InventoryKind,
  name: "",
  category: "",
  quantity: "",
  unit: "мл",
  abv: "",
  description: "",
  icon: "BottleWine",
  aliases: "",
  aiReviewed: false,
};

type InventoryForm = typeof emptyForm;

function toForm(item: InventoryItem): InventoryForm {
  return {
    kind: item.kind,
    name: item.name,
    category: item.category,
    quantity: item.quantity == null ? "" : String(item.quantity),
    unit: item.unit ?? "",
    abv: item.abv == null ? "" : String(item.abv),
    description: item.description,
    icon: item.icon,
    aliases: item.aliases.join(", "),
    aiReviewed: Boolean(item.aiReviewedAt),
  };
}

function toPayload(form: InventoryForm) {
  return {
    kind: form.kind,
    name: form.name,
    category: form.category || "custom",
    quantity: form.quantity === "" ? null : Number(form.quantity),
    unit: form.quantity === "" ? null : form.unit,
    abv: form.abv === "" ? null : Number(form.abv),
    description: form.description,
    icon: form.icon || "Package",
    aliases: form.aliases
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean),
    aiReviewed: form.aiReviewed,
  };
}

function defaultIcon(kind: InventoryKind) {
  if (kind === "ALCOHOL") return "BottleWine";
  if (kind === "TOOL") return "GlassWater";
  return "Package";
}

function defaultUnit(kind: InventoryKind) {
  if (kind === "ALCOHOL") return "мл";
  if (kind === "TOOL") return "шт";
  return "г";
}

function clearAIFields(form: InventoryForm): InventoryForm {
  return {
    ...form,
    category: "",
    abv: "",
    description: "",
    aliases: "",
    aiReviewed: false,
  };
}

export function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadItems() {
    try {
      const response = await requestJson<{ items?: InventoryItem[]; error?: string }>("/api/inventory", { cache: "no-store" }, 30_000);
      if (!response.ok) {
        setMessage(response.data.error ?? "Не удалось загрузить инвентарь.");
        return;
      }
      setItems(response.data.items ?? []);
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось загрузить инвентарь."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.kind] += 1;
        return acc;
      },
      { ALCOHOL: 0, INGREDIENT: 0, TOOL: 0 },
    );
  }, [items]);

  async function normalize() {
    if (!form.name.trim()) {
      setMessage("Введите название, чтобы AI понял контекст.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await requestJson<{ item?: Omit<InventoryItem, "id" | "aiReviewedAt">; aiReviewed?: boolean; error?: string }>("/api/inventory/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      if (!response.ok || !response.data.item) {
        setMessage(response.data.error ?? "Не удалось нормализовать предмет.");
        return;
      }
      setForm(toForm({ id: editingId ?? "draft", aiReviewedAt: response.data.aiReviewed ? new Date().toISOString() : null, ...response.data.item }));
      setMessage("Предложение применено. Его можно поправить перед сохранением.");
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось нормализовать предмет."));
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await requestJson<{ error?: string }>(editingId ? `/api/inventory/${editingId}` : "/api/inventory", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      }, 30_000);
      if (!response.ok) {
        setMessage(response.data.error ?? "Не удалось сохранить предмет.");
        return;
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadItems();
      setMessage("Инвентарь обновлен.");
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось сохранить предмет."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!window.confirm(`Удалить «${item?.name ?? "эту позицию"}» из инвентаря?`)) {
      return;
    }
    try {
      const response = await requestJson<{ error?: string }>(`/api/inventory/${id}`, { method: "DELETE" }, 30_000);
      if (response.ok) {
        setItems((current) => current.filter((candidate) => candidate.id !== id));
      } else {
        setMessage(response.data.error ?? "Не удалось удалить позицию.");
      }
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось удалить позицию."));
    }
  }

  async function addMany() {
    const names = quickInput.split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean);
    if (!names.length) {
      setMessage("Введите хотя бы одно название.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await requestJson<{ createdCount?: number; skippedCount?: number; error?: string }>("/api/inventory/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      }, 30_000);
      if (!response.ok) {
        setMessage(response.data.error ?? "Не удалось добавить список.");
        return;
      }
      setQuickInput("");
      await loadItems();
      setMessage(`Добавлено: ${response.data.createdCount ?? 0}${response.data.skippedCount ? `, уже были: ${response.data.skippedCount}` : ""}.`);
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось добавить список."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-grid">
      <section className="tool-panel">
        <div className="section-heading">
          <div>
            <h1>Инвентарь</h1>
            <p>Алкоголь, ингредиенты и инструменты, которые AI будет считать доступными.</p>
          </div>
          <div className="mini-stats">
            <span>{counts.ALCOHOL} алк.</span>
            <span>{counts.INGREDIENT} инг.</span>
            <span>{counts.TOOL} инстр.</span>
          </div>
        </div>
        <div className="quick-add-panel">
          <label>
            Добавить несколько позиций
            <textarea value={quickInput} onChange={(event) => setQuickInput(event.target.value)} rows={2} placeholder="Водка, джин, лайм, тоник" maxLength={1800} />
          </label>
          <button className="secondary-button" type="button" onClick={addMany} disabled={saving || !quickInput.trim()}>
            <Plus size={18} />
            Добавить список
          </button>
        </div>
        <form className="inventory-form" onSubmit={save}>
          <div className="kind-switch" aria-label="Тип предмета">
            {(Object.keys(kindLabels) as InventoryKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={form.kind === kind ? "kind-option selected" : "kind-option"}
                onClick={() =>
                  setForm((current) =>
                    clearAIFields({
                      ...current,
                      kind,
                      icon: defaultIcon(kind),
                      unit: defaultUnit(kind),
                    }),
                  )
                }
              >
                {kindLabels[kind]}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Название
              <input value={form.name} onChange={(event) => setForm(clearAIFields({ ...form, name: event.target.value }))} required maxLength={120} />
            </label>
            <label>
              Остаток, необязательно
              <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} type="number" min="0" step="0.01" placeholder="Не отслеживать" />
            </label>
            <label>
              Ед.
              <select value={form.unit || defaultUnit(form.kind)} onChange={(event) => setForm({ ...form, unit: event.target.value })} required={form.quantity !== ""} disabled={form.quantity === ""}>
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="optional-fields">
            <summary>Необязательно, может заполнить AI</summary>
            <div className="form-grid">
              <label>
                Категория
                <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, aiReviewed: false })} placeholder="AI заполнит сам" maxLength={80} />
              </label>
              <label>
                ABV %
                <input value={form.abv} onChange={(event) => setForm({ ...form, abv: event.target.value, aiReviewed: false })} type="number" min="0" max="96" step="0.1" disabled={form.kind !== "ALCOHOL"} />
              </label>
              <label>
                Алиасы через запятую
                <input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value, aiReviewed: false })} placeholder="lime, лайм, green lemon" />
              </label>
            </div>
            <label>
              Описание
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value, aiReviewed: false })} rows={4} maxLength={1200} />
            </label>
            <div className="icon-picker" aria-label="Выбор иконки">
              {selectableIcons.map((icon) => (
                <button key={icon} type="button" className={form.icon === icon ? "selected" : ""} title={icon} onClick={() => setForm({ ...form, icon, aiReviewed: false })}>
                  <ItemIcon name={icon} />
                </button>
              ))}
            </div>
          </details>
          {message ? <div className={message.startsWith("Не") || message.startsWith("Введите") ? "form-error" : "form-note"} aria-live="polite">{message}</div> : null}
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={normalize} disabled={saving}>
              <Sparkles size={18} />
              AI заполнить
            </button>
            {editingId ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                <X size={18} />
                Сбросить
              </button>
            ) : null}
            <button className="primary-button" type="submit" disabled={saving}>
              {editingId ? <Save size={18} /> : <Plus size={18} />}
              {saving ? "Сохраняю..." : editingId ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      </section>
      <section className="list-panel">
        <div className="section-heading compact">
          <h2>Предметы</h2>
          <Bot size={20} />
        </div>
        {loading ? <p className="muted">Загружаю...</p> : null}
        {!loading && items.length === 0 ? <p className="muted">Пока пусто. Добавьте пару бутылок, миксеры и хотя бы один инструмент.</p> : null}
        <div className="item-list">
          {items.map((item) => (
            <article key={item.id} className="item-card">
              <button
                className="item-main"
                type="button"
                onClick={() => {
                  setEditingId(item.id);
                  setForm(toForm(item));
                }}
              >
                <span className="item-icon">
                  <ItemIcon name={item.icon} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {kindLabels[item.kind]} · {item.category}
                    {item.quantity != null ? ` · ${item.quantity} ${item.unit ?? ""}` : ""}
                  </small>
                  <small className={item.aiReviewedAt ? "review-status ok" : "review-status"}>
                    {item.aiReviewedAt ? (
                      <>
                        <CheckCircle2 size={13} /> AI проверил
                      </>
                    ) : (
                      "AI заполнит при подборе"
                    )}
                  </small>
                </span>
              </button>
              <button className="icon-action danger" type="button" title="Удалить" onClick={() => remove(item.id)}>
                <Trash2 size={18} />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
