import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { parseFlags } from "../_helpers/_io.js";

const VALID_TYPES = new Set(["dom", "canvas", "svg", "media"]);
const CHECKS = [
  "id matches filename",
  "type is valid",
  "tags count is 3-8",
  "description is long enough",
  "params define type/default/desc",
  "create/update/destroy exist",
  "no hardcoded 1920/1080",
  "create uses container.clientWidth/clientHeight",
];

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function extractMethodBody(source, methodName) {
  const match = source.match(new RegExp(`\\b${methodName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\},`, "m"));
  return match ? match[1] : "";
}

function makeCheck(ok, label, detail = "") {
  return { ok, label, detail };
}

function validateParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return { ok: false, detail: "params must be an object" };
  }

  for (const [key, spec] of Object.entries(params)) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      return { ok: false, detail: `params.${key} must be an object` };
    }
    if (!Object.prototype.hasOwnProperty.call(spec, "type")) {
      return { ok: false, detail: `params.${key} missing type` };
    }
    if (!Object.prototype.hasOwnProperty.call(spec, "default")) {
      return { ok: false, detail: `params.${key} missing default` };
    }
    if (typeof spec.desc !== "string" || spec.desc.trim().length === 0) {
      return { ok: false, detail: `params.${key} missing desc` };
    }
  }

  return { ok: true };
}

async function lintSceneFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const sceneModule = await import(pathToFileURL(filePath).href);
  const scene = sceneModule.default ?? {};
  const fileName = path.basename(filePath, ".js");
  const sourceSansComments = stripComments(source);
  const createBody = extractMethodBody(source, "create");

  const paramsCheck = validateParams(scene.params);
  const hasMethods = typeof scene.create === "function"
    && typeof scene.update === "function"
    && typeof scene.destroy === "function"
    && /\bcreate\s*\(/.test(source)
    && /\bupdate\s*\(/.test(source)
    && /\bdestroy\s*\(/.test(source);

  const checks = [
    makeCheck(scene.id === fileName, CHECKS[0], `expected "${fileName}", got "${scene.id ?? ""}"`),
    makeCheck(VALID_TYPES.has(scene.type), CHECKS[1], `got "${scene.type ?? ""}"`),
    makeCheck(Array.isArray(scene.tags) && scene.tags.length >= 3 && scene.tags.length <= 8, CHECKS[2], `got ${Array.isArray(scene.tags) ? scene.tags.length : "non-array"}`),
    makeCheck(typeof scene.description === "string" && scene.description.trim().length > 10, CHECKS[3], `length ${typeof scene.description === "string" ? scene.description.trim().length : 0}`),
    makeCheck(paramsCheck.ok, CHECKS[4], paramsCheck.detail),
    makeCheck(hasMethods, CHECKS[5], "missing exported function or source method"),
    makeCheck(!/\b(?:1920|1080)\b/.test(sourceSansComments), CHECKS[6], "found hardcoded stage size literal"),
    makeCheck(/container\.client(?:Width|Height)/.test(createBody), CHECKS[7], "create() does not read container.clientWidth/clientHeight"),
  ];

  return {
    file: path.basename(filePath),
    ok: checks.every((check) => check.ok),
    checks,
  };
}

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  if (positional.length > 0) {
    process.stderr.write("usage: nextframe lint-scenes\n");
    return 3;
  }

  const scenesDir = path.join(repoRootFromHere(), "runtime/web/src/scenes-v2");
  const files = (await readdir(scenesDir))
    .filter((name) => name.endsWith(".js") && name !== "index.js")
    .sort();

  const results = [];
  for (const file of files) {
    results.push(await lintSceneFile(path.join(scenesDir, file)));
  }

  const failedFiles = results.filter((result) => !result.ok);
  if (flags.json) {
    process.stdout.write(JSON.stringify({
      ok: failedFiles.length === 0,
      files: results,
    }, null, 2) + "\n");
  } else {
    for (const result of results) {
      process.stdout.write(`${result.file} ${result.ok ? "OK" : "FAIL"}\n`);
      for (const check of result.checks) {
        const suffix = check.ok || !check.detail ? "" : ` (${check.detail})`;
        process.stdout.write(`  ${check.ok ? "PASS" : "FAIL"} ${check.label}${suffix}\n`);
      }
    }
    process.stdout.write(`\nSummary: ${results.length - failedFiles.length}/${results.length} files passed\n`);
  }

  return failedFiles.length === 0 ? 0 : 2;
}
