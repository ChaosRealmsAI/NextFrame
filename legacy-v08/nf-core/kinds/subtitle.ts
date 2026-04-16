import type { Issue } from "../anchors/types.js";
import type { KindSchema } from "./types.js";

function getTrackParam(track: { params?: Record<string, unknown>; [key: string]: unknown }, field: string) {
  if (track.params && field in track.params) {
    return track.params[field];
  }
  return track[field];
}

function isTimeRef(value: unknown) {
  return (typeof value === "string" && value.trim().length > 0)
    || (typeof value === "number" && Number.isFinite(value));
}

function pushRequiredTime(issues: Issue[], clip: Record<string, unknown>, field: "begin" | "end") {
  if (!isTimeRef(clip[field])) {
    issues.push({
      code: "KIND_SCHEMA_VIOLATION",
      message: `subtitle.${field}.required: clip requires "${field}"`,
      field,
      fix: `Set "${field}" to an anchor ref like "s1.${field}" or a temporary numeric millisecond value.`,
    });
  }
}

export const schema: KindSchema = {
  kind: "subtitle",
  clipFields: ["text", "style", "begin", "end"],
  trackFields: ["font", "color", "position"],
  validateClip(clip) {
    const issues: Issue[] = [];
    if (typeof clip.text !== "string" || clip.text.trim().length === 0) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'subtitle.text.required: clip requires non-empty "text"',
        field: "text",
        fix: 'Set "text" to the subtitle content for this cue.',
      });
    }
    pushRequiredTime(issues, clip, "begin");
    pushRequiredTime(issues, clip, "end");
    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
  validateTrack(track) {
    const issues: Issue[] = [];
    if (!Array.isArray(track.clips)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'subtitle.clips.required: track requires "clips[]"',
        field: "clips",
      });
    }

    for (const field of ["font", "color", "position"] as const) {
      const value = getTrackParam(track, field);
      if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
        issues.push({
          code: "KIND_SCHEMA_VIOLATION",
          message: `subtitle.${field}.type: "${field}" must be a non-empty string`,
          field,
        });
      }
    }

    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
};
