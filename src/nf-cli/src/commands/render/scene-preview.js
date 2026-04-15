// nextframe scene-preview <name> [--ratio=9:16] [--port=3300] [--time=5]
// Builds a self-contained preview HTML and serves it via HTTP.
import { parseFlags } from "../_helpers/_io.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { statSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_ROOT = resolve(HERE, "../../../../nf-core/scenes");
const RATIO_DIRS = { "16:9": "16x9", "9:16": "9x16", "4:3": "4x3" };
const CATEGORIES = ["backgrounds", "typography", "data", "shapes", "overlays", "media", "browser"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const DIMS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "4:3": [1440, 1080] };

function stripESM(code) {
  return code
    .replace(/^import\s+.+?;?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "return ")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+(function|const|let|var|class)\s+/gm, "$1 ");
}

function buildPreviewHTML(scenePath, ratio) {
  const [w, h] = DIMS[ratio] || [1080, 1920];
  const designPath = resolve(SCENES_ROOT, "shared/design.js");
  const designCode = existsSync(designPath) ? stripESM(readFileSync(designPath, "utf8")) : "";
  const sceneCode = stripESM(readFileSync(scenePath, "utf8"));
  const scale = Math.min(500 / w, 900 / h);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Scene Preview</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a1a1a; display:flex; flex-direction:column; align-items:center; padding:20px; font:14px system-ui; color:#aaa; }
  .info { margin-bottom:12px; }
  .frame { width:${w}px; height:${h}px; position:relative; overflow:hidden; transform:scale(${scale.toFixed(3)}); transform-origin:top center; border:2px solid #333; }
  .controls { margin-top:${Math.round(h * scale) + 20}px; display:flex; gap:12px; align-items:center; }
  input[type=range] { width:300px; }
  .time { font:500 14px monospace; color:#e8c47a; }
</style>
</head><body>
<div class="info" id="info"></div>
<div class="frame" id="stage"></div>
<div class="controls">
  <span class="time" id="tval">t=0.0s</span>
  <input type="range" id="scrub" min="0" max="1000" value="0">
</div>
<script>
// ── Design system ──
${designCode}

// ── Scene ──
var __scene = (function(){
${sceneCode}
return { meta: typeof meta !== "undefined" ? meta : null, render: typeof render === "function" ? render : null };
})();

var vp = { width: ${w}, height: ${h} };
var duration = (__scene.meta && __scene.meta.duration_hint) || 20;
var stage = document.getElementById("stage");
var scrub = document.getElementById("scrub");
var tval = document.getElementById("tval");
var info = document.getElementById("info");

// Default params
var params = {};
if (__scene.meta && __scene.meta.params) {
  for (var k in __scene.meta.params) {
    var spec = __scene.meta.params[k];
    if (spec && spec.default !== undefined) params[k] = spec.default;
  }
}

info.textContent = (__scene.meta ? __scene.meta.id + " [" + __scene.meta.ratio + "] — " + (__scene.meta.label || "") : "unknown scene") + "  |  " + ${w} + "×" + ${h};

function draw(t) {
  if (__scene.render) {
    try { stage.innerHTML = __scene.render(t, params, vp); }
    catch(e) { stage.innerHTML = '<div style="color:red;padding:40px">render error: ' + e.message + '</div>'; }
  }
  tval.textContent = "t=" + t.toFixed(1) + "s";
}

scrub.addEventListener("input", function() {
  draw(parseFloat(scrub.value) / 1000 * duration);
});

draw(0.5);
</script>
</body></html>`;
}

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  if (flags.help || positional.length === 0) {
    process.stdout.write(`scene-preview — Preview a single scene component in browser.

Usage: nextframe scene-preview <name> [--ratio=9:16] [--port=3300]

Opens a self-contained preview with scrubber in the browser.
No import issues — design.js + scene code are inlined.
Shows the scene in a correctly-sized ${"`"}1080×1920${"`"} (or 1920×1080) frame.
`);
    return positional.length === 0 ? 3 : 0;
  }

  const name = positional[0];
  const ratio = flags.ratio || "9:16";
  const port = Number(flags.port) || 3300;
  const ratioDir = RATIO_DIRS[ratio];
  if (!ratioDir) { process.stderr.write(`Unknown ratio "${ratio}"\n`); return 2; }

  let scenePath = null;
  for (const cat of CATEGORIES) {
    const candidate = resolve(SCENES_ROOT, ratioDir, cat, name, "index.js");
    if (existsSync(candidate)) { scenePath = candidate; break; }
  }
  if (!scenePath) {
    process.stderr.write(`Scene "${name}" not found in ${ratio}. Run: nextframe scenes\n`);
    return 2;
  }

  const previewHTML = buildPreviewHTML(scenePath, ratio);

  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(previewHTML);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    process.stdout.write(`Preview: ${url}\n`);
    try { execSync(`open "${url}"`); } catch { /* ignore */ }
    process.stdout.write(`Scrub the slider to see different times. Ctrl+C to stop.\n`);
  });

  await new Promise(() => {});
}
