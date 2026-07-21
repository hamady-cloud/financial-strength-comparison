import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fiscal Lens｜市町村財政ダッシュボード",
  description: "類似団体との比較から、市町村財政の現在地と苦しさの主因を読み解く分析ダッシュボード。",
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
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
