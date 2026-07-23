import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const inputDir = resolve(args[0] ?? "");
const outputPath = resolve(args[1] ?? "public/prefectural-data.json");
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const healthPath = option("health-data");
const snapshot = option("snapshot");
const populationPath = option("population-data") ?? "public/official-data.json";
const metaOutputPath = resolve(option("meta-output") ?? "app/prefectural-data-meta.json");
if (!args[0] || !healthPath || !snapshot) {
  throw new Error("Usage: node scripts/generate-prefectural-data.mjs <csv-directory> [output] --health-data <json> --snapshot <YYYY-MM-DD> [--population-data <json>] [--meta-output <json>]");
}

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

const indicatorRows = await readCsvRows("財政指標（市区町村）.csv");
const years = [...new Set(indicatorRows.map((row) => Number(row["年度"])))].sort((a, b) => a - b).slice(-5);
if (years.length !== 5 || years.some((year, index) => index && year !== years[index - 1] + 1)) {
  throw new Error(`直近5年度が連続していません: ${years.join(", ")}`);
}
const healthData = JSON.parse(await readFile(resolve(healthPath), "utf8"));
const municipalityData = JSON.parse(await readFile(resolve(populationPath), "utf8"));
if (municipalityData.years.join(",") !== years.join(",")) throw new Error("市町村人口データと都道府県データの年度が一致しません");

const empty = () => years.map(() => null);
const records = new Map();
const groupAverages = {};
const yearIndex = (year) => years.indexOf(Number(year));
const numberOrNull = (value) => value === "" || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const regionFor = (code) => {
  const value = Number(code);
  if (value <= 7) return "北海道・東北";
  if (value <= 14) return "関東";
  if (value <= 20) return "甲信越・北陸";
  if (value <= 24) return "東海";
  if (value <= 30) return "近畿";
  if (value <= 35) return "中国";
  if (value <= 39) return "四国";
  return "九州・沖縄";
};
const groupFor = (value) => value >= 1 ? "グループA" : value >= .5 ? "グループB" : value >= .4 ? "グループC" : value >= .3 ? "グループD" : "グループE";

function ensure(row) {
  const code = String(row["都道府県コード"]).padStart(2, "0");
  if (!records.has(code)) {
    records.set(code, {
      c: code, n: row["都道府県名"], p: regionFor(code), g: empty(), pop: empty(),
      v: { f: empty(), o: empty(), d: empty(), b: empty(), a: empty(), c: empty(), r: empty(), pe: empty() },
      comp: { a: empty(), d: empty(), o: empty() },
      _surplus: empty(), _surplusRatio: empty(), _funds: years.map(() => 0),
      _flow: years.map(() => ({ total: 0, personnel: 0, assistance: 0, debt: 0 })),
    });
  }
  return records.get(code);
}

const indicatorMap = {
  "財政力指数": ["f", 1, 3],
  "経常収支比率": ["o", 100, 1],
  "実質公債費比率": ["d", 100, 1],
  "将来負担比率": ["b", 100, 1],
};
for (const row of indicatorRows) {
  const index = yearIndex(row["年度"]);
  if (index < 0) continue;
  const record = ensure(row);
  const mapping = indicatorMap[row["指標名"]];
  const value = numberOrNull(row["値"]);
  if (mapping && value != null) record.v[mapping[0]][index] = Number((value * mapping[1]).toFixed(mapping[2]));
  if (row["指標名"] === "実質収支") record._surplus[index] = value;
  if (row["指標名"] === "実質収支比率") record._surplusRatio[index] = value;
}

for (const record of records.values()) {
  record.g = record.v.f.map((value) => value == null ? null : groupFor(value));
}

for (const row of await readCsvRows("財政指標（類似団体）.csv")) {
  const index = yearIndex(row["年度"]);
  const mapping = indicatorMap[row["指標名"]];
  if (index < 0 || !mapping) continue;
  const group = row["グループ"];
  groupAverages[group] ??= { f: empty(), o: empty(), d: empty(), b: empty() };
  const value = numberOrNull(row["値"]);
  groupAverages[group][mapping[0]][index] = value == null ? null : Number((value * mapping[1]).toFixed(mapping[2]));
}

for (const row of await readCsvRows("積立金・地方債.csv")) {
  const index = yearIndex(row["年度"]);
  if (index < 0 || row["分類"] !== "積立金" || row["大項目"] !== "積立金現在高") continue;
  ensure(row)._funds[index] += numberOrNull(row["値【千円】"]) ?? 0;
}

for (const row of await readCsvRows("歳入・歳出性質・歳出目的.csv")) {
  const index = yearIndex(row["年度"]);
  if (index < 0 || row["分類"] !== "歳出 (性質)") continue;
  const flow = ensure(row)._flow[index];
  const value = numberOrNull(row["値【千円】"]) ?? 0;
  flow.total += value;
  if (row["大項目"] === "人件費") flow.personnel += value;
  if (row["大項目"] === "扶助費") flow.assistance += value;
  if (row["大項目"] === "公債費") flow.debt += value;
}

const prefByName = new Map([...records.values()].map((record) => [record.n, record]));
for (const municipality of municipalityData.municipalities) {
  const record = prefByName.get(municipality.p);
  if (!record) continue;
  municipality.pop.forEach((value, index) => { record.pop[index] = (record.pop[index] ?? 0) + (value ?? 0); });
}

for (const record of records.values()) {
  for (let index = 0; index < years.length; index += 1) {
    const ratio = record._surplusRatio[index];
    const size = ratio ? record._surplus[index] / ratio : null;
    if (size && size > 0) record.v.r[index] = Number((record._funds[index] / size * 100).toFixed(1));
    const flow = record._flow[index];
    if (flow.total > 0) {
      record.v.pe[index] = Number((flow.personnel / flow.total * 100).toFixed(1));
      record.comp.a[index] = Number((flow.assistance / flow.total * 100).toFixed(1));
      record.comp.d[index] = Number((flow.debt / flow.total * 100).toFixed(1));
      record.comp.o[index] = Number(((flow.total - flow.personnel - flow.assistance - flow.debt) / flow.total * 100).toFixed(1));
    }
    const health = healthData.years?.[years[index]]?.values?.[record.c] ?? {};
    record.v.a[index] = health.a ?? 0;
    record.v.c[index] = health.c ?? 0;
  }
  delete record._surplus;
  delete record._surplusRatio;
  delete record._funds;
  delete record._flow;
}

// Group A contains only Tokyo; publish a complete self-benchmark series.
const tokyo = records.get("13");
if (tokyo) groupAverages["グループA"] = {
  f: [...tokyo.v.f], o: [...tokyo.v.o], d: [...tokyo.v.d], b: [...tokyo.v.b],
};

const prefectures = [...records.values()].sort((a, b) => a.c.localeCompare(b.c));
const output = {
  snapshot,
  generatedAt: new Date().toISOString(),
  source: "デジタル庁『地方財政（都道府県ごと）』・総務省",
  sourceUrl: "https://www.digital.go.jp/resources/japandashboard/prefectural-finance",
  healthRatioSnapshot: healthData.snapshot,
  healthRatioSource: healthData.source,
  healthRatioSourceUrl: healthData.sourceUrl,
  healthRatioSources: healthData.sources,
  years, groupAverages, prefectures,
};
await writeFile(outputPath, JSON.stringify(output), "utf8");
await writeFile(metaOutputPath, `${JSON.stringify({
  snapshot: output.snapshot, generatedAt: output.generatedAt, source: output.source, sourceUrl: output.sourceUrl,
  healthRatioSnapshot: output.healthRatioSnapshot, healthRatioSource: output.healthRatioSource,
  healthRatioSourceUrl: output.healthRatioSourceUrl, years,
}, null, 2)}\n`, "utf8");
console.log(`Wrote ${prefectures.length} prefectures to ${basename(outputPath)} (${years[0]}-${years.at(-1)})`);
