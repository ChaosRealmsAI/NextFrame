// nextframe scene-new <name> --ratio=16:9 --category=data --tech=dom [--description="..."]
// Creates scene with WORKING render code (not TODOs). Ready to preview immediately.

import { parseFlags } from "../_helpers/_io.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";

const RATIOS = ["16:9", "9:16", "4:3"];
const RATIO_DIRS = { "16:9": "16x9", "9:16": "9x16", "4:3": "4x3" };
const RATIO_SIZES = { "16:9": [1920, 1080], "9:16": [1080, 1920], "4:3": [1440, 1080] };
const CATEGORIES = ["backgrounds", "typography", "data", "shapes", "overlays", "media", "browser"];
const TECHS = ["canvas2d", "webgl", "svg", "dom", "video", "lottie"];

const HELP = `nextframe scene-new <name> --ratio=<16:9|9:16|4:3> --category=<cat> [--tech=dom] [--description="..."]

Create a new scene component with WORKING code. Opens preview immediately.

Example:
  nextframe scene-new subtitleBar --ratio=16:9 --category=overlays --description="底部字幕条，SRT 驱动"

Creates ready-to-use scene:
  src/nf-core/scenes/16x9/overlays/subtitleBar/
  ├── index.js       (working render + complete meta)
  └── preview.html   (self-contained preview with controls)

After creation you MUST:
  1. Edit index.js — customize render() for your specific visual
  2. open preview.html — verify visually in browser
  3. nextframe scenes <name> — confirm meta loads correctly
`;

// Category-specific render templates that actually work
function renderTemplate(name, category, ratio) {
  const [w, h] = RATIO_SIZES[ratio];
  switch (category) {
    case "backgrounds":
      return `export function render(t, params, vp) {
  const bg = params.bg || "#1a1510";
  const glowColor = params.glowColor || "rgba(218,119,86,0.12)";
  return '<div style="position:absolute;left:0;top:0;width:' + vp.width + 'px;height:' + vp.height + 'px;background:' + bg + '">' +
    '<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,' + glowColor + ' 0%,transparent 60%)"></div>' +
  '</div>';
}`;

    case "typography":
      return `export function render(t, params, vp) {
  var text = params.text || "标题文字";
  var fontSize = params.fontSize || ${ratio === "9:16" ? 36 : 48};
  var color = params.color || "#f5ece0";
  var accentColor = params.accentColor || "#da7756";
  var opacity = Math.min(1, t / 0.5); // 0.5s fade in
  var y = params.y || 0;
  var pos = y > 0
    ? 'position:absolute;left:60px;right:60px;top:' + y + 'px;text-align:center'
    : 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 60px';
  return '<div style="' + pos + '">' +
    '<div style="font:700 ' + fontSize + 'px Georgia,\\'Noto Serif SC\\',serif;color:' + color + ';text-align:center;line-height:1.3;opacity:' + opacity + '">' + text + '</div>' +
  '</div>';
}`;

    case "overlays":
      return `export function render(t, params, vp) {
  var color = params.color || "#da7756";
  var height = params.height || 3;
  var progress = typeof params.progress === "number" ? params.progress : (params.duration ? t / params.duration : 0);
  progress = Math.max(0, Math.min(1, progress));
  return '<div style="position:absolute;left:0;bottom:0;width:' + vp.width + 'px;height:' + height + 'px;background:rgba(245,236,224,0.08)">' +
    '<div style="height:100%;width:' + (progress * 100) + '%;background:' + color + ';transition:none"></div>' +
  '</div>';
}`;

    case "data":
      return `function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export function render(t, params, vp) {
  var items = params.items || [{ label: "Item 1" }, { label: "Item 2" }, { label: "Item 3" }];
  var color = params.color || "#da7756";
  var textColor = params.textColor || "#f5ece0";
  var opacity = Math.min(1, t / 0.6);
  var html = items.map(function(item, i) {
    var itemOp = Math.min(1, Math.max(0, (t - i * 0.2) / 0.4));
    return '<div style="display:flex;align-items:center;gap:12px;opacity:' + itemOp + '">' +
      '<div style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>' +
      '<div style="font:500 18px system-ui,sans-serif;color:' + textColor + '">' + esc(item.label) + '</div>' +
    '</div>';
  }).join("");
  return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:' + opacity + '">' +
    '<div style="display:flex;flex-direction:column;gap:16px">' + html + '</div>' +
  '</div>';
}`;

    case "browser":
      return `function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export function render(t, params, vp) {
  var title = params.title || "Terminal";
  var lines = params.lines || [{ text: "$ echo hello", type: "command" }, { text: "hello", type: "output" }];
  var bg = params.bg || "#1e1e2e";
  var width = params.width || ${ratio === "9:16" ? 900 : 1400};
  var x = params.x || ${ratio === "9:16" ? 90 : 260};
  var y = params.y || ${ratio === "9:16" ? 200 : 120};
  var opacity = Math.min(1, t / 0.5);

  var linesHtml = lines.map(function(line, i) {
    var lineOp = Math.min(1, Math.max(0, (t - 0.3 - i * 0.15) / 0.3));
    var color = line.type === "command" ? "#7ec699" : line.type === "comment" ? "rgba(245,236,224,0.4)" : "#f5ece0";
    return '<div style="opacity:' + lineOp + ';color:' + color + '">' + esc(line.text) + '</div>';
  }).join("");

  return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + width + 'px;opacity:' + opacity + '">' +
    '<div style="background:#2a2a3a;border-radius:10px 10px 0 0;padding:8px 16px;display:flex;gap:6px">' +
      '<div style="width:10px;height:10px;border-radius:50%;background:#e06c75"></div>' +
      '<div style="width:10px;height:10px;border-radius:50%;background:#d4b483"></div>' +
      '<div style="width:10px;height:10px;border-radius:50%;background:#7ec699"></div>' +
      '<div style="font:500 12px system-ui;color:rgba(245,236,224,0.5);margin-left:8px">' + esc(title) + '</div>' +
    '</div>' +
    '<div style="background:' + bg + ';border-radius:0 0 10px 10px;padding:20px;font:14px \\'SF Mono\\',\\'JetBrains Mono\\',monospace;line-height:1.7">' +
      linesHtml +
    '</div>' +
  '</div>';
}`;

    case "media":
      return `export function render(t, params, vp) {
  var src = params.src || "";
  var x = params.x || 0;
  var y = params.y || 0;
  var width = params.width || vp.width;
  var height = params.height || vp.height;
  var borderRadius = params.borderRadius || 0;
  var opacity = Math.min(1, t / 0.3);
  var currentTime = t;
  var persistKey = "vc-" + String(src).replace(/[^a-zA-Z0-9]/g, "").slice(-20);

  if (!src) {
    return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + width + 'px;height:' + height + 'px;background:#2a2319;border-radius:' + borderRadius + 'px;display:flex;align-items:center;justify-content:center;color:rgba(245,236,224,0.3);font:14px system-ui">No video src</div>';
  }
  return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + width + 'px;height:' + height + 'px;border-radius:' + borderRadius + 'px;overflow:hidden;opacity:' + opacity + '">' +
    '<video data-nf-persist="' + persistKey + '" data-nf-time="' + currentTime + '" src="' + src + '" playsinline preload="auto" style="width:100%;height:100%;object-fit:cover"></video>' +
  '</div>';
}`;

    case "shapes":
      return `export function render(t, params, vp) {
  var color = params.color || "#da7756";
  var size = params.size || 200;
  var x = params.x || (vp.width / 2);
  var y = params.y || (vp.height / 2);
  var scale = Math.min(1, t / 0.5);
  return '<div style="position:absolute;left:' + (x - size/2) + 'px;top:' + (y - size/2) + 'px;width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:3px solid ' + color + ';transform:scale(' + scale + ');opacity:' + scale + '"></div>';
}`;

    default:
      return `export function render(t, params, vp) {
  return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f5ece0;font:24px system-ui">' + (params.text || "${name}") + '</div>';
}`;
  }
}

function metaTemplate(name, category, ratio, tech, description) {
  const [w, h] = RATIO_SIZES[ratio];
  const zHint = category === "backgrounds" ? "bottom" : category === "overlays" ? "top" : "middle";
  const desc = description || `${name} — ${category} component for ${ratio}`;
  return `export const meta = {
  id: "${name}",
  version: 1,
  ratio: "${ratio}",
  category: "${category}",
  label: "${name}",
  description: "${desc}",
  tech: "${tech}",
  duration_hint: 10,
  loopable: ${category === "backgrounds"},
  z_hint: "${zHint}",
  tags: ["${category}", "${name.toLowerCase()}"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": {},
  },
  params: {},
  ai: {
    when: "Use as ${category} layer in ${ratio} video",
    how: "Add as layer: { scene: \\"${name}\\", start: 0, dur: 10, params: {} }",
    example: {},
    avoid: "",
    pairs_with: [],
  },
};`;
}

function previewTemplate(name, ratio, tech, renderCode) {
  const [w, h] = RATIO_SIZES[ratio];
  const scaleX = ratio === "9:16" ? 0.35 : 0.5;
  const previewW = Math.round(w * scaleX);
  const previewH = Math.round(h * scaleX);

  // Strip "export " from render code for inline use
  const inlineRender = renderCode
    .replace(/^export\s+/gm, "")
    .replace(/^function esc/gm, "function esc"); // keep helper functions

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${name} ${ratio} Preview</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111;color:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;padding:20px;min-height:100vh}
.info{font-size:13px;color:#888;margin-bottom:12px}.info span{color:#da7756;font-weight:700}
.canvas-wrap{position:relative;width:${previewW}px;height:${previewH}px;background:#1a1510;border:1px solid #333;border-radius:8px;overflow:hidden}
.canvas-inner{width:${w}px;height:${h}px;transform-origin:0 0;transform:scale(${scaleX});position:absolute;top:0;left:0}
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
  ${inlineRender}

  var DEMO = {};
  var duration = 10;
  var canvas = document.getElementById('canvas');
  var scrubber = document.getElementById('scrubber');
  var td = document.getElementById('timeDisplay');
  var pb = document.getElementById('playBtn');
  function rf(t){canvas.innerHTML='<div style="position:absolute;inset:0;background:#1a1510"></div><div style="position:absolute;inset:0">'+render(t,DEMO,{width:${w},height:${h}})+'</div>';}
  scrubber.addEventListener('input',function(){var t=(scrubber.value/1000)*duration;td.textContent=t.toFixed(2)+'s';rf(t);});
  var playing=false,st=0,so=0;
  function tick(){if(!playing)return;var t=((Date.now()-st)/1000+so)%duration;scrubber.value=(t/duration)*1000;td.textContent=t.toFixed(2)+'s';rf(t);requestAnimationFrame(tick);}
  pb.addEventListener('click',function(){playing=!playing;if(playing){st=Date.now();so=(scrubber.value/1000)*duration;pb.textContent='⏸ Pause';tick();}else{pb.textContent='▶ Play';}});
  rf(0);
})();
</script>
</body>
</html>`;
}

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
  const description = flags.description || "";

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

  const scenesRoot = resolve(dirname(createRequire(import.meta.url).resolve("nf-core/package.json")), "scenes");
  const dir = resolve(scenesRoot, RATIO_DIRS[ratio], category, name);

  if (existsSync(dir)) {
    process.stderr.write(`error: ${dir} already exists\n`);
    return 2;
  }

  mkdirSync(dir, { recursive: true });

  const renderCode = renderTemplate(name, category, ratio);
  const metaCode = metaTemplate(name, category, ratio, tech, description);

  // Build index.js
  const helperCode = renderCode.includes("function esc(")
    ? ""
    : 'function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }\n';

  const indexJs = `${metaCode}

${helperCode}function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }
function fadeIn(t, start, dur) { return ease3((t - start) / dur); }

${renderCode}

export function screenshots() {
  return [
    { t: 0, label: "start" },
    { t: 5, label: "mid" },
    { t: 9, label: "end" },
  ];
}

export function lint(params) {
  return { ok: true, errors: [] };
}
`;

  const previewHtml = previewTemplate(name, ratio, tech, renderCode);

  writeFileSync(resolve(dir, "index.js"), indexJs);
  writeFileSync(resolve(dir, "preview.html"), previewHtml);

  process.stdout.write(`✓ Created ${name} (${ratio} ${category})
  ${dir}/

Scene is WORKING — preview immediately:
  open ${dir}/preview.html

Then customize:
  1. Edit index.js render() — change the visual
  2. Edit index.js meta.params — declare your parameters
  3. Edit index.js meta.description — write a one-line Chinese description
  4. Refresh preview.html in browser to verify
  5. nextframe scenes ${name} — confirm it loads

Scene contract reference:
  cat src/nf-core/scenes/16x9/backgrounds/darkGradient/index.js
`);
  return 0;
}
