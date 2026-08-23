"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LockKeyhole, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { errorMessage, requestJson } from "@/lib/client-api";

type Mode = "signin" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      if (mode === "register") {
        const response = await requestJson<{ error?: string }>("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(form.get("name") ?? ""),
            email,
            password,
            ageConfirmed: form.get("ageConfirmed") === "on",
          }),
        }, 30_000);

        if (!response.ok) {
          setError(response.data.error ?? "Не удалось создать аккаунт.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (result?.error) {
        setError("Неверный email или пароль.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch (error) {
      setError(errorMessage(error, "Сервис временно недоступен. Попробуйте еще раз."));
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <section className="auth-shell">
      <div className="auth-panel">
        <div className="auth-icon">
          {isRegister ? <ShieldCheck size={24} /> : <LockKeyhole size={24} />}
        </div>
        <h1>{isRegister ? "Создать доступ" : "Войти в портал"}</h1>
        <p>{isRegister ? "Регистрация доступна только для приглашенных email." : "Закрытый помощник для домашнего бара."}</p>
        <form className="stack-form" onSubmit={onSubmit}>
          {isRegister ? (
            <label>
              Имя
              <input name="name" autoComplete="name" minLength={2} maxLength={80} />
            </label>
          ) : null}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Пароль
            <input name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} required />
          </label>
          {isRegister ? (
            <label className="check-row">
              <input name="ageConfirmed" type="checkbox" required />
              <span>Подтверждаю, что мне разрешено пользоваться алкогольным сервисом.</span>
            </label>
          ) : null}
          {error ? <div className="form-error" role="alert" aria-live="polite">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
            {loading ? "Подождите..." : isRegister ? "Зарегистрироваться" : "Войти"}
          </button>
        </form>
        <div className="auth-switch">
          {isRegister ? (
            <Link href="/auth/signin">Уже есть аккаунт</Link>
          ) : (
            <Link href="/auth/register">Регистрация по приглашению</Link>
          )}
        </div>
      </div>
    </section>
  );
}
