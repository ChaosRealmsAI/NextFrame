// Timeline validator implementing the 6 safety gates from
// spec/architecture/05-safety.md.
// Returns {ok, errors[], warnings[], hints[]} — never throws.

/** @typedef {import("../types.d.ts").Timeline} Timeline */

import { existsSync } from "node:fs";
import { resolve as resolvePath, isAbsolute } from "node:path";
import { resolveTimeline } from "./time.js";
import { guarded } from "./_guard.js";
import { REGISTRY } from "../../scenes/index.js";
import { EFFECT_IDS } from "../../fx/effects/index.js";
import { FILTER_IDS } from "../../fx/filters/index.js";
import { TRANSITION_IDS } from "../../fx/transitions/index.js";

const SUPPORTED_SCHEMAS = new Set(["nextframe/v0.1"]);
const SUPPORTED_FPS = new Set([24, 25, 30, 60]);
const VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;

/**
 * @param {Timeline} timeline
 * @param {{projectDir?: string}} [opts]
 * @returns {{ok: boolean, errors: object[], warnings: object[], hints: object[]}}
 */
export function validateTimeline(timeline, opts = {}) {
  const errors = [];
  const warnings = [];
  const hints = [];
  const projectDir = opts.projectDir || process.cwd();

  // Gate 1: schema
  const schemaErrs = gateSchema(timeline);
  errors.push(...schemaErrs);
  if (schemaErrs.length > 0) {
    return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints });
  }

  // Gate 2: symbolic time resolve
  const r = resolveTimeline(timeline);
  if (!r.ok) {
    errors.push({
      code: r.error.code || "TIME_RESOLVE_ERROR",
      message: r.error.message,
      ref: r.error.ref,
      hint: r.error.hint,
    });
    return guarded("validateTimeline", { ok: false, error: errors[0], errors, warnings, hints });
  }
  const resolved = r.value;

  // Gate 3: asset existence
  for (const asset of resolved.assets || []) {
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

  // Gate 4: reference completeness — checked by gate 2 (resolveTimeline already
  // throws TIME_REF_NOT_FOUND for dangling clip/marker/chapter references).

  // Also check clip.scene refers to a known scene
  for (const trk of resolved.tracks || []) {
    for (const clip of trk.clips || []) {
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
  for (const trk of resolved.tracks || []) {
    for (const clip of trk.clips || []) {
      if (clip.effects?.enter?.type && !EFFECT_IDS.includes(clip.effects.enter.type)) {
        warnings.push({ code: "UNKNOWN_EFFECT", message: `clip "${clip.id}" enter effect "${clip.effects.enter.type}" not found`, ref: clip.id, hint: `available: ${EFFECT_IDS.join(", ")}` });
      }
      if (clip.effects?.exit?.type && !EFFECT_IDS.includes(clip.effects.exit.type)) {
        warnings.push({ code: "UNKNOWN_EFFECT", message: `clip "${clip.id}" exit effect "${clip.effects.exit.type}" not found`, ref: clip.id, hint: `available: ${EFFECT_IDS.join(", ")}` });
      }
      for (const f of clip.filters || []) {
        const ft = typeof f === "string" ? f : f.type;
        if (ft && !FILTER_IDS.includes(ft)) {
          warnings.push({ code: "UNKNOWN_FILTER", message: `clip "${clip.id}" filter "${ft}" not found`, ref: clip.id, hint: `available: ${FILTER_IDS.join(", ")}` });
        }
      }
      if (clip.transition?.type && !TRANSITION_IDS.includes(clip.transition.type)) {
        warnings.push({ code: "UNKNOWN_TRANSITION", message: `clip "${clip.id}" transition "${clip.transition.type}" not found`, ref: clip.id, hint: `available: ${TRANSITION_IDS.join(", ")}` });
      }
    }
  }

  // Gate 5/6 (assertion + diff sanity) belong to apply_patch, not validate.

  // Range checks: every clip's [start, start+dur] in [0, duration]
  const dur = resolved.duration;
  for (const trk of resolved.tracks || []) {
    for (const clip of trk.clips || []) {
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
  for (const trk of resolved.tracks || []) {
    const sorted = [...(trk.clips || [])].filter((c) => typeof c.start === "number")
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (a.start + a.dur > b.start + 1e-6) {
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

function gateSchema(t) {
  const errs = [];
  if (!t || typeof t !== "object") {
    errs.push({ code: "BAD_TIMELINE", message: "timeline is not an object" });
    return errs;
  }
  if (typeof t.version !== "string" || !t.version.trim()) {
    errs.push({
      code: "MISSING_VERSION",
      message: "version is required",
      hint: 'set version to "0.1" for nextframe/v0.1 timelines',
    });
  } else if (!VERSION_RE.test(t.version.trim())) {
    errs.push({
      code: "BAD_VERSION",
      message: `version "${t.version}" must be a semver-like string`,
      hint: 'expected values look like "0.1" or "0.3"',
    });
  }
  if (typeof t.schema !== "string" || !SUPPORTED_SCHEMAS.has(t.schema)) {
    errs.push({
      code: "BAD_SCHEMA",
      message: `unsupported schema "${t.schema}"`,
      hint: `supported: ${[...SUPPORTED_SCHEMAS].join(", ")}`,
    });
  }
  if (typeof t.duration !== "number" || t.duration <= 0) {
    errs.push({ code: "BAD_DURATION", message: "duration must be > 0" });
  }
  if (!t.project || typeof t.project !== "object") {
    errs.push({ code: "BAD_PROJECT", message: "project is required" });
  } else {
    if (typeof t.project.width !== "number" || t.project.width < 360 || t.project.width > 7680) {
      errs.push({ code: "BAD_PROJECT", message: "project.width must be between 360 and 7680" });
    }
    if (typeof t.project.height !== "number" || t.project.height < 360 || t.project.height > 7680) {
      errs.push({ code: "BAD_PROJECT", message: "project.height must be between 360 and 7680" });
    }
    if (typeof t.project.fps !== "number" || !SUPPORTED_FPS.has(t.project.fps)) {
      errs.push({ code: "BAD_PROJECT", message: `project.fps must be one of ${[...SUPPORTED_FPS].join(", ")}` });
    }
  }
  if (!Array.isArray(t.tracks) || t.tracks.length === 0) {
    errs.push({ code: "NO_TRACKS", message: "tracks must be a non-empty array" });
    return errs;
  }
  // Unique track ids and clip ids
  const trackIds = new Set();
  const clipIds = new Set();
  for (const trk of t.tracks) {
    if (!trk.id) {
      errs.push({ code: "MISSING_TRACK_ID", message: "track missing id" });
      continue;
    }
    if (trackIds.has(trk.id)) {
      errs.push({ code: "DUP_TRACK_ID", message: `duplicate track id "${trk.id}"`, ref: trk.id });
    }
    trackIds.add(trk.id);
    if (!Array.isArray(trk.clips)) {
      errs.push({ code: "BAD_TRACK", message: `track "${trk.id}" clips must be an array`, ref: trk.id });
      continue;
    }
    for (const clip of trk.clips || []) {
      if (!clip.id) {
        errs.push({ code: "MISSING_CLIP_ID", message: "clip missing id" });
        continue;
      }
      if (clipIds.has(clip.id)) {
        errs.push({ code: "DUP_CLIP_ID", message: `duplicate clip id "${clip.id}"`, ref: clip.id });
      }
      clipIds.add(clip.id);
      if (!clip.scene || typeof clip.scene !== "string") {
        errs.push({ code: "MISSING_SCENE", message: `clip "${clip.id}" missing scene`, ref: clip.id });
      }
      if (clip.start == null) {
        errs.push({ code: "MISSING_START", message: `clip "${clip.id}" missing start`, ref: clip.id });
      }
      if (clip.dur == null) {
        errs.push({ code: "MISSING_DUR", message: `clip "${clip.id}" missing dur`, ref: clip.id });
      }
      if (!clip.params || typeof clip.params !== "object" || Array.isArray(clip.params)) {
        errs.push({ code: "MISSING_PARAMS", message: `clip "${clip.id}" missing params object`, ref: clip.id });
      }
    }
  }
  return errs;
}
