import type { NextConfig } from "next";

// 年1回しか変わらないデータ。1時間はそのまま使い、以降1日は再検証しつつ即返す。
const fiscalDataCacheHeaders = [
  { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
];

// public/ 配下の画像はファイル名にハッシュが付かないため immutable にはしない。
// 差し替え時は最大1日で入れ替わり、その間もSWRで即座に返る。
const staticAssetCacheHeaders = [
  { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
];

// 外部リソースを一切読まない構成なので既定を 'self' に絞れる。
// Next.jsのハイドレーションがインラインscript/styleを使うため 'unsafe-inline' は許可する。
// 本命は frame-ancestors 'none'。公的データ風の画面を第三者がiframeで埋め込み、
// 誤解を招く文脈で見せるのを防ぐ。
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/official-data.json", headers: fiscalDataCacheHeaders },
      { source: "/prefectural-data.json", headers: fiscalDataCacheHeaders },
      { source: "/og.jpg", headers: staticAssetCacheHeaders },
      { source: "/fiscal-risk-guide.webp", headers: staticAssetCacheHeaders },
      { source: "/favicon.svg", headers: staticAssetCacheHeaders },
    ];
  },
};

export default nextConfig;
