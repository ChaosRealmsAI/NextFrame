// nextframe video-guide [--type=lecture|interview] [timeline.json]
// True state machine: detects state → outputs ONE action + exact commands.
// AI reads output → executes → runs video-guide again → next state.

import { parseFlags } from "../_helpers/_io.js";
import { existsSync, readFileSync } from "node:fs";
import { listScenes } from "../../../../nf-core/scenes/index.js";

const HELP = `nextframe video-guide [--type=lecture|interview] [timeline.json]

State machine for video production. Run repeatedly — each call outputs ONE action.

  nextframe video-guide --type=lecture          # Start: what scenes needed?
  nextframe video-guide --type=interview        # Start: 9:16 interview scenes
  nextframe video-guide timeline.json           # Detect state, give next action
`;

// ═══ Video Type Recipes ═══
// Each recipe defines: ratio, required scenes, and a timeline template
const RECIPES = {
  lecture: {
    label: "16:9 讲解视频",
    ratio: "16:9",
    width: 1920,
    height: 1080,
    bg: "#1a1510",
    requiredScenes: [
      { id: "darkGradient", category: "backgrounds", description: "深色暖棕背景" },
      { id: "headlineCenter", category: "typography", description: "居中大标题" },
      { id: "subtitleBar", category: "overlays", description: "底部字幕条，SRT 驱动" },
      { id: "progressBar16x9", category: "overlays", description: "底部进度条" },
    ],
    optionalScenes: [
      { id: "codeTerminal", category: "browser", description: "代码块展示" },
      { id: "flowDiagram", category: "data", description: "流程图：节点+箭头" },
      { id: "eventList", category: "data", description: "竖排圆点列表" },
      { id: "titleCard", category: "typography", description: "带眉题的大标题" },
      { id: "quoteBlock", category: "typography", description: "金色引用块" },
      { id: "slideChrome", category: "overlays", description: "顶栏品牌+水印" },
      { id: "videoClip", category: "media", description: "嵌入真实 MP4 视频" },
    ],
  },
  interview: {
    label: "9:16 访谈切片",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    bg: "#0a0a0a",
    requiredScenes: [
      { id: "interviewBg", category: "backgrounds", description: "深黑访谈背景" },
      { id: "interviewTopBar", category: "overlays", description: "顶部系列标题栏" },
      { id: "interviewBiSub", category: "overlays", description: "双语字幕（中+英）" },
      { id: "progressBar9x16", category: "overlays", description: "底部进度条 9:16" },
    ],
    optionalScenes: [
      { id: "videoClip9x16", category: "media", description: "竖屏视频嵌入" },
    ],
  },
};

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }

  const type = flags.type || null;
  const timelinePath = positional[0];

  // ═══ STATE 1: No timeline, no type → show available types ═══
  if (!timelinePath && !type) {
    process.stdout.write(`═══ VIDEO GUIDE — Choose a type ═══

Available types:
  --type=lecture     16:9 横屏讲解（课程、源码分析、概念讲解）
  --type=interview   9:16 竖屏访谈切片（访谈、对话、评论）

Run:
  nextframe video-guide --type=lecture
  nextframe video-guide --type=interview
`);
    return 0;
  }

  // ═══ STATE 2: Has type, no timeline → check scenes ═══
  if (!timelinePath && type) {
    const recipe = RECIPES[type];
    if (!recipe) {
      process.stderr.write(`error: unknown type "${type}". Use: lecture | interview\n`);
      return 2;
    }

    const scenes = await listScenes();
    const available = new Set(scenes.filter(s => s.ratio === recipe.ratio).map(s => s.id));

    const missing = recipe.requiredScenes.filter(s => !available.has(s.id));
    const optMissing = recipe.optionalScenes.filter(s => !available.has(s.id));
    const ready = recipe.requiredScenes.filter(s => available.has(s.id));

    process.stdout.write(`═══ ${recipe.label} — Scene Check ═══

Required scenes (${ready.length}/${recipe.requiredScenes.length} ready):
`);
    for (const s of recipe.requiredScenes) {
      const ok = available.has(s.id);
      process.stdout.write(`  ${ok ? "✓" : "✗"} ${s.id.padEnd(22)} ${s.description}\n`);
    }

    if (missing.length > 0) {
      // ═══ ACTION: Create missing scenes ═══
      process.stdout.write(`
═══ ACTION: Create ${missing.length} missing scene(s) ═══

`);
      for (const s of missing) {
        const ratioDir = recipe.ratio.replace(":", "x");
        process.stdout.write(`## ${s.id}
nextframe scene-new ${s.id} --ratio=${recipe.ratio} --category=${s.category} --description="${s.description}"
# → Edit index.js: customize render() for ${s.description}
# → Edit meta.description: "${s.description}"
# → Verify: open src/nf-core/scenes/${ratioDir}/${s.category}/${s.id}/preview.html
# → Check: nextframe scenes ${s.id}

`);
      }

      process.stdout.write(`After creating ALL scenes, run again:
  nextframe video-guide --type=${type}
`);
      return 0;
    }

    // All required scenes ready → create timeline
    process.stdout.write(`
All required scenes ready! ✓

Optional scenes (not required but nice to have):
`);
    for (const s of recipe.optionalScenes) {
      const ok = available.has(s.id);
      process.stdout.write(`  ${ok ? "✓" : "○"} ${s.id.padEnd(22)} ${s.description}\n`);
    }

    const timelineFile = `/tmp/${type}-demo.json`;
    process.stdout.write(`
═══ ACTION: Create timeline ═══

Write your timeline JSON to: ${timelineFile}

Template:
{
  "ratio": "${recipe.ratio}",
  "width": ${recipe.width},
  "height": ${recipe.height},
  "fps": 30,
  "duration": ${type === "lecture" ? 30 : 20},
  "background": "${recipe.bg}",
  "layers": [
`);

    // Output template layers with unique ids
    for (let i = 0; i < recipe.requiredScenes.length; i++) {
      const s = recipe.requiredScenes[i];
      const dur = type === "lecture" ? 30 : 20;
      const comma = i < recipe.requiredScenes.length - 1 ? "," : "";
      const layerId = s.id.length <= 12 ? s.id : s.id.slice(0, 10) + i;
      process.stdout.write(`    {"id":"${layerId}","scene":"${s.id}","start":0,"dur":${dur},"params":{}}${comma}\n`);
    }

    process.stdout.write(`  ]
}

After writing the file:
  nextframe video-guide ${timelineFile}
`);
    return 0;
  }

  // ═══ STATE 3+: Has timeline → detect state ═══
  if (!existsSync(timelinePath)) {
    process.stderr.write(`error: ${timelinePath} not found\n`);
    return 2;
  }

  let timeline;
  try {
    timeline = JSON.parse(readFileSync(timelinePath, "utf-8"));
  } catch (e) {
    process.stderr.write(`error: cannot parse ${timelinePath}: ${e.message}\n`);
    return 2;
  }

  const layers = timeline.layers || [];
  const dur = timeline.duration || 0;
  const w = timeline.width || 1920;
  const h = timeline.height || 1080;

  // No layers
  if (layers.length === 0) {
    process.stdout.write(`═══ ACTION: Add layers to timeline ═══

Timeline: ${timelinePath} (${dur}s, ${w}x${h})
Layers: 0 — empty!

Add layers to the JSON file. Each layer = one scene.
Bottom layer = background, top layer = overlays.

After adding layers:
  nextframe video-guide ${timelinePath}
`);
    return 0;
  }

  // Has layers — check if HTML exists
  const htmlPath = timelinePath.replace(/\.json$/, ".html");
  const mp4Path = timelinePath.replace(/\.json$/, ".mp4");

  if (!existsSync(htmlPath)) {
    process.stdout.write(`═══ ACTION: Validate + Build ═══

Timeline: ${timelinePath}
Layers: ${layers.length} | Duration: ${dur}s

`);
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      process.stdout.write(`  [${i}] ${(l.scene || "?").padEnd(20)} ${l.start || 0}s — ${((l.start || 0) + (l.dur || 0)).toFixed(0)}s\n`);
    }

    process.stdout.write(`
Commands:
  nextframe validate ${timelinePath}
  nextframe build ${timelinePath} -o ${htmlPath}
  open ${htmlPath}

Check in browser:
  ✓ Background correct? (warm brown, not purple)
  ✓ Text readable? No overlap?
  ✓ Scrub through — all phases correct?
  ✓ Progress bar fills?

If OK:
  nextframe video-guide ${timelinePath}
If issues:
  Fix timeline JSON → rebuild → recheck
`);
    return 0;
  }

  // Has HTML — check if MP4 exists
  if (!existsSync(mp4Path)) {
    process.stdout.write(`═══ ACTION: Record video ═══

HTML: ${htmlPath} ✓
Duration: ${dur}s

Record:
  /Users/Zhuanz/bigbang/MediaAgentTeam/recorder/target/release/recorder slide ${htmlPath} --out ${mp4Path} --width ${w} --height ${h} --fps 30 --dpr 2

Verify:
  ffprobe ${mp4Path} 2>&1 | grep -E "Duration|Video:"
  open ${mp4Path}

After recording:
  nextframe video-guide ${timelinePath}
`);
    return 0;
  }

  // Has MP4 — DONE
  process.stdout.write(`═══ DONE ═══

Timeline: ${timelinePath} ✓
HTML:     ${htmlPath} ✓
MP4:      ${mp4Path} ✓

Pipeline complete!
  open ${mp4Path}
`);
  return 0;
}
