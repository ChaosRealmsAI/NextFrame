import type { Issue } from "../anchors/types.js";
import type { KindSchema } from "./types.js";

const TARGET_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*\.clips\[\d+\]\.params\.[A-Za-z_][A-Za-z0-9_.-]*$/;

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

export const schema: KindSchema = {
  kind: "animation",
  clipFields: ["at", "value", "ease"],
  trackFields: ["target"],
  validateClip(clip) {
    const issues: Issue[] = [];
    if (!isTimeRef(clip.at)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'animation.at.required: clip requires "at"',
        field: "at",
        fix: 'Set "at" to an anchor ref like "beat.drop" or a temporary numeric millisecond value.',
      });
    }
    if (typeof clip.value !== "number" || !Number.isFinite(clip.value)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'animation.value.required: clip requires numeric "value"',
        field: "value",
        fix: 'Set "value" to the target numeric keyframe value.',
      });
    }
    if (clip.ease !== undefined && (typeof clip.ease !== "string" || clip.ease.trim().length === 0)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'animation.ease.type: "ease" must be a non-empty string',
        field: "ease",
      });
    }
    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
  validateTrack(track) {
    const issues: Issue[] = [];
    if (!Array.isArray(track.clips)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'animation.clips.required: track requires "clips[]"',
        field: "clips",
      });
    }

    const target = getTrackParam(track, "target");
    if (typeof target !== "string" || target.trim().length === 0) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'animation.target.required: track requires non-empty "target"',
        field: "target",
        fix: 'Set "target" to "<trackId>.clips[<i>].params.<field>".',
      });
    } else if (!TARGET_PATTERN.test(target)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'animation.target.pattern: "target" must match "<trackId>.clips[<i>].params.<field>"',
        field: "target",
      });
    }

    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
};
