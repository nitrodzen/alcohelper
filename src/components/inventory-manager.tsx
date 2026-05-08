"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { ItemIcon, selectableIcons } from "@/components/icon";
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
  quantity: "1",
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadItems() {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const data = await response.json();
    setItems(data.items ?? []);
    setLoading(false);
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

    const response = await fetch("/api/inventory/normalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form)),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setMessage(data.error ?? "Не удалось нормализовать предмет.");
      return;
    }

    setForm(toForm({ id: editingId ?? "draft", aiReviewedAt: data.aiReviewed ? new Date().toISOString() : null, ...data.item }));
    setMessage("Предложение применено. Его можно поправить перед сохранением.");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const response = await fetch(editingId ? `/api/inventory/${editingId}` : "/api/inventory", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form)),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setMessage(data.error ?? "Не удалось сохранить предмет.");
      return;
    }

    setForm(emptyForm);
    setEditingId(null);
    await loadItems();
    setMessage("Инвентарь обновлен.");
  }

  async function remove(id: string) {
    const response = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== id));
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
              Количество
              <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} type="number" min="0" step="0.01" required />
            </label>
            <label>
              Ед.
              <select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} required>
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="icon-picker" aria-label="Выбор иконки">
            {selectableIcons.map((icon) => (
              <button key={icon} type="button" className={form.icon === icon ? "selected" : ""} title={icon} onClick={() => setForm({ ...form, icon, aiReviewed: false })}>
                <ItemIcon name={icon} />
              </button>
            ))}
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
          </details>
          {message ? <div className="form-note">{message}</div> : null}
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
