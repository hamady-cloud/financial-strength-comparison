import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(await readFile(new URL("../app/official-data.json", import.meta.url), "utf8"));

test("official snapshot has complete municipality-year grain", () => {
  assert.deepEqual(data.years, [2020, 2021, 2022, 2023, 2024]);
  assert.equal(data.snapshot, "2026-04-24");
  assert.equal(data.municipalities.length, 1741);
  assert.equal(new Set(data.municipalities.map((item) => item.c)).size, 1741);
  assert.ok(data.municipalities.every((item) => item.g.length === 5 && item.g.every(Boolean)));
  assert.ok(data.municipalities.every((item) => item.pop.length === 5 && item.pop.every((value) => Number.isFinite(value))));
});

test("formal peer groups and five-year metric series are retained", () => {
  const wakayama = data.municipalities.find((item) => item.c === "30201");
  const kainan = data.municipalities.find((item) => item.c === "30202");
  const hashimoto = data.municipalities.find((item) => item.c === "30203");
  assert.equal(wakayama.g[4], "中核市");
  assert.equal(kainan.g[4], "一般市Ⅰ－１");
  assert.equal(hashimoto.g[4], "一般市Ⅱ－３");
  for (const series of Object.values(wakayama.v)) assert.equal(series.length, 5);
  assert.ok(wakayama.v.f.every((value) => Number.isFinite(value)));
  assert.ok(wakayama.v.o.every((value) => Number.isFinite(value)));
  assert.ok(wakayama.v.d.every((value) => Number.isFinite(value)));
  assert.ok(wakayama.v.r.every((value) => Number.isFinite(value)));
  assert.ok(wakayama.v.pe.every((value) => Number.isFinite(value)));
});

test("derived ratios and expenditure compositions pass range checks", () => {
  for (const municipality of data.municipalities) {
    for (const value of municipality.v.r) assert.ok(value == null || value >= 0);
    for (const value of municipality.v.pe) assert.ok(value == null || (value >= 0 && value <= 100));
    for (let index = 0; index < data.years.length; index += 1) {
      const parts = [municipality.comp.pe[index], municipality.comp.a[index], municipality.comp.d[index], municipality.comp.o[index]];
      if (parts.every((value) => value != null)) {
        const total = parts.reduce((sum, value) => sum + value, 0);
        assert.ok(Math.abs(total - 100) <= 0.2, `${municipality.c} ${data.years[index]} composition=${total}`);
      }
    }
  }
});

test("official group averages cover published indicator groups", () => {
  assert.ok(Object.keys(data.groupAverages).length >= 33);
  assert.ok(data.groupAverages["一般市Ⅰ－１"]);
  assert.equal(data.groupAverages["一般市Ⅰ－１"].o.length, 5);
});
