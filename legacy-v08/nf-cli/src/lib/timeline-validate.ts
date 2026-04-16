// Timeline validation helpers shared by CLI commands and AI tools.

import { existsSync } from "node:fs";
import { resolve as resolvePath, isAbsolute } from "node:path";
import { guarded } from "./guard.js";
import { resolveTimeline as resolveLegacyTimeline } from "./legacy-timeline.js";
import { getREGISTRY } from "./scene-registry.js";
import { parse as parseAnchorExpr } from "../../../nf-core/anchors/parser.js";
import { resolve as resolveAnchorRef } from "../../../nf-core/anchors/resolver.js";
import { validateAnchors } from "../../../nf-core/anchors/validator.js";
import { getKind } from "../../../nf-core/kinds/index.js";
import { EFFECT_IDS } from "../../../nf-core/animation/effects/index.js";
import { FILTER_IDS } from "../../../nf-core/filters/index.js";
import { TRANSITION_IDS } from "../../../nf-core/animation/transitions/index.js";
import type { SceneParam, SceneEntry, Timeline } from "../../../nf-core/types.js";

let REGISTRY: Map<string, SceneEntry> = new Map();

// Scenes that are expected to overlay fullscreen — skip overlap warnings for these
const BG_SCENES = new Set([
  "auroraGradient", "fluidBackground", "neonGrid", "vignette", "starfield", "particleFlow",
  "circleRipple", "meshGrid", "radialBurst", "confetti", "waveform", "pulseWave",
  "matrixRain", "gridPattern", "svgRings",
  "subtitleBar", "marquee", "lowerThird", "cornerBadge",
  "audioTrack", "syncSubs", "videoClip",
  "slideChrome", "slideFrame",
  // 9:16 interview scenes — all overlay by design
  "interviewBg", "interviewHeader", "interviewVideoArea", "interviewBiSub",
  "interviewMeta", "interviewBrand", "interviewTopBar", "progressBar9x16",
  // 16:9 scenes that overlay
  "darkGradient", "progressBar16x9",
]);
const SUPPORTED_SCHEMAS = new Set(["nextframe/v0.1"]);
const SUPPORTED_FPS = new Set([24, 25, 30, 60]);
const V1_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;
const V3_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;

interface ValidationDiagnostic { code: string; message: string; ref?: string; hint?: string }
type LooseLayer = Record<string, unknown> & {
  id?: string; scene?: string; start?: number; dur?: number; params?: Record<string, unknown>;
  blend?: string; opacity?: number; x?: unknown; y?: unknown; w?: unknown; h?: unknown;
};
type LooseTimeline = Record<string, unknown> & {
  version?: string; schema?: string; width?: number; height?: number; fps?: number; duration?: number;
  ratio?: string; audio?: unknown; layers?: LooseLayer[]; tracks?: LooseTrack[]; anchors?: Record<string, unknown>;
  chapters?: Array<Record<string, unknown>>; markers?: Array<Record<string, unknown>>;
  assets?: Array<Record<string, unknown>>; background?: string;
  project?: { width?: number; height?: number; fps?: number };
};
type LooseTrack = Record<string, unknown> & { id?: string; clips?: LooseClip[] };
type LooseClip = Record<string, unknown> & {
  id?: string; scene?: string; start?: number; dur?: number; params?: Record<string, unknown>;
  effects?: { enter?: { type?: string }; exit?: { type?: string } };
  filters?: Array<string | { type?: string }>;
  transition?: { type?: string };
};

function hasExplicitBounds(layer: LooseLayer | null | undefined) {
  return layer?.x != null || layer?.y != null || layer?.w != null || layer?.h != null;
}

export function detectFormat(timeline: LooseTimeline) {
  if ((timeline as { version?: unknown })?.version === "0.8") return "v0.8";
  if (Array.isArray(timeline?.layers)) return "v0.3";
  if (Array.isArray(timeline?.tracks) && (timeline as { anchors?: unknown })?.anchors) return "v0.8";
  if (Array.isArray(timeline?.tracks)) return "v0.1";
  return "unknown";
}

function addAnchorRefIssue(
  errors: ValidationDiagnostic[],
  code: string,
  message: string,
  field: string,
  hint?: string,
) {
  errors.push({ code, message, ref: field, hint });
}

function validateAnchorExpr(
  anchors: Record<string, unknown>,
  expr: unknown,
  field: string,
  errors: ValidationDiagnostic[],
) {
  if (typeof expr !== "string" || expr.trim().length === 0) {
    addAnchorRefIssue(errors, "BAD_ANCHOR_EXPR", `${field} must be a non-empty anchor expression string`, field);
    return null;
  }
  try {
    parseAnchorExpr(expr);
    return resolveAnchorRef(anchors as Record<string, { at?: number; begin?: number; end?: number }>, expr);
  } catch (error) {
    const message = (error as Error).message || String(error);
    const code = message.startsWith("MISSING_ANCHOR") || message.startsWith("MISSING_ANCHOR_POINT")
      ? "MISSING_ANCHOR"
      : "BAD_ANCHOR_EXPR";
    addAnchorRefIssue(errors, code, message, field, "Use id.begin|at|end with optional ± offset in s/ms.");
    return null;
  }
}

export function validateTimelineV08(timeline: LooseTimeline) {
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];
  const hints: ValidationDiagnostic[] = [];

  if (timeline.version !== "0.8") {
    errors.push({ code: "BAD_VERSION", message: 'v0.8 timeline must set version to "0.8"' });
  }
  if (!timeline.anchors || typeof timeline.anchors !== "object" || Array.isArray(timeline.anchors)) {
    errors.push({ code: "MISSING_FIELD", message: "anchors object is required" });
  }
  if (!Array.isArray(timeline.tracks)) {
    errors.push({ code: "MISSING_FIELD", message: "tracks[] is required" });
  }
  if (errors.length > 0) return { ok: false, errors, warnings, hints };

  const anchorCheck = validateAnchors(timeline.anchors as Record<string, { at?: number; begin?: number; end?: number }>);
  for (const issue of anchorCheck.issues) {
    errors.push({ code: issue.code, message: issue.message, ref: issue.field, hint: issue.fix });
  }

  const trackIds = new Set<string>();
  for (let trackIndex = 0; trackIndex < timeline.tracks!.length; trackIndex++) {
    const track = timeline.tracks![trackIndex];
    const trackRef = `tracks[${trackIndex}]`;
    if (!track || typeof track !== "object") {
      errors.push({ code: "BAD_TRACK", message: `${trackRef} must be an object`, ref: trackRef });
      continue;
    }

    if (typeof track.id === "string" && track.id) {
      if (trackIds.has(track.id)) {
        errors.push({ code: "DUPLICATE_ID", message: `duplicate track id "${track.id}"`, ref: `${trackRef}.id` });
      }
      trackIds.add(track.id);
    }

    const schema = typeof track.kind === "string" ? getKind(track.kind) : null;
    if (!schema) {
      errors.push({ code: "UNKNOWN_KIND", message: `${trackRef} uses unknown kind "${String(track.kind || "")}"`, ref: `${trackRef}.kind` });
      continue;
    }

    const trackValidation = schema.validateTrack(track as never);
    if (!trackValidation.ok) {
      for (const issue of trackValidation.issues) {
        errors.push({ code: issue.code, message: issue.message, ref: `${trackRef}.${issue.field || ""}`.replace(/\.$/, "") });
      }
    }

    if (schema.kind === "animation") {
      const target = String(track.target || "");
      if (!/^([^.]+)\.clips\[(\d+)\]\.params\.([A-Za-z0-9_$]+)$/.test(target)) {
        errors.push({
          code: "KIND_SCHEMA_VIOLATION",
          message: `${trackRef}.target must match sceneTrackId.clips[N].params.fieldName`,
          ref: `${trackRef}.target`,
        });
      }
    }

    const clips = Array.isArray(track.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
      const clip = clips[clipIndex];
      const clipRef = `${trackRef}.clips[${clipIndex}]`;
      const clipValidation = schema.validateClip(clip as never);
      if (!clipValidation.ok) {
        for (const issue of clipValidation.issues) {
          errors.push({ code: issue.code, message: issue.message, ref: `${clipRef}.${issue.field || ""}`.replace(/\.$/, "") });
        }
      }

      if (schema.kind === "animation") {
        validateAnchorExpr(timeline.anchors as Record<string, unknown>, clip.at, `${clipRef}.at`, errors);
        continue;
      }

      const begin = validateAnchorExpr(timeline.anchors as Record<string, unknown>, clip.begin, `${clipRef}.begin`, errors);
      const end = validateAnchorExpr(timeline.anchors as Record<string, unknown>, clip.end, `${clipRef}.end`, errors);
      if (begin !== null && end !== null && begin >= end) {
        errors.push({
          code: "BAD_CLIP_RANGE",
          message: `${clipRef} must resolve to begin < end`,
          ref: clipRef,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, hints };
}

/**
 * Look up a scene in the registry by bare id (e.g. "auroraGradient") or ratio:id.
 * Registry keys use "ratio:id" format; bare ids may match multiple ratios.
 * Returns the entry for the given timelineRatio if available, otherwise first match.
 */
function registryLookup(sceneId: string, timelineRatio: string | null) {
  if (REGISTRY.has(sceneId)) return REGISTRY.get(sceneId);
  // Try ratio:id key
  const prefixed = timelineRatio ? `${timelineRatio}:${sceneId}` : null;
  if (prefixed && REGISTRY.has(prefixed)) return REGISTRY.get(prefixed);
  // Fall back: any ratio
  for (const [key, entry] of REGISTRY.entries()) {
    if (key.endsWith(`:${sceneId}`)) return entry;
  }
  return null;
}

export async function validateTimelineV3(timeline: LooseTimeline) {
  REGISTRY = await getREGISTRY();
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];
  const hints: ValidationDiagnostic[] = [];

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
  if (typeof timeline.duration === "number" && timeline.duration <= 0) {
    errors.push({ code: "BAD_DURATION", message: "duration must be > 0" });
  }
  if (!Array.isArray(timeline.layers)) errors.push({ code: "MISSING_FIELD", message: "layers[] is required" });
  if (errors.length > 0) return { ok: false, errors, warnings, hints };

  const layers = timeline.layers!;

  if (!timeline.ratio) {
    const inferred = timeline.height! > timeline.width! ? "9:16" : "16:9";
    warnings.push({ code: "MISSING_RATIO", message: `ratio not specified — inferred "${inferred}" from ${timeline.width}x${timeline.height}. Fix: add "ratio": "${inferred}"` });
  } else {
    const expectPortrait = timeline.ratio === "9:16";
    const actualPortrait = timeline.height! > timeline.width!;
    if (expectPortrait !== actualPortrait) {
      errors.push({ code: "RATIO_MISMATCH", message: `ratio "${timeline.ratio}" doesn't match ${timeline.width}x${timeline.height}. Fix: correct ratio or dimensions` });
    }
  }

  if (timeline.audio !== undefined && timeline.audio !== null) {
    if (typeof timeline.audio === "object" && !Array.isArray(timeline.audio)) {
      const audioObj = timeline.audio as Record<string, unknown>;
      if (!audioObj.src || typeof audioObj.src !== "string") {
        errors.push({ code: "BAD_AUDIO", message: "timeline.audio object missing .src string. Fix: set audio.src to file path, or use a plain string" });
      }
    } else if (typeof timeline.audio !== "string") {
      errors.push({ code: "BAD_AUDIO", message: `timeline.audio must be string or {src: "path"}, got ${typeof timeline.audio}` });
    }
  }

  const ids = new Set();
  for (const layer of layers) {
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

    const isPortrait = timeline.height! > timeline.width!;
    const isSquare = Math.abs(timeline.width! - timeline.height!) < 50;
    const aspectRatio = timeline.width! / timeline.height!;
    const is43 = !isPortrait && !isSquare && aspectRatio >= 1.2 && aspectRatio <= 1.5;
    const timelineRatio = isSquare ? "1:1" : isPortrait ? "9:16" : is43 ? "4:3" : "16:9";

    const registryEntry = layer.scene && REGISTRY.size > 0 ? registryLookup(layer.scene, timelineRatio) : null;

    if (layer.scene && REGISTRY.size > 0 && !registryEntry) {
      const sample = [...REGISTRY.keys()].slice(0, 5).join(", ");
      errors.push({
        code: "UNKNOWN_SCENE",
        message: `layer "${layer.id}" uses unknown scene "${layer.scene}"`,
        hint: `available: ${sample}...`,
      });
    }

    if (layer.scene && REGISTRY.size > 0 && registryEntry) {
      const sceneMeta = registryEntry?.META;
      const sceneRatio = sceneMeta?.ratio;
      if (sceneRatio && sceneRatio !== "any" && sceneRatio !== timelineRatio) {
        errors.push({
          code: "RATIO_MISMATCH",
          message: `layer "${layer.id}" uses scene "${layer.scene}" (ratio ${sceneRatio}) but timeline is ${timelineRatio} (${timeline.width}x${timeline.height}). Use the correct ratio variant.`,
        });
      }
    }

    // Deep param validation against scene meta.params schema
    if (registryEntry?.META?.params && layer.params && typeof layer.params === "object") {
      const paramSchema = (registryEntry as SceneEntry).META!.params as Record<string, SceneParam>;
      for (const [key, spec] of Object.entries(paramSchema)) {
        const val = layer.params[key];
        if (spec.required && (val === undefined || val === null || val === "")) {
          errors.push({ code: "MISSING_PARAM", message: `layer "${layer.id}" missing required param "${key}". Fix: add ${key} to params` });
        }
        if (val !== undefined && val !== null) {
          if (spec.type === "number" && typeof val !== "number") {
            errors.push({ code: "BAD_PARAM_TYPE", message: `layer "${layer.id}" param "${key}" must be number, got ${typeof val}` });
          }
          if (spec.type === "array" && !Array.isArray(val)) {
            errors.push({ code: "BAD_PARAM_TYPE", message: `layer "${layer.id}" param "${key}" must be array, got ${typeof val}` });
          }
          if (spec.type === "number" && typeof val === "number" && Array.isArray(spec.range) && spec.range.length === 2) {
            if (val < spec.range[0] || val > spec.range[1]) {
              warnings.push({ code: "PARAM_OUT_OF_RANGE", message: `layer "${layer.id}" param "${key}" = ${val} outside [${spec.range[0]}, ${spec.range[1]}]` });
            }
          }
          if (spec.type === "array" && Array.isArray(val) && spec.semantic && spec.semantic.includes("srt")) {
            for (let si = 0; si < Math.min(val.length, 3); si++) {
              const entry = val[si];
              if (!entry || typeof entry !== "object") {
                errors.push({ code: "BAD_SRT", message: `layer "${layer.id}" srt[${si}] must be {s, e, ...}` });
              } else if (typeof entry.s !== "number" || typeof entry.e !== "number") {
                errors.push({ code: "BAD_SRT", message: `layer "${layer.id}" srt[${si}] needs numeric s and e` });
              }
            }
          }
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
      if (end > timeline.duration! + 0.01) {
        warnings.push({
          code: "OVERFLOW",
          message: `layer "${layer.id}" ends at ${end.toFixed(2)}s but timeline is ${timeline.duration}s`,
        });
      }
    }
  }

  const contentLayers = layers.filter((layer) => {
    if (layer.scene && BG_SCENES.has(layer.scene)) return false;
    if (layer.blend && layer.blend !== "normal") return false;
    if (layer.opacity != null && layer.opacity < 0.5) return false;
    if (hasExplicitBounds(layer)) return false;
    return true;
  });
  for (let index = 0; index < contentLayers.length; index++) {
    const a = contentLayers[index];
    const aEnd = (a.start as number) + (a.dur as number);
    for (let otherIndex = index + 1; otherIndex < contentLayers.length; otherIndex++) {
      const b = contentLayers[otherIndex];
      const bEnd = (b.start as number) + (b.dur as number);
      const overlap = Math.min(aEnd, bEnd) - Math.max(a.start as number, b.start as number);
      if (overlap > 1.5) {
        warnings.push({
          code: "FULLSCREEN_OVERLAP",
          message: `"${a.id}" (${a.start}-${aEnd.toFixed(1)}s) and "${b.id}" (${b.start}-${bEnd.toFixed(1)}s) overlap ${overlap.toFixed(1)}s — both fullscreen content. Use x/y/w/h to position, or stagger times.`,
        });
      }
    }
  }

  const isVertical = (timeline.height ?? 0) > (timeline.width ?? 0);
  for (const layer of layers) {
    const fontSize = layer.params?.fontSize;
    if (typeof fontSize === "number" && fontSize >= 1) {
      const minFont = isVertical ? 24 : 18;
      const maxTitle = Math.floor(timeline.width! / 20);
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
      const x = parseFloat(String(layer.x));
      const w = parseFloat(String(layer.w));
      if (String(layer.x).includes("%") && String(layer.w).includes("%") && x + w > 102) {
        warnings.push({
          code: "CONTENT_OVERFLOW",
          message: `layer "${layer.id}" x=${layer.x} + w=${layer.w} exceeds stage width`,
        });
      }
    }
    if (layer.y != null && layer.h != null) {
      const y = parseFloat(String(layer.y));
      const h = parseFloat(String(layer.h));
      if (String(layer.y).includes("%") && String(layer.h).includes("%") && y + h > 102) {
        warnings.push({
          code: "CONTENT_OVERFLOW",
          message: `layer "${layer.id}" y=${layer.y} + h=${layer.h} exceeds stage height`,
        });
      }
    }

    if (isVertical && layer.scene && !BG_SCENES.has(layer.scene) && !hasExplicitBounds(layer)) {
      hints.push({
        code: "SAFE_ZONE_HINT",
        message: `layer "${layer.id}" is fullscreen in portrait mode without x/y/w/h. Consider safe-zone padding to reduce text clipping near the edges.`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings, hints };
}

export function validateTimelineLegacy(timeline: LooseTimeline, opts: { projectDir?: string } = {}) {
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];
  const hints: ValidationDiagnostic[] = [];
  const projectDir = opts.projectDir || process.cwd();

  const schemaErrs = gateLegacySchema(timeline);
  errors.push(...schemaErrs);
  if (schemaErrs.length > 0) {
    return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints });
  }

  type LegacyResolveResult =
    | { ok: true; value: Timeline & Record<string, unknown>; lookup?: unknown }
    | { ok: false; error: { code?: string; message: string; ref?: string; hint?: string } };

  const resolvedTimeline = resolveLegacyTimeline(timeline as unknown as Parameters<typeof resolveLegacyTimeline>[0]) as unknown as LegacyResolveResult;
  if (resolvedTimeline.ok === false) {
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
      if (start < 0 || start + clipDuration > (duration ?? 0) + 1e-6) {
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

function gateLegacySchema(timeline: LooseTimeline) {
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
