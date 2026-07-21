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
  assert.match(html, /デモデータで表示中/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("keeps data and methodology labels explicit", async () => {
  const [dashboard, data] = await Promise.all([
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/data.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /出典・注意/);
  assert.match(dashboard, /正確な値は必ず公表元/);
  assert.match(dashboard, /CSVを出力/);
  assert.match(data, /和歌山市/);
  assert.match(data, /北山村/);
});
