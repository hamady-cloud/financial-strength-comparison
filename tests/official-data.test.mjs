import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(await readFile(new URL("../public/official-data.json", import.meta.url), "utf8"));

test("official snapshot has complete municipality-year grain", () => {
  assert.equal(data.years.length, 5);
  assert.ok(data.years.every((year, index) => index === 0 || year === data.years[index - 1] + 1));
  assert.ok(data.years.at(-1) >= 2024);
  assert.match(data.snapshot, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(data.municipalities.length >= 1700 && data.municipalities.length <= 1800);
  assert.equal(new Set(data.municipalities.map((item) => item.c)).size, data.municipalities.length);
  assert.equal(new Set(data.municipalities.map((item) => item.p)).size, 47);
  assert.ok(data.municipalities.every((item) => item.g.length === 5 && item.g.every(Boolean)));
  assert.ok(data.municipalities.every((item) => item.pop.length === 5 && item.pop.every(Number.isFinite)));
});

test("formal peer groups and five-year metric series are retained", () => {
  for (const code of ["30201", "30202", "30203"]) {
    const municipality = data.municipalities.find((item) => item.c === code);
    assert.ok(municipality);
    assert.ok(municipality.g.at(-1));
    for (const series of Object.values(municipality.v)) assert.equal(series.length, 5);
    for (const key of ["f", "o", "d", "a", "c", "r", "pe"]) assert.ok(municipality.v[key].every(Number.isFinite));
  }
});

test("statutory deficit ratios retain five-year official series", () => {
  assert.match(data.healthRatioSnapshot, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(data.healthRatioSources) && data.healthRatioSources.length === data.years.length);
  assert.ok(data.municipalities.every((item) => item.v.a.length === 5 && item.v.c.length === 5));
  assert.ok(data.municipalities.every((item) => item.v.a.every(Number.isFinite) && item.v.c.every(Number.isFinite)));
});

test("derived ratios and expenditure compositions pass range checks", () => {
  for (const municipality of data.municipalities) {
    assert.ok(!("size" in municipality));
    assert.ok(!("pe" in municipality.comp));
    for (const value of municipality.v.r) assert.ok(value == null || value >= 0);
    for (const value of municipality.v.pe) assert.ok(value == null || (value >= 0 && value <= 100));
    for (let index = 0; index < data.years.length; index += 1) {
      const parts = [municipality.v.pe[index], municipality.comp.a[index], municipality.comp.d[index], municipality.comp.o[index]];
      if (parts.every((value) => value != null)) {
        const total = parts.reduce((sum, value) => sum + value, 0);
        assert.ok(Math.abs(total - 100) <= 0.2, `${municipality.c} ${data.years[index]} composition=${total}`);
      }
    }
  }
});

test("official group averages cover published indicator groups", () => {
  assert.ok(Object.keys(data.groupAverages).length >= 30);
  const sample = Object.values(data.groupAverages)[0];
  assert.equal(sample.o.length, 5);
});
