"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { BookMarked, Boxes, LogOut, Martini, Sparkles } from "lucide-react";

const nav = [
  { href: "/", label: "Подбор", icon: Sparkles },
  { href: "/inventory", label: "Инвентарь", icon: Boxes },
  { href: "/saved", label: "Рецепты", icon: BookMarked },
];

export function AppHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();

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
                <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <button className="icon-action" type="button" title="Выйти" onClick={() => signOut({ callbackUrl: "/auth/signin" })}>
            <LogOut size={19} />
          </button>
        </>
      ) : null}
    </header>
  );
}
