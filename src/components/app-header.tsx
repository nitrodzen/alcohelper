"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { BookMarked, Boxes, Clock3, LogOut, Martini, ShieldCheck, Sparkles } from "lucide-react";
import { isPortalAdminEmail } from "@/lib/admin-config";

const nav = [
  { href: "/", label: "Подбор", icon: Sparkles },
  { href: "/inventory", label: "Инвентарь", icon: Boxes },
  { href: "/saved", label: "Рецепты", icon: BookMarked },
  { href: "/history", label: "История", icon: Clock3 },
];

export function AppHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = isPortalAdminEmail(session?.user?.email);

  return (
    <header className="app-header">
      <Link href="/" className="brand" aria-label="Alco Helper">
        <span className="brand-mark">
          <Martini size={21} strokeWidth={1.9} />
        </span>
        <span>Alco Helper</span>
      </Link>
      {session?.user ? (
        <>
          <nav className="main-nav" aria-label="Основная навигация">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="header-actions">
            {isAdmin ? (
              <Link
                href="/admin/allowlist"
                className={pathname === "/admin/allowlist" ? "icon-action active" : "icon-action"}
                title="Управление доступом"
                aria-label="Управление доступом"
                aria-current={pathname === "/admin/allowlist" ? "page" : undefined}
              >
                <ShieldCheck size={19} />
              </Link>
            ) : null}
            <button className="icon-action" type="button" title="Выйти" aria-label="Выйти" onClick={() => signOut({ callbackUrl: "/auth/signin" })}>
              <LogOut size={19} />
            </button>
          </div>
        </>
      ) : null}
    </header>
  );
}
