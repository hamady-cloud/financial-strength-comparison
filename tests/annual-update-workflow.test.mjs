import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/annual-data-update.yml", import.meta.url), "utf8");
const annualScript = await readFile(new URL("../scripts/prepare-annual-update.mjs", import.meta.url), "utf8");

test("annual workflow has scheduled and manual entry points", () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron: "17 18 30 6 \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /force:/);
  assert.match(workflow, /health_page:/);
});

test("annual workflow pins current official GitHub actions and uses least required writes", () => {
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /issues: write/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40} # v6\.0\.2/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40} # v6\.4\.0/);
  assert.match(workflow, /actions\/github-script@[0-9a-f]{40} # v9\.0\.0/);
});

test("annual workflow validates before committing and reports failures", () => {
  const updatePosition = workflow.indexOf("npm run data:update:annual");
  const testPosition = workflow.indexOf("npm test");
  const commitPosition = workflow.indexOf("git commit");
  assert.ok(updatePosition >= 0 && testPosition > updatePosition && commitPosition > testPosition);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /issues\.create/);
});

test("annual preparation restores files when no new semantic data exists", () => {
  assert.match(annualScript, /normalizedJson/);
  assert.match(annualScript, /delete value\.generatedAt/);
  assert.match(annualScript, /restoreOriginals/);
  assert.match(annualScript, /after\.municipal !== after\.prefectural/);
  assert.match(annualScript, /update-official-data\.mjs/);
  assert.match(annualScript, /update-prefectural-data\.mjs/);
});
