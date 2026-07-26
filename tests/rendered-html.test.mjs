import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the fiscal dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Fiscal Lens/);
  assert.match(html, /全国ランキング/);
  assert.match(html, /公式データを読み込んでいます/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("keeps data and methodology labels explicit", async () => {
  const [dashboard, styles, data, officialData, prefecturalData, generator, worker] = await Promise.all([
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/data.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/official-data.json", import.meta.url), "utf8"),
    readFile(new URL("../public/prefectural-data.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-official-data.mjs", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
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
  assert.match(dashboard, /function PrefectureView/);
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
  assert.match(generator, /finance_data_table_groups\.csv/);
  assert.match(generator, /finance_local_finance_data_table_flow\.csv/);
  assert.doesNotMatch(worker, /no-store, no-cache, must-revalidate/);
  assert.match(worker, /prefectural-data\.json/);
  assert.match(worker, /stale-while-revalidate/);
});
