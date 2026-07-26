import type { MetadataRoute } from "next";

export const siteUrl = "https://financial-strength-comparison.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
