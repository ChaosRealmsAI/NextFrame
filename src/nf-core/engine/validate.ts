// Timeline validator implementing the 6 safety gates.
// Returns {ok, errors[], warnings[], hints[]} — never throws.

import { existsSync } from "node:fs";
import { resolve as resolvePath, isAbsolute } from "node:path";
import { resolveTimeline } from "./time.js";
import { guarded } from "./_guard.js";
import { REGISTRY } from "../scenes/index.js";
import { EFFECT_IDS } from "../animation/effects/index.js";
import { FILTER_IDS } from "../filters/index.js";
import { TRANSITION_IDS } from "../animation/transitions/index.js";
import type { Timeline, LegacyTrack as Track, LegacyClip as Clip } from "../types.js";

interface ValidationError {
  code: string;
  message: string;
  ref?: string;
  hint?: string;
}

const SUPPORTED_SCHEMAS = new Set(["nextframe/v0.1"]);
const SUPPORTED_FPS = new Set([24, 25, 30, 60]);
const VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;

interface ValidateOpts {
  projectDir?: string;
}

export function validateTimeline(timeline: Timeline, opts: ValidateOpts = {}): Record<string, unknown> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const hints: ValidationError[] = [];
  const projectDir = opts.projectDir ?? process.cwd();

  // Gate 1: schema
  const schemaErrs = gateSchema(timeline);
  errors.push(...schemaErrs);
  if (schemaErrs.length > 0) {
    return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints });
  }

  // Gate 2: symbolic time resolve
  const r = resolveTimeline(timeline) as { ok: boolean; value?: unknown; error?: { code?: string; message?: string; ref?: string; hint?: string } };
  if (!r.ok) {
    const err = r.error ?? {};
    errors.push({
      code: err.code ?? "TIME_RESOLVE_ERROR",
      message: err.message ?? "time resolution failed",
      ref: err.ref,
      hint: err.hint,
    });
    return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints });
  }
  const resolved = r.value as Timeline;

  // Gate 3: asset existence
  for (const asset of resolved.assets ?? []) {
    if (!asset.path) continue;
    const abs = isAbsolute(asset.path) ? asset.path : resolvePath(projectDir, asset.path);
    if (!existsSync(abs)) {
      warnings.push({
        code: "MISSING_ASSET",
        message: `asset "${asset.id}" not found at ${abs}`,
        ref: asset.id,
        hint: "fix the path or remove the asset",
      });
    }
  }

  // Gate 4: clip.scene references a known scene
  for (const trk of resolved.tracks ?? []) {
    for (const clip of trk.clips ?? []) {
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

  // Validate effect/filter/transition type names
  for (const trk of resolved.tracks ?? []) {
    for (const clip of trk.clips ?? []) {
      if (clip.effects?.enter?.type && !EFFECT_IDS.includes(clip.effects.enter.type)) {
        warnings.push({ code: "UNKNOWN_EFFECT", message: `clip "${clip.id}" enter effect "${clip.effects.enter.type}" not found`, ref: clip.id, hint: `available: ${EFFECT_IDS.join(", ")}` });
      }
      if (clip.effects?.exit?.type && !EFFECT_IDS.includes(clip.effects.exit.type)) {
        warnings.push({ code: "UNKNOWN_EFFECT", message: `clip "${clip.id}" exit effect "${clip.effects.exit.type}" not found`, ref: clip.id, hint: `available: ${EFFECT_IDS.join(", ")}` });
      }
      for (const f of clip.filters ?? []) {
        const ft = typeof f === "object" && f !== null ? (f as { type?: string }).type : undefined;
        if (ft && !FILTER_IDS.includes(ft)) {
          warnings.push({ code: "UNKNOWN_FILTER", message: `clip "${clip.id}" filter "${ft}" not found`, ref: clip.id, hint: `available: ${FILTER_IDS.join(", ")}` });
        }
      }
      if (clip.transition?.type && !TRANSITION_IDS.includes(clip.transition.type)) {
        warnings.push({ code: "UNKNOWN_TRANSITION", message: `clip "${clip.id}" transition "${clip.transition.type}" not found`, ref: clip.id, hint: `available: ${TRANSITION_IDS.join(", ")}` });
      }
    }
  }

  // Range checks: every clip's [start, start+dur] in [0, duration]
  const dur = resolved.duration ?? 0;
  for (const trk of resolved.tracks ?? []) {
    for (const clip of trk.clips ?? []) {
      const s = clip.start;
      const d = clip.dur;
      if (typeof s !== "number" || typeof d !== "number") continue;
      if (s < 0 || s + d > dur + 1e-6) {
        errors.push({
          code: "TIME_OUT_OF_RANGE",
          message: `clip "${clip.id}" [${s}, ${s + d}] outside [0, ${dur}]`,
          ref: clip.id,
        });
      }
    }
  }

  // Same-track overlap detection (warning only)
  for (const trk of resolved.tracks ?? []) {
    const sorted = [...(trk.clips ?? [])].filter((c): c is Clip & { start: number; dur: number } => typeof c.start === "number")
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (a.start + (a.dur ?? 0) > b.start + 1e-6) {
        warnings.push({
          code: "CLIP_OVERLAP",
          message: `clips "${a.id}" and "${b.id}" overlap on track "${trk.id}"`,
          ref: a.id,
        });
      }
    }
  }

  if (errors.length > 0) return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints, resolved });
  return guarded("validateTimeline", { ok: true, value: resolved, errors, warnings, hints, resolved });
}

function gateSchema(t: unknown): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!t || typeof t !== "object") {
    errs.push({ code: "BAD_TIMELINE", message: "timeline is not an object" });
    return errs;
  }
  const timeline = t as Record<string, unknown>;
  if (typeof timeline.version !== "string" || !String(timeline.version).trim()) {
    errs.push({
      code: "MISSING_VERSION",
      message: "version is required",
      hint: 'set version to "0.1" for nextframe/v0.1 timelines',
    });
  } else if (!VERSION_RE.test(String(timeline.version).trim())) {
    errs.push({
      code: "BAD_VERSION",
      message: `version "${timeline.version}" must be a semver-like string`,
      hint: 'expected values look like "0.1" or "0.3"',
    });
  }
  if (typeof timeline.schema !== "string" || !SUPPORTED_SCHEMAS.has(timeline.schema as string)) {
    errs.push({
      code: "BAD_SCHEMA",
      message: `unsupported schema "${timeline.schema}"`,
      hint: `supported: ${[...SUPPORTED_SCHEMAS].join(", ")}`,
    });
  }
  if (typeof timeline.duration !== "number" || (timeline.duration as number) <= 0) {
    errs.push({ code: "BAD_DURATION", message: "duration must be > 0" });
  }
  const project = timeline.project;
  if (!project || typeof project !== "object") {
    errs.push({ code: "BAD_PROJECT", message: "project is required" });
  } else {
    const p = project as Record<string, unknown>;
    if (typeof p.width !== "number" || (p.width as number) < 360 || (p.width as number) > 7680) {
      errs.push({ code: "BAD_PROJECT", message: "project.width must be between 360 and 7680" });
    }
    if (typeof p.height !== "number" || (p.height as number) < 360 || (p.height as number) > 7680) {
      errs.push({ code: "BAD_PROJECT", message: "project.height must be between 360 and 7680" });
    }
    if (typeof p.fps !== "number" || !SUPPORTED_FPS.has(p.fps as number)) {
      errs.push({ code: "BAD_PROJECT", message: `project.fps must be one of ${[...SUPPORTED_FPS].join(", ")}` });
    }
  }
  const tracks = timeline.tracks as unknown[];
  if (!Array.isArray(tracks) || tracks.length === 0) {
    errs.push({ code: "NO_TRACKS", message: "tracks must be a non-empty array" });
    return errs;
  }
  const trackIds = new Set<string>();
  const clipIds = new Set<string>();
  for (const trk of tracks) {
    if (!trk || typeof trk !== "object") continue;
    const track = trk as Record<string, unknown>;
    if (!track.id) {
      errs.push({ code: "MISSING_TRACK_ID", message: "track missing id" });
      continue;
    }
    const trackId = track.id as string;
    if (trackIds.has(trackId)) {
      errs.push({ code: "DUP_TRACK_ID", message: `duplicate track id "${trackId}"`, ref: trackId });
    }
    trackIds.add(trackId);
    const clips = track.clips as unknown[];
    if (!Array.isArray(clips)) {
      errs.push({ code: "BAD_TRACK", message: `track "${trackId}" clips must be an array`, ref: trackId });
      continue;
    }
    for (const clip of clips) {
      if (!clip || typeof clip !== "object") continue;
      const c = clip as Record<string, unknown>;
      if (!c.id) {
        errs.push({ code: "MISSING_CLIP_ID", message: "clip missing id" });
        continue;
      }
      const clipId = c.id as string;
      if (clipIds.has(clipId)) {
        errs.push({ code: "DUP_CLIP_ID", message: `duplicate clip id "${clipId}"`, ref: clipId });
      }
      clipIds.add(clipId);
      if (!c.scene || typeof c.scene !== "string") {
        errs.push({ code: "MISSING_SCENE", message: `clip "${clipId}" missing scene`, ref: clipId });
      }
      if (c.start == null) {
        errs.push({ code: "MISSING_START", message: `clip "${clipId}" missing start`, ref: clipId });
      }
      if (c.dur == null) {
        errs.push({ code: "MISSING_DUR", message: `clip "${clipId}" missing dur`, ref: clipId });
      }
      if (!c.params || typeof c.params !== "object" || Array.isArray(c.params)) {
        errs.push({ code: "MISSING_PARAMS", message: `clip "${clipId}" missing params object`, ref: clipId });
      }
    }
  }
  return errs;
}
