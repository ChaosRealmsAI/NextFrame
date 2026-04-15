// nextframe scene-preview <name> [--ratio=9:16] [--port=3300]
// Reads scene index.js + shared/design.js, strips ESM, inlines both into
// the same preview template that scene-new uses (Play/Pause + scrubber + scaled canvas).
// Serves via HTTP so everything works.
import { parseFlags } from "../_helpers/_io.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_ROOT = resolve(HERE, "../../../../nf-core/scenes");
const RATIO_DIRS: Record<string, string> = { "16:9": "16x9", "9:16": "9x16", "4:3": "4x3" };
const DIMS: Record<string, number[]> = { "16:9": [1920, 1080], "9:16": [1080, 1920], "4:3": [1440, 1080] };
const CATEGORIES = ["backgrounds", "typography", "data", "shapes", "overlays", "media", "browser"];

function stripESM(code: string) {
  return code
    .replace(/^import\s+.+?;?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "return ")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+(function|const|let|var|class)\s+/gm, "$1 ");
}

function buildPreview(name: string, ratio: string, scenePath: string) {
  const [w, h] = DIMS[ratio];
  const scaleX = ratio === "9:16" ? 0.35 : 0.5;
  const previewW = Math.round(w * scaleX);
  const previewH = Math.round(h * scaleX);

  const designPath = resolve(SCENES_ROOT, "shared/design.js");
  const designCode = existsSync(designPath) ? stripESM(readFileSync(designPath, "utf8")) : "";
  const sceneCode = stripESM(readFileSync(scenePath, "utf8"));

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${name} ${ratio} Preview</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111;color:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;padding:20px;min-height:100vh}
.info{font-size:13px;color:#888;margin-bottom:12px}.info span{color:#da7756;font-weight:700}
.canvas-wrap{position:relative;width:${previewW}px;height:${previewH}px;background:#111;border:1px solid #333;border-radius:8px;overflow:hidden}
.canvas-inner{width:${w}px;height:${h}px;transform-origin:0 0;transform:scale(${scaleX});position:absolute;top:0;left:0}
.controls{margin-top:16px;display:flex;gap:16px;align-items:center}
.controls input[type=range]{width:400px}
.controls button{background:#da7756;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:14px}
.time-display{font-family:monospace;font-size:14px;color:#da7756;min-width:80px}
</style>
</head>
<body>
<div class="info"><span>${name}</span> · ${ratio}</div>
<div class="canvas-wrap"><div class="canvas-inner" id="canvas"></div></div>
<div class="controls">
  <button id="playBtn">▶ Play</button>
  <input type="range" id="scrubber" min="0" max="1000" value="0">
  <div class="time-display" id="timeDisplay">0.00s</div>
</div>
<script>
(function(){
  // ── Design system (shared/design.js) ──
  ${designCode}

  // ── Scene ──
  ${sceneCode}

  const duration = (typeof meta !== 'undefined' && meta.duration_hint) || 10;
  const params = {};
  if (typeof meta !== 'undefined' && meta.params) {
    for (const k in meta.params) {
      const spec = meta.params[k];
      if (spec && spec.default !== undefined) params[k] = spec.default;
    }
  }
  const canvas = document.getElementById('canvas');
  const scrubber = document.getElementById('scrubber');
  const td = document.getElementById('timeDisplay');
  const pb = document.getElementById('playBtn');

  function rf(t) {
    if (typeof render === 'function') {
      try {
        canvas.innerHTML = render(t, params, {width:${w}, height:${h}});
      } catch(e) {
        canvas.innerHTML = '<div style="color:#e06c75;padding:40px;font:14px monospace">render error: ' + e.message + '</div>';
      }
    }
  }

  scrubber.addEventListener('input', function() {
    const t = (scrubber.value / 1000) * duration;
    td.textContent = t.toFixed(2) + 's';
    rf(t);
  });

  let playing = false;
  let st = 0;
  let so = 0;
  function tick() {
    if (!playing) return;
    const t = ((Date.now() - st) / 1000 + so) % duration;
    scrubber.value = (t / duration) * 1000;
    td.textContent = t.toFixed(2) + 's';
    rf(t);
    requestAnimationFrame(tick);
  }
  pb.addEventListener('click', function() {
    playing = !playing;
    if (playing) { st = Date.now(); so = (scrubber.value / 1000) * duration; pb.textContent = '⏸ Pause'; tick(); }
    else { pb.textContent = '▶ Play'; }
  });

  rf(0.5);
})();
</script>
</body>
</html>`;
}

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  if (flags.help || positional.length === 0) {
    process.stdout.write(`scene-preview — Preview a scene with Play/Pause + scrubber, or screenshot for AI verification.

Usage:
  nextframe scene-preview <name> [--ratio=9:16] [--port=3300]       # 人看模式
  nextframe scene-preview <name> [--ratio=9:16] --screenshot=DIR    # AI截图模式

Example:
  nextframe scene-preview interviewChrome --ratio=9:16
  nextframe scene-preview interviewChrome --ratio=9:16 --screenshot=/tmp/check
`);
    return positional.length === 0 ? 3 : 0;
  }

  const name = positional[0];
  const ratio = String(flags.ratio || "9:16");
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

  const html = buildPreview(name, ratio, scenePath);

  // Screenshot mode: write HTML, use puppeteer to capture, output paths
  if (flags.screenshot) {
    const { mkdirSync, writeFileSync: writeFS } = await import("node:fs");
    const outDir = String(flags.screenshot);
    mkdirSync(outDir, { recursive: true });
    const htmlPath = resolve(outDir, `${name}-preview.html`);
    writeFS(htmlPath, html);

    try {
      const puppeteer = await import("puppeteer-core");
      const browser = await puppeteer.default.launch({
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        headless: true,
        args: [`--window-size=800,1000`],
      });
      const page = await browser.newPage();
      const [w, h] = DIMS[ratio] ?? [1080, 1920];
      await page.setViewport({ width: 800, height: 1000, deviceScaleFactor: 2 });
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });
      // Screenshot at t=0.5 (default) and t=5
      for (const t of [0.5, 5]) {
        await page.evaluate((time, dur) => {
          const scrub = document.getElementById("scrubber") as HTMLInputElement | null;
          if (scrub) { scrub.value = String((time / dur) * 1000); scrub.dispatchEvent(new Event("input")); }
        }, t, 10);
        await new Promise((r) => setTimeout(r, 200));
        const shotPath = resolve(outDir, `${name}-t${t}s.png`);
        await page.screenshot({ path: shotPath, fullPage: true });
      }
      await browser.close();
      process.stdout.write(JSON.stringify({
        ok: true,
        screenshots: [
          resolve(outDir, `${name}-t0.5s.png`),
          resolve(outDir, `${name}-t5s.png`),
        ],
      }, null, 2) + "\n");
    } catch (err) {
      // Puppeteer not available — just output the HTML path
      process.stdout.write(JSON.stringify({
        ok: true,
        html: htmlPath,
        note: "puppeteer unavailable, open HTML manually",
      }, null, 2) + "\n");
    }
    return 0;
  }

  // Interactive mode: serve via HTTP
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    process.stdout.write(`Preview: ${url}\n`);
    try { execSync(`open "${url}"`); } catch { /* ignore */ }
    process.stdout.write(`Ctrl+C to stop.\n`);
  });

  await new Promise(() => {});
}
