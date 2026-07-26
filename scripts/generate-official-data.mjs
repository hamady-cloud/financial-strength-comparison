import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";

function parseArguments(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) positional.push(value);
    else options[value.slice(2)] = argv[index + 1]?.startsWith("--") ? true : argv[++index];
  }
  return { positional, options };
}

const { positional, options } = parseArguments(process.argv.slice(2));
if (!positional[0] || !options["health-data"] || !options.snapshot) {
  throw new Error("Usage: node scripts/generate-official-data.mjs <csv-directory> [output] --health-data <json> --snapshot <YYYY-MM-DD> [--source-url <url>] [--meta-output <json>]");
}

const inputDir = resolve(positional[0]);
const outputPath = resolve(positional[1] ?? "public/official-data.json");
const metaOutputPath = options["meta-output"] ? resolve(options["meta-output"]) : positional[1] ? null : resolve("app/official-data-meta.json");
const healthData = JSON.parse(await readFile(resolve(options["health-data"]), "utf8"));
const records = new Map();
const groupAverages = {};

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

async function readCsvRows(fileName) {
  const rows = [];
  const input = createReadStream(join(inputDir, fileName), { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let headers;
  for await (const rawLine of lines) {
    const line = rawLine.replace(/^\uFEFF/, "");
    if (!headers) { headers = parseCsvLine(line); continue; }
    if (!line) continue;
    const values = parseCsvLine(line);
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }
  return rows;
}

const masterRows = await readCsvRows("finance_data_table_master.csv");
const availableYears = [...new Set(masterRows.map((row) => Number(row["年度"])).filter(Number.isFinite))].sort((a, b) => a - b);
const years = availableYears.slice(-5);
if (years.length !== 5 || years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) {
  throw new Error(`直近5年度を連続して取得できません: ${availableYears.join(", ")}`);
}
for (const year of years) {
  if (!healthData.years?.[year]) throw new Error(`${year}年度の健全化判断比率データがありません。更新元を追加してください。`);
}

async function forEachCsv(fileName, handler) {
  for (const row of await readCsvRows(fileName)) handler(row);
}

function emptySeries() { return years.map(() => null); }
function yearIndex(year) { return years.indexOf(Number(year)); }
function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ensureRecord(row) {
  const code = row["市区町村コード"];
  if (!records.has(code)) {
    records.set(code, {
      c: code,
      n: row["市区町村名"],
      p: row["都道府県名"],
      g: emptySeries(),
      pop: emptySeries(),
      _size: emptySeries(),
      v: { f: emptySeries(), o: emptySeries(), d: emptySeries(), b: emptySeries(), a: emptySeries(), c: emptySeries(), r: emptySeries(), pe: emptySeries() },
      comp: { a: emptySeries(), d: emptySeries(), o: emptySeries() },
      _funds: years.map(() => 0),
      _flow: years.map(() => ({ total: 0, personnel: 0, assistance: 0, debt: 0 })),
    });
  }
  return records.get(code);
}

for (const row of masterRows) {
  const index = yearIndex(row["年度"]);
  if (index < 0) continue;
  const record = ensureRecord(row);
  record.g[index] = row["類似団体区分"] || null;
  record.pop[index] = numberOrNull(row["人口数_人"]);
  record._size[index] = numberOrNull(row["標準財政規模_千円"]);
}

const indicatorMap = {
  "財政力指数": ["f", 1],
  "経常収支比率": ["o", 100],
  "実質公債費比率": ["d", 100],
  "将来負担比率": ["b", 100],
};

await forEachCsv("finance_data_table_indicators.csv", (row) => {
  const index = yearIndex(row["年度"]);
  const mapping = indicatorMap[row["指標名"]];
  if (index < 0 || !mapping) return;
  const record = ensureRecord(row);
  const value = numberOrNull(row["値"]);
  record.v[mapping[0]][index] = value == null ? null : Number((value * mapping[1]).toFixed(mapping[0] === "f" ? 2 : 1));
});

await forEachCsv("finance_data_table_groups.csv", (row) => {
  const index = yearIndex(row["年度"]);
  const mapping = indicatorMap[row["指標名"]];
  if (index < 0 || !mapping) return;
  const group = row["類似団体名"];
  groupAverages[group] ??= { f: emptySeries(), o: emptySeries(), d: emptySeries(), b: emptySeries() };
  const value = numberOrNull(row["値"]);
  groupAverages[group][mapping[0]][index] = value == null ? null : Number((value * mapping[1]).toFixed(mapping[0] === "f" ? 2 : 1));
});

const fundItems = new Set(["財政調整基金", "減債基金", "その他特定目的基金"]);
await forEachCsv("finance_data_table_stock.csv", (row) => {
  const index = yearIndex(row["年度"]);
  if (index < 0 || row["分類"] !== "積立金" || row["大項目"] !== "積立金現在高" || !fundItems.has(row["項目"])) return;
  ensureRecord(row)._funds[index] += numberOrNull(row["値_千円"]) ?? 0;
});

// 歳出構成比の分母と公債費は「歳出 (目的)」から取る。
// 市町村版CSVの「歳出 (性質)」ブロックには2点の欠陥がある（都道府県版CSVには無い）。
//   1. 大項目「公債費」の値が、実際には目的別「災害復旧費」の値になっている
//      （2026-04-24版で8,705件中8,593件＝98.7%が完全一致）
//   2. 繰出金・投資及び出資金・貸付金を欠き、歳出総額を再現しない
//      （目的別合計より中央値9.5%小さい。1%以内に収まるのは421件のみ）
// 目的別合計は歳入合計との比が中央値1.003で、歳出総額として妥当と確認済み。
// 人件費・扶助費は目的別に存在しないため性質別のまま使う（分類混在は出典画面に明記）。
await forEachCsv("finance_local_finance_data_table_flow.csv", (row) => {
  const index = yearIndex(row["年度"]);
  if (index < 0) return;
  const category = row["分類"];
  if (category !== "歳出 (性質)" && category !== "歳出 (目的)") return;
  const value = numberOrNull(row["値_千円"]) ?? 0;
  const flow = ensureRecord(row)._flow[index];
  if (category === "歳出 (目的)") {
    flow.total += value;
    if (row["大項目"] === "公債費") flow.debt += value;
    return;
  }
  if (row["大項目"] === "人件費") flow.personnel += value;
  if (row["大項目"] === "扶助費") flow.assistance += value;
});

for (const record of records.values()) {
  for (let index = 0; index < years.length; index += 1) {
    const size = record._size[index];
    if (size && record._funds[index] >= 0) record.v.r[index] = Number((record._funds[index] / size * 100).toFixed(1));
    const flow = record._flow[index];
    if (flow.total > 0) {
      record.v.pe[index] = Number((flow.personnel / flow.total * 100).toFixed(1));
      record.comp.a[index] = Number((flow.assistance / flow.total * 100).toFixed(1));
      record.comp.d[index] = Number((flow.debt / flow.total * 100).toFixed(1));
      record.comp.o[index] = Number(((flow.total - flow.personnel - flow.assistance - flow.debt) / flow.total * 100).toFixed(1));
    }
    const health = healthData.years[years[index]].values?.[record.c] ?? {};
    record.v.a[index] = health.a ?? 0;
    record.v.c[index] = health.c ?? 0;
  }
  delete record._funds;
  delete record._flow;
  delete record._size;
}

const municipalities = [...records.values()].sort((a, b) => a.c.localeCompare(b.c, "ja"));
const output = {
  snapshot: options.snapshot,
  generatedAt: new Date().toISOString(),
  source: "デジタル庁・総務省『地方財政（市町村ごと）データテーブル』",
  sourceUrl: options["source-url"] ?? "https://www.digital.go.jp/resources/japandashboard/municipal-finance",
  healthRatioSnapshot: healthData.snapshot,
  healthRatioSource: healthData.source,
  healthRatioSourceUrl: healthData.sourceUrl,
  healthRatioApiUrl: healthData.apiUrl,
  healthRatioSources: healthData.sources,
  years,
  groupAverages,
  municipalities,
};

await writeFile(outputPath, JSON.stringify(output), "utf8");
if (metaOutputPath) {
  const metadata = {
    snapshot: output.snapshot,
    generatedAt: output.generatedAt,
    source: output.source,
    sourceUrl: output.sourceUrl,
    healthRatioSnapshot: output.healthRatioSnapshot,
    healthRatioSource: output.healthRatioSource,
    healthRatioSourceUrl: output.healthRatioSourceUrl,
    years: output.years,
  };
  await writeFile(metaOutputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}
console.log(`Wrote ${municipalities.length} municipalities to ${basename(outputPath)} (${years[0]}-${years.at(-1)})`);
