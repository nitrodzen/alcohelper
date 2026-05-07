import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alco Helper",
  description: "Закрытый помощник для домашнего бара",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <AppHeader />
          <main className="page-shell">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
