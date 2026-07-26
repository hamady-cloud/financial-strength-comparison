import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// 本番と同じ next build の成果物を next start で立ち上げて検証する。
// 以前は Cloudflare Worker のビルド結果を読んでいたが、Vercelへデプロイされるのは
// next build の出力なので、出荷物そのものを対象にする。
const port = 3100 + (process.pid % 500);
const origin = `http://127.0.0.1:${port}`;
let server;

before(async () => {
  // パスに非ASCIIを含むと URL.pathname はパーセントエンコードされたままになる
  const root = fileURLToPath(new URL("..", import.meta.url));
  const bin = fileURLToPath(new URL("../node_modules/.bin/next", import.meta.url));
  server = spawn(bin, ["start", "-p", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const failed = new Promise((_, reject) => {
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`next start が終了しました (code ${code})`)));
  });
  const ready = (async () => {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      try {
        if ((await fetch(origin, { headers: { accept: "text/html" } })).ok) return;
      } catch { /* 起動待ち */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`${origin} が30秒以内に応答しませんでした`);
  })();
  await Promise.race([ready, failed]);
});

after(() => {
  server?.kill("SIGTERM");
});

test("renders the fiscal dashboard shell", async () => {
  const response = await fetch(origin, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Fiscal Lens/);
  assert.match(html, /全国ランキング/);
  assert.match(html, /公式データを読み込んでいます/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("serves fiscal data and static assets with the intended cache policy", async () => {
  for (const path of ["/official-data.json", "/prefectural-data.json"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `${path} が配信されていません`);
    const cacheControl = response.headers.get("cache-control") ?? "";
    assert.match(cacheControl, /max-age=3600/, `${path} のキャッシュ設定`);
    assert.match(cacheControl, /stale-while-revalidate=86400/, `${path} のSWR設定`);
  }
  for (const path of ["/og.jpg", "/fiscal-risk-guide.webp"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `${path} が配信されていません`);
    assert.match(response.headers.get("cache-control") ?? "", /max-age=86400/, `${path} は長期キャッシュにする`);
  }
});

test("sets baseline security headers", async () => {
  const response = await fetch(origin, { headers: { accept: "text/html" } });
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("referrer-policy") ?? "", /strict-origin/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("permissions-policy") ?? "", /geolocation=\(\)/);
});

test("keeps data and methodology labels explicit", async () => {
  const [dashboard, styles, data, officialData, prefecturalData, generator, nextConfig] = await Promise.all([
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/data.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/official-data.json", import.meta.url), "utf8"),
    readFile(new URL("../public/prefectural-data.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-official-data.mjs", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /出典・注意/);
  assert.match(dashboard, /正確な値は必ず公表元/);
  assert.match(dashboard, /CSVを出力/);
  assert.match(dashboard, /escapeCsvCell/);
  assert.match(dashboard, /コピーしました/);
  assert.match(dashboard, /official-data\.json\?v=/);
  assert.match(dashboard, /prefectural-data\.json\?v=/);
  assert.match(dashboard, /市町村版/);
  assert.match(dashboard, /都道府県版/);
  assert.match(dashboard, /aria-pressed=\{scope === "prefecture"\}/);
  assert.match(dashboard, /平均との差は非表示/);
  assert.match(dashboard, /やさしい指標解説/);
  assert.match(dashboard, /地域の大きな家計簿/);
  assert.match(dashboard, /読み間違いに注意/);
  assert.match(dashboard, /const normalizedSearch = search\.trim\(\)/);
  assert.match(dashboard, /normalizedSearch \? plotted\.find/);
  assert.match(dashboard, /isPrefecture \? "地域" : "都道府県"/);
  assert.match(dashboard, /className="search-filter"/);
  assert.match(dashboard, /都道府県ビュー/);
  assert.match(dashboard, /entities\.filter\(\(item\) => item\.pref === pref\)/);
  assert.match(dashboard, /財政悪化でどうなる？/);
  assert.match(dashboard, /function FiscalRiskGuide/);
  assert.match(dashboard, /実質赤字比率/);
  assert.match(dashboard, /連結実質赤字比率/);
  assert.match(dashboard, /赤字なし/);
  assert.match(dashboard, /自治体が自ら立て直す段階/);
  assert.match(dashboard, /自治体だけでは立て直しが難しい段階/);
  assert.match(dashboard, /fiscal-risk-guide\.webp/);
  assert.match(dashboard, /夕張市で、実際に起きたこと/);
  assert.match(dashboard, /中学校3/);
  assert.match(dashboard, /小学校6/);
  assert.doesNotMatch(dashboard, /中3<span/);
  assert.doesNotMatch(dashboard, /小6<span/);
  assert.match(dashboard, /大阪府 泉佐野市/);
  assert.match(dashboard, /長野県 王滝村/);
  assert.doesNotMatch(dashboard, /中学生にもわかる/);
  assert.doesNotMatch(dashboard, /かんたんな意味/);
  assert.match(dashboard, /className="keep-line"/);
  assert.match(styles, /\.keep-line \{ white-space:nowrap; \}/);
  assert.match(styles, /\.risk-threshold-table td:nth-child\(2\).*white-space:nowrap/);
  assert.match(styles, /\.impact-grid li .*white-space:nowrap/);
  assert.match(styles, /\.non-events ul .*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(dashboard, /laws\.e-gov\.go\.jp\/law\/419AC0000000094/);
  // 同値は同順位で扱い、値のない団体を黙って落とさないこと
  assert.match(data, /rankWithin/);
  assert.match(data, /負担なし/);
  assert.match(dashboard, /ranks\[i\]/);
  assert.match(dashboard, /表示団体/);
  assert.match(data, /metricHistory/);
  assert.match(data, /groupAt/);
  assert.match(data, /actualDeficit/);
  assert.match(data, /consolidatedDeficit/);
  assert.doesNotMatch(data, /import officialData from "\.\/official-data\.json"/);
  assert.match(data, /hydrateOfficialData/);
  assert.match(data, /hydratePrefecturalData/);
  assert.match(data, /allPrefectures/);
  assert.match(officialData, /一般市Ⅰ－１/);
  assert.match(officialData, /北山村/);
  const parsedOfficialData = JSON.parse(officialData);
  assert.equal(new Set(parsedOfficialData.municipalities.map((item) => item.p)).size, 47);
  assert.ok(parsedOfficialData.municipalities.every((item) => !("size" in item) && !("pe" in item.comp)));
  const parsedPrefecturalData = JSON.parse(prefecturalData);
  assert.equal(parsedPrefecturalData.prefectures.length, 47);
  assert.equal(parsedPrefecturalData.prefectures.find((item) => item.c === "30").n, "和歌山県");
  assert.match(generator, /finance_local_finance_data_table_flow\.csv/);
  assert.match(generator, /歳出 \(目的\)/);
  // 配信ポリシーは next.config.ts に一本化する
  assert.match(nextConfig, /stale-while-revalidate=86400/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
});
