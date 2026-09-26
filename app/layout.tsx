import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yorus Dash | Inteligência de mídia",
  description: "Painel de mídia para clientes autorizados da Yorus.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
