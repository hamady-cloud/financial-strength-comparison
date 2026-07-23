import type { NextConfig } from "next";

const fiscalDataCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=3600, stale-while-revalidate=86400",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/official-data.json",
        headers: fiscalDataCacheHeaders,
      },
      {
        source: "/prefectural-data.json",
        headers: fiscalDataCacheHeaders,
      },
    ];
  },
};

export default nextConfig;
