// Build HTML from timeline JSON — orchestrator module.
// Delegates to build-srt (subtitle extraction), build-scenes (scene discovery/bundling),
// and build-runtime (browser playback runtime).
import { writeFileSync } from "node:fs";

import type { Timeline } from "../types.js";
import { extractTimelineSrt, serializeSrtLiteral } from "./build-srt.js";
import {
  buildAnimationBundle,
  buildSceneBundle,
  readLegacyBundleSource,
  buildSharedPreamble,
  collectSceneModules,
  readDiscoveredScenes,
} from "./build-scenes.js";
import { buildRuntime, SCRUBBER_MAX_VALUE } from "./build-runtime.js";

/**
 * Escape a string for safe embedding inside an inline <script> tag.
 */
function escapeInlineScript(value: string) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Assemble the full HTML document from timeline data and collected scene modules.
 */
interface SceneModule {
  id: string;
  varName: string;
  filePath: string;
  code: string;
  label?: string;
}

function detectRatioId(timeline: Timeline): string {
  if (typeof (timeline as { ratio?: unknown }).ratio === "string") {
    return String((timeline as { ratio?: unknown }).ratio);
  }
  const width = Number(timeline.width || timeline.project?.width || 0);
  const height = Number(timeline.height || timeline.project?.height || 0);
  if (width > 0 && height > 0) {
    if (Math.abs(width - height) < 50) return "4:3";
    return width >= height ? "16:9" : "9:16";
  }
  return "16:9";
}

function collectModularSceneModules(timeline: Timeline): SceneModule[] {
  const modularIds = new Set(readDiscoveredScenes(detectRatioId(timeline)).map((scene: { id: string }) => scene.id));
  const filteredTimeline: Timeline = {
    ...timeline,
    layers: (timeline.layers || []).filter((layer) => layer?.scene && modularIds.has(layer.scene)),
  };
  return collectSceneModules(filteredTimeline) as SceneModule[];
}

function buildDocument(timeline: Timeline, sceneModules: SceneModule[]) {
  const legacyBundle = readLegacyBundleSource();
  const sharedPreamble = buildSharedPreamble();
  const sceneBundles = sceneModules.map(buildSceneBundle).join("\n\n");
  const sceneMap = sceneModules
    .map((scene: SceneModule) => `${JSON.stringify(scene.id)}: ${scene.varName}`)
    .join(",\n");
  const background = String(timeline.background || "#05050c");
  const width = Number(timeline.width || 1920);
  const height = Number(timeline.height || 1080);
  const inlineSrt = extractTimelineSrt(timeline);
  const dur = Number(timeline.duration || 0);
  const audioSrc = timeline.audio && typeof timeline.audio === "object" ? String((timeline.audio as Record<string, unknown>).src || "") : typeof timeline.audio === "string" ? timeline.audio : "";
  const audioField = audioSrc ? `audio: ${JSON.stringify(audioSrc)},` : "";
  const animBundle = buildAnimationBundle();
  const scriptBody = escapeInlineScript(`window.__SLIDE_SEGMENTS = { ${audioField} gap: 0, segments: [{ phaseId: "main", duration: ${dur}, srt: [{ s: 0, e: ${dur}, t: "" }] }] };
const SRT = ${serializeSrtLiteral(inlineSrt)};
const TIMELINE = ${JSON.stringify(timeline, null, 2)};
// Shared scene utilities (design tokens, helpers)
${sharedPreamble}
// Legacy 16:9 scene bundle compatibility
${legacyBundle}
// Animation effects
${animBundle}
${sceneBundles}
const SCENES = Object.assign({}, window.__scenes || {}, {
${sceneMap}
});
${buildRuntime()}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NextFrame Build</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${background}; color: #f4efe8; font-family: system-ui, -apple-system, sans-serif; }
  body { position: relative; }
  #stage-shell { position: fixed; width: ${width}px; height: ${height}px; transform-origin: 0 0; }
  #stage { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${background}; box-shadow: 0 24px 100px rgba(0, 0, 0, 0.35); }
  #controls {
    position: fixed; left: 0; right: 0; bottom: 0; height: 56px; z-index: 9999;
    display: flex; align-items: center; gap: 14px; padding: 0 20px;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px);
  }
  #playBtn {
    height: 34px; padding: 0 12px; border: 0; border-radius: 999px; cursor: pointer;
    background: #f4efe8; color: #111; font: 600 13px/1 system-ui, -apple-system, sans-serif;
  }
  #scrubber { flex: 1; min-width: 160px; }
  #timeInfo, #phaseInfo { font: 500 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  #phaseInfo { opacity: 0.78; }
</style>
</head>
<body>
<div id="stage-shell"><div id="stage"></div></div>
<div id="controls">
  <button id="playBtn" type="button">Play</button>
  <input type="range" id="scrubber" min="0" max="${SCRUBBER_MAX_VALUE}" value="0">
  <span id="timeInfo">0.00s / 0.00s</span>
  <span id="phaseInfo">Phase: idle</span>
</div>
${timeline.audio ? `<audio id="timeline-audio" preload="auto"></audio>` : ""}
<script>
${scriptBody}
</script>
</body>
</html>
`;
}

/**
 * Build a single-file HTML from a timeline JSON and write it to outputPath.
 * Returns { ok, value } on success or { ok, error } on failure.
 */
/**
 * Coerce layer params to match scene meta schema types.
 * Prevents runtime type errors from AI-generated timelines.
 */
function coerceLayerParams(timeline: Timeline, sceneModules: SceneModule[]) {
  const metaByScene = new Map(sceneModules.map((m: SceneModule) => [m.id, m]));
  for (const layer of timeline.layers || []) {
    if (!layer.params || !layer.scene) continue;
    // Coerce via scene code eval is too risky — just normalize known problem patterns:
    // audio object → ensure __SLIDE_SEGMENTS gets .src string (handled in buildDocument)
    for (const [key, val] of Object.entries(layer.params)) {
      if (typeof val === "string" && val.startsWith("[")) {
        try { layer.params[key] = JSON.parse(val); } catch { /* keep string */ }
      }
    }
  }
  // Normalize audio: ensure string src is available for the runtime
  if (timeline.audio && typeof timeline.audio === "object" && (timeline.audio as Record<string, unknown>).src) {
    timeline._audioSrc = String((timeline.audio as Record<string, unknown>).src);
  } else if (typeof timeline.audio === "string") {
    timeline._audioSrc = timeline.audio;
  }
}

export function buildHTML(timeline: Timeline, outputPath: string) {
  try {
    const sceneModules = collectModularSceneModules(timeline || {});
    coerceLayerParams(timeline || {}, sceneModules);
    const html = buildDocument(timeline || {}, sceneModules);
    writeFileSync(outputPath, html, "utf8");
    return {
      ok: true,
      value: {
        path: outputPath,
        size: Buffer.byteLength(html, "utf8"),
        dimensions: `${timeline?.width || 1920}x${timeline?.height || 1080}`,
        fps: Number(timeline?.fps || 30),
        duration: Number(timeline?.duration || 0),
        layers: Array.isArray(timeline?.layers) ? timeline.layers.length : 0,
        scenes: sceneModules.length,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "BUILD_FAIL",
        message: `Internal: ${(err as Error).message}`,
        fix: "check timeline scene ids, ratio, and output path",
      },
    };
  }
}
