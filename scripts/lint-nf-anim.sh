#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

node --input-type=module <<'NODE'
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

const root = process.cwd();
const animRoot = path.join(root, "src/nf-anim");
const violations = [];
const gates = new Set();

function addViolation(gate, label, message) {
  const line = `[${gate}] ${label}: ${message}`;
  console.log(line);
  violations.push(line);
  gates.add(gate);
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function lineNumber(content, index) {
  if (index < 0) return 1;
  return content.slice(0, index).split("\n").length;
}

function firstMatchLine(content, pattern) {
  const match = content.match(pattern);
  return match?.index === undefined ? 1 : lineNumber(content, match.index);
}

function countLines(content) {
  if (!content.length) return 0;
  return content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function toSourcePath(file) {
  return pathToFileURL(file).href;
}

function isModuleSource(file) {
  return /\.(?:[cm]?js|ts|html)$/.test(file);
}

function isLeaf(relPath, bucket) {
  return new RegExp(`^src/nf-anim/${bucket}/[^/]+/[^/]+\\.js$`).test(relPath) && !relPath.endsWith("/index.js");
}

function parseJson(stdout) {
  try {
    return { ok: true, value: JSON.parse(stdout) };
  } catch (error) {
    return { ok: false, error };
  }
}

function runCli(args) {
  return spawnSync("node", ["src/nf-anim/cli/bin.js", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function inferCliKind(entry) {
  if (!entry || typeof entry !== "object") return null;
  const rawKind = `${entry.kind || entry.type || entry.registry || ""}`.toLowerCase();
  if (rawKind.includes("behavior")) return "behavior";
  if (rawKind.includes("shape")) return "shape";
  if (rawKind.includes("scene")) return "scene";
  return null;
}

function inferCliName(entry) {
  if (!entry || typeof entry !== "object") return "";
  const name = entry.name || entry.id || entry.key || entry.slug || "";
  return typeof name === "string" ? name : "";
}

const allFiles = walk(animRoot);
const moduleFiles = allFiles.filter(isModuleSource);
const behaviorFiles = allFiles.filter((file) => isLeaf(rel(file), "behaviors"));
const shapeFiles = allFiles.filter((file) => isLeaf(rel(file), "shapes"));
const sceneFiles = allFiles.filter((file) => isLeaf(rel(file), "scenes"));

const framePureRules = [
  { token: "Date.now", pattern: /\bDate\.now\s*\(/g, hint: "use animation time `t` instead" },
  { token: "Math.random", pattern: /\bMath\.random\s*\(/g, hint: "use mulberry32(seed) instead" },
  { token: "setTimeout", pattern: /\bsetTimeout\s*\(/g, hint: "use deterministic scheduling instead" },
  { token: "setInterval", pattern: /\bsetInterval\s*\(/g, hint: "use deterministic scheduling instead" },
  { token: "requestAnimationFrame", pattern: /\brequestAnimationFrame\s*\(/g, hint: "drive frames from the engine clock instead" },
  { token: "performance.now", pattern: /\bperformance\.now\s*\(/g, hint: "use animation time `t` instead" },
];

for (const file of moduleFiles) {
  const relPath = rel(file);
  const content = read(file);
  const isTestFile = relPath.startsWith("src/nf-anim/tests/");
  // examples/ are preview HTML/JS that drive the engine for human/AI inspection — they MAY use rAF / performance.now
  // (the engine itself stays frame-pure; examples are clients of the engine)
  const isExampleFile = relPath.startsWith("src/nf-anim/examples/");

  for (const rule of framePureRules) {
    if (isTestFile && rule.token === "performance.now") continue;
    if (isExampleFile) continue;
    for (const match of content.matchAll(rule.pattern)) {
      addViolation("L1", "FRAME-PURE", `${relPath}:${lineNumber(content, match.index)} uses ${rule.token} — ${rule.hint}`);
    }
  }
}

for (const file of behaviorFiles) {
  const relPath = rel(file);
  const content = read(file);
  let mod;

  try {
    mod = await import(toSourcePath(file));
  } catch (error) {
    addViolation("L2", "BEHAVIOR-SIG", `${relPath}:1 failed to load module — ${error.message}`);
    continue;
  }

  if (typeof mod.default !== "function") {
    addViolation("L2", "BEHAVIOR-SIG", `${relPath}:1 default export must be a function`);
  }

  const behaviorSig = /function\s+[A-Za-z_$][\w$]*\s*\(\s*startAt\s*=\s*0\s*,\s*duration\s*=\s*[^,)]+\s*,\s*opts\s*=\s*\{\s*\}\s*\)/;
  if (!behaviorSig.test(content)) {
    addViolation("L2", "BEHAVIOR-SIG", `${relPath}:${firstMatchLine(content, /function\s+/)} signature must match function NAME(startAt = 0, duration = ?, opts = {})`);
  }

  const m = mod.default && mod.default.meta;
  const required = ["name", "category", "description", "default_duration", "params"];
  if (!m || typeof m !== "object") {
    addViolation("L2", "BEHAVIOR-SIG", `${relPath}:1 default export must have a .meta object`);
  } else {
    const missing = required.filter(k => !(k in m));
    if (missing.length) {
      addViolation("L2", "BEHAVIOR-SIG", `${relPath}:1 meta missing fields: ${missing.join(", ")}`);
    }
  }

  // sanity: behavior(0, 1, {}) must return { tracks: {...} } OR { expand: "name", ... } for layer-type descriptors
  try {
    const out = mod.default(0, 1, {});
    const validShape = out && typeof out === "object" && (
      (out.tracks && typeof out.tracks === "object") ||
      (typeof out.expand === "string")
    );
    if (!validShape) {
      addViolation("L2", "BEHAVIOR-SIG", `${relPath}:1 return must be { tracks: {...} } or { expand: "name", ... } (got ${typeof out === "object" ? Object.keys(out || {}).join(",") : typeof out})`);
    }
  } catch (e) {
    addViolation("L2", "BEHAVIOR-SIG", `${relPath}:1 behavior call threw: ${e.message}`);
  }
}

for (const file of shapeFiles) {
  const relPath = rel(file);
  const content = read(file);
  let mod;

  try {
    mod = await import(toSourcePath(file));
  } catch (error) {
    addViolation("L3", "SHAPE-SIG", `${relPath}:1 failed to load module — ${error.message}`);
    continue;
  }

  if (typeof mod.default !== "function") {
    addViolation("L3", "SHAPE-SIG", `${relPath}:1 default export must be a function`);
    continue;
  }

  const shapeSig = /function\s+[A-Za-z_$][\w$]*\s*\(\s*layer\s*=\s*\{\s*\}\s*\)/;
  if (!shapeSig.test(content)) {
    addViolation("L3", "SHAPE-SIG", `${relPath}:${firstMatchLine(content, /function\s+/)} signature must match function NAME(layer = {})`);
  }

  const sm = mod.default && mod.default.meta;
  const sreq = ["name", "category", "description", "params"];
  if (!sm || typeof sm !== "object") {
    addViolation("L3", "SHAPE-SIG", `${relPath}:1 default export must have a .meta object`);
  } else {
    const smissing = sreq.filter(k => !(k in sm));
    if (smissing.length) {
      addViolation("L3", "SHAPE-SIG", `${relPath}:1 meta missing fields: ${smissing.join(", ")}`);
    }
  }

  try {
    const value = mod.default({});
    if (typeof value !== "string") {
      addViolation("L3", "SHAPE-SIG", `${relPath}:${firstMatchLine(content, /\breturn\b/)} shape function must return a string SVG fragment`);
    }
  } catch (error) {
    addViolation("L3", "SHAPE-SIG", `${relPath}:${firstMatchLine(content, /function\s+/)} shape invocation failed — ${error.message}`);
  }
}

for (const file of sceneFiles) {
  const relPath = rel(file);
  let mod;

  try {
    mod = await import(toSourcePath(file));
  } catch (error) {
    addViolation("L4", "SCENE-CONTRACT", `${relPath}:1 failed to load module — ${error.message}`);
    continue;
  }

  const scene = mod.default;
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    addViolation("L4", "SCENE-CONTRACT", `${relPath}:1 default export must be an object`);
    continue;
  }

  for (const key of ["id", "ratio", "duration_hint", "type", "render", "describe", "sample"]) {
    if (!(key in scene)) {
      addViolation("L4", "SCENE-CONTRACT", `${relPath}:1 missing required key ${key}`);
    }
  }

  for (const key of ["render", "describe", "sample"]) {
    if (key in scene && typeof scene[key] !== "function") {
      addViolation("L4", "SCENE-CONTRACT", `${relPath}:1 ${key} must be a function`);
    }
  }

  if (!["motion", "composite"].includes(scene.type)) {
    addViolation("L4", "SCENE-CONTRACT", `${relPath}:1 type must be "motion" or "composite"`);
  }
}

for (const file of allFiles) {
  const relPath = rel(file);
  const lines = countLines(read(file));
  const limit = relPath.startsWith("src/nf-anim/tests/") ? 500 : 300;
  if (lines > limit) {
    addViolation("L5", "FILE-SIZE", `${relPath}:${lines} exceeds ${limit} lines`);
  }
}

const packageJsonPath = path.join(animRoot, "package.json");
const packageJson = JSON.parse(read(packageJsonPath));
for (const field of ["dependencies", "devDependencies"]) {
  const value = packageJson[field] ?? {};
  const isEmptyObject = value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
  if (!isEmptyObject) {
    addViolation("L6", "ZERO-DEPS", `src/nf-anim/package.json:1 ${field} must be an empty object`);
  }
}

const crossImportRules = [
  { token: "nf-core", pattern: /\b(?:import|export)\b[^\n]*?(?:\bfrom\s*)?['"][^'"]*nf-core\/[^'"]*['"]|\brequire\s*\(\s*['"][^'"]*nf-core\/[^'"]*['"]\s*\)/g },
  { token: "nf-cli", pattern: /\b(?:import|export)\b[^\n]*?(?:\bfrom\s*)?['"][^'"]*nf-cli\/[^'"]*['"]|\brequire\s*\(\s*['"][^'"]*nf-cli\/[^'"]*['"]\s*\)/g },
  { token: "nf-bridge", pattern: /\b(?:import|export)\b[^\n]*?(?:\bfrom\s*)?['"][^'"]*nf-bridge\/[^'"]*['"]|\brequire\s*\(\s*['"][^'"]*nf-bridge\/[^'"]*['"]\s*\)/g },
  { token: "node_modules", pattern: /\b(?:import|export)\b[^\n]*?(?:\bfrom\s*)?['"][^'"]*node_modules\/[^'"]*['"]|\brequire\s*\(\s*['"][^'"]*node_modules\/[^'"]*['"]\s*\)/g },
];

for (const file of moduleFiles) {
  const relPath = rel(file);
  const content = read(file);

  for (const rule of crossImportRules) {
    for (const match of content.matchAll(rule.pattern)) {
      addViolation("L7", "CROSS-IMPORT", `${relPath}:${lineNumber(content, match.index)} imports from ${rule.token}, which is forbidden`);
    }
  }
}

const listResult = runCli(["list", "--json"]);
if (listResult.status !== 0) {
  addViolation("L8", "CLI-DESCRIBE", `src/nf-anim/cli/bin.js list --json failed — ${listResult.stderr.trim() || "unknown error"}`);
} else {
  const parsedList = parseJson(listResult.stdout.trim() || "[]");
  if (!parsedList.ok) {
    addViolation("L8", "CLI-DESCRIBE", `src/nf-anim/cli/bin.js list --json returned invalid JSON`);
  } else {
    const entries = [];
    const payload = parsedList.value;

    if (Array.isArray(payload)) {
      for (const entry of payload) {
        const kind = inferCliKind(entry);
        const name = inferCliName(entry);
        if (kind && name) entries.push({ kind, name, entry });
      }
    } else if (payload && typeof payload === "object") {
      for (const [kind, key] of [["behavior", "behaviors"], ["shape", "shapes"], ["scene", "scenes"]]) {
        const group = payload[key];
        if (!Array.isArray(group)) continue;
        for (const entry of group) {
          const name = inferCliName(entry);
          if (name) entries.push({ kind, name, entry });
        }
      }
    }

    for (const { kind, name, entry } of entries) {
      const describeResult = runCli(["describe", kind, name, "--json"]);
      if (describeResult.status !== 0) {
        addViolation("L8", "CLI-DESCRIBE", `${kind} ${name}: describe failed — ${describeResult.stderr.trim() || "unknown error"}`);
        continue;
      }

      const parsedDescribe = parseJson(describeResult.stdout.trim() || "{}");
      if (!parsedDescribe.ok) {
        addViolation("L8", "CLI-DESCRIBE", `${kind} ${name}: describe returned invalid JSON`);
        continue;
      }

      const detail = parsedDescribe.value?.meta && typeof parsedDescribe.value.meta === "object"
        ? parsedDescribe.value.meta
        : parsedDescribe.value;
      const description = typeof detail?.description === "string" && detail.description.trim()
        ? detail.description.trim()
        : typeof entry?.description === "string" && entry.description.trim()
          ? entry.description.trim()
          : "";
      const params = Array.isArray(detail?.params)
        ? detail.params
        : Array.isArray(entry?.params)
          ? entry.params
          : [];

      if (!description) {
        addViolation("L8", "CLI-DESCRIBE", `${kind} ${name}: description must be non-empty`);
      }
      if (params.length < 1) {
        addViolation("L8", "CLI-DESCRIBE", `${kind} ${name}: params must document at least one field`);
      }
    }
  }
}

if (violations.length > 0) {
  console.log(`\n${violations.length} violations across ${gates.size} gates. FAIL.`);
  process.exit(1);
}

console.log("nf-anim lint passed.");
NODE
