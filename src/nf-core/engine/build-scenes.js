// Scene discovery, collection, and bundling for the build pipeline.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = resolve(HERE, "../scenes");
const SCENE_REGISTRY_URL = pathToFileURL(resolve(SCENES_DIR, "index.js")).href;

/**
 * Strip ES module syntax so source can be wrapped in an IIFE for the browser bundle.
 */
export function stripESM(code) {
  return code
    .replace(/^import\s+.+?;?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "return ")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+(function|const|let|var|class)\s+/gm, "$1 ");
}

/**
 * Turn an arbitrary string into a valid JS identifier.
 */
export function toIdentifier(value) {
  const clean = String(value || "")
    .replace(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^([^A-Za-z_$])/, "_$1");
  return clean || "_scene";
}

/**
 * Spawn a child process to read the scene registry for a given aspect ratio.
 */
export function readDiscoveredScenes(ratio) {
  const script = `
    import { getRegistry } from ${JSON.stringify(SCENE_REGISTRY_URL)};
    const ratio = ${JSON.stringify(ratio)};
    const registry = await getRegistry();
    const entries = [];
    for (const entry of registry.values()) {
      if (!entry?.META || entry.META.ratio !== ratio) continue;
      if (entry.source && entry.source !== "official") continue;
      entries.push({
        id: entry.id,
        label: entry.META.label || entry.id,
        path: entry.path,
        ratio: entry.META.ratio,
      });
    }
    entries.sort((a, b) => a.id.localeCompare(b.id));
    process.stdout.write(JSON.stringify(entries));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: HERE,
    encoding: "utf8",
  });
  return JSON.parse(output || "[]");
}

/**
 * Collect scene modules referenced by the timeline. Returns an array of
 * { id, label, varName, filePath, code } objects ready for bundling.
 */
export function collectSceneModules(timeline) {
  const ratio = String(timeline?.ratio || "16:9");
  const discovered = readDiscoveredScenes(ratio);
  const byId = new Map(discovered.map((entry) => [entry.id, entry]));
  const requested = [];
  for (const layer of timeline.layers || []) {
    if (!layer?.scene || requested.includes(layer.scene)) continue;
    requested.push(layer.scene);
  }

  const missing = requested.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`missing scenes for ratio ${ratio}: ${missing.join(", ")}`);
  }

  const usedNames = new Set();
  return requested.map((id) => {
    const entry = byId.get(id);
    const baseName = toIdentifier(id);
    let varName = baseName;
    let suffix = 1;
    while (usedNames.has(varName)) {
      suffix += 1;
      varName = `${baseName}_${suffix}`;
    }
    usedNames.add(varName);
    const filePath = resolve(SCENES_DIR, entry.path, "index.js");
    return {
      id,
      label: entry.label,
      varName,
      filePath,
      code: stripESM(readFileSync(filePath, "utf8")).trim(),
    };
  });
}

/**
 * Wrap a single scene module in an IIFE that exposes { meta, render }.
 */
export function buildSceneBundle(scene) {
  return `// ${scene.id} (${scene.filePath})
const ${scene.varName} = (function(){
${scene.code}
return { meta: typeof meta !== "undefined" ? meta : null, render: typeof render === "function" ? render : null };
})();`;
}

/**
 * Read the shared design preamble (shared/design.js) for inline injection.
 */
export function buildSharedPreamble() {
  const sharedPath = resolve(SCENES_DIR, "shared", "design.js");
  try {
    return stripESM(readFileSync(sharedPath, "utf8")).trim();
  } catch {
    return "// no shared/design.js";
  }
}
