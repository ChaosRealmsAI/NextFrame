// Build HTML from timeline JSON — orchestrator module.
// Delegates to build-srt (subtitle extraction), build-scenes (scene discovery/bundling),
// and build-runtime (browser playback runtime).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Timeline, Track } from "../types.js";
import { dispatchExpand } from "../matches/index.js";
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

const HERE = dirname(fileURLToPath(import.meta.url));
const NARRATION_RUNTIME_PATH = resolve(HERE, "../narration-runtime.js");

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

function findTrackIndex(tracks: Track[], updatedTrack: Partial<Track>): number {
  if (typeof updatedTrack.id === "string" && updatedTrack.id.length > 0) {
    return tracks.findIndex((track) => track?.id === updatedTrack.id);
  }
  if (typeof updatedTrack.kind === "string") {
    return tracks.findIndex((track) => track?.kind === updatedTrack.kind);
  }
  return -1;
}

function mergeTrackUpdates(timeline: Timeline, updates: Partial<Timeline>) {
  const nextTracks = Array.isArray(timeline.tracks) ? [...timeline.tracks] : [];
  const updatedTracks = Array.isArray(updates.tracks) ? updates.tracks : [];

  for (const updatedTrack of updatedTracks) {
    const index = findTrackIndex(nextTracks, updatedTrack as Partial<Track>);
    if (index >= 0) {
      nextTracks[index] = {
        ...nextTracks[index],
        ...updatedTrack,
      } as Track;
      continue;
    }
    nextTracks.push(updatedTrack as Track);
  }

  if (updatedTracks.length > 0) {
    timeline.tracks = nextTracks;
  }

  const { tracks: _tracks, ...rest } = updates;
  Object.assign(timeline, rest);
}

function expandMatches(timeline: Timeline): Timeline {
  if (!Array.isArray(timeline.matches) || timeline.matches.length === 0) {
    return timeline;
  }

  const expanded = structuredClone(timeline);
  const matches = Array.isArray(expanded.matches) ? expanded.matches : [];
  for (const match of matches) {
    mergeTrackUpdates(expanded, dispatchExpand(match, expanded));
  }
  return expanded;
}

function deriveLayersFromTracks(timeline: Timeline): Timeline {
  if (Array.isArray(timeline.layers) && timeline.layers.length > 0) {
    return timeline;
  }
  if (!Array.isArray(timeline.tracks)) {
    return timeline;
  }

  const layers = [];
  for (const track of timeline.tracks) {
    if (!track || (track.kind !== "scene" && track.kind !== "overlay") || !Array.isArray(track.clips)) {
      continue;
    }
    for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex += 1) {
      const clip = track.clips[clipIndex];
      if (!clip || typeof clip.scene !== "string" || clip.scene.length === 0) {
        continue;
      }
      layers.push({
        ...clip,
        id: clip.id || `${track.id || track.kind || "track"}-${clip.scene}-${clipIndex}`,
        trackId: clip.trackId || track.id,
      });
    }
  }

  if (layers.length === 0) {
    return timeline;
  }

  return {
    ...timeline,
    layers,
  };
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

function findAudioSrc(timeline: Timeline): string {
  if (timeline.audio && typeof timeline.audio === "object") {
    const src = String((timeline.audio as Record<string, unknown>).src || "");
    if (src) {
      return src;
    }
  }
  if (typeof timeline.audio === "string") {
    return timeline.audio;
  }
  if (!Array.isArray(timeline.tracks)) {
    return "";
  }
  for (const track of timeline.tracks) {
    if (track?.kind === "audio" && typeof track.src === "string" && track.src) {
      return track.src;
    }
  }
  return "";
}

function hasAudioTrack(timeline: Timeline): boolean {
  return Array.isArray(timeline.tracks)
    && timeline.tracks.some((track) => track?.kind === "audio");
}

function hasSubtitleTrack(timeline: Timeline): boolean {
  return Array.isArray(timeline.tracks)
    && timeline.tracks.some((track) => track?.kind === "subtitle");
}

function buildNarrationRuntime() {
  try {
    return readFileSync(NARRATION_RUNTIME_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

function buildSubtitleBootstrap() {
  return `(() => {
  function boot() {
    const subtitleRoot = document.getElementById("nf-subtitle");
    const audioEl = document.getElementById("timeline-audio");
    if (!subtitleRoot || !audioEl || !window.__narrationRuntime) return;

    const tracks = Array.isArray(TIMELINE.tracks) ? TIMELINE.tracks : [];
    const matches = Array.isArray(TIMELINE.matches) ? TIMELINE.matches : [];

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function findTrackById(trackId) {
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (track && track.id === trackId) return track;
      }
      return null;
    }

    function resolveSegments() {
      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        if (!match || match.rule !== "subtitle-from-words" || typeof match.source !== "string") continue;
        const sourceTrack = findTrackById(match.source);
        if (sourceTrack && sourceTrack.kind === "audio" && sourceTrack.meta && Array.isArray(sourceTrack.meta.segments)) {
          return sourceTrack.meta.segments;
        }
      }

      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (track && track.kind === "audio" && track.meta && Array.isArray(track.meta.segments)) {
          return track.meta.segments;
        }
      }
      return [];
    }

    const segments = resolveSegments();
    const segmentWords = new Map();
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment || typeof segment.id !== "string") continue;
      segmentWords.set(segment.id, Array.isArray(segment.words) ? segment.words : []);
    }

    if (!audioEl.getAttribute("src")) {
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (track && track.kind === "audio" && typeof track.src === "string" && track.src) {
          audioEl.src = track.src;
          break;
        }
      }
    }

    let activeSegmentId = "";
    let activeWordIndex = -1;

    function renderSegment(segmentId, wordIndex) {
      const words = segmentWords.get(segmentId);
      if (!Array.isArray(words) || words.length === 0) {
        subtitleRoot.textContent = "";
        return;
      }
      subtitleRoot.innerHTML = words.map((word, index) => {
        const activeClass = index === wordIndex ? " active" : "";
        return '<span class="nf-subtitle-word' + activeClass + '" data-word-index="' + index + '">' +
          escapeHtml(String(word && word.w ? word.w : "")) +
          "</span>";
      }).join(" ");
    }

    document.addEventListener("nf-subtitle-tick", (event) => {
      const detail = event && event.detail && typeof event.detail === "object" ? event.detail : {};
      const segmentId = typeof detail.segmentId === "string" ? detail.segmentId : "";
      const wordIndex = typeof detail.wordIndex === "number" ? detail.wordIndex : -1;

      if (!segmentId) {
        subtitleRoot.textContent = "";
        activeSegmentId = "";
        activeWordIndex = -1;
        return;
      }

      if (segmentId !== activeSegmentId) {
        activeSegmentId = segmentId;
        activeWordIndex = wordIndex;
        renderSegment(segmentId, wordIndex);
        return;
      }

      if (wordIndex === activeWordIndex) return;
      activeWordIndex = wordIndex;
      const words = subtitleRoot.querySelectorAll(".nf-subtitle-word");
      words.forEach((node, index) => {
        if (node instanceof HTMLElement) {
          node.classList.toggle("active", index === wordIndex);
        }
      });
    });

    window.__narrationRuntime.init({ tracks, matches, audioEl });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();`;
}

function buildDocument(timeline: Timeline, sceneModules: SceneModule[]) {
  const legacyBundle = readLegacyBundleSource();
  const sharedPreamble = buildSharedPreamble();
  const sceneBundles = sceneModules.map(buildSceneBundle).join("\n\n");
  const sceneMap = sceneModules
    .map((scene: SceneModule) => `${JSON.stringify(scene.id)}: ${scene.varName}`)
    .join(",\n");
  const background = String(timeline.background || "#05050c");
  const shellBackground = "#03050a";
  const width = Number(timeline.width || 1920);
  const height = Number(timeline.height || 1080);
  const inlineSrt = extractTimelineSrt(timeline);
  const dur = Number(timeline.duration || 0);
  const audioSrc = findAudioSrc(timeline);
  const subtitleTrackPresent = hasSubtitleTrack(timeline);
  const narrationRuntime = subtitleTrackPresent ? buildNarrationRuntime() : "";
  const subtitleBootstrap = subtitleTrackPresent ? buildSubtitleBootstrap() : "";
  const subtitleCss = subtitleTrackPresent
    ? `
  #nf-subtitle {
    position: absolute; left: 8%; right: 8%; bottom: 8%; z-index: 9998;
    display: flex; flex-wrap: wrap; justify-content: center; gap: 0.35em;
    pointer-events: none; text-align: center;
    font: 700 34px/1.35 system-ui, -apple-system, sans-serif;
    text-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  }
  .nf-subtitle-word {
    color: rgba(255, 255, 255, 0.5);
    transform: scale(1);
    transition: color 80ms linear, transform 80ms linear;
  }
  .nf-subtitle-word.active {
    color: #ffffff;
    transform: scale(1.06);
  }`
    : "";
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
${narrationRuntime}
const SCENES = Object.assign({}, window.__scenes || {}, {
${sceneMap}
});
${buildRuntime()}
${subtitleBootstrap}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NextFrame Build</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${shellBackground}; color: #f4efe8; font-family: system-ui, -apple-system, sans-serif; }
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
${subtitleCss}
</style>
</head>
<body>
<div id="stage-shell"><div id="stage"></div>${subtitleTrackPresent ? '<div id="nf-subtitle" aria-live="polite"></div>' : ""}</div>
<div id="controls">
  <button id="playBtn" type="button">Play</button>
  <input type="range" id="scrubber" min="0" max="${SCRUBBER_MAX_VALUE}" value="0">
  <span id="timeInfo">0.00s / 0.00s</span>
  <span id="phaseInfo">Phase: idle</span>
</div>
${audioSrc || hasAudioTrack(timeline) ? `<audio id="timeline-audio" preload="auto"></audio>` : ""}
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
    timeline = deriveLayersFromTracks(expandMatches(timeline || {}));
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
