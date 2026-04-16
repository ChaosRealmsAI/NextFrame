// nextframe scene-preview --id=<scene-id> --ratio=<ratio> --theme=<theme> [--port=8765]
//
// Single-component detail page: big stage + Play/Pause + scrubber + full metadata panel
// (intent / when_to_use / alternatives / params / sample / changelog). Live re-render on t change.
// Typically opened by clicking a scene card in `nextframe scene-gallery`.

import { parseFlags } from "../_helpers/_io.js";
import { readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../../..");
const SCENES_ROOT = resolve(REPO_ROOT, "src/nf-core/scenes");
const RATIO_DIRS: Record<string, string> = { "16:9": "16x9", "9:16": "9x16", "1:1": "1x1", "4:3": "4x3" };
const RATIO_WH: Record<string, [number, number]> = {
  "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:3": [1440, 1080],
};

const HELP = `nextframe scene-preview --id=<id> --ratio=<ratio> --theme=<theme> [opts]

Single-scene detail page with time scrubber + full metadata. Starts http
server, writes preview-{id}.html at repo root, opens browser.

Required:
  --id      scene id (e.g. analogyCard)
  --ratio   16:9 | 9:16 | 1:1 | 4:3
  --theme   theme name

Optional:
  --port    http port (default 8765)
  --no-open don't auto-open browser
  --no-server  generate html only, don't serve
  --dur     duration in seconds (default from duration_hint or 5)
`;

function buildHtml(opts: {
  ratio: string; theme: string; id: string; filename: string;
  meta: Record<string, unknown>; port: number; dur: number;
}): string {
  const [W, H] = RATIO_WH[opts.ratio];
  const aspectPct = (H / W * 100).toFixed(4);
  const dirUrl = `http://localhost:${opts.port}/src/nf-core/scenes/${RATIO_DIRS[opts.ratio]}/${opts.theme}`;
  const m = opts.meta;
  const fmt = (v: unknown) => v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2);

  const metaRows = [
    ["type", m.type],
    ["role", m.role],
    ["version", m.version],
    ["status", m.status],
    ["complexity", m.complexity],
    ["visual_weight", m.visual_weight],
    ["z_layer", m.z_layer],
    ["frame_pure", m.frame_pure],
    ["duration_hint", m.duration_hint ?? "null (timeline-driven)"],
  ].map(([k, v]) => `<tr><td><code>${k}</code></td><td>${fmt(v)}</td></tr>`).join("");

  const listBlock = (title: string, key: string) => {
    const arr = m[key] as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return "";
    return `<h4>${title}</h4><ul>${arr.map(v => `<li>${String(v).replace(/</g, "&lt;")}</li>`).join("")}</ul>`;
  };

  const tags = Array.isArray(m.tags) ? (m.tags as string[]).map(t => `<span class="tag">${t}</span>`).join("") : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${opts.id} · ${opts.theme} · preview</title>
<link rel="stylesheet" href="https://boom-cdn.vercel.app/themes/obsidian-velvet.css">
<style>
  body { padding-bottom: 64px; }
  .layout { display: grid; grid-template-columns: 1fr 400px; gap: 32px; align-items: start; }
  .stage-wrap { position: relative; width: 100%; padding-top: ${aspectPct}%; overflow: hidden; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.5); background: #000; }
  .stage { position: absolute; top: 0; left: 0; width: ${W}px; height: ${H}px; transform-origin: top left; }
  .controls { display: flex; align-items: center; gap: 16px; margin-top: 16px; padding: 12px 20px; background: rgba(255,255,255,0.04); border-radius: 10px; }
  .controls button { background: #da7756; color: #fff; border: 0; padding: 8px 20px; border-radius: 6px; cursor: pointer; font: 600 14px system-ui; }
  .controls input[type=range] { flex: 1; }
  .time-display { font-family: monospace; color: #da7756; min-width: 160px; text-align: right; }
  .meta-panel { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 24px; font-size: 13px; line-height: 1.6; max-height: 85vh; overflow-y: auto; }
  .meta-panel h3 { margin-top: 0; color: #da7756; font-size: 16px; }
  .meta-panel h4 { font-size: 13px; color: #d4b483; margin: 16px 0 6px 0; font-weight: 600; }
  .meta-panel table { width: 100%; font-size: 12px; border-collapse: collapse; }
  .meta-panel td { padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .meta-panel td:first-child { width: 120px; }
  .meta-panel ul { margin: 4px 0 0 18px; padding: 0; font-size: 12px; }
  .meta-panel pre { background: rgba(0,0,0,0.4); padding: 12px; border-radius: 6px; font-size: 11px; white-space: pre-wrap; margin-top: 8px; max-height: 240px; overflow: auto; }
  .tag { display:inline-block; font-size:10px; padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.06); margin: 2px; color: #aaa; }
  .intent { white-space: pre-line; font-size: 12px; color: #ccc; background: rgba(0,0,0,.3); padding: 14px; border-radius: 6px; border-left: 3px solid #da7756; }
  @media (max-width: 1200px) { .layout { grid-template-columns: 1fr; } }
</style>
</head>
<body class="boom">

<nav class="b-navbar">
  <span class="b-navbar-brand b-accent">${opts.id}</span>
  <div class="b-flex b-gap-4">
    <span class="b-chip">${opts.ratio}</span>
    <span class="b-chip">${opts.theme}</span>
    <span class="b-chip">${m.type}</span>
    <a href="gallery-${RATIO_DIRS[opts.ratio]}-${opts.theme}.html" class="b-btn b-btn-ghost b-btn-sm">← 返回 gallery</a>
  </div>
</nav>

<section class="b-section">
  <div class="b-container">
    <div class="layout">
      <div>
        <p class="b-muted">${m.description || ""}</p>
        <div style="margin: 12px 0">${tags}</div>
        <div class="stage-wrap"><div id="stage" class="stage"></div></div>
        <div class="controls">
          <button id="playBtn">▶ Play</button>
          <input type="range" id="scrubber" min="0" max="1000" value="500" step="1">
          <div class="time-display" id="timeDisplay">t=0.00s / ${opts.dur.toFixed(1)}s</div>
        </div>
      </div>

      <div class="meta-panel">
        <h3>intent</h3>
        <div class="intent">${String(m.intent || "").trim()}</div>

        ${listBlock("when_to_use", "when_to_use")}
        ${listBlock("when_not_to_use", "when_not_to_use")}
        ${listBlock("limitations", "limitations")}

        <h4>contract</h4>
        <table>${metaRows}</table>

        ${listBlock("requires", "requires")}
        ${listBlock("pairs_well_with", "pairs_well_with")}
        ${listBlock("conflicts_with", "conflicts_with")}
        ${listBlock("alternatives", "alternatives")}

        <h4>sample()</h4>
        <pre id="sampleJson">loading…</pre>

        <h4>describe(t=0.5)</h4>
        <pre id="describeJson">loading…</pre>

        ${Array.isArray(m.changelog) ? `<h4>changelog</h4><ul>${(m.changelog as Array<{version:string;date:string;change:string}>).map(c => `<li><code>${c.version}</code> ${c.date} — ${c.change}</li>`).join("")}</ul>` : ""}
      </div>
    </div>
  </div>
</section>

<script type="module">
const DIR = ${JSON.stringify(dirUrl)};
const FILENAME = ${JSON.stringify(opts.filename)};
const VP = { width: ${W}, height: ${H} };
const DUR = ${opts.dur};

const stage = document.getElementById('stage');
const stageWrap = stage.parentElement;
const scrubber = document.getElementById('scrubber');
const playBtn = document.getElementById('playBtn');
const timeDisplay = document.getElementById('timeDisplay');
const sampleJson = document.getElementById('sampleJson');
const describeJson = document.getElementById('describeJson');

function scaleStage() {
  const w = stageWrap.clientWidth;
  stage.style.transform = \`scale(\${w / VP.width})\`;
}
scaleStage();
window.addEventListener('resize', scaleStage);

const mod = await import(\`\${DIR}/\${FILENAME}\`);
const c = mod.default;
const params = c.sample();
sampleJson.textContent = JSON.stringify(params, null, 2);

function renderAt(t) {
  try {
    stage.innerHTML = '';
    const out = c.render(stage, t, params, VP);
    if (typeof out === 'string') stage.innerHTML = out;
    const d = c.describe(t, params, VP);
    describeJson.textContent = JSON.stringify(d, null, 2);
    timeDisplay.textContent = \`t=\${t.toFixed(2)}s / \${DUR.toFixed(1)}s\`;
  } catch (e) {
    stage.innerHTML = \`<div style="color:#e06c75;padding:48px;font-family:monospace">\${e.message}</div>\`;
  }
}

scrubber.addEventListener('input', () => {
  const t = (scrubber.value / 1000) * DUR;
  renderAt(t);
});

let playing = false;
let rafId = null;
let startMs = 0;
let startT = 0;
function tick(now) {
  if (!playing) return;
  const elapsed = (now - startMs) / 1000;
  let t = startT + elapsed;
  if (t > DUR) { t = 0; startMs = now; startT = 0; }
  scrubber.value = String((t / DUR) * 1000);
  renderAt(t);
  rafId = requestAnimationFrame(tick);
}
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
  if (playing) {
    startMs = performance.now();
    startT = (scrubber.value / 1000) * DUR;
    rafId = requestAnimationFrame(tick);
  } else {
    if (rafId) cancelAnimationFrame(rafId);
  }
});

renderAt(DUR * 0.5);
</script>

</body>
</html>`;
}

function startServer(port: number, rootDir: string): Promise<() => void> {
  return new Promise((res, rej) => {
    const server = createServer(async (req, res2) => {
      const url = req.url || "/";
      const safePath = url.split("?")[0].split("#")[0];
      const filePath = resolve(rootDir, "." + safePath);
      if (!filePath.startsWith(rootDir)) { res2.writeHead(403); res2.end("forbidden"); return; }
      try {
        const s = statSync(filePath);
        if (s.isDirectory()) { res2.writeHead(403); res2.end("no directory listing"); return; }
        const data = await readFile(filePath);
        const ext = filePath.split(".").pop() || "";
        const mime: Record<string, string> = {
          html: "text/html", js: "application/javascript", mjs: "application/javascript",
          css: "text/css", json: "application/json", png: "image/png", svg: "image/svg+xml",
        };
        res2.writeHead(200, { "Content-Type": mime[ext] || "text/plain", "Access-Control-Allow-Origin": "*" });
        res2.end(data);
      } catch {
        res2.writeHead(404); res2.end("not found");
      }
    });
    server.on("error", rej);
    server.listen(port, "127.0.0.1", () => res(() => server.close()));
  });
}

export async function run(argv: string[]): Promise<number> {
  const { flags } = parseFlags(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }

  const id = String(flags.id || "").trim();
  const ratio = String(flags.ratio || "").trim();
  const theme = String(flags.theme || "").trim();
  const port = Number(flags.port) || 8765;
  const noOpen = Boolean(flags["no-open"]);
  const noServer = Boolean(flags["no-server"]);

  if (!id || !theme || !(ratio in RATIO_DIRS)) {
    process.stderr.write(`error: --id --ratio --theme all required\nrun: nextframe scene-preview --help\n`);
    return 1;
  }

  const themeDir = join(SCENES_ROOT, RATIO_DIRS[ratio], theme);
  if (!existsSync(themeDir)) {
    process.stderr.write(`error: theme dir not found: ${themeDir}\n`);
    return 1;
  }

  const files = readdirSync(themeDir).filter(f => f.endsWith(".js") && !f.startsWith("_"));
  let found: { file: string; meta: Record<string, unknown> } | null = null;
  for (const f of files) {
    try {
      const mod = await import(pathToFileURL(join(themeDir, f)).href) as { default?: Record<string, unknown> };
      const c = mod.default;
      if (c && typeof c === "object" && (c as { id?: string }).id === id) {
        found = { file: f, meta: c };
        break;
      }
    } catch { /* skip */ }
  }
  if (!found) {
    process.stderr.write(`error: scene id "${id}" not found in ${themeDir}\n`);
    return 1;
  }

  const dur = Number(flags.dur) || (typeof found.meta.duration_hint === "number" ? found.meta.duration_hint : 5);

  const html = buildHtml({ ratio, theme, id, filename: found.file, meta: found.meta, port, dur });
  const outName = `preview-${id}-${RATIO_DIRS[ratio]}-${theme}.html`;
  const outPath = join(REPO_ROOT, outName);
  writeFileSync(outPath, html);
  process.stdout.write(`✓ preview written: ${outPath}\n`);

  if (noServer) return 0;

  try {
    const stop = await startServer(port, REPO_ROOT);
    const url = `http://localhost:${port}/${outName}`;
    process.stdout.write(`✓ serving ${REPO_ROOT} at http://localhost:${port}\n  preview: ${url}\n  Ctrl+C to stop\n`);
    if (!noOpen) {
      try { execSync(`open "${url}"`); } catch { /* ignore */ }
    }
    await new Promise<void>(resolve => {
      process.on("SIGINT", () => { stop(); resolve(); });
    });
    return 0;
  } catch (e) {
    process.stderr.write(`server error: ${(e as Error).message}\n`);
    return 1;
  }
}
