#!/usr/bin/env node
// scripts/check-abi.mjs
// Lint CLI for nf-tracks: runs 6 ABI gates over a single Track .js file.
//
//   Usage:  node check-abi.mjs <path-to-track.js>
//
//   Output: JSON-only (rule-ai-operable). One line on success:
//     {"event":"lint-track.pass","file":"<abs>","gates":6}
//   One line on failure:
//     {"event":"lint-track.fail","file":"<abs>","failed_gate":"<name>","details":"..."}
//
//   Gates:
//     1. single-file            — file is self-contained, readable
//     2. zero-import            — regex scan: no import / require / await import
//     3. three-exports          — source defines describe / sample / render
//     4. describe-schema-valid  — describe().params is a valid JSON Schema draft-07
//     5. sample-passes-describe — sample() conforms to describe().params
//     6. t0-gate                — render(0, sample(), vp) max opacity >= 0.9
//
// Exits 0 on pass, non-zero (matches interfaces.json exit_codes) on fail:
//   1 = bad args / missing file
//   2 = ABI violation

import { readFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// --- output helpers -------------------------------------------------------

function emitPass(file) {
  process.stdout.write(
    JSON.stringify({ event: "lint-track.pass", file, gates: 6 }) + "\n",
  );
}

function emitFail(file, gate, details) {
  process.stdout.write(
    JSON.stringify({
      event: "lint-track.fail",
      file,
      failed_gate: gate,
      details: String(details),
    }) + "\n",
  );
}

// --- gate implementations -------------------------------------------------

// Gate 2: zero-import — scan source text
const IMPORT_RE = /^\s*(import\b|require\s*\(|await\s+import\s*\()/m;

function checkZeroImport(source) {
  const m = source.match(IMPORT_RE);
  if (m) {
    return {
      ok: false,
      details:
        "forbidden statement detected: '" +
        m[0].trim() +
        "' at offset " +
        m.index,
    };
  }
  return { ok: true };
}

// Gate 3: three-exports — detect via source pattern (each export function)
function checkThreeExports(source) {
  const needed = ["describe", "sample", "render"];
  const missing = [];
  for (const name of needed) {
    const re = new RegExp(
      "export\\s+function\\s+" + name + "\\s*\\(",
      "m",
    );
    if (!re.test(source)) missing.push(name);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      details: "missing export(s): " + missing.join(", "),
    };
  }
  return { ok: true };
}

// Load the track by rewriting `export function` → `function`; mirrors the
// ABI loader in abi/index.js but kept self-contained so the linter can run
// even when the package is partially broken.
function loadTrackFromSource(source) {
  const rewritten = source.replace(
    /^(\s*)export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    (_m, indent, name) => indent + "function " + name + "(",
  );
  const body =
    '"use strict";\n' +
    rewritten +
    "\nconst __e = {};\n" +
    "if (typeof describe === 'function') __e.describe = describe;\n" +
    "if (typeof sample === 'function') __e.sample = sample;\n" +
    "if (typeof render === 'function') __e.render = render;\n" +
    "return __e;\n";
  // eslint-disable-next-line no-new-func
  const fn = new Function(body);
  return fn();
}

// Gate 4: describe-schema-valid — Ajv meta-schema validation (draft-07)
function checkDescribeSchema(ajv, describeRes) {
  if (!describeRes || typeof describeRes !== "object") {
    return { ok: false, details: "describe() did not return an object" };
  }
  if (!describeRes.params || typeof describeRes.params !== "object") {
    return { ok: false, details: "describe().params missing or not object" };
  }
  if (typeof describeRes.t0_visibility !== "number") {
    return {
      ok: false,
      details: "describe().t0_visibility must be a number",
    };
  }
  if (describeRes.t0_visibility < 0.9) {
    return {
      ok: false,
      details:
        "describe().t0_visibility = " +
        describeRes.t0_visibility +
        " < 0.9 (FM-T0)",
    };
  }
  // compile the params schema — Ajv will check draft-07 compliance
  try {
    ajv.compile(describeRes.params);
  } catch (e) {
    return {
      ok: false,
      details: "describe().params is not valid JSON Schema: " + e.message,
    };
  }
  return { ok: true };
}

// Gate 5: sample() must conform to describe().params
function checkSamplePassesDescribe(ajv, describeRes, sampleRes) {
  const validate = ajv.compile(describeRes.params);
  const ok = validate(sampleRes);
  if (!ok) {
    return {
      ok: false,
      details:
        "sample() violates describe().params: " +
        JSON.stringify(validate.errors),
    };
  }
  return { ok: true };
}

// Gate 6: t0-gate — render at t=0 must yield opacity >= 0.9
function checkT0Gate(render, sampleRes) {
  let html;
  try {
    html = render(0, sampleRes, { w: 1920, h: 1080 });
  } catch (e) {
    return { ok: false, details: "render(0,...) threw: " + e.message };
  }
  if (typeof html !== "string" || html.length === 0) {
    return {
      ok: false,
      details: "render(0,...) returned non-string or empty",
    };
  }
  const opacities = [];
  const re = /opacity:\s*([0-9.]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v)) opacities.push(v);
  }
  if (opacities.length === 0) {
    return {
      ok: false,
      details:
        "no 'opacity:' declaration found in render(0,...) HTML (FM-T0 unmeasurable)",
    };
  }
  const max = Math.max(...opacities);
  if (max < 0.9) {
    return {
      ok: false,
      details:
        "max opacity at t=0 = " +
        max.toFixed(4) +
        " < 0.9 (FM-T0 gate)",
    };
  }
  return { ok: true };
}

// --- main -----------------------------------------------------------------

async function main() {
  const argPath = process.argv[2];
  if (!argPath) {
    emitFail("", "single-file", "usage: node check-abi.mjs <path>");
    process.exit(1);
  }
  const filePath = isAbsolute(argPath) ? argPath : resolve(process.cwd(), argPath);

  // Gate 1: single-file / readable
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (e) {
    emitFail(filePath, "single-file", "cannot read file: " + e.message);
    process.exit(1);
  }
  if (!source || source.length === 0) {
    emitFail(filePath, "single-file", "file is empty");
    process.exit(2);
  }

  // Gate 2: zero-import
  const g2 = checkZeroImport(source);
  if (!g2.ok) {
    emitFail(filePath, "zero-import", g2.details);
    process.exit(2);
  }

  // Gate 3: three-exports (source-level)
  const g3 = checkThreeExports(source);
  if (!g3.ok) {
    emitFail(filePath, "three-exports", g3.details);
    process.exit(2);
  }

  // Load (needed for gates 4-6)
  let exp;
  try {
    exp = loadTrackFromSource(source);
  } catch (e) {
    emitFail(filePath, "three-exports", "source failed to parse: " + e.message);
    process.exit(2);
  }
  if (
    typeof exp.describe !== "function" ||
    typeof exp.sample !== "function" ||
    typeof exp.render !== "function"
  ) {
    emitFail(
      filePath,
      "three-exports",
      "one or more exports not callable after eval",
    );
    process.exit(2);
  }

  // Ajv setup
  let Ajv;
  try {
    Ajv = require("ajv");
    if (Ajv && Ajv.default) Ajv = Ajv.default;
  } catch (e) {
    emitFail(
      filePath,
      "describe-schema-valid",
      "ajv not installed: " + e.message,
    );
    process.exit(2);
  }
  const ajv = new Ajv({ strict: false, allErrors: true });

  // Gate 4: describe-schema-valid
  let describeRes;
  try {
    describeRes = exp.describe();
  } catch (e) {
    emitFail(filePath, "describe-schema-valid", "describe() threw: " + e.message);
    process.exit(2);
  }
  const g4 = checkDescribeSchema(ajv, describeRes);
  if (!g4.ok) {
    emitFail(filePath, "describe-schema-valid", g4.details);
    process.exit(2);
  }

  // Gate 5: sample-passes-describe
  let sampleRes;
  try {
    sampleRes = exp.sample();
  } catch (e) {
    emitFail(filePath, "sample-passes-describe", "sample() threw: " + e.message);
    process.exit(2);
  }
  const g5 = checkSamplePassesDescribe(ajv, describeRes, sampleRes);
  if (!g5.ok) {
    emitFail(filePath, "sample-passes-describe", g5.details);
    process.exit(2);
  }

  // Gate 6: t0-gate
  const g6 = checkT0Gate(exp.render, sampleRes);
  if (!g6.ok) {
    emitFail(filePath, "t0-gate", g6.details);
    process.exit(2);
  }

  emitPass(filePath);
  process.exit(0);
}

main().catch((e) => {
  process.stdout.write(
    JSON.stringify({
      event: "lint-track.fail",
      file: "",
      failed_gate: "internal",
      details: String(e && e.message ? e.message : e),
    }) + "\n",
  );
  process.exit(3);
});
