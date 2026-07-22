import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Fiscal Lens｜市町村財政ダッシュボード";
const description = "類似団体との比較から、市町村財政の現在地と、財政悪化が暮らしに及ぼす影響を読み解く分析ダッシュボード。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "fiscal-lens-wakayama.yuyuiloveyou6.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, type: "website", images: [{ url: imageUrl, width: 1730, height: 909, alt: "Fiscal Lens 財政が悪いと、どうなる？" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

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
