// Timeline validation helpers shared by CLI commands and AI tools.

import { existsSync } from "node:fs";
import { resolve as resolvePath, isAbsolute } from "node:path";
import { guarded } from "../engine/legacy/_guard.js";
import { resolveTimeline as resolveLegacyTimeline } from "../engine/legacy/time.js";
import { REGISTRY } from "./scene-registry.js";
import { EFFECT_IDS } from "../../../nf-core/animation/effects/index.js";
import { FILTER_IDS } from "../../../nf-core/filters/index.js";
import { TRANSITION_IDS } from "../../../nf-core/animation/transitions/index.js";

const BG_SCENES = new Set([
  "auroraGradient", "fluidBackground", "neonGrid", "vignette", "starfield", "particleFlow",
  "circleRipple", "meshGrid", "radialBurst", "confetti", "waveform", "pulseWave",
  "matrixRain", "gridPattern", "svgRings",
  "subtitleBar", "marquee", "lowerThird", "cornerBadge",
  "audioTrack", "syncSubs", "videoClip",
  "slideChrome", "slideFrame",
]);
const SUPPORTED_SCHEMAS = new Set(["nextframe/v0.1"]);
const SUPPORTED_FPS = new Set([24, 25, 30, 60]);
const V1_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;
const V3_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;

function hasExplicitBounds(layer) {
  return layer?.x != null || layer?.y != null || layer?.w != null || layer?.h != null;
}

export function detectFormat(timeline) {
  if (Array.isArray(timeline?.layers)) return "v0.3";
  if (Array.isArray(timeline?.tracks)) return "v0.1";
  return "unknown";
}

export function validateTimelineV3(timeline) {
  const errors = [];
  const warnings = [];
  const hints = [];

  if (Array.isArray(timeline?.tracks) && !Array.isArray(timeline?.layers)) {
    return {
      ok: false,
      errors: [{
        code: "LEGACY_FORMAT",
        message: "tracks/clips format detected — use the legacy validator or migrate to layers[]",
      }],
      warnings,
      hints,
    };
  }

  if (typeof timeline?.version !== "string" || !timeline.version.trim()) {
    errors.push({ code: "MISSING_FIELD", message: "version is required" });
  } else if (!V3_VERSION_RE.test(timeline.version.trim())) {
    errors.push({ code: "BAD_VERSION", message: `version "${timeline.version}" must be a semver-like string` });
  }
  if (!timeline.width) errors.push({ code: "MISSING_FIELD", message: "width is required" });
  if (!timeline.height) errors.push({ code: "MISSING_FIELD", message: "height is required" });
  if (!timeline.fps) errors.push({ code: "MISSING_FIELD", message: "fps is required" });
  if (!timeline.duration) errors.push({ code: "MISSING_FIELD", message: "duration is required" });
  if (!Array.isArray(timeline.layers)) errors.push({ code: "MISSING_FIELD", message: "layers[] is required" });
  if (errors.length > 0) return { ok: false, errors, warnings, hints };

  const ids = new Set();
  for (const layer of timeline.layers) {
    if (!layer.id) errors.push({ code: "MISSING_ID", message: "layer missing id" });
    if (!layer.scene) errors.push({ code: "MISSING_SCENE", message: `layer "${layer.id}" missing scene` });
    if (layer.start == null) errors.push({ code: "MISSING_START", message: `layer "${layer.id}" missing start` });
    if (layer.dur == null) errors.push({ code: "MISSING_DUR", message: `layer "${layer.id}" missing dur` });
    if (!layer.params || typeof layer.params !== "object" || Array.isArray(layer.params)) {
      errors.push({ code: "MISSING_PARAMS", message: `layer "${layer.id}" missing params object` });
    }

    if (layer.id && ids.has(layer.id)) {
      errors.push({ code: "DUPLICATE_ID", message: `duplicate layer id "${layer.id}"` });
    }
    ids.add(layer.id);

    if (layer.scene && REGISTRY.size > 0 && !REGISTRY.has(layer.scene)) {
      const sample = [...REGISTRY.keys()].slice(0, 5).join(", ");
      errors.push({
        code: "UNKNOWN_SCENE",
        message: `layer "${layer.id}" uses unknown scene "${layer.scene}"`,
        hint: `available: ${sample}...`,
      });
    }

    if (layer.scene && REGISTRY.size > 0 && REGISTRY.has(layer.scene)) {
      const sceneMeta = REGISTRY.get(layer.scene);
      const sceneRatio = sceneMeta?.ratio;
      if (sceneRatio && sceneRatio !== "any") {
        const isPortrait = timeline.height > timeline.width;
        const isSquare = Math.abs(timeline.width - timeline.height) < 50;
        const aspectRatio = timeline.width / timeline.height;
        const is43 = !isPortrait && !isSquare && aspectRatio >= 1.2 && aspectRatio <= 1.5;
        const timelineRatio = isSquare ? "1:1" : isPortrait ? "9:16" : is43 ? "4:3" : "16:9";
        if (sceneRatio !== timelineRatio) {
          errors.push({
            code: "RATIO_MISMATCH",
            message: `layer "${layer.id}" uses scene "${layer.scene}" (ratio ${sceneRatio}) but timeline is ${timelineRatio} (${timeline.width}x${timeline.height}). Use the correct ratio variant.`,
          });
        }
      }
    }

    if (typeof layer.start === "number" && layer.start < 0) {
      errors.push({ code: "BAD_TIME", message: `layer "${layer.id}" start < 0` });
    }
    if (typeof layer.dur === "number" && layer.dur <= 0) {
      errors.push({ code: "BAD_DUR", message: `layer "${layer.id}" dur <= 0` });
    }

    if (typeof layer.start === "number" && typeof layer.dur === "number") {
      const end = layer.start + layer.dur;
      if (end > timeline.duration + 0.01) {
        warnings.push({
          code: "OVERFLOW",
          message: `layer "${layer.id}" ends at ${end.toFixed(2)}s but timeline is ${timeline.duration}s`,
        });
      }
    }
  }

  const contentLayers = timeline.layers.filter((layer) => {
    if (BG_SCENES.has(layer.scene)) return false;
    if (layer.blend && layer.blend !== "normal") return false;
    if (layer.opacity != null && layer.opacity < 0.5) return false;
    if (hasExplicitBounds(layer)) return false;
    return true;
  });
  for (let index = 0; index < contentLayers.length; index++) {
    const a = contentLayers[index];
    const aEnd = a.start + a.dur;
    for (let otherIndex = index + 1; otherIndex < contentLayers.length; otherIndex++) {
      const b = contentLayers[otherIndex];
      const bEnd = b.start + b.dur;
      const overlap = Math.min(aEnd, bEnd) - Math.max(a.start, b.start);
      if (overlap > 1.5) {
        warnings.push({
          code: "FULLSCREEN_OVERLAP",
          message: `"${a.id}" (${a.start}-${aEnd.toFixed(1)}s) and "${b.id}" (${b.start}-${bEnd.toFixed(1)}s) overlap ${overlap.toFixed(1)}s — both fullscreen content. Use x/y/w/h to position, or stagger times.`,
        });
      }
    }
  }

  const isVertical = timeline.height > timeline.width;
  for (const layer of timeline.layers) {
    const fontSize = layer.params?.fontSize;
    if (typeof fontSize === "number" && fontSize >= 1) {
      const minFont = isVertical ? 24 : 18;
      const maxTitle = Math.floor(timeline.width / 20);
      if (fontSize < minFont) {
        warnings.push({
          code: "FONT_TOO_SMALL",
          message: `layer "${layer.id}" fontSize ${fontSize}px — minimum ${minFont}px for ${isVertical ? "竖屏" : "横屏"}`,
        });
      }
      if (fontSize > maxTitle) {
        warnings.push({
          code: "FONT_TOO_LARGE",
          message: `layer "${layer.id}" fontSize ${fontSize}px exceeds max ${maxTitle}px for ${timeline.width}px width — text will be clipped`,
        });
      }
    } else if (typeof fontSize === "number" && fontSize > 0 && fontSize < 1) {
      const maxRatio = 0.15;
      if (fontSize > maxRatio) {
        warnings.push({
          code: "FONT_TOO_LARGE",
          message: `layer "${layer.id}" fontSize ratio ${fontSize} exceeds max ratio ${maxRatio} — text may overflow`,
        });
      }
    }

    if (layer.x != null && layer.w != null) {
      const x = parseFloat(layer.x);
      const w = parseFloat(layer.w);
      if (String(layer.x).includes("%") && String(layer.w).includes("%") && x + w > 102) {
        warnings.push({
          code: "CONTENT_OVERFLOW",
          message: `layer "${layer.id}" x=${layer.x} + w=${layer.w} exceeds stage width`,
        });
      }
    }
    if (layer.y != null && layer.h != null) {
      const y = parseFloat(layer.y);
      const h = parseFloat(layer.h);
      if (String(layer.y).includes("%") && String(layer.h).includes("%") && y + h > 102) {
        warnings.push({
          code: "CONTENT_OVERFLOW",
          message: `layer "${layer.id}" y=${layer.y} + h=${layer.h} exceeds stage height`,
        });
      }
    }

    if (isVertical && !BG_SCENES.has(layer.scene) && !hasExplicitBounds(layer)) {
      hints.push({
        code: "SAFE_ZONE_HINT",
        message: `layer "${layer.id}" is fullscreen in portrait mode without x/y/w/h. Consider safe-zone padding to reduce text clipping near the edges.`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings, hints };
}

export function validateTimelineLegacy(timeline, opts = {}) {
  const errors = [];
  const warnings = [];
  const hints = [];
  const projectDir = opts.projectDir || process.cwd();

  const schemaErrs = gateLegacySchema(timeline);
  errors.push(...schemaErrs);
  if (schemaErrs.length > 0) {
    return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints });
  }

  const resolvedTimeline = resolveLegacyTimeline(timeline);
  if (!resolvedTimeline.ok) {
    errors.push({
      code: resolvedTimeline.error.code || "TIME_RESOLVE_ERROR",
      message: resolvedTimeline.error.message,
      ref: resolvedTimeline.error.ref,
      hint: resolvedTimeline.error.hint,
    });
    return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints });
  }
  const resolved = resolvedTimeline.value;

  for (const asset of resolved.assets || []) {
    if (!asset.path) continue;
    const absolutePath = isAbsolute(asset.path) ? asset.path : resolvePath(projectDir, asset.path);
    if (!existsSync(absolutePath)) {
      warnings.push({
        code: "MISSING_ASSET",
        message: `asset "${asset.id}" not found at ${absolutePath}`,
        ref: asset.id,
        hint: "fix the path or remove the asset",
      });
    }
  }

  for (const track of resolved.tracks || []) {
    for (const clip of track.clips || []) {
      if (!REGISTRY.has(clip.scene)) {
        errors.push({
          code: "UNKNOWN_SCENE",
          message: `clip "${clip.id}" references unknown scene "${clip.scene}"`,
          ref: clip.id,
          hint: `available: ${[...REGISTRY.keys()].slice(0, 8).join(", ")}...`,
        });
      }
    }
  }

  for (const track of resolved.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.effects?.enter?.type && !EFFECT_IDS.includes(clip.effects.enter.type)) {
        warnings.push({ code: "UNKNOWN_EFFECT", message: `clip "${clip.id}" enter effect "${clip.effects.enter.type}" not found`, ref: clip.id, hint: `available: ${EFFECT_IDS.join(", ")}` });
      }
      if (clip.effects?.exit?.type && !EFFECT_IDS.includes(clip.effects.exit.type)) {
        warnings.push({ code: "UNKNOWN_EFFECT", message: `clip "${clip.id}" exit effect "${clip.effects.exit.type}" not found`, ref: clip.id, hint: `available: ${EFFECT_IDS.join(", ")}` });
      }
      for (const filter of clip.filters || []) {
        const filterType = typeof filter === "string" ? filter : filter.type;
        if (filterType && !FILTER_IDS.includes(filterType)) {
          warnings.push({ code: "UNKNOWN_FILTER", message: `clip "${clip.id}" filter "${filterType}" not found`, ref: clip.id, hint: `available: ${FILTER_IDS.join(", ")}` });
        }
      }
      if (clip.transition?.type && !TRANSITION_IDS.includes(clip.transition.type)) {
        warnings.push({ code: "UNKNOWN_TRANSITION", message: `clip "${clip.id}" transition "${clip.transition.type}" not found`, ref: clip.id, hint: `available: ${TRANSITION_IDS.join(", ")}` });
      }
    }
  }

  const duration = resolved.duration;
  for (const track of resolved.tracks || []) {
    for (const clip of track.clips || []) {
      const start = clip.start;
      const clipDuration = clip.dur;
      if (typeof start !== "number" || typeof clipDuration !== "number") continue;
      if (start < 0 || start + clipDuration > duration + 1e-6) {
        errors.push({
          code: "TIME_OUT_OF_RANGE",
          message: `clip "${clip.id}" [${start}, ${start + clipDuration}] outside [0, ${duration}]`,
          ref: clip.id,
        });
      }
    }
  }

  for (const track of resolved.tracks || []) {
    const sorted = [...(track.clips || [])]
      .filter((clip) => typeof clip.start === "number")
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < sorted.length; index++) {
      const a = sorted[index - 1];
      const b = sorted[index];
      if (a.start + a.dur > b.start + 1e-6) {
        warnings.push({
          code: "CLIP_OVERLAP",
          message: `clips "${a.id}" and "${b.id}" overlap on track "${track.id}"`,
          ref: a.id,
        });
      }
    }
  }

  if (errors.length > 0) return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints, resolved });
  return guarded("validateTimeline", { ok: true, value: resolved, errors, warnings, hints, resolved });
}

function gateLegacySchema(timeline) {
  const errors = [];
  if (!timeline || typeof timeline !== "object") {
    errors.push({ code: "BAD_TIMELINE", message: "timeline is not an object" });
    return errors;
  }
  if (typeof timeline.version !== "string" || !timeline.version.trim()) {
    errors.push({
      code: "MISSING_VERSION",
      message: "version is required",
      hint: 'set version to "0.1" for nextframe/v0.1 timelines',
    });
  } else if (!V1_VERSION_RE.test(timeline.version.trim())) {
    errors.push({
      code: "BAD_VERSION",
      message: `version "${timeline.version}" must be a semver-like string`,
      hint: 'expected values look like "0.1" or "0.3"',
    });
  }
  if (typeof timeline.schema !== "string" || !SUPPORTED_SCHEMAS.has(timeline.schema)) {
    errors.push({
      code: "BAD_SCHEMA",
      message: `unsupported schema "${timeline.schema}"`,
      hint: `supported: ${[...SUPPORTED_SCHEMAS].join(", ")}`,
    });
  }
  if (typeof timeline.duration !== "number" || timeline.duration <= 0) {
    errors.push({ code: "BAD_DURATION", message: "duration must be > 0" });
  }
  if (!timeline.project || typeof timeline.project !== "object") {
    errors.push({ code: "BAD_PROJECT", message: "project is required" });
  } else {
    if (typeof timeline.project.width !== "number" || timeline.project.width < 360 || timeline.project.width > 7680) {
      errors.push({ code: "BAD_PROJECT", message: "project.width must be between 360 and 7680" });
    }
    if (typeof timeline.project.height !== "number" || timeline.project.height < 360 || timeline.project.height > 7680) {
      errors.push({ code: "BAD_PROJECT", message: "project.height must be between 360 and 7680" });
    }
    if (typeof timeline.project.fps !== "number" || !SUPPORTED_FPS.has(timeline.project.fps)) {
      errors.push({ code: "BAD_PROJECT", message: `project.fps must be one of ${[...SUPPORTED_FPS].join(", ")}` });
    }
  }
  if (!Array.isArray(timeline.tracks) || timeline.tracks.length === 0) {
    errors.push({ code: "NO_TRACKS", message: "tracks must be a non-empty array" });
    return errors;
  }

  const trackIds = new Set();
  const clipIds = new Set();
  for (const track of timeline.tracks) {
    if (!track.id) {
      errors.push({ code: "MISSING_TRACK_ID", message: "track missing id" });
      continue;
    }
    if (trackIds.has(track.id)) {
      errors.push({ code: "DUP_TRACK_ID", message: `duplicate track id "${track.id}"`, ref: track.id });
    }
    trackIds.add(track.id);
    if (!Array.isArray(track.clips)) {
      errors.push({ code: "BAD_TRACK", message: `track "${track.id}" clips must be an array`, ref: track.id });
      continue;
    }
    for (const clip of track.clips || []) {
      if (!clip.id) {
        errors.push({ code: "MISSING_CLIP_ID", message: "clip missing id" });
        continue;
      }
      if (clipIds.has(clip.id)) {
        errors.push({ code: "DUP_CLIP_ID", message: `duplicate clip id "${clip.id}"`, ref: clip.id });
      }
      clipIds.add(clip.id);
      if (!clip.scene || typeof clip.scene !== "string") {
        errors.push({ code: "MISSING_SCENE", message: `clip "${clip.id}" missing scene`, ref: clip.id });
      }
      if (clip.start == null) {
        errors.push({ code: "MISSING_START", message: `clip "${clip.id}" missing start`, ref: clip.id });
      }
      if (clip.dur == null) {
        errors.push({ code: "MISSING_DUR", message: `clip "${clip.id}" missing dur`, ref: clip.id });
      }
      if (!clip.params || typeof clip.params !== "object" || Array.isArray(clip.params)) {
        errors.push({ code: "MISSING_PARAMS", message: `clip "${clip.id}" missing params object`, ref: clip.id });
      }
    }
  }
  return errors;
}
