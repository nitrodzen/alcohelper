"use client";

import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, Mail, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { errorMessage, requestJson } from "@/lib/client-api";

type AllowlistEntry = {
  id: string;
  email: string;
  createdByEmail: string;
  createdAt: string;
  registered: boolean;
};

type AllowlistResponse = {
  entries?: AllowlistEntry[];
  entry?: AllowlistEntry;
  alreadyAllowed?: boolean;
  error?: string;
};

function sortEntries(entries: AllowlistEntry[]) {
  return [...entries].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function AllowlistManager() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  async function loadEntries() {
    setLoading(true);
    setFailure("");
    try {
      const response = await requestJson<AllowlistResponse>("/api/admin/allowlist", { cache: "no-store" }, 30_000);
      if (!response.ok) {
        setFailure(response.data.error ?? "Не удалось загрузить allowlist.");
        return;
      }
      setEntries(response.data.entries ?? []);
    } catch (error) {
      setFailure(errorMessage(error, "Не удалось загрузить allowlist."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFailure("");
    setNotice("");

    try {
      const response = await requestJson<AllowlistResponse>(
        "/api/admin/allowlist",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
        30_000,
      );
      if (!response.ok || !response.data.entry) {
        setFailure(response.data.error ?? "Не удалось добавить email.");
        return;
      }

      setEntries((current) =>
        sortEntries([
          response.data.entry!,
          ...current.filter((entry) => entry.id !== response.data.entry!.id),
        ]),
      );
      setEmail("");
      setNotice(response.data.alreadyAllowed ? "Этот email уже был в allowlist." : "Email добавлен в allowlist.");
    } catch (error) {
      setFailure(errorMessage(error, "Не удалось добавить email."));
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entry: AllowlistEntry) {
    if (!window.confirm(`Убрать ${entry.email} из allowlist?`)) {
      return;
    }

    setDeletingId(entry.id);
    setFailure("");
    setNotice("");
    try {
      const response = await requestJson<{ error?: string }>(
        `/api/admin/allowlist/${entry.id}`,
        { method: "DELETE" },
        30_000,
      );
      if (!response.ok) {
        setFailure(response.data.error ?? "Не удалось удалить email.");
        return;
      }
      setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
      setNotice("Email удален из allowlist.");
    } catch (error) {
      setFailure(errorMessage(error, "Не удалось удалить email."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-heading">
        <span className="admin-heading-icon" aria-hidden="true">
          <ShieldCheck size={24} />
        </span>
        <div>
          <span className="admin-eyebrow">Доступ к порталу</span>
          <h1>Allowlist регистрации</h1>
          <p>Адреса, которым разрешено создать новый аккаунт.</p>
        </div>
      </div>

      <div className="admin-content">
        <form className="allowlist-form" onSubmit={addEntry}>
          <label htmlFor="allowlist-email">
            Email для приглашения
            <input
              id="allowlist-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="friend@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={180}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={saving || !email.trim()}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <UserPlus size={18} />}
            {saving ? "Добавляю..." : "Добавить"}
          </button>
          {failure ? <div className="form-error" role="alert">{failure}</div> : null}
          {notice ? <div className="form-note" role="status">{notice}</div> : null}
        </form>

        <section className="allowlist-section" aria-labelledby="allowlist-list-title">
          <div className="allowlist-list-heading">
            <div>
              <h2 id="allowlist-list-title">Приглашенные</h2>
              <p>{entries.length} {entries.length === 1 ? "адрес" : "адресов"}</p>
            </div>
          </div>

          {loading ? (
            <div className="allowlist-loading">
              <LoaderCircle className="spin" size={19} />
              Загружаю...
            </div>
          ) : entries.length === 0 ? (
            <div className="empty-state">Добавленных адресов пока нет.</div>
          ) : (
            <div className="allowlist-list">
              {entries.map((entry) => (
                <div className="allowlist-row" key={entry.id}>
                  <span className="allowlist-mail-icon" aria-hidden="true">
                    <Mail size={18} />
                  </span>
                  <div className="allowlist-entry-copy">
                    <strong>{entry.email}</strong>
                    <span>
                      {entry.registered ? "Аккаунт создан" : "Ожидает регистрации"}
                      {" · "}
                      {new Date(entry.createdAt).toLocaleString("ru-RU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <button
                    className="icon-action danger"
                    type="button"
                    title="Удалить из allowlist"
                    aria-label={`Удалить ${entry.email} из allowlist`}
                    onClick={() => void removeEntry(entry)}
                    disabled={deletingId === entry.id}
                  >
                    {deletingId === entry.id ? <LoaderCircle className="spin" size={18} /> : <Trash2 size={18} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
