import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { Fillers } from "../anchors/fillers/index.js";
import { parse } from "../anchors/parser.js";
import { resolve } from "../anchors/resolver.js";
import { validateAnchors } from "../anchors/validator.js";
import { getKind, validateClipForKind, validateTrackForKind } from "../kinds/index.js";
import type { Clip, Track } from "../kinds/types.js";
import type { Issue, AnchorDict } from "../anchors/types.js";
import type { Timeline, TimelineV08 } from "../types.js";
import {
  buildSceneBundle,
  buildSharedPreamble,
  collectSceneModules,
  readLegacyBundleSource,
  readDiscoveredScenes,
  stripESM,
} from "./build-scenes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME_V08_DIR = resolvePath(HERE, "../runtime-v08");
const SIMPLE_ANCHOR_EXPR = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\.(begin|end|at)\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(s|ms))?\s*$/;
const NOT_IMPL_TOKEN = ["NOT", "IMPLEMENTED"].join("_");

type ResolvedClip = Clip & { begin?: number; end?: number; at?: number };
type ResolvedTrack = Track & { clips: ResolvedClip[] };
type ResolvedTimeline = TimelineV08 & { tracks: ResolvedTrack[] };
type SceneModule = ReturnType<typeof collectSceneModules>[number];

function escapeInlineScript(value: string) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function createCodeError(code: string, message: string, extras: Record<string, unknown> = {}) {
  const error = new Error(`${code}: ${message}`) as Error & {
    code?: string;
    issues?: Issue[];
    field?: string;
    detail?: unknown;
  };
  error.code = code;
  Object.assign(error, extras);
  return error;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNotImplemented(error: unknown) {
  return error instanceof Error && new RegExp(NOT_IMPL_TOKEN).test(error.message);
}

function normalizeIssue(
  issue: Issue,
  fieldPrefix: string,
  kind: string,
  trackId: string,
) {
  return {
    ...issue,
    field: issue.field ? `${fieldPrefix}.${issue.field}` : fieldPrefix,
    message: `${kind}: ${issue.message}`,
    kind,
    trackId,
  };
}

function detectRatioId(timeline: TimelineV08): string {
  const tl = timeline as Timeline;
  if (typeof tl.ratio === "string" && tl.ratio) {
    return tl.ratio;
  }
  const width = Number(tl.width || tl.project?.width || 0);
  const height = Number(tl.height || tl.project?.height || 0);
  if (width > 0 && height > 0) {
    return width >= height ? "16:9" : "9:16";
  }
  return "16:9";
}

async function runFillers(timeline: TimelineV08) {
  for (const [anchorId, entry] of Object.entries(timeline.anchors || {})) {
    if (!entry?.filler) continue;
    const filler = Fillers.get(entry.filler);
    if (!filler) {
      throw createCodeError(
        "UNSUPPORTED_FILLER",
        `unknown filler "${entry.filler}" for anchor "${anchorId}"`,
      );
    }
    await filler(entry, timeline.anchors);
  }
}

function resolveFallback(dict: AnchorDict, expr: string): number {
  const match = expr.match(SIMPLE_ANCHOR_EXPR);
  if (!match) {
    throw createCodeError(
      "BAD_ANCHOR_EXPR",
      `unsupported anchor expression "${expr}"`,
      { field: expr },
    );
  }
  const [, anchorId, point, op, rawValue, unit] = match;
  const entry = dict[anchorId];
  if (!entry) {
    throw createCodeError(
      "ANCHOR_MISSING",
      `anchor "${anchorId}" is not defined`,
      { field: expr },
    );
  }
  const base = entry[point as "begin" | "end" | "at"];
  if (!isFiniteNumber(base)) {
    throw createCodeError(
      "ANCHOR_MISSING",
      `anchor "${anchorId}.${point}" is not defined`,
      { field: expr },
    );
  }
  if (!rawValue || !unit || !op) {
    return base;
  }
  const offset = Number(rawValue) * (unit === "s" ? 1000 : 1);
  return op === "+" ? base + offset : base - offset;
}

function resolveTimeRef(dict: AnchorDict, value: unknown, fps?: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (isFiniteNumber(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    parse(value);
    return resolve(dict, value, fps);
  } catch (error) {
    if (!isNotImplemented(error)) {
      throw error;
    }
    return resolveFallback(dict, value);
  }
}

function validateAnchorSurface(timeline: TimelineV08) {
  try {
    const result = validateAnchors(timeline.anchors || {});
    if (!result.ok && result.issues.length > 0) {
      throw createCodeError(
        "ANCHOR_VALIDATION_FAIL",
        result.issues.map((issue) => issue.message).join("; "),
        { issues: result.issues },
      );
    }
  } catch (error) {
    if (!isNotImplemented(error)) {
      throw error;
    }
  }
}

function resolveAndValidateTracks(timeline: TimelineV08): ResolvedTrack[] {
  const issues: Issue[] = [];
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const resolvedTracks: ResolvedTrack[] = [];

  tracks.forEach((track, trackIndex) => {
    const trackId = typeof track.id === "string" && track.id.trim().length > 0
      ? track.id
      : `track_${trackIndex}`;
    const schema = getKind(track.kind);
    if (!schema) {
      throw createCodeError(
        "UNSUPPORTED_KIND",
        `track "${trackId}" uses unsupported kind "${track.kind}"`,
        { field: `tracks[${trackIndex}].kind` },
      );
    }

    const trackResult = validateTrackForKind(track.kind, track);
    if (!trackResult.ok) {
      issues.push(
        ...trackResult.issues.map((issue) =>
          normalizeIssue(issue, `tracks[${trackIndex}]`, track.kind, trackId)),
      );
    }

    const clips = Array.isArray(track.clips) ? track.clips : [];
    const resolvedClips = clips.map((clip, clipIndex) => {
      const clipResult = validateClipForKind(track.kind, clip);
      if (!clipResult.ok) {
        issues.push(
          ...clipResult.issues.map((issue) =>
            normalizeIssue(issue, `tracks[${trackIndex}].clips[${clipIndex}]`, track.kind, trackId)),
        );
      }

      const resolvedClip: ResolvedClip = { ...clip };
      if ("begin" in clip || track.kind === "audio" || track.kind === "scene" || track.kind === "subtitle") {
        const begin = resolveTimeRef(timeline.anchors || {}, clip.begin, (timeline as Timeline).fps);
        if (begin !== undefined) resolvedClip.begin = begin;
      }
      if ("end" in clip || track.kind === "audio" || track.kind === "scene" || track.kind === "subtitle") {
        const end = resolveTimeRef(timeline.anchors || {}, clip.end, (timeline as Timeline).fps);
        if (end !== undefined) resolvedClip.end = end;
      }
      if ("at" in clip || track.kind === "animation") {
        const at = resolveTimeRef(timeline.anchors || {}, clip.at, (timeline as Timeline).fps);
        if (at !== undefined) resolvedClip.at = at;
      }
      return resolvedClip;
    });

    resolvedTracks.push({ ...track, clips: resolvedClips });
  });

  if (issues.length > 0) {
    throw createCodeError(
      "KIND_CONTRACT_FAIL",
      `${issues.length} kind contract issue(s) found`,
      { issues },
    );
  }

  return resolvedTracks;
}

function collectSceneBundle(timeline: ResolvedTimeline): { modules: SceneModule[]; bundle: string; map: string } {
  const modularIds = new Set(readDiscoveredScenes(detectRatioId(timeline)).map((scene) => scene.id));
  const requestedLayers = timeline.tracks
    .filter((track) => track.kind === "scene")
    .flatMap((track) => track.clips)
    .map((clip) => ({ scene: clip.scene as string }))
    .filter((layer) => typeof layer.scene === "string" && layer.scene.length > 0 && modularIds.has(layer.scene));

  const fakeTimeline: Timeline = {
    ratio: detectRatioId(timeline),
    layers: requestedLayers as Timeline["layers"],
  };

  const modules = requestedLayers.length > 0 ? collectSceneModules(fakeTimeline) : [];
  return {
    modules,
    bundle: modules.map(buildSceneBundle).join("\n\n"),
    map: modules.map((scene) => `${JSON.stringify(scene.id)}: ${scene.varName}`).join(",\n"),
  };
}

function buildAudioMarkup(timeline: ResolvedTimeline) {
  const clips = timeline.tracks
    .filter((track) => track.kind === "audio")
    .flatMap((track, trackIndex) =>
      track.clips
        .filter((clip) => typeof clip.src === "string" && clip.src.trim().length > 0)
        .map((clip, clipIndex) => ({
          id: clipIndex === 0 && trackIndex === 0 ? ' id="timeline-audio"' : "",
          trackId: track.id || `track_${trackIndex}`,
          clipIndex,
          src: clip.src as string,
        })),
    );

  if (clips.length === 0) return "";
  return clips
    .map((clip) =>
      `<audio${clip.id} preload="auto" data-track-id="${clip.trackId}" data-clip-index="${clip.clipIndex}" src="${clip.src}"></audio>`)
    .join("\n");
}

function collectSubtitleData(timeline: ResolvedTimeline) {
  return timeline.tracks
    .filter((track) => track.kind === "subtitle")
    .flatMap((track, trackIndex) =>
      track.clips.map((clip, clipIndex) => ({
        trackId: track.id || `track_${trackIndex}`,
        clipIndex,
        begin: clip.begin ?? 0,
        end: clip.end ?? clip.begin ?? 0,
        text: clip.text ?? "",
        style: clip.style ?? null,
      })),
    );
}

function collectAnimationData(timeline: ResolvedTimeline) {
  return timeline.tracks
    .filter((track) => track.kind === "animation")
    .map((track, trackIndex) => ({
      trackId: track.id || `track_${trackIndex}`,
      target: track.params?.target ?? track.target ?? null,
      clips: track.clips.map((clip, clipIndex) => ({
        clipIndex,
        at: clip.at ?? 0,
        value: clip.value ?? null,
        ease: clip.ease ?? null,
      })),
    }));
}

function computeDuration(timeline: ResolvedTimeline) {
  let max = 0;
  for (const anchor of Object.values(timeline.anchors || {})) {
    for (const value of [anchor.begin, anchor.end, anchor.at]) {
      if (isFiniteNumber(value)) max = Math.max(max, value);
    }
  }
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      for (const value of [clip.begin, clip.end, clip.at]) {
        if (isFiniteNumber(value)) max = Math.max(max, value);
      }
    }
  }
  return max;
}

function buildRuntimeSources() {
  const runtimeFiles = ["clock.js", "scene-loop.js", "subtitle.js", "anim.js"];
  return runtimeFiles
    .map((file) => stripESM(readFileSync(resolvePath(RUNTIME_V08_DIR, file), "utf8")).trim())
    .join("\n\n");
}

function buildDocument(timeline: ResolvedTimeline) {
  const width = Number((timeline as Timeline).width || 1920);
  const height = Number((timeline as Timeline).height || 1080);
  const background = String((timeline as Timeline).background || "#05050c");
  const sceneBundle = collectSceneBundle(timeline);
  const duration = computeDuration(timeline);
  const subtitles = collectSubtitleData(timeline);
  const animations = collectAnimationData(timeline);
  const firstAudio = timeline.tracks
    .filter((track) => track.kind === "audio")
    .flatMap((track) => track.clips)
    .find((clip) => typeof clip.src === "string" && clip.src.trim().length > 0);
  const slideSegments = {
    audio: typeof firstAudio?.src === "string" ? firstAudio.src : "",
    gap: 0,
    segments: [{
      phaseId: "main",
      duration,
      srt: subtitles.map((cue) => ({ s: cue.begin, e: cue.end, t: cue.text })),
    }],
  };

  const scriptBody = escapeInlineScript(`window.__TIMELINE__ = ${JSON.stringify(timeline, null, 2)};
window.__TIMELINE_SUBTITLES__ = ${JSON.stringify(subtitles, null, 2)};
window.__TIMELINE_ANIMATIONS__ = ${JSON.stringify(animations, null, 2)};
window.__SLIDE_SEGMENTS = ${JSON.stringify(slideSegments, null, 2)};
function getDuration() { return ${duration}; }
window.getDuration = getDuration;
window.frame_pure = true;
window.__NF_V08__ = window.__NF_V08__ || {};
${buildSharedPreamble()}
${readLegacyBundleSource()}
${sceneBundle.bundle}
window.__scenes = Object.assign({}, window.__scenes || {}, {
${sceneBundle.map}
});
window.__NF_V08__.scenes = window.__scenes;
window.__NF_V08__.timeline = window.__TIMELINE__;
window.__NF_V08__.subtitles = window.__TIMELINE_SUBTITLES__;
window.__NF_V08__.animations = window.__TIMELINE_ANIMATIONS__;
${buildRuntimeSources()}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NextFrame v0.8</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${background}; color: #f4efe8; font-family: system-ui, -apple-system, sans-serif; }
  body { position: relative; }
  #stage-shell { position: fixed; inset: 0; width: ${width}px; height: ${height}px; transform-origin: 0 0; }
  #stage { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${background}; }
  audio { display: none; }
</style>
</head>
<body>
<div id="stage-shell"><div id="stage"></div></div>
${buildAudioMarkup(timeline)}
<script>
${scriptBody}
</script>
</body>
</html>
`;
}

export async function buildV08(timeline: TimelineV08, outPath: string): Promise<void> {
  await runFillers(timeline);
  validateAnchorSurface(timeline);

  const resolvedTimeline: ResolvedTimeline = {
    ...timeline,
    tracks: resolveAndValidateTracks(timeline),
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buildDocument(resolvedTimeline), "utf8");
}
