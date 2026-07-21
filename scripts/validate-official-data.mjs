import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [input = "app/official-data.json", previousOption, previousPath] = process.argv.slice(2);
const data = JSON.parse(await readFile(resolve(input), "utf8"));
const previous = previousOption === "--previous" && previousPath
  ? JSON.parse(await readFile(resolve(previousPath), "utf8"))
  : null;
const errors = [];
const warnings = [];
const metricKeys = ["f", "o", "d", "b", "a", "c", "r", "pe"];

function check(condition, message) {
  if (!condition) errors.push(message);
}

check(/^\d{4}-\d{2}-\d{2}$/.test(data.snapshot), "snapshot が YYYY-MM-DD 形式ではありません");
check(Array.isArray(data.years) && data.years.length === 5, "表示年度は直近5年度である必要があります");
check(data.years?.every((year, index) => index === 0 || year === data.years[index - 1] + 1), "表示年度が連続していません");
check(Array.isArray(data.municipalities), "municipalities が配列ではありません");
check(Array.isArray(data.healthRatioSources) && data.healthRatioSources.length === data.years?.length, "赤字比率の年度別出典が揃っていません");

const municipalities = data.municipalities ?? [];
check(municipalities.length >= 1700 && municipalities.length <= 1800, `団体数が想定範囲外です: ${municipalities.length}`);
check(new Set(municipalities.map((item) => item.c)).size === municipalities.length, "団体コードが重複しています");
check(new Set(municipalities.map((item) => item.p)).size === 47, `都道府県数が47ではありません: ${new Set(municipalities.map((item) => item.p)).size}`);

for (const item of municipalities) {
  check(/^\d{5}$/.test(item.c), `不正な団体コード: ${item.c}`);
  check(item.g?.length === data.years.length, `${item.c} 類似団体区分の年度数が不一致です`);
  check(item.pop?.length === data.years.length, `${item.c} 人口の年度数が不一致です`);
  check(item.comp && ["pe", "a", "d", "o"].every((key) => item.comp[key]?.length === data.years.length), `${item.c} 歳出構成の年度数が不一致です`);
  for (const key of metricKeys) check(item.v?.[key]?.length === data.years.length, `${item.c} 指標 ${key} の年度数が不一致です`);

  for (let index = 0; index < data.years.length; index += 1) {
    const label = `${item.c} ${data.years[index]}`;
    check(Number.isFinite(item.pop[index]) && item.pop[index] >= 0, `${label} 人口が欠損または不正です`);
    check(Boolean(item.g[index]), `${label} 類似団体区分が欠損しています`);
    for (const key of ["f", "o", "d", "a", "c"]) check(Number.isFinite(item.v[key][index]), `${label} 指標 ${key} が欠損しています`);
    check(item.v.f[index] >= 0 && item.v.f[index] <= 3, `${label} 財政力指数が想定範囲外です`);
    check(item.v.o[index] >= 0 && item.v.o[index] <= 200, `${label} 経常収支比率が想定範囲外です`);
    check(item.v.d[index] >= -100 && item.v.d[index] <= 100, `${label} 実質公債費比率が想定範囲外です`);
    check(item.v.a[index] >= 0 && item.v.a[index] <= 100, `${label} 実質赤字比率が想定範囲外です`);
    check(item.v.c[index] >= 0 && item.v.c[index] <= 100, `${label} 連結実質赤字比率が想定範囲外です`);
    const parts = [item.comp.pe[index], item.comp.a[index], item.comp.d[index], item.comp.o[index]];
    if (parts.every(Number.isFinite)) {
      const total = parts.reduce((sum, value) => sum + value, 0);
      check(Math.abs(total - 100) <= 0.2, `${label} 歳出構成の合計が100%ではありません: ${total}`);
    }
  }
}

check(Object.keys(data.groupAverages ?? {}).length >= 30, "類似団体平均の区分数が少なすぎます");
for (const [group, averages] of Object.entries(data.groupAverages ?? {})) {
  for (const key of ["f", "o", "d", "b"]) check(averages[key]?.length === data.years.length, `${group} の平均 ${key} の年度数が不一致です`);
}

if (previous) {
  const countChange = Math.abs(municipalities.length - previous.municipalities.length);
  check(countChange <= 20, `前回から団体数が大きく変化しています: ${previous.municipalities.length} → ${municipalities.length}`);
  check(data.years.at(-1) >= previous.years.at(-1), "最新年度が前回より古くなっています");
  if (data.years.at(-1) === previous.years.at(-1)) warnings.push("最新年度は前回と同じです（データ再生成として扱います）");
}

if (errors.length) {
  console.error(`品質検査に失敗しました（${errors.length}件）`);
  for (const error of errors.slice(0, 40)) console.error(`- ${error}`);
  if (errors.length > 40) console.error(`- ほか ${errors.length - 40}件`);
  process.exit(1);
}

console.log(`品質検査OK: ${data.years[0]}–${data.years.at(-1)}年度 / ${municipalities.length.toLocaleString()}団体 / 47都道府県`);
for (const warning of warnings) console.warn(`注意: ${warning}`);
