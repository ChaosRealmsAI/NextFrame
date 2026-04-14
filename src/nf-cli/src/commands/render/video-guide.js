// nextframe video-guide [timeline.json] [--ratio=16:9]
// State machine navigator — reads current state, outputs what to do next.
// Each output is a self-contained prompt with exact CLI commands.

import { parseFlags } from "../_helpers/_io.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listScenes } from "../../../../nf-core/scenes/index.js";

const HELP = `nextframe video-guide [timeline.json] [--ratio=16:9] [--json]

State machine navigator for video production.
Reads current state → tells you exactly what to do next.

Without arguments: starts from Step 1 (scene inventory).
With timeline.json: detects current step and gives next action.

Example:
  nextframe video-guide                     # Start: what scenes exist?
  nextframe video-guide timeline.json       # Where am I? What's next?
  nextframe video-guide --ratio=9:16        # Scene inventory for vertical
`;

const STEPS = [
  { id: "inventory", label: "Step 1: Scene Inventory" },
  { id: "scene-dev", label: "Step 2: Build Missing Scenes" },
  { id: "assemble", label: "Step 3: Assemble Timeline" },
  { id: "validate", label: "Step 4: Validate + Build" },
  { id: "record", label: "Step 5: Record Video" },
];

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const ratio = flags.ratio || "16:9";
  const timelinePath = positional[0];

  // ═══ No timeline → Step 1: Scene Inventory ═══
  if (!timelinePath) {
    const scenes = await listScenes();
    const matching = scenes.filter(s => s.ratio === ratio);
    const byCategory = {};
    for (const s of matching) {
      (byCategory[s.category] || (byCategory[s.category] = [])).push(s);
    }

    process.stdout.write(`═══ ${STEPS[0].label} ═══
Ratio: ${ratio}
Available scenes: ${matching.length}

`);
    for (const [cat, items] of Object.entries(byCategory).sort()) {
      process.stdout.write(`  ${cat}:\n`);
      for (const s of items) {
        process.stdout.write(`    ${s.id.padEnd(20)} — ${s.description}\n`);
      }
      process.stdout.write("\n");
    }

    process.stdout.write(`═══ What to do next ═══

1. Decide what video to make — what layers/scenes do you need?

2. ⚠️  BEFORE using any scene, check its defaults:
     nextframe scenes <id>
   Look at: default_theme, themes{}, params defaults.
   Example: auroraGradient default_theme="obsidian-violet" (purple!) — if you want warm brown,
   pass params: { hueA:25, hueB:15, hueC:35, intensity:0.3 } or use theme "sunset-warm".
   DO NOT blindly use a scene without checking what it looks like by default.

3. If a scene you need is missing:
     nextframe scene-new <name> --ratio=${ratio} --category=<cat>
     [edit index.js — implement render(), fill meta]
     [edit preview.html — inline render + demo params]
     nextframe scene-preview <name>          ← MUST open and verify visually
     nextframe scene-validate <name>         ← MUST pass all checks

4. When all scenes are ready:
     nextframe video-guide --ratio=${ratio}  ← run again to confirm
     Then: nextframe new -o timeline.json --ratio=${ratio} --duration=<N>
`);
    return 0;
  }

  // ═══ Timeline exists → detect step ═══
  if (!existsSync(timelinePath)) {
    process.stderr.write(`error: ${timelinePath} not found\n`);
    process.stderr.write(`To start: nextframe new -o ${timelinePath} --ratio=${ratio} --duration=30\n`);
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

  // Detect state
  if (layers.length === 0) {
    // Step 3: Empty timeline, need to add layers
    process.stdout.write(`═══ ${STEPS[2].label} ═══
Timeline: ${timelinePath}
Ratio: ${timeline.ratio || ratio} (${w}x${h})
Duration: ${dur}s
Layers: 0 (empty)

═══ What to do next ═══

Add layers one by one. Each layer = one scene component.
Order matters: first layer = bottom (background), last = top (overlays).

Typical layer order:
  nextframe layer-add ${timelinePath} --scene=auroraGradient --start=0 --dur=${dur} --params='{"intensity":0.8}'
  nextframe layer-add ${timelinePath} --scene=slideChrome --start=0 --dur=${dur} --params='{"brand":"OPC","series":"系列名","epTitle":"集标题","watermark":"E01"}'
  nextframe layer-add ${timelinePath} --scene=codeTerminal --start=0 --dur=14 --params='{"title":"Terminal","lines":[{"text":"$ hello","type":"prompt"}]}'
  nextframe layer-add ${timelinePath} --scene=titleCard --start=0 --dur=14 --params='{"eyebrow":"DIM 01","title":"标题","x":700}'
  nextframe layer-add ${timelinePath} --scene=subtitleBar --start=0 --dur=${dur} --params='{"srt":[{"s":0,"e":3,"t":"字幕文字"}]}'
  nextframe layer-add ${timelinePath} --scene=progressBar --start=0 --dur=${dur} --params='{}'

After adding layers:
  nextframe layer-list ${timelinePath}       ← review all layers
  nextframe validate ${timelinePath}         ← must pass
  nextframe video-guide ${timelinePath}      ← run again for next step
`);
    return 0;
  }

  // Has layers — check if built
  const htmlPath = timelinePath.replace(/\.json$/, ".html");
  const hasHtml = existsSync(htmlPath);

  if (!hasHtml) {
    // Step 4: Validate + Build
    process.stdout.write(`═══ ${STEPS[3].label} ═══
Timeline: ${timelinePath}
Layers: ${layers.length}
Duration: ${dur}s

Layer summary:
`);
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      process.stdout.write(`  [${i}] ${(l.scene || "?").padEnd(20)} ${l.start || 0}s — ${((l.start || 0) + (l.dur || 0)).toFixed(1)}s\n`);
    }

    process.stdout.write(`
═══ What to do next ═══

1. Validate:
     nextframe validate ${timelinePath}

2. Build HTML:
     nextframe build ${timelinePath} -o ${htmlPath}

3. ⛔ MANDATORY SELF-VERIFICATION (do NOT skip):
     open ${htmlPath}
   Then take a screenshot or visually check EVERY phase:
     a. Background correct? (NOT bright purple/pink — should match video theme)
     b. Text readable? No overlap between layers?
     c. Each phase shows correct content? (drag scrubber to phase boundaries)
     d. Subtitles appear at correct times?
     e. Progress bar fills correctly?
   If ANY issue → fix and rebuild. Do NOT deliver without checking.

4. If issues found:
     - Wrong scene colors? Check: nextframe scenes <id> ← look at default_theme
     - Content overlap? Check layer positions (x, y params)
     - Missing content? Check layer timing (start, dur)
     Fix: nextframe layer-set ${timelinePath} <N> key=value
     Rebuild: nextframe build ${timelinePath} -o ${htmlPath}
     Re-verify: open ${htmlPath} ← check again

5. When ALL checks pass:
     nextframe video-guide ${timelinePath}               ← run again for record step
`);
    return 0;
  }

  // Has HTML — Step 5: Record
  process.stdout.write(`═══ ${STEPS[4].label} ═══
Timeline: ${timelinePath}
HTML: ${htmlPath} ✓
Layers: ${layers.length}
Duration: ${dur}s

═══ What to do next ═══

1. Final preview:
     open ${htmlPath}
     ← Last visual check before recording

2. Record 4K video:
     nextframe render ${timelinePath} -o ${timelinePath.replace(/\.json$/, ".mp4")} --width=${w} --height=${h} --dpr=2

   Or use the recorder directly:
     recorder slide ${htmlPath} --out ${timelinePath.replace(/\.json$/, ".mp4")} --width=${w} --height=${h} --dpr 2 --fps 30

3. Verify recording:
     ffprobe ${timelinePath.replace(/\.json$/, ".mp4")}  ← check dimensions, duration
     open ${timelinePath.replace(/\.json$/, ".mp4")}     ← watch the video

═══ Done! ═══
`);
  return 0;
}
