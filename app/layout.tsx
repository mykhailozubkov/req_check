import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Storylens — business requirements review",
  description: "Review and refine user stories with a focus on business logic.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
