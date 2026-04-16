// Scene discovery, collection, and bundling for the build pipeline.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Timeline } from "../types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = resolve(HERE, "../scenes");
const SCENE_REGISTRY_URL = pathToFileURL(resolve(SCENES_DIR, "index.js")).href;
const LEGACY_BUNDLE_PATH = resolve(HERE, "../../nf-runtime/web/src/components/scene-bundle.js");
const IMPORT_RE = /^\s*import\s+.+?\s+from\s+["'](.+?)["'];?\s*$/gm;

/**
 * Strip ES module syntax so source can be wrapped in an IIFE for the browser bundle.
 */
export function stripESM(code: string) {
  return code
    .replace(/^import\s+.+?;?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "return ")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+(function|const|let|var|class)\s+/gm, "$1 ");
}

/**
 * Inline relative scene dependencies such as ../../tokens.js before stripping ESM.
 */
export function inlineLocalImports(filePath: string, seen: Set<string> = new Set()): string {
  const resolvedPath = resolve(filePath);
  if (seen.has(resolvedPath)) return "";
  seen.add(resolvedPath);

  const source = readFileSync(resolvedPath, "utf8");
  return source.replace(IMPORT_RE, (_line, specifier: string) => {
    if (!specifier.startsWith(".")) return "";
    const dependencyPath = resolve(dirname(resolvedPath), specifier);
    return `${inlineLocalImports(dependencyPath, seen)}\n`;
  });
}

/**
 * Turn an arbitrary string into a valid JS identifier.
 */
export function toIdentifier(value: unknown) {
  const clean = String(value || "")
    .replace(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^([^A-Za-z_$])/, "_$1");
  return clean || "_scene";
}

/**
 * Spawn a child process to read the scene registry for a given aspect ratio.
 */
export function readDiscoveredScenes(ratio: string) {
  const script = `
    import { getRegistry } from ${JSON.stringify(SCENE_REGISTRY_URL)};
    const ratio = ${JSON.stringify(ratio)};
    const registry = await getRegistry();
    const entries = [];
    for (const entry of registry.values()) {
      if (!entry?.META || entry.META.ratio !== ratio) continue;
      if (entry.source && entry.source !== "official") continue;
      if (!entry.path) continue;
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

export function readLegacyBundleSource(): string {
  try {
    return readFileSync(LEGACY_BUNDLE_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * Collect scene modules referenced by the timeline. Returns an array of
 * { id, label, varName, filePath, code } objects ready for bundling.
 */
interface DiscoveredScene {
  id: string;
  label?: string;
  path: string;
  ratio: string;
}

export function collectSceneModules(timeline: Timeline) {
  const ratio = String(timeline?.ratio || "16:9");
  const discovered: DiscoveredScene[] = readDiscoveredScenes(ratio);
  const byId = new Map(discovered.map((entry: DiscoveredScene) => [entry.id, entry]));
  const requested: string[] = [];
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
    const entry = byId.get(id) as { path: string; label?: string } | undefined;
    if (!entry) throw new Error(`scene entry not found: ${id}`);
    const baseName = toIdentifier(id);
    let varName = baseName;
    let suffix = 1;
    while (usedNames.has(varName)) {
      suffix += 1;
      varName = `${baseName}_${suffix}`;
    }
    usedNames.add(varName);
    // Flat layout: path ends with .js (e.g. "16x9/anthropic-warm/bg-warmGradient.js")
    // Legacy nested layout: path is a directory, index.js lives inside
    const filePath = entry.path.endsWith(".js")
      ? resolve(SCENES_DIR, entry.path)
      : resolve(SCENES_DIR, entry.path, "index.js");
    return {
      id,
      label: entry.label,
      varName,
      filePath,
      code: stripESM(inlineLocalImports(filePath)).trim(),
    };
  });
}

/**
 * Wrap a single scene module in an IIFE that exposes { meta, render }.
 */
export function buildSceneBundle(scene: { id: string; filePath: string; varName: string; code: string }) {
  const adaptedCode = scene.code.replace(
    /^return\s+(\{[\s\S]*\});\s*$/m,
    "var _def = $1;"
  );
  const wasAdapted = adaptedCode !== scene.code;
  const body = wasAdapted
    ? `${adaptedCode}
var _rawRender = _def && typeof _def.render === "function" ? _def.render.bind(_def) : null;
function _serializeHost(host) {
  if (host && host.querySelectorAll) {
    var canvases = host.querySelectorAll("canvas");
    for (var i = 0; i < canvases.length; i += 1) {
      var canvas = canvases[i];
      if (!canvas || typeof canvas.toDataURL !== "function" || !canvas.parentNode) continue;
      var img = document.createElement("img");
      for (var j = 0; j < canvas.attributes.length; j += 1) {
        var attr = canvas.attributes[j];
        if (attr && attr.name !== "src") img.setAttribute(attr.name, attr.value);
      }
      img.setAttribute("src", canvas.toDataURL());
      if (!img.getAttribute("alt")) img.setAttribute("alt", "");
      canvas.parentNode.replaceChild(img, canvas);
    }
  }
  return host && typeof host.outerHTML === "string" ? host.outerHTML : "";
}
var _adaptedRender = null;
if (_rawRender && _rawRender.length >= 4) {
  _adaptedRender = function(t, params, vp) {
    var host = document.createElement("div");
    host.style.cssText = "position:absolute;inset:0;";
    var _out = _rawRender(host, t, params, vp);
    if (typeof _out === "string") return _out;
    return _serializeHost(host);
  };
} else {
  _adaptedRender = function(t, params, vp) {
    return _rawRender ? _rawRender(t, params, vp) : "";
  };
}
return { meta: _def || null, render: _adaptedRender };`
    : `${scene.code}
return { meta: typeof meta !== "undefined" ? meta : null, render: typeof render === "function" ? render : null };`;
  return `// ${scene.id} (${scene.filePath})
const ${scene.varName} = (function(){
${body}
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

const EFFECT_NAMES = [
  "fadeIn", "fadeOut", "slideUp", "slideDown", "slideLeft", "slideRight",
  "scaleIn", "scaleOut", "springIn", "springOut", "blurIn", "blurOut",
  "wipeReveal", "bounceIn",
];

/**
 * Bundle animation effects into an IIFE that exposes window.__nfEffect(name, progress, opts).
 * Used by build-runtime.js to apply enter/exit effects to layer divs.
 */
export function buildAnimationBundle() {
  const animDir = resolve(HERE, "../animation");
  const effectsDir = resolve(animDir, "effects");
  try {
    const sharedCode = stripESM(readFileSync(resolve(animDir, "shared.js"), "utf8")).trim();
    const effectCodes = EFFECT_NAMES.map((name) =>
      stripESM(readFileSync(resolve(effectsDir, `${name}.js`), "utf8")).trim()
    );
    return `// Animation effects bundle
(function(){
function normalizeTime(v){var n=Number.isFinite(v)?v:0;return Math.min(1,Math.max(0,n));}
function bounce(t){var p=normalizeTime(t);var n=7.5625;var d=2.75;if(p<1/d)return n*p*p;if(p<2/d){p-=1.5/d;return n*p*p+0.75;}if(p<2.5/d){p-=2.25/d;return n*p*p+0.9375;}p-=2.625/d;return n*p*p+0.984375;}
${sharedCode}
${effectCodes.join("\n")}
var __NF_EFX={${EFFECT_NAMES.join(",")}};
window.__nfEffect=function(name,progress,opts){var fn=__NF_EFX[name];if(!fn)return"";return serializeStyle(fn(clamp01(progress),opts||{}));};
})();`;
  } catch {
    return "// no animation bundle";
  }
}
