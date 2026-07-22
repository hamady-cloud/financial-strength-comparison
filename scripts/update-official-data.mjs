import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const config = JSON.parse(await readFile(join(scriptDir, "data-sources.json"), "utf8"));
const options = parseArguments(process.argv.slice(2));
const tempDir = await mkdtemp(join(tmpdir(), "fiscal-lens-update-"));
const currentOutput = resolve(options.output ?? join(projectDir, "public/official-data.json"));
const currentMetaOutput = resolve(options["meta-output"] ?? join(projectDir, "app/official-data-meta.json"));

try {
  const source = options["input-dir"]
    ? { directory: resolve(options["input-dir"]), snapshot: required(options.snapshot, "--input-dir には --snapshot YYYY-MM-DD が必要です"), url: config.municipalFinancePageUrl }
    : await downloadLatestCoreData(tempDir);
  const csvRoot = await findCsvRoot(source.directory);
  const masterRows = await readCsvRows(join(csvRoot, "finance_data_table_master.csv"));
  const availableYears = [...new Set(masterRows.map((row) => Number(row["年度"])).filter(Number.isFinite))].sort((a, b) => a - b);
  const years = availableYears.slice(-(config.rollingYears ?? 5));
  if (years.length !== (config.rollingYears ?? 5) || years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) {
    throw new Error(`直近年度が連続していません: ${availableYears.join(", ")}`);
  }
  const latestRows = masterRows.filter((row) => Number(row["年度"]) === years.at(-1));
  const targets = new Map(latestRows.map((row) => [row["市区町村コード"], { pref: row["都道府県名"], name: row["市区町村名"] }]));
  if (targets.size < 1700 || targets.size > 1800) throw new Error(`最新年度の団体数が想定範囲外です: ${targets.size}`);

  const health = await buildHealthRatios(years, targets, tempDir);
  const healthPath = join(tempDir, "health-ratios.json");
  const candidatePath = join(tempDir, "official-data.candidate.json");
  const candidateMetaPath = join(tempDir, "official-data-meta.candidate.json");
  await writeFile(healthPath, JSON.stringify(health), "utf8");
  runNode([
    join(scriptDir, "generate-official-data.mjs"), csvRoot, candidatePath,
    "--health-data", healthPath, "--snapshot", source.snapshot, "--source-url", source.url, "--meta-output", candidateMetaPath,
  ]);
  const validatorArgs = [join(scriptDir, "validate-official-data.mjs"), candidatePath];
  try { await access(currentOutput); validatorArgs.push("--previous", currentOutput); } catch { /* first generation */ }
  runNode(validatorArgs);

  const backupPath = `${currentOutput}.previous`;
  try { await cp(currentOutput, backupPath); } catch { /* first generation */ }
  await cp(candidatePath, currentOutput, { force: true });
  await cp(candidateMetaPath, currentMetaOutput, { force: true });
  console.log(`更新完了: ${years[0]}–${years.at(-1)}年度 / 取得日 ${source.snapshot}`);
  console.log(`更新前データの控え: ${backupPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`不明な引数です: ${name}`);
    const value = argv[index + 1];
    result[name.slice(2)] = !value || value.startsWith("--") ? true : argv[++index];
  }
  return result;
}

function required(value, message) {
  if (!value || value === true) throw new Error(message);
  return value;
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: projectDir, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${basename(args[0])} が失敗しました`);
}

async function downloadLatestCoreData(directory) {
  console.log("デジタル庁の公開ページから最新版を確認しています…");
  const response = await fetch(config.municipalFinancePageUrl);
  if (!response.ok) throw new Error(`公開ページを取得できません: HTTP ${response.status}`);
  const html = await response.text();
  const matches = [...html.matchAll(/href=["']([^"']*municipal-finance\.zip[^"']*)["']/gi)].map((match) => new URL(match[1], config.municipalFinancePageUrl).href);
  if (!matches.length) throw new Error("公開ページから地方財政ZIPのURLを検出できません");
  const url = matches.sort().at(-1);
  const dateMatch = decodeURIComponent(url).match(/(20\d{6})_resources_municipal-finance\.zip/i);
  if (!dateMatch) throw new Error(`ZIPファイル名から取得日を判定できません: ${url}`);
  const snapshot = `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}`;
  const zipPath = join(directory, "municipal-finance.zip");
  const extractPath = join(directory, "core");
  const zipResponse = await fetch(url);
  if (!zipResponse.ok) throw new Error(`ZIPを取得できません: HTTP ${zipResponse.status}`);
  await writeFile(zipPath, Buffer.from(await zipResponse.arrayBuffer()));
  if (process.platform === "win32") {
    const result = spawnSync("powershell", ["-NoProfile", "-Command", "Expand-Archive -LiteralPath $env:FISCAL_ZIP -DestinationPath $env:FISCAL_OUT -Force"], {
      stdio: "inherit",
      env: { ...process.env, FISCAL_ZIP: zipPath, FISCAL_OUT: extractPath },
    });
    if (result.status !== 0) throw new Error("ZIPの展開に失敗しました");
  } else {
    const result = spawnSync("unzip", ["-q", zipPath, "-d", extractPath], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("ZIPの展開に失敗しました");
  }
  return { directory: extractPath, snapshot, url: config.municipalFinancePageUrl };
}

async function findCsvRoot(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "finance_data_table_master.csv")) return directory;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try { return await findCsvRoot(join(directory, entry.name)); } catch { /* continue */ }
  }
  throw new Error(`${directory} に finance_data_table_master.csv がありません`);
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value); value = ""; } else value += character;
  }
  values.push(value);
  return values;
}

async function readCsvRows(path) {
  const rows = [];
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
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

async function buildHealthRatios(years, targets, directory) {
  const yearly = Object.fromEntries(years.map((year) => [year, { values: {}, source: null }]));
  const covered = Object.fromEntries(years.map((year) => [year, new Map()]));
  console.log("e-Statから健全化判断比率を取得しています…");
  const response = await fetch(config.eStat.apiUrl);
  if (!response.ok) throw new Error(`e-Stat APIを取得できません: HTTP ${response.status}`);
  const json = await response.json();
  const objects = json.GET_STATS?.STATISTICAL_DATA?.DATA_INF?.DATA_OBJ ?? [];
  for (const object of objects) {
    const value = object.VALUE;
    const year = Number(String(value["@time"]).slice(0, 4));
    const code = value["@regionCode"];
    if (!yearly[year] || !targets.has(code)) continue;
    const metric = value["@indicator"] === config.eStat.actualIndicator ? "a" : value["@indicator"] === config.eStat.consolidatedIndicator ? "c" : null;
    if (!metric) continue;
    const parsed = Number(value.$);
    if (!Number.isFinite(parsed)) throw new Error(`e-Statの値を数値として読めません: ${year} ${code} ${metric}=${value.$}`);
    const entry = covered[year].get(code) ?? {};
    entry[metric] = parsed;
    covered[year].set(code, entry);
  }

  const sources = [];
  for (const year of years) {
    if (covered[year].size === targets.size && [...covered[year].values()].every((value) => Number.isFinite(value.a) && Number.isFinite(value.c))) {
      for (const [code, values] of covered[year]) if (values.a !== 0 || values.c !== 0) yearly[year].values[code] = values;
      yearly[year].source = config.eStat.apiUrl;
      sources.push({ year, type: "e-Stat API", url: config.eStat.apiUrl });
      continue;
    }

    let annual = config.annualHealthRatios?.[year];
    if (!annual && year === years.at(-1) && options["health-page"]) annual = { pageUrl: options["health-page"] };
    if (!annual) throw new Error(`${year}年度の実質赤字比率・連結実質赤字比率の公表元が未登録です。scripts/data-sources.json に追加するか --health-page URL を指定してください。`);
    if (annual.allClear === true) {
      yearly[year].source = annual.pageUrl;
      sources.push({ year, type: "総務省確報（全団体赤字なし）", url: annual.pageUrl, publishedAt: annual.publishedAt });
      continue;
    }
    const values = await readAnnualHealthWorkbook(year, annual.pageUrl, targets, directory);
    yearly[year].values = Object.fromEntries([...values].filter(([, value]) => value.a !== 0 || value.c !== 0));
    yearly[year].source = annual.pageUrl;
    sources.push({ year, type: "総務省確報", url: annual.pageUrl, publishedAt: annual.publishedAt });
  }
  const latestPublished = sources.map((source) => source.publishedAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  return {
    snapshot: latestPublished,
    source: "e-Statおよび総務省『健全化判断比率・資金不足比率（確報）』",
    sourceUrl: sources.at(-1).url,
    apiUrl: config.eStat.apiUrl,
    sources,
    years: yearly,
  };
}

async function readAnnualHealthWorkbook(year, pageUrl, targets, directory) {
  console.log(`${year}年度の総務省確報を取得しています…`);
  const pageResponse = await fetch(pageUrl);
  if (!pageResponse.ok) throw new Error(`${year}年度の確報ページを取得できません: HTTP ${pageResponse.status}`);
  const html = await pageResponse.text();
  const links = [...html.matchAll(/href=["']([^"']+\.xlsx(?:\?[^"']*)?)["']/gi)].map((match) => new URL(match[1], pageUrl).href);
  if (!links.length) throw new Error(`${year}年度の確報ページにExcelファイルがありません: ${pageUrl}`);
  const workbookUrl = links[0];
  const workbookResponse = await fetch(workbookUrl);
  if (!workbookResponse.ok) throw new Error(`${year}年度のExcelを取得できません: HTTP ${workbookResponse.status}`);
  const workbookPath = join(directory, `health-${year}.xlsx`);
  await writeFile(workbookPath, Buffer.from(await workbookResponse.arrayBuffer()));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.getWorksheet("1(2)") ?? workbook.worksheets.find((candidate) => candidate.name.includes("1(2)"));
  if (!sheet) throw new Error(`${year}年度Excelの市区町村シート「1(2)」が見つかりません`);
  const targetByName = new Map([...targets].map(([code, value]) => [`${normalize(value.pref)}|${normalize(value.name)}`, code]));
  const result = new Map();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 6) return;
    const pref = cellText(row.getCell(3).value);
    const name = cellText(row.getCell(4).value);
    const code = targetByName.get(`${normalize(pref)}|${normalize(name)}`);
    if (!code) return;
    result.set(code, { a: ratioValue(row.getCell(6).value), c: ratioValue(row.getCell(8).value) });
  });
  if (result.size !== targets.size) {
    const missing = [...targets].filter(([code]) => !result.has(code)).slice(0, 10).map(([code, value]) => `${code} ${value.pref}${value.name}`);
    throw new Error(`${year}年度Excelと団体マスターを完全結合できません（${result.size}/${targets.size}）。未結合: ${missing.join("、")}`);
  }
  return result;
}

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") return String(value.result ?? value.text ?? value.richText?.map((part) => part.text).join("") ?? "");
  return String(value);
}

function normalize(value) {
  return String(value).normalize("NFKC").replace(/[\s　]/g, "").replaceAll("檮", "梼");
}

function ratioValue(value) {
  const text = cellText(value).trim();
  if (!text || /^[\-－―ー]+$/.test(text)) return 0;
  const number = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(number) || number < 0) throw new Error(`赤字比率を数値として読めません: ${text}`);
  return number;
}
