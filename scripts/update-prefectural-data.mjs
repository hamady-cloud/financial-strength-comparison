import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const config = JSON.parse(await readFile(join(scriptDir, "data-sources.json"), "utf8"));
const options = parseArguments(process.argv.slice(2));
const tempDir = await mkdtemp(join(tmpdir(), "fiscal-lens-pref-update-"));
const output = resolve(options.output ?? join(projectDir, "public/prefectural-data.json"));
const metaOutput = resolve(options["meta-output"] ?? join(projectDir, "app/prefectural-data-meta.json"));

try {
  const source = options["input-dir"]
    ? { directory: resolve(options["input-dir"]), snapshot: required(options.snapshot, "--input-dir には --snapshot が必要です") }
    : await downloadCore(tempDir);
  const csvRoot = await findCsvRoot(source.directory);
  const years = await getYears(join(csvRoot, "財政指標（市区町村）.csv"));
  const health = await buildHealth(years, tempDir);
  const healthPath = join(tempDir, "pref-health.json");
  const candidate = join(tempDir, "prefectural-data.candidate.json");
  const candidateMeta = join(tempDir, "prefectural-data-meta.candidate.json");
  await writeFile(healthPath, JSON.stringify(health), "utf8");
  runNode([
    join(scriptDir, "generate-prefectural-data.mjs"), csvRoot, candidate,
    "--health-data", healthPath, "--snapshot", source.snapshot,
    "--population-data", join(projectDir, "public/official-data.json"),
    "--meta-output", candidateMeta,
  ]);
  runNode([join(scriptDir, "validate-prefectural-data.mjs"), candidate]);
  try { await cp(output, `${output}.previous`); } catch { /* first generation */ }
  await cp(candidate, output, { force: true });
  await cp(candidateMeta, metaOutput, { force: true });
  console.log(`都道府県データ更新完了: ${years[0]}–${years.at(-1)}年度 / 取得日 ${source.snapshot}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`不明な引数です: ${key}`);
    result[key.slice(2)] = argv[++index];
  }
  return result;
}
function required(value, message) { if (!value) throw new Error(message); return value; }
function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: projectDir, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${basename(args[0])} が失敗しました`);
}

async function downloadCore(directory) {
  console.log("デジタル庁から都道府県版の最新版を確認しています…");
  const response = await fetch(config.prefecturalFinancePageUrl);
  if (!response.ok) throw new Error(`公開ページを取得できません: HTTP ${response.status}`);
  const html = await response.text();
  const urls = [...html.matchAll(/href=["']([^"']+\.zip(?:\?[^"']*)?)["']/gi)]
    .map((match) => new URL(match[1], config.prefecturalFinancePageUrl).href)
    .filter((url) => /prefectural-finance/i.test(url));
  if (!urls.length) throw new Error("都道府県財政ZIPを検出できません");
  const url = urls.sort().at(-1);
  const date = decodeURIComponent(url).match(/(20\d{6})_resources_?prefectural-finance/i)?.[1]
    ?? decodeURIComponent(url).match(/(20\d{6})_resourcesprefectural-finance/i)?.[1];
  if (!date) throw new Error(`ZIP名から取得日を判定できません: ${url}`);
  const snapshot = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const zipPath = join(directory, "prefectural-finance.zip");
  const extractPath = join(directory, "core");
  const zipResponse = await fetch(url);
  if (!zipResponse.ok) throw new Error(`ZIPを取得できません: HTTP ${zipResponse.status}`);
  await writeFile(zipPath, Buffer.from(await zipResponse.arrayBuffer()));
  const command = process.platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-Command", "Expand-Archive -LiteralPath $env:FISCAL_ZIP -DestinationPath $env:FISCAL_OUT -Force"], {
      stdio: "inherit", env: { ...process.env, FISCAL_ZIP: zipPath, FISCAL_OUT: extractPath },
    })
    : spawnSync("unzip", ["-q", zipPath, "-d", extractPath], { stdio: "inherit" });
  if (command.status !== 0) throw new Error("ZIPの展開に失敗しました");
  return { directory: extractPath, snapshot };
}

async function findCsvRoot(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "財政指標（市区町村）.csv")) return directory;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try { return await findCsvRoot(join(directory, entry.name)); } catch { /* next */ }
  }
  throw new Error("都道府県財政CSVが見つかりません");
}

async function getYears(path) {
  const text = await readFile(path, "utf8");
  const years = [...new Set(text.split(/\r?\n/).slice(1).map((line) => Number(line.slice(0, 4))).filter(Number.isFinite))].sort((a, b) => a - b).slice(-5);
  if (years.length !== 5 || years.some((year, index) => index && year !== years[index - 1] + 1)) throw new Error(`年度が不正です: ${years.join(", ")}`);
  return years;
}

async function buildHealth(years, directory) {
  const yearly = {};
  const sources = [];
  for (const year of years) {
    const source = config.prefecturalAnnualHealthRatios?.[year];
    if (!source) throw new Error(`${year}年度の総務省確報ページが未登録です`);
    console.log(`${year}年度の都道府県健全化判断比率を取得しています…`);
    if (source.allClear === true) {
      yearly[year] = { values: {}, source: source.pageUrl };
      sources.push({ year, type: "総務省確報（全都道府県赤字なし）", url: source.pageUrl, publishedAt: source.publishedAt });
      continue;
    }
    const page = await fetch(source.pageUrl);
    if (!page.ok) throw new Error(`${year}年度ページを取得できません: HTTP ${page.status}`);
    const html = await page.text();
    const workbookUrl = [...html.matchAll(/href=["']([^"']+\.xlsx(?:\?[^"']*)?)["']/gi)]
      .map((match) => new URL(match[1], source.pageUrl).href)[0];
    if (!workbookUrl) throw new Error(`${year}年度ページにExcelがありません`);
    const workbookResponse = await fetch(workbookUrl);
    if (!workbookResponse.ok) throw new Error(`${year}年度Excelを取得できません: HTTP ${workbookResponse.status}`);
    const path = join(directory, `pref-health-${year}.xlsx`);
    await writeFile(path, Buffer.from(await workbookResponse.arrayBuffer()));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet = workbook.getWorksheet("1(1)") ?? workbook.worksheets.find((item) => item.name.includes("1(1)"));
    if (!sheet) throw new Error(`${year}年度の都道府県シートがありません`);
    const values = {};
    sheet.eachRow((row) => {
      const code = String(row.getCell(2).value ?? "").match(/\d{1,2}/)?.[0]?.padStart(2, "0");
      const name = cellText(row.getCell(3).value).trim();
      if (!code || !/都|道|府|県/.test(name)) return;
      values[code] = { a: ratioValue(row.getCell(5).value), c: ratioValue(row.getCell(6).value) };
    });
    // Older files omit an explicit code column; row order is still JIS prefecture order.
    if (Object.keys(values).length !== 47) {
      for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const name = cellText(row.getCell(3).value).trim();
        if (!/都$|道$|府$|県$/.test(name)) continue;
        const code = String(Object.keys(values).length + 1).padStart(2, "0");
        values[code] = { a: ratioValue(row.getCell(5).value), c: ratioValue(row.getCell(6).value) };
      }
    }
    if (Object.keys(values).length !== 47) throw new Error(`${year}年度の都道府県数が47ではありません: ${Object.keys(values).length}`);
    yearly[year] = { values, source: source.pageUrl };
    sources.push({ year, type: "総務省確報", url: source.pageUrl, publishedAt: source.publishedAt });
  }
  return {
    snapshot: sources.map((source) => source.publishedAt).sort().at(-1),
    source: "総務省『健全化判断比率・資金不足比率（確報）』",
    sourceUrl: sources.at(-1).url,
    sources,
    years: yearly,
  };
}

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") return String(value.result ?? value.text ?? value.richText?.map((part) => part.text).join("") ?? "");
  return String(value);
}
function ratioValue(value) {
  const text = cellText(value).trim();
  if (!text || /^[\-－―ー]+$/.test(text)) return 0;
  const number = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(number) || number < 0) throw new Error(`赤字比率が不正です: ${text}`);
  return number;
}
