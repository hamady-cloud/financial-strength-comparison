import type { MetadataRoute } from "next";
import { dataGeneratedAt } from "./data";
import { siteUrl } from "./robots";

// 画面は1ルートで、表示の切り替えはクエリパラメータとクライアント側描画で行うため、
// サイトマップに載せるのは入口のURLだけにする。
// 更新日はデータ生成時刻に合わせ、年次更新がそのまま反映されるようにする。
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(dataGeneratedAt),
      changeFrequency: "yearly",
      priority: 1,
    },
  ];
}
