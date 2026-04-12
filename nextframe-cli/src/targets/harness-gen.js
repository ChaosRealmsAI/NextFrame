import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const WEB_ROOT = resolve(REPO_ROOT, "runtime/web/src");
const SCENES_DIR = resolve(WEB_ROOT, "scenes");
const ENGINE_DIR = resolve(WEB_ROOT, "engine");
const CLI_SCENES_DIR = resolve(REPO_ROOT, "nextframe-cli/src/scenes");

const NAMED_IMPORT_PATTERN = /^\s*import\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];?\s*$/gm;
const RE_EXPORT_PATTERN = /^\s*export\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];?\s*$/gm;
const RESIDUAL_ESM_PATTERN = /^\s*(import|export)\b/m;

const RECORDER_COMPAT_SCENES = Object.freeze({
  vignette: Object.freeze({
    exportName: "vignette",
    moduleId: toModuleId(resolve(CLI_SCENES_DIR, "vignette.js")),
  }),
});

function toModuleId(filePath) {
  return relative(REPO_ROOT, filePath).split("\\").join("/");
}

function fromModuleId(moduleId) {
  return resolve(REPO_ROOT, moduleId);
}

function escapeScriptContent(value) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function serializeForScript(value) {
  return escapeScriptContent(JSON.stringify(value).replace(/</g, "\\u003C"));
}

function listModuleIds(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => toModuleId(resolve(dir, name)));
}

function resolveImportId(fromModuleIdValue, specifier) {
  return toModuleId(resolve(dirname(fromModuleId(fromModuleIdValue)), specifier));
}

function parseNamedSpecifiers(source, moduleId) {
  const specifiers = [];

  for (const rawSpecifier of source.split(",")) {
    const specifier = rawSpecifier.trim();
    if (!specifier) {
      continue;
    }

    const match = specifier.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
    if (!match) {
      throw new Error(`Unsupported named import/export specifier in ${moduleId}: ${specifier}`);
    }

    specifiers.push({
      imported: match[1],
      local: match[2] || match[1],
    });
  }

  return specifiers;
}

function formatDestructuredSpecifiers(specifiers) {
  return specifiers
    .map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`))
    .join(", ");
}

function collectDependencies(source, moduleId) {
  const dependencies = [];

  for (const pattern of [NAMED_IMPORT_PATTERN, RE_EXPORT_PATTERN]) {
    for (const match of source.matchAll(pattern)) {
      dependencies.push(resolveImportId(moduleId, match[2]));
    }
  }

  return dependencies;
}

function transformModuleSource(source, moduleId) {
  const exportNames = [];
  let transformed = source.replace(NAMED_IMPORT_PATTERN, (_match, specifierSource, specifier) => {
    const dependencyId = resolveImportId(moduleId, specifier);
    const bindings = formatDestructuredSpecifiers(parseNamedSpecifiers(specifierSource, moduleId));
    return `const { ${bindings} } = __nfImport(${JSON.stringify(dependencyId)});`;
  });

  transformed = transformed.replace(RE_EXPORT_PATTERN, (_match, specifierSource, specifier) => {
    const dependencyId = resolveImportId(moduleId, specifier);
    const lines = [];

    for (const { imported, local } of parseNamedSpecifiers(specifierSource, moduleId)) {
      lines.push(
        `const { ${imported}: __nfReExport_${local} } = __nfImport(${JSON.stringify(dependencyId)});`,
      );
      lines.push(`exports.${local} = __nfReExport_${local};`);
    }

    return lines.join("\n");
  });

  transformed = transformed.replace(/^export function\s+([A-Za-z0-9_$]+)\s*\(/gm, (_match, name) => {
    exportNames.push(name);
    return `function ${name}(`;
  });
  transformed = transformed.replace(/^export\s+(const|let|var)\s+([A-Za-z0-9_$]+)\s*=/gm, (_match, kind, name) => {
    exportNames.push(name);
    return `${kind} ${name} =`;
  });

  if (exportNames.length > 0) {
    transformed += `\n${exportNames.map((name) => `exports.${name} = ${name};`).join("\n")}\n`;
  }

  if (RESIDUAL_ESM_PATTERN.test(transformed)) {
    const residual = transformed.match(RESIDUAL_ESM_PATTERN)?.[0]?.trim() || "import/export";
    throw new Error(`Failed to inline ESM syntax in ${moduleId}: ${residual}`);
  }

  return transformed;
}

function collectRecorderCompatSceneIds(timeline) {
  const sceneIds = new Set();

  for (const track of timeline?.tracks || []) {
    for (const clip of track?.clips || []) {
      if (RECORDER_COMPAT_SCENES[clip?.scene]) {
        sceneIds.add(clip.scene);
      }
    }
  }

  return Array.from(sceneIds).sort();
}

function buildRuntimeBundle(extraModuleIds = []) {
  const entryIds = [
    toModuleId(resolve(WEB_ROOT, "track-flags.js")),
    ...listModuleIds(ENGINE_DIR),
    ...listModuleIds(SCENES_DIR),
    ...extraModuleIds,
  ];
  const seen = new Set();
  const orderedIds = [];

  function visit(moduleId) {
    if (seen.has(moduleId)) {
      return;
    }
    seen.add(moduleId);
    const source = readFileSync(fromModuleId(moduleId), "utf8");
    for (const dependencyId of collectDependencies(source, moduleId)) {
      visit(dependencyId);
    }
    orderedIds.push(moduleId);
  }

  for (const entryId of entryIds) {
    visit(entryId);
  }

  return orderedIds.map((moduleId) => {
    const source = readFileSync(fromModuleId(moduleId), "utf8");
    const transformed = transformModuleSource(source, moduleId);
    return `__nfDefine(${JSON.stringify(moduleId)}, function(module, exports, __nfImport) {\n${transformed}\n});`;
  }).join("\n\n");
}

/**
 * Generate a self-contained HTML harness for the browser renderer.
 * @param {object} timeline
 * @param {{width?: number, height?: number}} [opts]
 * @returns {string}
 */
export function generateHarness(timeline, opts = {}) {
  const width = Number(opts.width) || timeline?.project?.width || 1920;
  const height = Number(opts.height) || timeline?.project?.height || 1080;
  const duration = Number(timeline?.duration) || 0;
  const fps = Number(timeline?.project?.fps) || 30;
  const compatSceneIds = collectRecorderCompatSceneIds(timeline);
  const compatModuleIds = compatSceneIds.map((sceneId) => RECORDER_COMPAT_SCENES[sceneId].moduleId);
  const bundle = buildRuntimeBundle(compatModuleIds);
  const serializedTimeline = serializeForScript(timeline);
  const serializedRecorderMeta = serializeForScript({
    width,
    height,
    duration,
    fps,
  });
  const compatSceneRegistrationScript = compatSceneIds.map((sceneId) => {
    const { moduleId, exportName } = RECORDER_COMPAT_SCENES[sceneId];
    const bindingName = `__nfCompat_${sceneId.replace(/[^A-Za-z0-9_$]/g, "_")}`;
    return `const ${bindingName} = __nfImport(${JSON.stringify(moduleId)}).${exportName};
  if (typeof ${bindingName} !== "function") {
    throw new Error("Recorder compatibility scene ${sceneId} is not available");
  }
  engine.registerScene(${JSON.stringify(sceneId)}, ${bindingName});`;
  }).join("\n  ");
  const runtimeScript = escapeScriptContent(`
(function() {
  const __nfModules = new Map();
  const __nfCache = new Map();

  function __nfDefine(id, factory) {
    __nfModules.set(id, factory);
  }

  function __nfImport(id) {
    if (__nfCache.has(id)) {
      return __nfCache.get(id).exports;
    }

    const factory = __nfModules.get(id);
    if (typeof factory !== "function") {
      throw new Error("Unknown NextFrame runtime module: " + id);
    }

    const module = { exports: {} };
    __nfCache.set(id, module);
    factory(module, module.exports, __nfImport);
    return module.exports;
  }

  ${bundle}

  const timeline = window.__TIMELINE;
  const width = ${JSON.stringify(width)};
  const height = ${JSON.stringify(height)};
  const engine = __nfImport("runtime/web/src/engine/index.js");
  const scenes = __nfImport("runtime/web/src/scenes/index.js");
  const canvas = document.getElementById("nf-canvas");
  const ctx = canvas.getContext("2d");
  let ready = false;

  if (!ctx) {
    throw new Error("Failed to initialize #nf-canvas 2D context");
  }

  canvas.width = width;
  canvas.height = height;
  // Force CSS size to match pixel size — prevents DPR scaling in WKWebView
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  try {
    scenes.registerAllScenes(engine);
  } catch(e) {
    console.error("[harness] registerAllScenes failed:", e.message, e.stack);
  }
  console.log("[harness] registered scenes:", engine.SCENES ? engine.SCENES.size : "unknown");
  ${compatSceneRegistrationScript}

  // Monkey-patch getDisplaySize if the engine uses getBoundingClientRect
  // which returns wrong values in headless WKWebView
  const origGetContext = canvas.getContext;
  const _nfWidth = width;
  const _nfHeight = height;

  // Override getBoundingClientRect on canvas to return fixed size
  canvas.getBoundingClientRect = function() {
    return { x: 0, y: 0, width: _nfWidth, height: _nfHeight, top: 0, left: 0, right: _nfWidth, bottom: _nfHeight };
  };
  // Also set clientWidth/clientHeight
  Object.defineProperty(canvas, 'clientWidth', { get() { return _nfWidth; } });
  Object.defineProperty(canvas, 'clientHeight', { get() { return _nfHeight; } });

  function renderFrame(time) {
    try {
      engine.renderAt(ctx, timeline, Number.isFinite(time) ? time : 0);
    } catch(e) {
      console.error("[harness] renderAt error at t=" + time + ":", e.message, e.stack);
    }
    if (!ready) {
      ready = true;
      window.__READY = true;
    }
  }

  window.__READY = false;
  window.__onFrame = function(frame = {}) {
    try {
      renderFrame(Number(frame.time) || 0);
    } catch(e) {
      console.error("[harness] __onFrame error:", e.message);
    }
    return true;
  };

  renderFrame(0);
})();
`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NextFrame Harness</title>
  <style>
    :root { color-scheme: light; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
    body {
      display: grid;
      place-items: center;
    }
    canvas {
      display: block;
      width: ${width}px;
      height: ${height}px;
    }
  </style>
</head>
<body>
  <canvas id="nf-canvas" width="${width}" height="${height}"></canvas>
  <script>window.__TIMELINE = ${serializedTimeline}; window.__onFrame_meta = ${serializedRecorderMeta};</script>
  <script>${runtimeScript}</script>
</body>
</html>
`;
}
