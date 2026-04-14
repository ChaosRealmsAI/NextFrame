// nextframe scene-new <name> --ratio=16:9 --category=data --tech=dom
// Creates scene skeleton: directory + index.js template + preview.html template.
// Outputs next step instructions.

import { parseFlags } from "../_helpers/_io.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RATIOS = ["16:9", "9:16", "4:3"];
const RATIO_DIRS = { "16:9": "16x9", "9:16": "9x16", "4:3": "4x3" };
const CATEGORIES = ["backgrounds", "typography", "data", "shapes", "overlays", "media", "browser"];
const TECHS = ["canvas2d", "webgl", "svg", "dom", "video", "lottie"];

const HELP = `nextframe scene-new <name> --ratio=<16:9|9:16|4:3> --category=<cat> [--tech=dom]

Create a new scene component skeleton.

Example:
  nextframe scene-new headlineCenter --ratio=16:9 --category=typography --tech=dom

Creates:
  src/nf-core/scenes/16x9/typography/headlineCenter/
  ├── index.js       (template with all required exports)
  └── preview.html   (self-contained, file:// compatible)

Next step after creation:
  1. Edit index.js — fill in render() logic
  2. Edit preview.html — add demo params
  3. nextframe scene-preview headlineCenter  (open and verify visually)
  4. nextframe scene-validate headlineCenter  (must pass 16/16)
`;

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);

  if (flags.help || positional.length === 0) {
    process.stdout.write(HELP);
    return positional.length === 0 ? 3 : 0;
  }

  const name = positional[0];
  const ratio = flags.ratio || "16:9";
  const category = flags.category;
  const tech = flags.tech || "dom";

  // Validate
  if (!RATIOS.includes(ratio)) {
    process.stderr.write(`error: ratio must be one of ${RATIOS.join(", ")}\n`);
    return 2;
  }
  if (!category || !CATEGORIES.includes(category)) {
    process.stderr.write(`error: --category required, must be one of ${CATEGORIES.join(", ")}\n`);
    return 2;
  }
  if (!TECHS.includes(tech)) {
    process.stderr.write(`error: --tech must be one of ${TECHS.join(", ")}\n`);
    return 2;
  }

  const scenesRoot = resolve(fileURLToPath(import.meta.url), "../../../../../nf-core/scenes");
  const dir = resolve(scenesRoot, RATIO_DIRS[ratio], category, name);

  if (existsSync(dir)) {
    process.stderr.write(`error: ${dir} already exists\n`);
    return 2;
  }

  mkdirSync(dir, { recursive: true });

  // Generate index.js template
  const indexJs = `export const meta = {
  id: "${name}",
  version: 1,
  ratio: "${ratio}",
  category: "${category}",
  label: "${name}",
  description: "TODO: 中文一句话描述，说清楚这个 scene 只做什么一件事",
  tech: "${tech}",
  duration_hint: 10,
  loopable: false,
  z_hint: "middle",
  tags: ["TODO", "至少3个", "搜索标签"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { /* TODO: params 子集 */ },
    "dark": { /* TODO */ },
    "minimal": { /* TODO */ },
  },
  params: {
    // TODO: 每个 param 必须有 type + default + label + semantic + group
    // text: { type: "string", required: true, label: "文字内容", semantic: "main text content", group: "content" },
  },
  ai: {
    when: "TODO: 什么场景适合用",
    how: "TODO: 怎么在 timeline 里用",
    example: { /* TODO: 完整 params 示例 */ },
    theme_guide: { "anthropic-warm": "TODO" },
    avoid: "TODO: 什么情况不要用",
    pairs_with: [],
  },
};

function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }
function fadeIn(t, start, dur) { return ease3((t - start) / dur); }
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export function render(t, params, vp) {
  // TODO: 实现渲染逻辑
  // 纯函数：相同 (t, params, vp) → 相同 HTML
  // 只做一件事！
  return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f5ece0;font-size:24px">TODO: ${name} render</div>';
}

export function screenshots() {
  return [
    { t: 0, label: "开始" },
    { t: 5, label: "中间" },
    { t: 9, label: "结束" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  // TODO: 检查 required 参数、数值范围、文字溢出
  return { ok: errors.length === 0, errors };
}
`;

  // Generate preview.html template
  const previewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${name} ${ratio} Preview</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111;color:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;padding:20px;min-height:100vh}
.info{font-size:13px;color:#888;margin-bottom:12px}
.info span{color:#da7756;font-weight:700}
.canvas-wrap{position:relative;width:960px;height:540px;background:#1a1510;border:1px solid #333;border-radius:8px;overflow:hidden}
.canvas-inner{width:1920px;height:1080px;transform-origin:0 0;transform:scale(0.5);position:absolute;top:0;left:0}
.controls{margin-top:16px;display:flex;gap:16px;align-items:center}
.controls input[type=range]{width:400px}
.controls button{background:#da7756;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:14px}
.time-display{font-family:monospace;font-size:14px;color:#da7756;min-width:80px}
</style>
</head>
<body>
<div class="info"><span>${name}</span> · ${ratio} · ${tech}</div>
<div class="canvas-wrap"><div class="canvas-inner" id="canvas"></div></div>
<div class="controls">
  <button id="playBtn">▶ Play</button>
  <input type="range" id="scrubber" min="0" max="1000" value="0">
  <div class="time-display" id="timeDisplay">0.00s</div>
</div>
<script>
(function(){
  // TODO: 从 index.js 复制 render 函数到这里（去掉 export）
  function render(t, params, vp) {
    return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f5ece0;font-size:24px">TODO: implement render</div>';
  }

  var DEMO = { /* TODO: 填入 demo 参数 */ };
  var duration = 10;
  var canvas = document.getElementById('canvas');
  var scrubber = document.getElementById('scrubber');
  var timeDisplay = document.getElementById('timeDisplay');
  var playBtn = document.getElementById('playBtn');

  function renderFrame(t) {
    canvas.innerHTML = '<div style="position:absolute;inset:0;background:#1a1510"></div>' +
      '<div style="position:absolute;inset:0">' + render(t, DEMO, {width:1920,height:1080}) + '</div>';
  }
  scrubber.addEventListener('input', function(){
    var t = (scrubber.value/1000)*duration;
    timeDisplay.textContent = t.toFixed(2)+'s';
    renderFrame(t);
  });
  var playing=false, startTime=0, startOffset=0;
  function tick(){
    if(!playing) return;
    var t = ((Date.now()-startTime)/1000+startOffset)%duration;
    scrubber.value = (t/duration)*1000;
    timeDisplay.textContent = t.toFixed(2)+'s';
    renderFrame(t);
    requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', function(){
    playing = !playing;
    if(playing){ startTime=Date.now(); startOffset=(scrubber.value/1000)*duration; playBtn.textContent='⏸ Pause'; tick(); }
    else { playBtn.textContent='▶ Play'; }
  });
  renderFrame(0);
})();
<\/script>
</body>
</html>`;

  writeFileSync(resolve(dir, "index.js"), indexJs);
  writeFileSync(resolve(dir, "preview.html"), previewHtml);

  process.stdout.write(`✓ Created ${name} scene skeleton:
  ${dir}/
  ├── index.js       (template — fill in render logic)
  └── preview.html   (template — fill in demo params)

Next steps:
  1. Edit index.js — implement render(t, params, vp), fill meta fields marked TODO
  2. Edit preview.html — copy render function inline, add demo params
  3. nextframe scene-preview ${name}    ← open and verify visually (BLOCKING)
  4. nextframe scene-validate ${name}   ← must pass all checks
  5. Commit when both pass
`);
  return 0;
}
