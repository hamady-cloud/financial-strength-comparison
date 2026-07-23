import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(await readFile(new URL("../public/prefectural-data.json", import.meta.url), "utf8"));

test("prefectural snapshot covers 47 prefectures and five years", () => {
  assert.equal(data.prefectures.length, 47);
  assert.equal(new Set(data.prefectures.map((item) => item.c)).size, 47);
  assert.deepEqual(data.years, [2020, 2021, 2022, 2023, 2024]);
  assert.ok(data.prefectures.every((item) => item.pop.length === 5 && item.pop.every(Number.isFinite)));
});

test("official fiscal strength groups and key prefectures are present", () => {
  assert.deepEqual(Object.keys(data.groupAverages).sort(), ["グループA", "グループB", "グループC", "グループD", "グループE"]);
  assert.ok(data.prefectures.find((item) => item.c === "13").g.every((group) => group === "グループA"));
  assert.equal(data.prefectures.find((item) => item.c === "30").n, "和歌山県");
});

test("prefectural metrics and compositions are complete", () => {
  for (const prefecture of data.prefectures) {
    for (const series of Object.values(prefecture.v)) assert.equal(series.length, 5);
    for (let index = 0; index < 5; index += 1) {
      const parts = [prefecture.v.pe[index], prefecture.comp.a[index], prefecture.comp.d[index], prefecture.comp.o[index]];
      assert.ok(parts.every(Number.isFinite));
      assert.ok(Math.abs(parts.reduce((sum, value) => sum + value, 0) - 100) <= .2);
    }
  }
});
