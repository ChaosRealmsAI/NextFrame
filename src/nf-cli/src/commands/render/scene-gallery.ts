// nextframe scene-gallery --ratio=<ratio> --theme=<theme> [--port=8765] [--out=<html-path>]
//
// Scans scenes/{ratio-dir}/{theme}/*.js, generates one HTML that mounts each in a
// scaled <div> stage, starts an http server rooted at the repo, and opens the browser.
// Batch visual preview for any ratio+theme — auto-discovers what exists.

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
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:3": [1440, 1080],
};

const HELP = `nextframe scene-gallery --ratio=<ratio> --theme=<theme> [opts]

Auto-generate a batch preview page for all scenes in a ratio+theme, serve it, open browser.

Required:
  --ratio       16:9 | 9:16 | 1:1 | 4:3
  --theme       theme name (must have existing theme dir)

Optional:
  --port        http port (default 8765)
  --out         output html path (default: gallery-{ratio}-{theme}.html in repo root, auto-cleaned)
  --no-open     don't auto-open browser
  --no-server   just write html, don't serve (you run your own server)
  --composite   also render a stacked composite (bg + chrome + first content scene)

Example:
  nextframe scene-gallery --ratio=16:9 --theme=anthropic-warm
`;

type SceneMeta = {
  filename: string;
  id: string;
  name?: string;
  description?: string;
  type: string;
  role?: string;
};

async function scanScenes(themeDir: string): Promise<SceneMeta[]> {
  const entries = readdirSync(themeDir);
  const scenes: SceneMeta[] = [];
  for (const f of entries) {
    if (!f.endsWith(".js") || f.startsWith("_")) continue;
    const path = join(themeDir, f);
    try {
      const mod = await import(pathToFileURL(path).href) as { default?: Record<string, unknown> };
      const c = mod.default;
      if (!c || typeof c !== "object") continue;
      const cr = c as Record<string, unknown>;
      if (!cr.id || !cr.type) continue;
      scenes.push({
        filename: f,
        id: String(cr.id),
        name: cr.name ? String(cr.name) : undefined,
        description: cr.description ? String(cr.description) : undefined,
        type: String(cr.type),
        role: cr.role ? String(cr.role) : undefined,
      });
    } catch {
      // skip broken modules
    }
  }
  scenes.sort((a, b) => {
    const roleOrder = ["bg", "chrome", "content", "text", "overlay", "data"];
    const ra = roleOrder.indexOf(a.role || "");
    const rb = roleOrder.indexOf(b.role || "");
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
  return scenes;
}

function buildHtml(opts: {
  ratio: string;
  theme: string;
  port: number;
  scenes: SceneMeta[];
  composite: boolean;
}): string {
  const [W, H] = RATIO_WH[opts.ratio];
  const dirUrl = `http://localhost:${opts.port}/src/nf-core/scenes/${RATIO_DIRS[opts.ratio]}/${opts.theme}`;
  const ratioDir = RATIO_DIRS[opts.ratio];
  const sceneCards = opts.scenes.map(s => `
      <div class="b-card">
        <div class="card-head">
          <a href="preview-${s.id}-${ratioDir}-${opts.theme}.html" class="b-card-title" style="color:inherit;text-decoration:none">${s.id} →</a>
          <div class="b-flex b-gap-2">
            <span class="tag tag-type-${s.type}">${s.type}</span>
            ${s.role ? `<span class="tag tag-role">${s.role}</span>` : ""}
          </div>
        </div>
        <p class="b-muted desc">${s.description || ""}</p>
        <a href="preview-${s.id}-${ratioDir}-${opts.theme}.html" style="text-decoration:none;display:block" title="点击看详情 + 时间轴">
          <div class="stage-wrap"><div id="scene-${s.id}" class="stage" data-src="${s.filename}"></div></div>
        </a>
      </div>`).join("");

  const compositeCard = opts.composite && opts.scenes.length >= 2 ? `
      <div class="b-card">
        <div class="card-head"><h3 class="b-card-title">Composite（多层叠加）</h3><span class="tag">stack</span></div>
        <p class="b-muted">按 role 顺序叠加：bg → content → text → chrome → overlay</p>
        <div class="stage-wrap"><div id="scene-composite" class="stage"></div></div>
      </div>` : "";

  const aspectPercent = (H / W * 100).toFixed(4);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${opts.theme} · ${opts.ratio} · 组件预览</title>
<link rel="stylesheet" href="https://boom-cdn.vercel.app/themes/obsidian-velvet.css">
<style>
  .stage { position: relative; width: ${W}px; height: ${H}px; transform-origin: top left; background: #000; }
  .stage-wrap { position: relative; width: 100%; padding-top: ${aspectPercent}%; overflow: hidden; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.5); background: #0a0a0a; }
  .stage-wrap .stage { position: absolute; top: 0; left: 0; }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .desc { font-size: 13px; margin: 0 0 16px 0; }
  .tag { font-size: 11px; padding: 2px 10px; border-radius: 10px; }
  .tag-type-canvas { background: rgba(218,119,86,.18); color: #da7756 }
  .tag-type-dom    { background: rgba(126,198,153,.18); color: #7ec699 }
  .tag-type-svg    { background: rgba(138,180,204,.18); color: #8ab4cc }
  .tag-type-media    { background: rgba(212,180,131,.18); color: #d4b483 }
  .tag-type-shader   { background: rgba(110,170,255,.18); color: #6eaaff }
  .tag-type-particle { background: rgba(255,180,77,.18);  color: #ffb44d }
  .tag-type-motion   { background: rgba(255,154,184,.18); color: #ff9ab8 }
  .tag-role { background: rgba(255,255,255,.06); color: #aaa }
</style>
</head>
<body class="boom">

<nav class="b-navbar">
  <span class="b-navbar-brand b-accent">${opts.theme}</span>
  <div class="b-flex b-gap-4">
    <span class="b-chip">${opts.ratio}</span>
    <span class="b-chip">${opts.scenes.length} scenes</span>
    <span class="b-chip">auto-generated</span>
  </div>
</nav>

<section class="b-section">
  <div class="b-container">
    <div class="b-grid b-grid-2 b-gap-4">
${sceneCards}
${compositeCard}
    </div>
  </div>
</section>

<script type="module">
import { renderMotion as __nfMotionRender } from '/src/nf-core/engine/runtime/motion.js';
const DIR = ${JSON.stringify(dirUrl)};
const VP = { width: ${W}, height: ${H} };
const SCENES = ${JSON.stringify(opts.scenes.map(s => ({ id: s.id, filename: s.filename, type: s.type, role: s.role })))};

function scaleStages() {
  document.querySelectorAll('.stage-wrap').forEach(wrap => {
    const stage = wrap.querySelector('.stage');
    if (!stage) return;
    const w = wrap.clientWidth;
    stage.style.transform = \`scale(\${w / ${W}})\`;
  });
}

function mountCanvas(stage, c, params) {
  const canvas = document.createElement('canvas');
  canvas.width = VP.width;
  canvas.height = VP.height;
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  const ctx = canvas.getContext('2d');
  c.render(ctx, 0.5, params, VP);
  stage.innerHTML = '';
  stage.appendChild(canvas);
}

function mountHost(stage, c, params) {
  stage.innerHTML = '';
  c.render(stage, 0.5, params, VP);
}

function mountShader(stage, c, params) {
  const config = c.render(null, 0.5, params, VP);
  if (!config || !config.frag) { stage.innerHTML = '<div style="color:#e06c75;padding:24px;font:12px monospace">shader: no frag</div>'; return; }
  const canvas = document.createElement('canvas');
  canvas.width = VP.width; canvas.height = VP.height;
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  stage.innerHTML = ''; stage.appendChild(canvas);
  const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
  if (!gl) { stage.innerHTML += '<div style="color:#e06c75;padding:24px;font:12px monospace">WebGL unavailable</div>'; return; }
  const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.error(gl.getShaderInfoLog(s));} return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, config.frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { stage.innerHTML += '<div style="color:#e06c75;padding:24px;font:12px monospace">shader link: '+gl.getProgramInfoLog(prog)+'</div>'; return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, VP.width, VP.height);
  const uT = gl.getUniformLocation(prog, 'uT'); if (uT) gl.uniform1f(uT, 0.5);
  const uR = gl.getUniformLocation(prog, 'uR'); if (uR) gl.uniform2f(uR, VP.width, VP.height);
  if (config.uniforms) { for (const [k, v] of Object.entries(config.uniforms)) { const u = gl.getUniformLocation(prog, k); if (u) gl.uniform1f(u, Number(v)); } }
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function mountParticle(stage, c, params) {
  const config = c.render(null, 0.5, params, VP);
  if (!config || !config.emitter) { stage.innerHTML = '<div style="color:#e06c75;padding:24px;font:12px monospace">particle: no emitter</div>'; return; }
  const canvas = document.createElement('canvas');
  canvas.width = VP.width; canvas.height = VP.height;
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  stage.innerHTML = ''; stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, VP.width, VP.height);
  const count = config.emitter.count || 100;
  const seed = config.emitter.seed || 42;
  const spawnFn = config.emitter.spawn;
  function mulberry32(s) { return function(){ let x=s|=0; s=s+0x6D2B79F5|0; x=Math.imul(x^x>>>15,1|x); x=x+Math.imul(x^x>>>7,61|x)^x; return((x^x>>>14)>>>0)/4294967296; }; }
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(seed + i * 37);
    let p;
    if (spawnFn) { p = spawnFn(rng, i, VP); p.i = i; }
    else { p = { i, x: rng()*VP.width, y: rng()*VP.height, depth: rng()*0.8+0.2, size: 0.75+rng()*2.25, alpha: 0.2+rng()*0.7, hue: rng()*360 }; }
    if (config.field) { const d = config.field(p.x, p.y, 0.5); if (d) Object.assign(p, d); }
    ctx.save();
    if (config.render) { config.render(ctx, p, 0.5); }
    else { ctx.globalAlpha = p.alpha||0.5; ctx.fillStyle = '#fff'; ctx.fillRect(p.x, p.y, p.size||2, p.size||2); }
    ctx.restore();
  }
}

function mountMotion(stage, c, params) {
  // Use a smaller viewport for motion preview so shapes are visible in gallery thumbnails
  const motionVP = { width: 400, height: 400 };
  const config = c.render(null, 0.5, params, motionVP);
  if (!config || !config.layers) { stage.innerHTML = '<div style="color:#e06c75;padding:24px;font:12px monospace">motion: no layers</div>'; return; }
  stage.innerHTML = '';
  try { __nfMotionRender(stage, 0.5, config); } catch(e) { stage.innerHTML = '<div style="color:#e06c75;padding:24px;font:12px monospace">motion render: '+e.message+'</div>'; }
}

for (const s of SCENES) {
  const stage = document.getElementById('scene-' + s.id);
  if (!stage) continue;
  try {
    const mod = await import(\`\${DIR}/\${s.filename}\`);
    const c = mod.default;
    const params = c.sample();
    if (s.type === 'canvas') mountCanvas(stage, c, params);
    else if (s.type === 'shader') mountShader(stage, c, params);
    else if (s.type === 'particle') mountParticle(stage, c, params);
    else if (s.type === 'motion') mountMotion(stage, c, params);
    else mountHost(stage, c, params);
  } catch (e) {
    stage.innerHTML = \`<div style="color:#e06c75;padding:48px;font-family:monospace">\${s.id}: \${e.message}</div>\`;
  }
}

${opts.composite && opts.scenes.length >= 2 ? `
// composite: stack by role
const compositeStage = document.getElementById('scene-composite');
if (compositeStage) {
  const roleOrder = ['bg', 'content', 'text', 'chrome', 'overlay'];
  const sorted = [...SCENES].sort((a, b) => roleOrder.indexOf(a.role || '') - roleOrder.indexOf(b.role || ''));
  // pick first of each role
  const seen = new Set();
  const layers = [];
  for (const s of sorted) {
    if (seen.has(s.role)) continue;
    seen.add(s.role);
    layers.push(s);
  }
  for (const s of layers) {
    const layer = document.createElement(s.type === 'canvas' ? 'canvas' : 'div');
    layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    if (s.type === 'canvas') {
      layer.width = VP.width;
      layer.height = VP.height;
    }
    compositeStage.appendChild(layer);
    try {
      const mod = await import(\`\${DIR}/\${s.filename}\`);
      const c = mod.default;
      const params = c.sample();
      if (s.type === 'canvas') c.render(layer.getContext('2d'), 0.5, params, VP);
      else c.render(layer, 0.5, params, VP);
    } catch (e) {
      console.error('composite layer failed:', s.id, e);
    }
  }
}
` : ""}

scaleStages();
window.addEventListener('resize', scaleStages);
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
      if (!filePath.startsWith(rootDir)) {
        res2.writeHead(403); res2.end("forbidden"); return;
      }
      try {
        const s = statSync(filePath);
        if (s.isDirectory()) {
          res2.writeHead(403); res2.end("no directory listing"); return;
        }
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
    server.listen(port, "127.0.0.1", () => {
      res(() => server.close());
    });
  });
}

export async function run(argv: string[]): Promise<number> {
  const { flags } = parseFlags(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }

  const ratio = String(flags.ratio || "").trim();
  const theme = String(flags.theme || "").trim();
  const port = Number(flags.port) || 8765;
  const noOpen = Boolean(flags["no-open"]);
  const noServer = Boolean(flags["no-server"]);
  const composite = flags.composite !== false && flags.composite !== "false";

  if (!(ratio in RATIO_DIRS)) {
    process.stderr.write(`error: --ratio must be one of: ${Object.keys(RATIO_DIRS).join(", ")}\n`);
    return 1;
  }
  if (!theme) {
    process.stderr.write(`error: --theme required\n`);
    return 1;
  }

  const themeDir = join(SCENES_ROOT, RATIO_DIRS[ratio], theme);
  if (!existsSync(themeDir)) {
    process.stderr.write(`error: theme dir not found: ${themeDir}\n`);
    return 1;
  }

  const scenes = await scanScenes(themeDir);
  if (scenes.length === 0) {
    process.stderr.write(`warning: no scenes found in ${themeDir}\n`);
  }

  const html = buildHtml({ ratio, theme, port, scenes, composite });
  const outName = flags.out ? String(flags.out) : `gallery-${RATIO_DIRS[ratio]}-${theme}.html`;
  const outPath = flags.out ? resolve(String(flags.out)) : join(REPO_ROOT, outName);
  writeFileSync(outPath, html);
  process.stdout.write(`✓ gallery written: ${outPath}\n`);
  process.stdout.write(`  ${scenes.length} scenes (${scenes.map(s => s.id).join(", ")})\n`);

  if (noServer) return 0;

  try {
    const stop = await startServer(port, REPO_ROOT);
    const url = `http://localhost:${port}/${outName}`;
    process.stdout.write(`✓ serving ${REPO_ROOT} at http://localhost:${port}\n`);
    process.stdout.write(`  preview: ${url}\n`);
    process.stdout.write(`  Ctrl+C to stop server\n`);
    if (!noOpen) {
      try { execSync(`open "${url}"`); } catch { /* ignore */ }
    }
    // Keep running until SIGINT
    await new Promise<void>(resolve => {
      process.on("SIGINT", () => { stop(); resolve(); });
    });
    return 0;
  } catch (e) {
    process.stderr.write(`server error: ${(e as Error).message}\n`);
    return 1;
  }
}
