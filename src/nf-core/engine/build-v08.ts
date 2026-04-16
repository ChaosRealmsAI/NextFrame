import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolve as resolveAnchorRef } from "../anchors/resolver.js";
import { validateAnchors } from "../anchors/validator.js";
import { getKind } from "../kinds/index.js";
import type { TimelineV08 } from "../types.js";
import { buildSceneBundle, buildSharedPreamble, collectSceneModules, readDiscoveredScenes, readLegacyBundleSource } from "./build-scenes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = resolve(HERE, "../runtime-v08");

function escapeInlineScript(value: string) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function detectRatio(timeline: TimelineV08) {
  if (typeof timeline.ratio === "string" && timeline.ratio) return timeline.ratio;
  const width = Number(timeline.width || 0);
  const height = Number(timeline.height || 0);
  if (width > 0 && height > 0) return width >= height ? "16:9" : "9:16";
  return "16:9";
}

function viewportFor(timeline: TimelineV08) {
  const ratio = detectRatio(timeline);
  if (Number.isFinite(timeline.width) && Number.isFinite(timeline.height) && Number(timeline.width) > 0 && Number(timeline.height) > 0) {
    return { width: Number(timeline.width), height: Number(timeline.height), ratio };
  }
  if (ratio === "9:16") {
    return { width: 1080, height: 1920, ratio };
  }
  return { width: 1920, height: 1080, ratio };
}

function runtimeSource(name: string) {
  return readFileSync(resolve(RUNTIME_DIR, name), "utf8").trim();
}

function resolveTimeline(timeline: TimelineV08) {
  const resolved: TimelineV08 = JSON.parse(JSON.stringify(timeline));
  let durationMs = Number.isFinite(resolved.duration) ? Number(resolved.duration) * 1000 : 0;

  for (const track of resolved.tracks) {
    const schema = getKind(track.kind);
    if (!schema) {
      throw new Error(`UNKNOWN_KIND: builder cannot render kind=${track.kind}`);
    }
    for (const clip of track.clips) {
      if (track.kind === "animation") {
        clip.at = resolveAnchorRef(resolved.anchors, String(clip.at));
        durationMs = Math.max(durationMs, Number(clip.at) || 0);
      } else {
        clip.begin = resolveAnchorRef(resolved.anchors, String(clip.begin));
        clip.end = resolveAnchorRef(resolved.anchors, String(clip.end));
        durationMs = Math.max(durationMs, Number(clip.end) || 0);
      }
    }
  }

  resolved.duration = durationMs / 1000;
  return resolved;
}

function findAudioSrc(timeline: TimelineV08) {
  for (const track of timeline.tracks) {
    if (track.kind !== "audio") continue;
    for (const clip of track.clips) {
      if (typeof clip.src === "string" && clip.src) return clip.src;
    }
  }
  return "";
}

function collectV08SceneModules(timeline: TimelineV08) {
  const ratio = detectRatio(timeline);
  const discoveredIds = new Set(readDiscoveredScenes(ratio).map((scene: { id: string }) => scene.id));
  const requested = new Set<string>();
  for (const track of timeline.tracks) {
    if (track.kind !== "scene") continue;
    for (const clip of track.clips) {
      if (typeof clip.scene === "string" && discoveredIds.has(clip.scene)) {
        requested.add(clip.scene);
      }
    }
  }
  if (requested.size === 0) return [];
  return collectSceneModules({
    ratio,
    layers: [...requested].map((scene) => ({ scene })),
  } as never);
}

function renderHtml(timeline: TimelineV08) {
  const anchorCheck = validateAnchors(timeline.anchors);
  if (!anchorCheck.ok) {
    throw new Error(anchorCheck.issues.map((issue) => issue.message).join("; "));
  }

  const resolved = resolveTimeline(timeline);
  const viewport = viewportFor(resolved);
  resolved.width = viewport.width;
  resolved.height = viewport.height;
  resolved.ratio = viewport.ratio;
  resolved.fps = Number.isFinite(resolved.fps) ? Number(resolved.fps) : 30;

  const audioSrc = findAudioSrc(resolved);
  const sharedPreamble = String(buildSharedPreamble() || "").trim();
  const legacyBundle = String(readLegacyBundleSource() || "").trim();
  const sceneModules = collectV08SceneModules(resolved);
  const sceneBundles = sceneModules.map(buildSceneBundle).join("\n\n");
  const sceneMap = sceneModules.map((scene: { id: string; varName: string }) => `${JSON.stringify(scene.id)}: ${scene.varName}`).join(",\n");
  const runtimeBundle = [
    runtimeSource("clock.js"),
    runtimeSource("scene-loop.js"),
    runtimeSource("subtitle.js"),
    runtimeSource("anim.js"),
  ].join("\n\n");
  const durationSec = Number(resolved.duration || 0);

  const script = escapeInlineScript(`
window.__duration = ${durationSec};
window.__audioSrc = ${JSON.stringify(audioSrc)};
window.__SLIDE_SEGMENTS = {
  audio: ${JSON.stringify(audioSrc)},
  gap: 0,
  segments: [{ phaseId: "main", duration: ${durationSec}, srt: [] }]
};
window.__TIMELINE__ = ${JSON.stringify(resolved)};
window.__scenes = window.__scenes || {};
${sharedPreamble}
${legacyBundle}
${sceneBundles}
window.__SCENES__ = Object.assign({}, window.__scenes || {}, {
${sceneMap}
});
${runtimeBundle}
(function () {
  var audioEl = document.getElementById("timeline-audio");
  if (audioEl && window.__audioSrc) {
    audioEl.src = window.__audioSrc;
  }
  if (audioEl && window.__NF_V08__ && window.__NF_V08__.clock) {
    window.__NF_V08__.clock.attachAudio(audioEl);
  }
  window.__onFrame = function (data) {
    var tMs = data && Number.isFinite(data.time) ? data.time * 1000 : undefined;
    return window.__NF_V08__.frame(tMs);
  };
  window.frame = function () {
    return window.__NF_V08__.frame();
  };
  window.__NF_V08__.frame(0);
}());
`);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>NextFrame v0.8</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #05050c; }
    body { position: relative; }
    #app { position: relative; width: ${viewport.width}px; height: ${viewport.height}px; overflow: hidden; background: #05050c; }
  </style>
</head>
<body>
  <div id="app"></div>
  ${audioSrc ? '<audio id="timeline-audio" preload="auto"></audio>' : ""}
  <script>${script}</script>
</body>
</html>`;
}

export async function buildV08(timeline: TimelineV08, outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, renderHtml(timeline), "utf8");
}
