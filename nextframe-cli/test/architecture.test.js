import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { REGISTRY, SCENE_IDS, META_TABLE } from "../src/scenes/index.js";
import { TOOLS } from "../src/ai/tools.js";
import { validateTimeline } from "../src/engine/validate.js";
import { resolveTimeline } from "../src/engine/time.js";
import { renderAt } from "../src/engine/render.js";
import { addClip, moveClip } from "../src/timeline/ops.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC_ROOT = resolve(ROOT, "src");
const PREVIEW_ROOT = resolve(ROOT, "preview");
const IMPORT_RE = /^\s*import\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gm;
const REQUIRED_SUBCOMMANDS = ["new", "validate", "frame", "render", "bake-html", "bake-video", "describe", "gantt", "scenes", "add-clip", "move-clip", "resize-clip", "remove-clip", "set-param"];

test("arch-1 layer graph", () => {
  const files = [...walk(resolve(ROOT, "src"), [".js"]), ...walk(resolve(ROOT, "preview"), [".js", ".mjs"])];
  const violations = [];
  for (const absPath of files) {
    const rel = toRoot(absPath);
    const code = stripComments(readFileSync(absPath, "utf8"));
    for (const match of code.matchAll(IMPORT_RE)) {
      const spec = match[1] || match[2];
      const line = lineNumber(code, match.index || 0);
      if (!isAllowedImport(rel, spec)) {
        violations.push(`${rel}:${line} imports "${spec}" and breaks ${ruleFor(rel)}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("arch-2 scene contract", () => {
  const scenesDir = resolve(ROOT, "src/scenes");
  const indexSource = readFileSync(resolve(scenesDir, "index.js"), "utf8");
  for (const absPath of walk(scenesDir, [".js"])) {
    const base = posix.basename(toRoot(absPath));
    if (base === "index.js" || base.startsWith("_")) continue;
    const id = base.replace(/\.js$/, "");
    const source = readFileSync(absPath, "utf8");
    const clean = stripComments(source);
    const exportMatch = clean.match(/export function (\w+)/);
    assert.ok(exportMatch, `${id}: missing exported scene function`);
    assert.equal(exportMatch[1], id, `${id}: export function name must match basename`);
    assert.match(indexSource, new RegExp(`import\\s+\\{\\s*${id}\\s*\\}\\s+from\\s+"\\./${id}\\.js";`), `${id}: missing index import`);
    const meta = META_TABLE[id];
    assert.ok(meta, `${id}: missing META_TABLE entry`);
    assert.equal(typeof meta.category, "string", `${id}: META.category must be string`);
    assert.equal(typeof meta.description, "string", `${id}: META.description must be string`);
    assert.equal(typeof meta.duration_hint, "number", `${id}: META.duration_hint must be number`);
    assert.ok(Array.isArray(meta.params), `${id}: META.params must be array`);
    for (const param of meta.params) {
      assert.equal(typeof param.name, "string", `${id}: META param missing name`);
      assert.equal(typeof param.type, "string", `${id}: META param missing type`);
      assert.ok(Object.hasOwn(param, "default"), `${id}: META param missing default`);
    }
    assert.doesNotMatch(clean, /Math\.random\(/, `${id}: Math.random forbidden`);
    assert.doesNotMatch(clean, /Date\.now\(/, `${id}: Date.now forbidden`);
    assert.doesNotMatch(clean, /performance\.now\(/, `${id}: performance.now forbidden`);
    assert.doesNotMatch(clean, /new Image\(\)/, `${id}: new Image() forbidden`);
    assert.doesNotMatch(clean, /fetch\(/, `${id}: fetch() forbidden`);
    assert.doesNotMatch(clean, /^let\s+/m, `${id}: top-level let forbidden`);
    assert.doesNotMatch(clean, /^const\s+\w+\s*=\s*new Map\(/m, `${id}: top-level new Map forbidden`);
    for (const match of clean.matchAll(IMPORT_RE)) {
      const spec = match[1] || match[2];
      assert.ok(spec === "@napi-rs/canvas" || /^\.\/_/.test(spec), `${id}: scene imports must stay inside scene helpers or canvas, got ${spec}`);
    }
  }
});

test("arch-3 error contract", () => {
  const badValidate = validateTimeline(null);
  assert.equal(badValidate.ok, false);
  assert.match(badValidate.error.code, /^BAD_/);
  assert.equal(typeof badValidate.error.message, "string");

  const badResolve = resolveTimeline({ duration: 0 });
  assert.equal(badResolve.ok, false);
  assert.equal(typeof badResolve.error.code, "string");
  assert.equal(typeof badResolve.error.message, "string");

  const emptyRender = renderAt({ tracks: [] }, 0);
  assert.equal(emptyRender.ok, true);
  assert.ok(emptyRender.canvas);

  const missingTrack = addClip({ tracks: [{ id: "v1", clips: [] }] }, "vMissing", { id: "c", scene: "auroraGradient", start: 0, dur: 1 });
  assert.equal(missingTrack.ok, false);
  assert.equal(missingTrack.error.code, "TRACK_NOT_FOUND");
  assert.equal(typeof missingTrack.error.message, "string");

  const missingClip = moveClip({ tracks: [] }, "missing", 5);
  assert.equal(missingClip.ok, false);
  assert.equal(missingClip.error.code, "CLIP_NOT_FOUND");
  assert.equal(typeof missingClip.error.message, "string");
});

test("arch-4 extension registry", () => {
  assert.ok(SCENE_IDS.length >= 21, `expected at least 21 scenes, got ${SCENE_IDS.length}`);
  for (const id of SCENE_IDS) {
    const entry = REGISTRY.get(id);
    assert.ok(entry, `${id}: missing registry entry`);
    assert.equal(typeof entry.render, "function", `${id}: render missing`);
    assert.equal(typeof entry.describe, "function", `${id}: describe missing`);
    assert.equal(entry.META.id, id, `${id}: META.id mismatch`);
    assert.equal(typeof entry.META.category, "string", `${id}: META.category missing`);
    assert.ok(Array.isArray(entry.META.params), `${id}: META.params missing`);
  }

  const binSource = readFileSync(resolve(ROOT, "bin/nextframe.js"), "utf8");
  const block = binSource.match(/const SUBCOMMANDS = \{([\s\S]*?)\n\};/);
  assert.ok(block, "SUBCOMMANDS object missing");
  const keys = [...block[1].matchAll(/^\s*(?:"([^"]+)"|([a-z-]+))\s*:/gm)].map((m) => m[1] || m[2]);
  for (const key of REQUIRED_SUBCOMMANDS) assert.ok(keys.includes(key), `missing subcommand ${key}`);

  const toolNames = Object.keys(TOOLS);
  assert.ok(toolNames.length >= 7, `expected at least 7 tools, got ${toolNames.length}`);
  for (const name of toolNames) {
    assert.ok(TOOLS[name].schema && typeof TOOLS[name].schema === "object", `${name}: schema missing`);
  }
});

test("arch-5 file size cap", () => {
  const files = [...walk(resolve(ROOT, "src"), [".js"]), ...walk(resolve(ROOT, "preview"), [".js"])];
  const failures = [];
  for (const absPath of files) {
    const rel = toRoot(absPath);
    const count = countNonCommentLines(readFileSync(absPath, "utf8"));
    if (count > 300) console.warn(`WARN ${rel} has ${count} non-comment lines`);
    if (count > 400) failures.push(`${rel} has ${count} non-comment lines`);
  }
  assert.deepEqual(failures, []);
});

test("arch-6 error guard runtime", () => {
  const script = [
    'import { readFileSync } from "node:fs";',
    'import { renderAt } from "./src/engine/render.js";',
    'const timeline = JSON.parse(readFileSync("./examples/minimal.timeline.json", "utf8"));',
    "const result = renderAt(timeline, 0.5);",
    'if (!result.ok) { console.error(result.error.message); process.exit(1); }',
  ].join("\n");
  const run = spawnSync("node", ["--input-type=module", "-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NEXTFRAME_GUARD: "1" },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stderr, /\[NEXTFRAME_GUARD\]/, "guard reported a violation");
});

function walk(root, exts) {
  const out = [];
  if (!safeExists(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = resolve(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, exts));
    else if (exts.includes(extname(entry.name))) out.push(abs);
  }
  return out;
}

function safeExists(path) {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

function toRoot(absPath) {
  return posix.normalize(absPath.replace(`${ROOT}/`, "").replace(/\\/g, "/"));
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function countNonCommentLines(source) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .filter((line) => line.trim() !== "").length;
}

function isAllowedImport(source, spec) {
  if (spec.startsWith("node:")) return true;
  if (spec === "@napi-rs/canvas") return source.startsWith("src/scenes/") || source.startsWith("src/targets/") || source.startsWith("src/engine/");
  if (!spec.startsWith(".")) return false;
  const target = resolveImport(source, spec);
  const sameDir = posix.dirname(source) === posix.dirname(target);
  if (sameDir) return true;
  if (source.startsWith("src/scenes/")) return /^src\/scenes\/_/.test(target);
  if (source.startsWith("src/targets/")) return target.startsWith("src/engine/");
  if (source.startsWith("src/engine/")) return target === "src/scenes/index.js" || target.startsWith("src/engine/");
  if (source.startsWith("src/timeline/")) return target.startsWith("src/engine/");
  if (source.startsWith("src/ai/")) return target.startsWith("src/engine/") || target.startsWith("src/timeline/") || target.startsWith("src/scenes/") || target.startsWith("src/views/");
  if (source.startsWith("src/cli/")) return target.startsWith("src/targets/") || target.startsWith("src/engine/") || target.startsWith("src/timeline/") || target.startsWith("src/scenes/") || target.startsWith("src/views/") || target.startsWith("src/ai/");
  if (source.startsWith("src/views/")) return target.startsWith("src/engine/");
  if (source.startsWith("preview/")) return target.startsWith("src/");
  return false;
}

function resolveImport(source, spec) {
  const sourceDir = posix.dirname(source);
  const sourceAbs = posix.join("/", sourceDir);
  let target = posix.normalize(posix.join(sourceAbs, spec));
  if (!posix.extname(target)) target += ".js";
  return target.slice(1);
}

function ruleFor(source) {
  if (source.startsWith("src/scenes/")) return "src/scenes/* -> @napi-rs/canvas, ./_*, or same-dir siblings";
  if (source.startsWith("src/targets/")) return "src/targets/* -> @napi-rs/canvas, node:*, ../engine/*, or same-dir siblings";
  if (source.startsWith("src/engine/")) return "src/engine/* -> @napi-rs/canvas, node:*, ../scenes/index.js, ./*, or same-dir siblings";
  if (source.startsWith("src/timeline/")) return "src/timeline/* -> ../engine/* or same-dir siblings";
  if (source.startsWith("src/ai/")) return "src/ai/* -> ../engine/*, ../timeline/*, ../scenes/*, ../views/*, or same-dir siblings";
  if (source.startsWith("src/cli/")) return "src/cli/* -> lower layers, node:*, or same-dir siblings";
  if (source.startsWith("src/views/")) return "src/views/* -> node:*, ../engine/*, or same-dir siblings";
  if (source.startsWith("preview/")) return "preview/* -> ../src/*, node:*, or same-dir siblings";
  return "allowed import contract";
}
