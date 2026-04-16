import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { Fillers } from "../anchors/fillers/index.js";
import { parse } from "../anchors/parser.js";
import { resolve } from "../anchors/resolver.js";
import { validateAnchors } from "../anchors/validator.js";
import { getKind, listKinds, validateClipForKind, validateTrackForKind } from "../kinds/index.js";
import type { Clip, Track } from "../kinds/types.js";
import type { Issue, AnchorDict } from "../anchors/types.js";
import type { Timeline, TimelineV08 } from "../types.js";
import { getScene } from "../scenes/index.js";
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
const ANIMATION_TARGET_EXPR = /^([A-Za-z_][A-Za-z0-9_-]*)\.clips\[(\d+)\]\.params\.([A-Za-z_][A-Za-z0-9_.-]*)$/;
const NOT_IMPL_TOKEN = ["NOT", "IMPLEMENTED"].join("_");

type ResolvedClip = Clip & { begin?: number; end?: number; at?: number };
type ResolvedTrack = Track & { clips: ResolvedClip[] };
type ResolvedTimeline = TimelineV08 & { tracks: ResolvedTrack[] };
type SceneModule = ReturnType<typeof collectSceneModules>[number];
type LegacyLayer = NonNullable<Timeline["layers"]>[number];
type AnimationTarget = { trackId: string; clipIndex: number; paramKey: string };
type LayerTarget = {
  params: Record<string, unknown>;
  startMs: number;
};

function escapeInlineScript(value: string) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function createCodeError(code: string, message: string, extras: Record<string, unknown> = {}) {
  const error = new Error(message) as Error & {
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

function getTrackParam(track: { params?: Record<string, unknown>; [key: string]: unknown }, field: string) {
  if (track.params && typeof track.params === "object" && field in track.params) {
    return track.params[field];
  }
  return track[field];
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
        {
          field: `tracks[${trackIndex}].kind`,
          fix: `Use one of: ${listKinds().join(", ")}.`,
        },
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
        if (at !== undefined) {
          resolvedClip.at = at;
          resolvedClip.begin = at;
          resolvedClip.end = at;
        }
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

const ALLOWED_SCENE_TYPES = new Set(["dom", "media"]);

async function validateSceneIds(timeline: ResolvedTimeline) {
  const sceneIds = Array.from(new Set(
    timeline.tracks
      .filter((track) => track.kind === "scene")
      .flatMap((track) => track.clips)
      .map((clip) => clip.scene)
      .filter((sceneId): sceneId is string => typeof sceneId === "string" && sceneId.trim().length > 0),
  ));

  for (const sceneId of sceneIds) {
    const scene = await getScene(sceneId);
    if (!scene) {
      throw createCodeError(
        "SCENE_NOT_FOUND",
        `scene "${sceneId}" is not registered for build`,
        { fix: `Pick a valid scene id from \`nextframe scenes\` or correct "${sceneId}".` },
      );
    }
    const sceneAny = scene as { type?: unknown; META?: { type?: unknown } };
    const sceneType = sceneAny.META?.type ?? sceneAny.type;
    if (typeof sceneType !== "string" || !ALLOWED_SCENE_TYPES.has(sceneType)) {
      throw createCodeError(
        "UNSUPPORTED_SCENE_TYPE",
        `scene "${sceneId}" has type=${JSON.stringify(sceneType)}, must be "dom" or "media"`,
        {
          field: `scene.${sceneId}.type`,
          fix: `v0.9.3 scene contract accepts only type="dom" (self-generated HTML) or type="media" (external src). Update the scene definition.`,
        },
      );
    }
  }
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

// ISSUE-006: HTML build 到 tmp/，browser 以 tmp/ 解析相对 src → projects/ 404。
// 策略：audio src 统一转 file:// 绝对 URL。支持 http(s)/data/file URL 原样返回、
// 绝对 fs 路径加 file:// 前缀、相对路径按 cwd 解析（CLI 在 repo root 跑）。
function toFileUrl(src: string): string {
  if (/^(https?:|data:|file:\/\/)/.test(src)) return src;
  const abs = src.startsWith("/") ? src : resolvePath(process.cwd(), src);
  return `file://${abs}`;
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
          src: toFileUrl(clip.src as string),
        })),
    );

  if (clips.length === 0) return "";
  return clips
    .map((clip) =>
      `<audio${clip.id} preload="auto" data-track-id="${clip.trackId}" data-clip-index="${clip.clipIndex}" src="${clip.src}"></audio>`)
    .join("\n");
}

export interface AudioMetaClip {
  trackId: string;
  clipIndex: number;
  src: string;
  beginMs: number;
  endMs: number;
  srcInMs: number;
  srcOutMs: number | null;
  fadeInMs: number;
  fadeOutMs: number;
  volume: number;
  pan: number;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function collectAudioMeta(timeline: ResolvedTimeline): AudioMetaClip[] {
  const result: AudioMetaClip[] = [];
  timeline.tracks.forEach((track, trackIndex) => {
    if (track.kind !== "audio") return;
    const trackVolume = pickNumber(getTrackParam(track, "volume"), 1);
    const trackPan = pickNumber(getTrackParam(track, "pan"), 0);
    const trackMute = getTrackParam(track, "mute") === true;
    if (trackMute) return;
    const trackId = track.id || `track_${trackIndex}`;
    track.clips.forEach((clip, clipIndex) => {
      if (typeof clip.src !== "string" || clip.src.trim().length === 0) return;
      const beginMs = pickNumber(clip.begin, 0);
      const endMs = pickNumber(clip.end, beginMs);
      const clipVolume = pickNumber(clip.volume, 1);
      result.push({
        trackId,
        clipIndex,
        src: clip.src as string,
        beginMs,
        endMs,
        srcInMs: pickNumber(clip.src_in, 0),
        srcOutMs: pickOptionalNumber(clip.src_out),
        fadeInMs: pickNumber(clip.fade_in, 0),
        fadeOutMs: pickNumber(clip.fade_out, 0),
        volume: clipVolume * trackVolume,
        pan: trackPan,
      });
    });
  });
  return result;
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

function parseAnimationTarget(target: unknown): AnimationTarget | null {
  const match = ANIMATION_TARGET_EXPR.exec(String(target || "").trim());
  if (!match) {
    return null;
  }
  return {
    trackId: match[1],
    clipIndex: Number(match[2]),
    paramKey: match[3],
  };
}

function warnAnimationSkip(trackId: string, detail: string) {
  process.emitWarning(`animation track "${trackId}" skipped: ${detail}`);
}

function lowerAnimationTracks(
  resolved: ResolvedTimeline,
  layerTargets: Map<string, LayerTarget>,
) {
  resolved.tracks.forEach((track, trackIndex) => {
    if (track.kind !== "animation") return;

    const animationTrackId = track.id || `track_${trackIndex}`;
    const targetExpr = getTrackParam(track, "target");
    const target = parseAnimationTarget(targetExpr);
    if (!target) {
      warnAnimationSkip(animationTrackId, `invalid target "${String(targetExpr || "")}"`);
      return;
    }

    const targetLayer = layerTargets.get(`${target.trackId}:${target.clipIndex}`);
    if (!targetLayer) {
      warnAnimationSkip(animationTrackId, `target "${String(targetExpr)}" does not resolve to a scene clip`);
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(targetLayer.params, target.paramKey)) {
      warnAnimationSkip(animationTrackId, `target param "${target.paramKey}" does not exist on "${String(targetExpr)}"`);
      return;
    }

    const keyframes = track.clips
      .map((clip) => {
        if (!isFiniteNumber(clip.at)) {
          return null;
        }
        const keyframe: { t: number; value: unknown; ease?: string } = {
          t: (clip.at - targetLayer.startMs) / 1000,
          value: clip.value,
        };
        if (typeof clip.ease === "string" && clip.ease.trim().length > 0) {
          keyframe.ease = clip.ease;
        }
        return keyframe;
      })
      .filter((entry): entry is { t: number; value: unknown; ease?: string } => entry !== null)
      .sort((left, right) => left.t - right.t);

    if (keyframes.length === 0) {
      warnAnimationSkip(animationTrackId, `no resolved keyframes found for "${String(targetExpr)}"`);
      return;
    }

    targetLayer.params[target.paramKey] = { keyframes };
  });
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
  const durationSec = duration / 1000;
  const slideSegments = {
    audio: typeof firstAudio?.src === "string" ? toFileUrl(firstAudio.src) : "",
    gap: 0,
    segments: [{
      phaseId: "main",
      duration: durationSec,
      srt: subtitles.map((cue) => ({ s: cue.begin / 1000, e: cue.end / 1000, t: cue.text })),
    }],
  };

  const scriptBody = escapeInlineScript(`window.__TIMELINE__ = ${JSON.stringify(timeline, null, 2)};
window.__TIMELINE_SUBTITLES__ = ${JSON.stringify(subtitles, null, 2)};
window.__TIMELINE_ANIMATIONS__ = ${JSON.stringify(animations, null, 2)};
window.__SLIDE_SEGMENTS = ${JSON.stringify(slideSegments, null, 2)};
function getDuration() { return ${durationSec}; }
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
${buildRuntimeSources()}
window.__onFrame = function(state) {
  if (!state || typeof state !== "object") return;
  var sec = typeof state.time === "number" ? state.time : 0;
  var ms = isFinite(sec) ? sec * 1000 : 0;
  var nf = window.__NF_V08__;
  if (!nf) return;
  if (typeof state.subtitle === "string" && nf.subtitle) {
    nf.subtitle.override = state.subtitle;
  }
  if (typeof nf.frame === "function") nf.frame(ms);
  var bar = document.getElementById("nf-progress");
  if (bar) bar.style.width = (state.progress || 0) + "%";
};
(function() {
  var nf = window.__NF_V08__;
  if (!nf || !nf.clock) return;
  var audioEls = document.querySelectorAll("audio[data-track-id]");
  if (audioEls.length > 0) nf.clock.attachAudio(audioEls[0]);
  function tick() {
    if (nf.frame) nf.frame(nf.clock.getT());
    requestAnimationFrame(tick);
  }
  if (document.readyState === "complete") { tick(); }
  else { window.addEventListener("load", tick); }
})();`);

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
<div id="nf-progress" style="position:fixed;bottom:0;left:0;height:4px;background:rgba(218,119,86,0.8);width:0%;z-index:9999;transition:none;"></div>
${buildAudioMarkup(timeline)}
<script>
${scriptBody}
</script>
</body>
</html>
`;
}

function toLegacyTimeline(resolved: ResolvedTimeline): Timeline {
  const layers: Timeline["layers"] = [];
  let layerIndex = 0;
  const layerTargets = new Map<string, LayerTarget>();
  resolved.tracks.forEach((track, trackIndex) => {
    if (track.kind !== "scene") return;
    const blendMode = typeof track.params?.blend_mode === "string" && track.params.blend_mode.trim().length > 0
      ? track.params.blend_mode
      : typeof track.blend_mode === "string" && track.blend_mode.trim().length > 0
        ? track.blend_mode
        : undefined;
    track.clips.forEach((clip, clipIndex) => {
      const beginMs = isFiniteNumber(clip.begin) ? clip.begin : 0;
      const endMs = isFiniteNumber(clip.end) ? clip.end : beginMs;
      const params = (clip.params && typeof clip.params === "object")
        ? { ...(clip.params as Record<string, unknown>) }
        : {};
      const layer: LegacyLayer = {
        id: clip.id || `${track.id || "scene"}-${layerIndex}`,
        scene: (clip.scene as string) || "",
        start: beginMs / 1000,
        dur: (endMs - beginMs) / 1000,
        params,
      };
      if (clip.effects && typeof clip.effects === "object") {
        const fx = clip.effects as { enter?: Record<string, unknown>; exit?: Record<string, unknown> };
        layer.effects = clip.effects as NonNullable<typeof layer.effects>;
        // Runtime (build-runtime.ts) reads layer.enter/layer.exit with .effect field.
        // Lower the v0.8 nested {effects:{enter:{type,dur}}} to flat {enter:{effect,dur}}.
        if (fx.enter && typeof fx.enter === "object") {
          const { type, ...rest } = fx.enter;
          (layer as Record<string, unknown>).enter = { effect: type, ...rest };
        }
        if (fx.exit && typeof fx.exit === "object") {
          const { type, ...rest } = fx.exit;
          (layer as Record<string, unknown>).exit = { effect: type, ...rest };
        }
      }
      if (clip.transition && typeof clip.transition === "object") {
        layer.transition = clip.transition as NonNullable<typeof layer.transition>;
      }
      if (isFiniteNumber(clip.opacity)) {
        layer.opacity = clip.opacity;
      }
      if (blendMode) {
        layer.blend = blendMode;
      }
      layers!.push(layer);
      layerTargets.set(`${track.id || `track_${trackIndex}`}:${clipIndex}`, {
        params,
        startMs: beginMs,
      });
      layerIndex++;
    });
  });

  lowerAnimationTracks(resolved, layerTargets);

  const firstAudio = resolved.tracks
    .filter((t) => t.kind === "audio")
    .flatMap((t) => t.clips)
    .find((c) => typeof c.src === "string" && (c.src as string).trim().length > 0);
  // ISSUE-006: 相对路径在 tmp/ 下的 HTML 解析不到 projects/。统一转 file:// URL。
  const audioSrc = firstAudio ? toFileUrl(firstAudio.src as string) : undefined;

  const srtEntries = resolved.tracks
    .filter((t) => t.kind === "subtitle")
    .flatMap((t) => t.clips)
    .map((c) => ({
      s: isFiniteNumber(c.begin) ? (c.begin as number) / 1000 : 0,
      e: isFiniteNumber(c.end) ? (c.end as number) / 1000 : 0,
      t: (c.text as string) || "",
    }));

  if (srtEntries.length > 0) {
    const dMs = computeDuration(resolved);
    layers!.push({
      id: "__v08-subtitles",
      scene: "subtitleBar",
      start: 0,
      dur: dMs / 1000,
      params: { srt: srtEntries },
    });
  }

  const durationMs = computeDuration(resolved);
  const tl = resolved as unknown as Timeline;
  return {
    version: "0.3",
    width: Number(tl.width || 1920),
    height: Number(tl.height || 1080),
    fps: Number(tl.fps || 30),
    duration: durationMs / 1000,
    ratio: detectRatioId(resolved),
    background: String(tl.background || "#05050c"),
    audio: audioSrc ? { src: audioSrc, srt: srtEntries } as unknown as Timeline["audio"] : undefined,
    layers,
  };
}

export async function buildV08(timeline: TimelineV08, outPath: string): Promise<void> {
  await runFillers(timeline);
  validateAnchorSurface(timeline);

  const resolvedTimeline: ResolvedTimeline = {
    ...timeline,
    tracks: resolveAndValidateTracks(timeline),
  };
  await validateSceneIds(resolvedTimeline);

  const legacy = toLegacyTimeline(resolvedTimeline);
  const { buildHTML } = await import("./build.js");
  const result = buildHTML(legacy, outPath);
  if (!result.ok) {
    throw createCodeError(
      result.error?.code || "BUILD_FAIL",
      result.error?.message || "v0.3 builder failed",
    );
  }

  // Sidecar audiometa.json — render pipeline (recorder.ts) reads this post-record
  // to drive ffmpeg filter_complex (atrim/afade/volume/pan). Empty array still written
  // so render can deterministically skip the mux step when tracks are absent.
  const audioMeta = collectAudioMeta(resolvedTimeline);
  const sidecarPath = `${outPath}.audiometa.json`;
  await mkdir(dirname(sidecarPath), { recursive: true });
  await writeFile(sidecarPath, JSON.stringify(audioMeta, null, 2) + "\n", "utf8");
}
