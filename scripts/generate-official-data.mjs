import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";

const inputDir = resolve(process.argv[2] ?? "");
const outputPath = resolve(process.argv[3] ?? "app/official-data.json");
const years = [2020, 2021, 2022, 2023, 2024];
const records = new Map();
const groupAverages = {};

if (!process.argv[2]) {
  throw new Error("Usage: node scripts/generate-official-data.mjs <extracted-csv-directory> [output]");
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

async function forEachCsv(fileName, handler) {
  const path = join(inputDir, fileName);
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let headers;
  for await (const rawLine of lines) {
    const line = rawLine.replace(/^\uFEFF/, "");
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    if (!line) continue;
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    handler(row);
  }
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
      size: emptySeries(),
      v: { f: emptySeries(), o: emptySeries(), d: emptySeries(), b: emptySeries(), r: emptySeries(), pe: emptySeries() },
      comp: { pe: emptySeries(), a: emptySeries(), d: emptySeries(), o: emptySeries() },
      _funds: years.map(() => 0),
      _flow: years.map(() => ({ total: 0, personnel: 0, assistance: 0, debt: 0 })),
    });
  }
  return records.get(code);
}

await forEachCsv("finance_data_table_master.csv", (row) => {
  const index = yearIndex(row["年度"]);
  if (index < 0) return;
  const record = ensureRecord(row);
  record.g[index] = row["類似団体区分"] || null;
  record.pop[index] = numberOrNull(row["人口数_人"]);
  record.size[index] = numberOrNull(row["標準財政規模_千円"]);
});

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
  const record = ensureRecord(row);
  record._funds[index] += numberOrNull(row["値_千円"]) ?? 0;
});

await forEachCsv("finance_local_finance_data_table_flow.csv", (row) => {
  const index = yearIndex(row["年度"]);
  if (index < 0 || row["分類"] !== "歳出 (性質)") return;
  const record = ensureRecord(row);
  const value = numberOrNull(row["値_千円"]) ?? 0;
  const flow = record._flow[index];
  flow.total += value;
  if (row["大項目"] === "人件費") flow.personnel += value;
  if (row["大項目"] === "扶助費") flow.assistance += value;
  if (row["大項目"] === "公債費") flow.debt += value;
});

for (const record of records.values()) {
  for (let index = 0; index < years.length; index += 1) {
    const size = record.size[index];
    if (size && record._funds[index] >= 0) record.v.r[index] = Number((record._funds[index] / size * 100).toFixed(1));
    const flow = record._flow[index];
    if (flow.total > 0) {
      record.v.pe[index] = Number((flow.personnel / flow.total * 100).toFixed(1));
      record.comp.pe[index] = Number((flow.personnel / flow.total * 100).toFixed(1));
      record.comp.a[index] = Number((flow.assistance / flow.total * 100).toFixed(1));
      record.comp.d[index] = Number((flow.debt / flow.total * 100).toFixed(1));
      record.comp.o[index] = Number(((flow.total - flow.personnel - flow.assistance - flow.debt) / flow.total * 100).toFixed(1));
    }
  }
  delete record._funds;
  delete record._flow;
}

const municipalities = [...records.values()].sort((a, b) => a.c.localeCompare(b.c, "ja"));
const output = {
  snapshot: "2026-04-24",
  source: "デジタル庁・総務省『地方財政（市町村ごと）データテーブル』",
  sourceUrl: "https://www.digital.go.jp/resources/japandashboard/municipal-finance",
  years,
  groupAverages,
  municipalities,
};

await writeFile(outputPath, JSON.stringify(output), "utf8");
console.log(`Wrote ${municipalities.length} municipalities to ${basename(outputPath)} (${years[0]}-${years.at(-1)})`);
