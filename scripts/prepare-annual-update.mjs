import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedFiles = [
  "public/official-data.json",
  "app/official-data-meta.json",
  "public/prefectural-data.json",
  "app/prefectural-data-meta.json",
];
const originals = new Map(await Promise.all(generatedFiles.map(async (path) => [path, await readFile(join(projectDir, path), "utf8")])));
const before = readYears(originals.get("public/official-data.json"), originals.get("public/prefectural-data.json"));
const force = /^(1|true|yes)$/i.test(process.env.FORCE_UPDATE ?? "");
const healthPage = (process.env.HEALTH_PAGE_URL ?? "").trim();
const healthPublishedAt = (process.env.HEALTH_PUBLISHED_AT ?? "").trim();

if (healthPage || healthPublishedAt) {
  if (!healthPage || !healthPublishedAt) throw new Error("確報ページURLと公表日は両方入力してください。");
  const url = new URL(healthPage);
  if (url.protocol !== "https:" || !(url.hostname === "soumu.go.jp" || url.hostname.endsWith(".soumu.go.jp"))) {
    throw new Error("確報ページには総務省（soumu.go.jp）のHTTPS URLを指定してください。");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(healthPublishedAt)) throw new Error("公表日は YYYY-MM-DD 形式で指定してください。");
}

try {
  const healthArguments = healthPage ? ["--health-page", healthPage, "--health-published-at", healthPublishedAt] : [];
  runNode("scripts/update-official-data.mjs", healthArguments);
  runNode("scripts/update-prefectural-data.mjs", healthArguments);

  const currentMunicipal = await readFile(join(projectDir, "public/official-data.json"), "utf8");
  const currentPrefectural = await readFile(join(projectDir, "public/prefectural-data.json"), "utf8");
  const after = readYears(currentMunicipal, currentPrefectural);
  if (after.municipal !== after.prefectural) {
    throw new Error(`市町村版と都道府県版の最新年度が一致しません: ${after.municipal} / ${after.prefectural}`);
  }

  const semanticChange = await hasSemanticChange(originals);
  const newerYear = after.municipal > before.municipal;
  if (!semanticChange || (!newerYear && !force)) {
    await restoreOriginals(originals);
    console.log(
      semanticChange
        ? `最新年度は${after.municipal}年度のままです。FORCE_UPDATEが無効のため変更しません。`
        : `公開データに実質的な変更はありません（最新${after.municipal}年度）。`,
    );
  } else {
    console.log(`${after.municipal}年度の${newerYear ? "新年度" : "訂正版"}データを検出しました。`);
  }
} finally {
  await Promise.all([
    rm(join(projectDir, "public/official-data.json.previous"), { force: true }),
    rm(join(projectDir, "public/prefectural-data.json.previous"), { force: true }),
  ]);
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [join(projectDir, script), ...args], {
    cwd: projectDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`${script} が失敗しました。`);
}

function readYears(municipalText, prefecturalText) {
  const municipal = JSON.parse(municipalText).years?.at(-1);
  const prefectural = JSON.parse(prefecturalText).years?.at(-1);
  if (!Number.isInteger(municipal) || !Number.isInteger(prefectural)) throw new Error("最新年度を読み取れません。");
  return { municipal, prefectural };
}

async function hasSemanticChange(beforeFiles) {
  for (const path of generatedFiles) {
    const before = normalizedJson(beforeFiles.get(path));
    const after = normalizedJson(await readFile(join(projectDir, path), "utf8"));
    if (before !== after) return true;
  }
  return false;
}

function normalizedJson(text) {
  const value = JSON.parse(text);
  delete value.generatedAt;
  return JSON.stringify(value);
}

async function restoreOriginals(files) {
  await Promise.all([...files].map(([path, contents]) => writeFile(join(projectDir, path), contents, "utf8")));
}
