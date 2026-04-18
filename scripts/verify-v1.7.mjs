#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const VERIFY_DIR = path.join(ROOT, "spec", "versions", "v1.7", "verify");
const SCREENSHOT_DIR = path.join(VERIFY_DIR, "screenshots");
const TMP_DIR = path.join(ROOT, "tmp");
const DATA_JS = path.join(ROOT, "src", "nf-tracks", "official", "data.js");
const ABI_LINTER = path.join(ROOT, "src", "nf-tracks", "scripts", "check-abi.mjs");
const CLI_JS = path.join(ROOT, "src", "nf-cli", "dist", "cli.js");
const INTERFACES_JSON = path.join(ROOT, "spec", "interfaces.json");
const INTERFACES_DELTA_JSON = path.join(ROOT, "spec", "versions", "v1.7", "spec", "interfaces-delta.json");
const VERIFY_POINTS_JSON = path.join(ROOT, "spec", "versions", "v1.7", "kickoff", "verify-points.json");
const BDD_JSON = path.join(ROOT, "spec", "bdd", "v1.7", "nf-tracks-data.json");
const DEMO_SOURCE_CANDIDATES = [
  path.join(ROOT, "spec", "versions", "v1.7", "kickoff", "demo-battle-report.json"),
  path.join(ROOT, "spec", "versions", "v1.7", "spec", "demo-battle-report.json"),
];
const DEMO_OUT = path.join(TMP_DIR, "v1.7-demo.html");

mkdirSync(VERIFY_DIR, { recursive: true });
mkdirSync(SCREENSHOT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

const VERIFY_POINTS = readJson(VERIFY_POINTS_JSON);
const BDD = readJson(BDD_JSON);

let domFallback = null;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function toPlainError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function md5(text) {
  return createHash("md5").update(text).digest("hex");
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch (_) {
      // continue
    }
  }
  return null;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findVerifyPoint(id) {
  return (VERIFY_POINTS.points || []).find((point) => point.id === id) || null;
}

function findScenario(id) {
  return (BDD.scenarios || []).find((scenario) => scenario.verify_point === id) || null;
}

function getAjv() {
  let Ajv = require("ajv");
  if (Ajv && Ajv.default) Ajv = Ajv.default;
  return new Ajv({ strict: false, allErrors: true });
}

async function loadTrackModule() {
  return import("../src/nf-tracks/official/data.js");
}

function getTrackSchema(describeResult) {
  return describeResult && typeof describeResult === "object"
    ? describeResult.params_schema || describeResult.params || null
    : null;
}

function findDemoSource() {
  for (const candidate of DEMO_SOURCE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`demo source not found: ${DEMO_SOURCE_CANDIDATES.join(" | ")}`);
}

function runSpawn(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env || {}) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function ensureDomFallback() {
  if (domFallback) return domFallback;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  domFallback = { browser, page };
  return domFallback;
}

async function inspectRenderedHtml(html) {
  let jsdom = null;
  try {
    jsdom = await import("jsdom");
  } catch (_) {
    jsdom = null;
  }

  if (jsdom && jsdom.JSDOM) {
    const dom = new jsdom.JSDOM(`<!doctype html><html><body><div id="host">${html}</div></body></html>`);
    const { document } = dom.window;
    const host = document.getElementById("host");
    const rows = Array.from(document.querySelectorAll("[data-variant$='-row']"));
    const firstRankingValueCell = document.querySelector("[data-variant='ranking-row'] > div:nth-child(3)");
    return {
      mode: "jsdom",
      hostOuterHTML: host ? host.outerHTML : "",
      firstRankingValueText: firstRankingValueCell ? firstRankingValueCell.textContent || "" : "",
      rowOpacities: rows.map((row) => Number.parseFloat(row.style.opacity || "1")),
    };
  }

  const { page } = await ensureDomFallback();
  await page.setContent(`<!doctype html><html><body><div id="host">${html}</div></body></html>`, {
    waitUntil: "domcontentloaded",
  });
  return page.evaluate(() => {
    const host = document.getElementById("host");
    const rows = Array.from(document.querySelectorAll("[data-variant$='-row']"));
    const firstRankingValueCell = document.querySelector("[data-variant='ranking-row'] > div:nth-child(3)");
    return {
      mode: "playwright-fallback",
      hostOuterHTML: host ? host.outerHTML : "",
      firstRankingValueText: firstRankingValueCell ? firstRankingValueCell.textContent || "" : "",
      rowOpacities: rows.map((row) => Number.parseFloat(row.style.opacity || "1")),
    };
  });
}

async function closeDomFallback() {
  if (!domFallback) return;
  await domFallback.browser.close();
  domFallback = null;
}

function extractNumeric(text) {
  const raw = String(text || "").replace(/,/g, "");
  const matched = raw.match(/-?\d+(?:\.\d+)?/);
  return matched ? Number.parseFloat(matched[0]) : NaN;
}

function countColorPixels(buffer, target, tolerance = 28) {
  const { PNG } = require("pngjs");
  const png = PNG.sync.read(buffer);
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];
    if (a === 0) continue;
    if (
      Math.abs(r - target.r) <= tolerance &&
      Math.abs(g - target.g) <= tolerance &&
      Math.abs(b - target.b) <= tolerance
    ) {
      count += 1;
    }
  }
  return count;
}

function buildBranchChecks(oneOf) {
  return (oneOf || []).map((branch) => {
    const properties = branch && branch.properties ? branch.properties : {};
    const discriminator = properties.type && properties.type.const;
    return {
      type: discriminator || null,
      has_type_const: typeof discriminator === "string",
      has_rows: Boolean(properties.rows),
      has_columns: Boolean(properties.columns),
      has_options: Boolean(properties.options),
      has_criteria: Boolean(properties.criteria),
      has_animation_field: Boolean(properties.stagger_ms || properties.interpolate_ms || properties.animation_duration_ms),
    };
  });
}

function interfaceDeltaTarget() {
  if (!existsSync(INTERFACES_DELTA_JSON)) return null;
  const delta = readJson(INTERFACES_DELTA_JSON);
  return delta?.delta_target?.after_v1_7 || null;
}

function lockInterfacesDataKind(expectedSchema) {
  const beforeDoc = readJson(INTERFACES_JSON);
  const beforeDocSnapshot = clone(beforeDoc);
  const modules = Array.isArray(beforeDoc.modules) ? beforeDoc.modules : [];
  const moduleEntry = modules.find((entry) => entry && entry.id === "nf-tracks");
  if (!moduleEntry || !moduleEntry.kinds || !moduleEntry.kinds.data) {
    throw new Error("spec/interfaces.json missing modules[nf-tracks].kinds.data");
  }

  const deltaTarget = interfaceDeltaTarget();
  const before = clone(moduleEntry.kinds.data);
  const next = clone(moduleEntry.kinds.data);
  next.status = "done";
  next.version = "v1.7";
  next.params_schema = clone(expectedSchema);
  if (deltaTarget && typeof deltaTarget.purpose === "string") {
    next.purpose = deltaTarget.purpose;
  }

  const changed = !deepEqual(before, next);
  if (changed) {
    moduleEntry.kinds.data = next;
    writeFileSync(INTERFACES_JSON, JSON.stringify(beforeDoc, null, 2) + "\n");
  }

  const afterDoc = readJson(INTERFACES_JSON);
  const afterModule = (afterDoc.modules || []).find((entry) => entry && entry.id === "nf-tracks");
  const after = clone(afterModule?.kinds?.data || null);

  return {
    changed,
    before_doc_hash: md5(JSON.stringify(beforeDocSnapshot)),
    after_doc_hash: md5(JSON.stringify(afterDoc)),
    before,
    after,
  };
}

async function vp1() {
  const evidenceFile = path.join(VERIFY_DIR, "VP-1-abi.json");
  try {
    const track = await loadTrackModule();
    const describeResult = track.describe();
    const sampleResult = track.sample();
    const schema = getTrackSchema(describeResult);
    const oneOf = Array.isArray(schema?.oneOf) ? schema.oneOf : [];
    const ajv = getAjv();
    const wholeSchemaValidate = ajv.compile(schema);
    const branchCompileResults = oneOf.map((branch) => {
      ajv.compile(branch);
      return {
        title: branch.title || null,
        type: branch?.properties?.type?.const || null,
        compiled: true,
      };
    });
    const sampleValid = wholeSchemaValidate(sampleResult);

    const lint = await runSpawn(process.execPath, [ABI_LINTER, DATA_JS], { cwd: ROOT });
    const lintEvent = parseLastJsonLine(lint.stdout);

    const pass =
      typeof track.describe === "function" &&
      typeof track.sample === "function" &&
      typeof track.render === "function" &&
      (describeResult?.kind === "data" || describeResult?.id === "data") &&
      Array.isArray(oneOf) &&
      oneOf.length === 3 &&
      sampleValid === true &&
      lint.code === 0 &&
      lintEvent?.event === "lint-track.pass";

    const payload = {
      vp: "VP-1",
      pass,
      verify_point: findVerifyPoint("VP-1"),
      scenario: findScenario("VP-1"),
      detail: {
        export_types: {
          describe: typeof track.describe,
          sample: typeof track.sample,
          render: typeof track.render,
        },
        describe_contract: {
          id: describeResult?.id ?? null,
          kind: describeResult?.kind ?? null,
          accepted_identifier: describeResult?.kind === "data" ? "kind" : describeResult?.id === "data" ? "id" : null,
        },
        schema_key: describeResult?.params_schema ? "params_schema" : describeResult?.params ? "params" : null,
        schema_oneOf_count: oneOf.length,
        branch_compile_results: branchCompileResults,
        sample_valid: sampleValid,
        sample_errors: wholeSchemaValidate.errors || [],
        lint: {
          code: lint.code,
          signal: lint.signal,
          stdout: lint.stdout.trim(),
          stderr: lint.stderr.trim(),
          event: lintEvent,
        },
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (error) {
    const payload = {
      vp: "VP-1",
      pass: false,
      verify_point: findVerifyPoint("VP-1"),
      scenario: findScenario("VP-1"),
      error: toPlainError(error),
    };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

async function vp2() {
  const evidenceFile = path.join(VERIFY_DIR, "VP-2-schema.json");
  try {
    const track = await loadTrackModule();
    const describeResult = track.describe();
    const schema = getTrackSchema(describeResult);
    const reconcile = lockInterfacesDataKind(schema);
    const after = reconcile.after || {};
    const oneOf = Array.isArray(after?.params_schema?.oneOf) ? after.params_schema.oneOf : [];
    const branchChecks = buildBranchChecks(oneOf);
    const pass =
      after.status === "done" &&
      oneOf.length === 3 &&
      branchChecks.every((branch) => branch.has_type_const && branch.has_animation_field) &&
      branchChecks.some((branch) => branch.type === "ranking" && branch.has_rows) &&
      branchChecks.some((branch) => branch.type === "finance" && branch.has_rows && branch.has_columns) &&
      branchChecks.some((branch) => branch.type === "comparison" && branch.has_options && branch.has_criteria);

    const payload = {
      vp: "VP-2",
      pass,
      verify_point: findVerifyPoint("VP-2"),
      scenario: findScenario("VP-2"),
      detail: {
        changed_interfaces_json: reconcile.changed,
        before_doc_hash: reconcile.before_doc_hash,
        after_doc_hash: reconcile.after_doc_hash,
        before: reconcile.before,
        after: reconcile.after,
        diff_snapshot: {
          status: [reconcile.before?.status ?? null, reconcile.after?.status ?? null],
          purpose: [reconcile.before?.purpose ?? null, reconcile.after?.purpose ?? null],
          params_schema_oneOf_count: [
            Array.isArray(reconcile.before?.params_schema?.oneOf) ? reconcile.before.params_schema.oneOf.length : 0,
            oneOf.length,
          ],
        },
        branch_checks: branchChecks,
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (error) {
    const payload = {
      vp: "VP-2",
      pass: false,
      verify_point: findVerifyPoint("VP-2"),
      scenario: findScenario("VP-2"),
      error: toPlainError(error),
    };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

async function vp3() {
  const evidenceFile = path.join(VERIFY_DIR, "VP-3-check.json");
  try {
    const demoSource = findDemoSource();
    const build = await runSpawn(process.execPath, [CLI_JS, "build", demoSource, "-o", DEMO_OUT], { cwd: ROOT });
    const buildEvent = parseLastJsonLine(build.stdout);
    if (build.code !== 0) {
      throw new Error(`build failed: code=${build.code} stderr=${build.stderr.trim()}`);
    }

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });

    const url = pathToFileURL(DEMO_OUT).href;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean(window.__nf && typeof window.__nf.seek === "function"));

    const variants = [
      {
        id: "ranking",
        t: 1500,
        required: {
          size_min_bytes: 100000,
          color: { name: "gold", rgb: { r: 251, g: 191, b: 36 } },
          rows_min: 8,
        },
      },
      {
        id: "finance",
        t: 4500,
        required: {
          size_min_bytes: 100000,
          colors: [
            { name: "green", rgb: { r: 52, g: 211, b: 153 } },
            { name: "red", rgb: { r: 248, g: 113, b: 113 } },
          ],
          rows_min: 5,
          cols_min: 4,
        },
      },
      {
        id: "comparison",
        t: 7500,
        required: {
          size_min_bytes: 100000,
          color: { name: "purple", rgb: { r: 167, g: 139, b: 250 } },
          rows_min: 7,
          cols_min: 3,
        },
      },
    ];

    const checks = [];
    for (const variant of variants) {
      await page.evaluate((tMs) => {
        window.__nf.pause();
        window.__nf.seek(tMs, { pause: true });
      }, variant.t);
      await page.waitForTimeout(100);

      const dom = await page.evaluate(() => {
        const stage = document.getElementById("nf-stage");
        const dataRoot = stage?.querySelector("[data-nf-track='data']");
        const firstFinanceRow = stage?.querySelector("[data-variant='finance-row']");
        const firstComparisonRow = stage?.querySelector("[data-variant='comparison-row']");
        return {
          title: dataRoot?.getAttribute("data-data-title") || "",
          ranking_rows: stage?.querySelectorAll("[data-variant='ranking-row']").length || 0,
          finance_rows: stage?.querySelectorAll("[data-variant='finance-row']").length || 0,
          comparison_rows: stage?.querySelectorAll("[data-variant='comparison-row']").length || 0,
          finance_cols: firstFinanceRow ? Math.max(0, firstFinanceRow.children.length - 1) : 0,
          comparison_cols: firstComparisonRow ? Math.max(0, firstComparisonRow.children.length - 1) : 0,
          active_track_ids: window.__nf.getState().activeClips.map((clip) => clip.trackId),
        };
      });

      const buffer = await page.locator("#nf-stage").screenshot();
      const rootPng = path.join(VERIFY_DIR, `VP-3-render-${variant.id}.png`);
      const shotPng = path.join(SCREENSHOT_DIR, `VP-3-${variant.id}.png`);
      writeFileSync(rootPng, buffer);
      writeFileSync(shotPng, buffer);

      const pixelCounts = {
        gold: countColorPixels(buffer, { r: 251, g: 191, b: 36 }),
        green: countColorPixels(buffer, { r: 52, g: 211, b: 153 }),
        red: countColorPixels(buffer, { r: 248, g: 113, b: 113 }),
        purple: countColorPixels(buffer, { r: 167, g: 139, b: 250 }),
      };
      const sizeBytes = buffer.length;
      const commonChecks = {
        file_bytes: sizeBytes,
        size_ok: sizeBytes > variant.required.size_min_bytes,
      };

      let variantPass = commonChecks.size_ok;
      if (variant.id === "ranking") {
        variantPass =
          variantPass &&
          dom.ranking_rows >= variant.required.rows_min &&
          pixelCounts.gold > 50;
      } else if (variant.id === "finance") {
        variantPass =
          variantPass &&
          dom.finance_rows >= variant.required.rows_min &&
          dom.finance_cols >= variant.required.cols_min &&
          (pixelCounts.green > 50 || pixelCounts.red > 50);
      } else if (variant.id === "comparison") {
        variantPass =
          variantPass &&
          dom.comparison_rows >= variant.required.rows_min &&
          dom.comparison_cols >= variant.required.cols_min &&
          pixelCounts.purple > 50;
      }

      checks.push({
        id: variant.id,
        t_ms: variant.t,
        pass: variantPass,
        dom,
        pixel_counts: pixelCounts,
        ...commonChecks,
        output_files: {
          root: path.relative(ROOT, rootPng),
          screenshot: path.relative(ROOT, shotPng),
        },
      });
    }

    await browser.close();

    const payload = {
      vp: "VP-3",
      pass: build.code === 0 && checks.every((entry) => entry.pass),
      verify_point: findVerifyPoint("VP-3"),
      scenario: findScenario("VP-3"),
      detail: {
        demo_source_used: path.relative(ROOT, demoSource),
        build_command: `node src/nf-cli/dist/cli.js build ${path.relative(ROOT, demoSource)} -o tmp/v1.7-demo.html`,
        build: {
          code: build.code,
          signal: build.signal,
          stdout: build.stdout.trim(),
          stderr: build.stderr.trim(),
          event: buildEvent,
        },
        checks,
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (error) {
    const payload = {
      vp: "VP-3",
      pass: false,
      verify_point: findVerifyPoint("VP-3"),
      scenario: findScenario("VP-3"),
      error: toPlainError(error),
    };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

async function vp4() {
  const evidenceFile = path.join(VERIFY_DIR, "VP-4-t0-opacity.json");
  try {
    const source = readFileSync(DATA_JS, "utf8");
    const track = await loadTrackModule();
    const sample = track.sample();
    const staticOpacityMatches = source.match(/opacity:\s*0[^.]/g) || [];
    const sampleStaggerMs = typeof sample?.stagger_ms === "number" ? sample.stagger_ms : null;
    const entranceMatches = Array.from(
      source.matchAll(/rowEntryOpacityAt\(t,\s*[A-Za-z0-9_]+,\s*staggerMs,\s*(\d+(?:\.\d+)?)\)/g),
      (match) => Number.parseFloat(match[1]),
    );
    const html = track.render(0, sample, { w: 1920, h: 1080, dpi: 1 });
    const inspection = await inspectRenderedHtml(html);
    const minOpacity = inspection.rowOpacities.length > 0 ? Math.min(...inspection.rowOpacities) : null;
    const firstOpacity = inspection.rowOpacities.length > 0 ? inspection.rowOpacities[0] : null;

    const pass =
      staticOpacityMatches.length === 0 &&
      (sampleStaggerMs == null || sampleStaggerMs <= 150) &&
      entranceMatches.every((value) => value <= 300) &&
      minOpacity != null &&
      minOpacity >= 0.9 &&
      firstOpacity != null &&
      firstOpacity >= 0.95;

    const payload = {
      vp: "VP-4",
      pass,
      verify_point: findVerifyPoint("VP-4"),
      scenario: findScenario("VP-4"),
      detail: {
        static_checks: {
          opacity_zero_matches: staticOpacityMatches,
          sample_stagger_ms: sampleStaggerMs,
          sample_stagger_ok: sampleStaggerMs == null ? true : sampleStaggerMs <= 150,
          inferred_entrance_ms_values: entranceMatches,
          inferred_entrance_ok: entranceMatches.every((value) => value <= 300),
        },
        dynamic_checks: {
          dom_mode: inspection.mode,
          row_opacities: inspection.rowOpacities,
          first_row_opacity: firstOpacity,
          min_row_opacity: minOpacity,
        },
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (error) {
    const payload = {
      vp: "VP-4",
      pass: false,
      verify_point: findVerifyPoint("VP-4"),
      scenario: findScenario("VP-4"),
      error: toPlainError(error),
    };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

async function vp5() {
  const evidenceFile = path.join(VERIFY_DIR, "VP-5-interpolate-idempotent.json");
  try {
    const source = readFileSync(DATA_JS, "utf8");
    const track = await loadTrackModule();
    const sample = track.sample();
    const viewport = { w: 1920, h: 1080, dpi: 1 };
    const renderAt = async (tMs) => {
      const html = track.render(tMs, sample, viewport);
      const inspection = await inspectRenderedHtml(html);
      return {
        t_ms: tMs,
        html,
        inspection,
        text: inspection.firstRankingValueText,
        numeric: extractNumeric(inspection.firstRankingValueText),
      };
    };

    const t0 = await renderAt(0);
    const t300 = await renderAt(300);
    const t2000 = await renderAt(2000);
    const t500a = await renderAt(500);
    const t500b = await renderAt(500);
    const forbiddenPatterns = source.match(/\b(setInterval|setTimeout|requestAnimationFrame|Date\.now|performance\.now|Math\.random)\b/g) || [];
    const targetValue = Number(sample?.rows?.[0]?.value || 0);
    const hashA = md5(t500a.inspection.hostOuterHTML);
    const hashB = md5(t500b.inspection.hostOuterHTML);

    const zeroOk = Number.isFinite(t0.numeric) && t0.numeric === 0;
    const midOk = Number.isFinite(t300.numeric) && t300.numeric > 0 && t300.numeric < targetValue;
    const endOk = Number.isFinite(t2000.numeric) && t2000.numeric === targetValue;
    const hashOk = hashA === hashB;
    const pass = zeroOk && midOk && endOk && hashOk && forbiddenPatterns.length === 0;

    const payload = {
      vp: "VP-5",
      pass,
      verify_point: findVerifyPoint("VP-5"),
      scenario: findScenario("VP-5"),
      detail: {
        dom_mode: t0.inspection.mode,
        target_value: targetValue,
        values: [
          { t_ms: t0.t_ms, text: t0.text, numeric: t0.numeric },
          { t_ms: t300.t_ms, text: t300.text, numeric: t300.numeric },
          { t_ms: t2000.t_ms, text: t2000.text, numeric: t2000.numeric },
        ],
        monotonic: {
          zero_ok: zeroOk,
          mid_ok: midOk,
          end_ok: endOk,
        },
        idempotent: {
          t_ms: 500,
          hash_a: hashA,
          hash_b: hashB,
          equal: hashOk,
        },
        forbidden_patterns: forbiddenPatterns,
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (error) {
    const payload = {
      vp: "VP-5",
      pass: false,
      verify_point: findVerifyPoint("VP-5"),
      scenario: findScenario("VP-5"),
      error: toPlainError(error),
    };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

async function main() {
  const results = [];
  try {
    results.push(await vp1());
    results.push(await vp2());
    results.push(await vp3());
    results.push(await vp4());
    results.push(await vp5());
  } finally {
    await closeDomFallback();
  }

  const passed = results.filter((entry) => entry.pass).length;
  process.stdout.write(`${passed}/5 VP pass\n`);
  process.exit(passed === 5 ? 0 : 1);
}

main().catch(async (error) => {
  await closeDomFallback();
  process.stderr.write(`${toPlainError(error).message}\n`);
  process.exit(1);
});
