import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const input = process.argv[2] ?? "public/prefectural-data.json";
const data = JSON.parse(await readFile(resolve(input), "utf8"));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const metrics = ["f", "o", "d", "b", "a", "c", "r", "pe"];

check(/^\d{4}-\d{2}-\d{2}$/.test(data.snapshot), "snapshot が不正です");
check(data.years?.length === 5 && data.years.every((year, index) => !index || year === data.years[index - 1] + 1), "5年度が連続していません");
check(data.prefectures?.length === 47, `都道府県数が47ではありません: ${data.prefectures?.length}`);
check(new Set(data.prefectures?.map((item) => item.c)).size === 47, "都道府県コードが重複しています");
check(Object.keys(data.groupAverages ?? {}).length === 5, "財政力グループ平均が5区分ではありません");

for (const item of data.prefectures ?? []) {
  check(/^\d{2}$/.test(item.c), `都道府県コードが不正です: ${item.c}`);
  check(item.g?.length === 5 && item.g.every(Boolean), `${item.c} グループが不完全です`);
  check(item.pop?.length === 5 && item.pop.every((value) => Number.isFinite(value) && value > 0), `${item.c} 人口が不完全です`);
  for (const key of metrics) check(item.v?.[key]?.length === 5 && item.v[key].every(Number.isFinite), `${item.c} 指標 ${key} が不完全です`);
  check(["a", "d", "o"].every((key) => item.comp?.[key]?.length === 5), `${item.c} 歳出構成が不完全です`);
  for (let index = 0; index < 5; index += 1) {
    const parts = [item.v.pe[index], item.comp.a[index], item.comp.d[index], item.comp.o[index]];
    check(Math.abs(parts.reduce((sum, value) => sum + value, 0) - 100) <= .2, `${item.c} ${data.years[index]} 歳出構成合計が不正です`);
  }
}
check(data.prefectures?.find((item) => item.c === "13")?.g.every((value) => value === "グループA"), "東京都がグループAではありません");
check(data.prefectures?.some((item) => item.c === "30" && item.n === "和歌山県"), "和歌山県がありません");

if (errors.length) {
  console.error(`品質検査に失敗しました（${errors.length}件）`);
  for (const error of errors.slice(0, 40)) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`品質検査OK: ${data.years[0]}–${data.years.at(-1)}年度 / 47都道府県`);
