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

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function pushRequiredTime(issues: Issue[], clip: Record<string, unknown>, field: "begin" | "end") {
  if (!isTimeRef(clip[field])) {
    issues.push({
      code: "KIND_SCHEMA_VIOLATION",
      message: `audio.${field}.required: clip requires "${field}"`,
      field,
      fix: `Set "${field}" to an anchor ref like "s1.${field}" or a temporary numeric millisecond value.`,
    });
  }
}

function pushRangeIssue(issues: Issue[], field: string, value: unknown, min: number, max: number) {
  if (value === undefined) return;
  if (!isFiniteNumber(value) || value < min || value > max) {
    issues.push({
      code: "KIND_SCHEMA_VIOLATION",
      message: `audio.${field}.range: "${field}" must be a number in [${min}, ${max}]`,
      field,
    });
  }
}

function pushNonNegativeIssue(issues: Issue[], field: string, value: unknown) {
  if (value === undefined) return;
  if (!isFiniteNumber(value) || value < 0) {
    issues.push({
      code: "KIND_SCHEMA_VIOLATION",
      message: `audio.${field}.non_negative: "${field}" must be a non-negative number`,
      field,
    });
  }
}

export const schema: KindSchema = {
  kind: "audio",
  clipFields: ["src", "volume", "src_in", "src_out", "fade_in", "fade_out", "begin", "end"],
  trackFields: ["volume", "pan", "mute"],
  validateClip(clip) {
    const issues: Issue[] = [];
    if (typeof clip.src !== "string" || clip.src.trim().length === 0) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'audio.src.required: clip requires non-empty "src"',
        field: "src",
        fix: 'Set "src" to an audio asset path.',
      });
    }
    pushRequiredTime(issues, clip, "begin");
    pushRequiredTime(issues, clip, "end");
    pushRangeIssue(issues, "volume", clip.volume, 0, 1);
    pushNonNegativeIssue(issues, "src_in", clip.src_in);
    pushNonNegativeIssue(issues, "src_out", clip.src_out);
    pushNonNegativeIssue(issues, "fade_in", clip.fade_in);
    pushNonNegativeIssue(issues, "fade_out", clip.fade_out);
    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
  validateTrack(track) {
    const issues: Issue[] = [];
    if (!Array.isArray(track.clips)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'audio.clips.required: track requires "clips[]"',
        field: "clips",
      });
    }

    pushRangeIssue(issues, "volume", getTrackParam(track, "volume"), 0, 1);
    pushRangeIssue(issues, "pan", getTrackParam(track, "pan"), -1, 1);

    const mute = getTrackParam(track, "mute");
    if (mute !== undefined && typeof mute !== "boolean") {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'audio.mute.type: "mute" must be a boolean',
        field: "mute",
      });
    }

    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
};
