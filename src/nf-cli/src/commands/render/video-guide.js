// nextframe video-guide [--type=lecture|interview] [timeline.json]
// Strict state machine router. Detects state → outputs the FULL prompt for that state.
// Each state has mandatory verification. AI cannot skip verification.

import { parseFlags } from "../_helpers/_io.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listScenes } from "nf-core/scenes/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATES_DIR = resolve(HERE, "states");

const HELP = `nextframe video-guide [--type=lecture|interview] [timeline.json]

Strict state machine for video production.
Each state outputs a COMPLETE prompt with mandatory verification.
Run repeatedly — each call detects state and outputs next action.

States:
  01-scene-check    → Check what scenes exist
  02-scene-create   → Create missing scenes
  03-scene-verify   → ⛔ Verify each scene (screenshot + checklist)
  04-timeline       → Assemble timeline JSON
  05-build-verify   → Build HTML + ⛔ verify in browser
  06-record-verify  → Record MP4 + ⛔ verify frames

Usage:
  nextframe video-guide --type=lecture     # Start
  nextframe video-guide timeline.json      # Continue from current state
`;

const RECIPES = {
  lecture: {
    label: "16:9 讲解视频",
    ratio: "16:9",
    ratioDir: "16x9",
    width: 1920,
    height: 1080,
    bg: "#1a1510",
    requiredScenes: [
      { id: "darkGradient", category: "backgrounds", description: "深色暖棕背景" },
      { id: "headlineCenter", category: "typography", description: "居中大标题" },
      { id: "subtitleBar", category: "overlays", description: "底部字幕条，SRT 驱动" },
      { id: "progressBar16x9", category: "overlays", description: "底部进度条" },
    ],
  },
  interview: {
    label: "9:16 访谈切片",
    ratio: "9:16",
    ratioDir: "9x16",
    width: 1080,
    height: 1920,
    bg: "#0a0a0a",
    requiredScenes: [
      { id: "interviewBg", category: "backgrounds", description: "深黑访谈背景" },
      { id: "interviewTopBar", category: "overlays", description: "顶部系列标题栏" },
      { id: "interviewBiSub", category: "overlays", description: "双语字幕（中+英）" },
      { id: "progressBar9x16", category: "overlays", description: "底部进度条 9:16" },
    ],
  },
};

function readState(filename) {
  const path = resolve(STATES_DIR, filename);
  if (!existsSync(path)) return `[ERROR: ${filename} not found at ${path}]`;
  return readFileSync(path, "utf-8");
}

function fillTemplate(text, vars) {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }

  const type = flags.type || null;
  const timelinePath = positional[0];

  // ═══ No type, no timeline → show help ═══
  if (!timelinePath && !type) {
    process.stdout.write(`═══ VIDEO GUIDE — Choose a type ═══

  nextframe video-guide --type=lecture     16:9 横屏讲解
  nextframe video-guide --type=interview   9:16 竖屏访谈
  nextframe video-guide timeline.json      从时间线继续
`);
    return 0;
  }

  // ═══ Has type → check scenes ═══
  if (!timelinePath && type) {
    const recipe = RECIPES[type];
    if (!recipe) {
      process.stderr.write(`error: unknown type "${type}". Use: lecture | interview\n`);
      return 2;
    }

    const scenes = await listScenes();
    const available = new Set(scenes.filter(s => s.ratio === recipe.ratio).map(s => s.id));
    const missing = recipe.requiredScenes.filter(s => !available.has(s.id));

    if (missing.length > 0) {
      // ═══ STATE 02: Create missing scenes ═══
      process.stdout.write(`═══ STATE 02: Create Missing Scenes ═══
Current: ${recipe.label}
Missing: ${missing.length} scene(s)

`);
      const statePrompt = readState("02-scene-create.md");
      process.stdout.write(statePrompt);

      process.stdout.write(`\n═══ SPECIFIC: Create these scenes ═══\n\n`);
      for (const s of missing) {
        process.stdout.write(`## Create: ${s.id}
\`\`\`bash
node src/nf-cli/bin/nextframe.js scene-new ${s.id} --ratio=${recipe.ratio} --category=${s.category} --description="${s.description}"
\`\`\`
Then customize render() for: ${s.description}

`);
      }

      process.stdout.write(`═══ After creating EACH scene → run STATE 03 verify ═══

For each scene you created:
`);
      const verifyPrompt = readState("03-scene-verify.md");
      const vars = { ratioDir: recipe.ratioDir, ratio: recipe.ratio, type };
      process.stdout.write(fillTemplate(verifyPrompt, vars));

      process.stdout.write(`\n═══ After ALL scenes verified → run again ═══
  nextframe video-guide --type=${type}
`);
      return 0;
    }

    // ═══ STATE 04: All scenes ready → assemble timeline ═══
    process.stdout.write(`═══ STATE 04: Assemble Timeline ═══
Current: ${recipe.label}
All ${recipe.requiredScenes.length} required scenes: ✓

Available scenes:
`);
    for (const s of recipe.requiredScenes) {
      process.stdout.write(`  ✓ ${s.id.padEnd(22)} ${s.description}\n`);
    }
    // Also list available optional scenes
    const allForRatio = scenes.filter(s => s.ratio === recipe.ratio);
    const extraScenes = allForRatio.filter(s => !recipe.requiredScenes.find(r => r.id === s.id));
    if (extraScenes.length > 0) {
      process.stdout.write(`\nExtra available scenes:\n`);
      for (const s of extraScenes) {
        process.stdout.write(`  + ${s.id.padEnd(22)} ${s.description}\n`);
      }
    }

    process.stdout.write(`\n`);
    const timelinePrompt = readState("04-timeline-assemble.md");
    const dur = type === "lecture" ? 30 : 20;
    const timelineFile = `/tmp/${type}-video.json`;
    const vars = {
      ratio: recipe.ratio, width: recipe.width, height: recipe.height,
      bg: recipe.bg, duration: dur, timelinePath: timelineFile, type,
    };
    process.stdout.write(fillTemplate(timelinePrompt, vars));

    process.stdout.write(`\n═══ Timeline file to create: ${timelineFile} ═══
After writing → validate → run:
  nextframe video-guide ${timelineFile}
`);
    return 0;
  }

  // ═══ Has timeline → detect state ═══
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
  const htmlPath = timelinePath.replace(/\.json$/, ".html");
  const mp4Path = timelinePath.replace(/\.json$/, ".mp4");

  if (layers.length === 0) {
    process.stdout.write(`═══ STATE 04: Timeline is empty — add layers ═══
File: ${timelinePath} (${dur}s, ${w}x${h})
Layers: 0

Edit the file and add layers. Then:
  nextframe video-guide ${timelinePath}
`);
    return 0;
  }

  if (!existsSync(htmlPath)) {
    // ═══ STATE 05: Build + Verify ═══
    process.stdout.write(`═══ STATE 05: Build HTML + Verify ═══
Timeline: ${timelinePath}
Layers: ${layers.length} | Duration: ${dur}s | Size: ${w}x${h}

Layer summary:
`);
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      process.stdout.write(`  [${i}] ${(l.scene || "?").padEnd(20)} ${l.start || 0}s — ${((l.start || 0) + (l.dur || 0)).toFixed(0)}s\n`);
    }
    process.stdout.write(`\n`);

    const buildPrompt = readState("05-build-html.md");
    const mid = Math.floor(dur / 2);
    const vars = { timelinePath, htmlPath, width: w, height: h, duration: dur, mid, end: dur - 2 };
    process.stdout.write(fillTemplate(buildPrompt, vars));
    return 0;
  }

  if (!existsSync(mp4Path)) {
    // ═══ STATE 06: Record + Verify ═══
    process.stdout.write(`═══ STATE 06: Record + Verify Video ═══
HTML: ${htmlPath} ✓
Duration: ${dur}s | Size: ${w}x${h}

`);
    const recordPrompt = readState("06-record-verify.md");
    const mid = Math.floor(dur / 2);
    const vars = { htmlPath, mp4Path, width: w, height: h, duration: dur, mid, end: dur - 2 };
    process.stdout.write(fillTemplate(recordPrompt, vars));
    return 0;
  }

  // ═══ DONE ═══
  process.stdout.write(`═══ PIPELINE COMPLETE ═══

Timeline: ${timelinePath} ✓
HTML:     ${htmlPath} ✓
MP4:      ${mp4Path} ✓
Duration: ${dur}s | ${w}x${h}

Final check:
  open ${mp4Path}
  ffprobe ${mp4Path} 2>&1 | grep -E "Duration|Video:"
`);
  return 0;
}
