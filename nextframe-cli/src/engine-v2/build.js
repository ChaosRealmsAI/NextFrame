import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { timelineMetrics } from "./timeline.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, "../../../runtime/web/src");

export function buildHTMLDocument(timeline, opts = {}) {
  const { width, height, fps, duration, background } = timelineMetrics(timeline);
  const mode = opts.mode === "headless" ? "headless" : "player";
  const baseHref = typeof opts.baseHref === "string" && opts.baseHref ? opts.baseHref : "";
  const sharedCode = stripESM(readFileSync(resolve(SRC_DIR, "scenes-v2-shared.js"), "utf8"));
  const engineCode = stripESM(readFileSync(resolve(SRC_DIR, "engine-v2.js"), "utf8"));
  const sceneDir = resolve(SRC_DIR, "scenes-v2");
  const sceneFiles = readdirSync(sceneDir).filter((name) => name.endsWith(".js") && name !== "index.js").sort();
  const sceneBootstrap = sceneFiles.map((file) => {
    const id = file.slice(0, -3);
    const code = stripESM(readFileSync(resolve(sceneDir, file), "utf8"));
    return `SCENE_REGISTRY["${id}"] = (function() {\n${code}\n})();`;
  }).join("\n\n");

  const bootScript = mode === "headless"
    ? [
        "window.__NEXTFRAME_ENGINE = createEngine(stage, TIMELINE, SCENE_REGISTRY);",
        "window.__NEXTFRAME_PLAYER = null;",
        "window.__NEXTFRAME_ENGINE.renderFrame(0);",
      ].join("\n")
    : [
        "window.__NEXTFRAME_ENGINE = createEngine(stage, TIMELINE, SCENE_REGISTRY);",
        "window.__NEXTFRAME_PLAYER = createPlayer(window.__NEXTFRAME_ENGINE, stage);",
      ].join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NextFrame v0.3</title>
${baseHref ? `<base href="${escapeHtml(baseHref)}">` : ""}
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; background: ${background}; }
  body[data-mode="headless"] { overflow: hidden; }
  #stage { width: ${width}px; height: ${height}px; background: ${background}; }
</style>
</head>
<body data-mode="${mode}">
<div id="stage"></div>
<script>
${sharedCode}

const SCENE_REGISTRY = {};
${sceneBootstrap}

${engineCode}

const TIMELINE = ${serializeForScript(timeline)};
const stage = document.getElementById("stage");
window.__NEXTFRAME_TIMELINE = TIMELINE;
window.__NEXTFRAME_MODE = ${JSON.stringify(mode)};
${bootScript}
window.__NEXTFRAME_READY = true;
</script>
</body>
</html>
`;
}

export function buildHTML(timeline, outputPath, opts = {}) {
  try {
    const html = buildHTMLDocument(timeline, opts);
    writeFileSync(outputPath, html, "utf8");
    const { width, height, fps, duration } = timelineMetrics(timeline);

    return {
      ok: true,
      value: {
        path: outputPath,
        width,
        height,
        fps,
        duration,
        layers: Array.isArray(timeline.layers) ? timeline.layers.length : 0,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "BUILD_FAIL",
        message: error.message,
      },
    };
  }
}

export function timelineBaseHref(dirPath) {
  return `${pathToFileURL(dirPath).href.replace(/\/?$/, "/")}`;
}

function stripESM(code) {
  return code
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, "")
    .replace(/^import\s*\{[^}]*\}\s*from\s+['"].*?['"];?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "return ")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+(function|const|let|var|class)\s/gm, "$1 ");
}

function escapeHtml(value) {
  return String(value).replace(/"/g, "&quot;");
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
