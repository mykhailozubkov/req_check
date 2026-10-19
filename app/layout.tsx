import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Storylens — проверка бизнес-требований",
  description: "Ревью и улучшение user stories с фокусом на бизнес-логике.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
