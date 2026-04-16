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
      message: `scene.${field}.required: clip requires "${field}"`,
      field,
      fix: `Set "${field}" to an anchor ref like "s1.${field}" or a temporary numeric millisecond value.`,
    });
  }
}

function pushUnitRange(issues: Issue[], field: string, value: unknown) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    issues.push({
      code: "KIND_SCHEMA_VIOLATION",
      message: `scene.${field}.range: "${field}" must be a number in [0, 1]`,
      field,
    });
  }
}

export const schema: KindSchema = {
  kind: "scene",
  clipFields: ["scene", "params", "opacity", "begin", "end"],
  trackFields: ["theme", "opacity", "blend_mode"],
  validateClip(clip) {
    const issues: Issue[] = [];
    if (typeof clip.scene !== "string" || clip.scene.trim().length === 0) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'scene.scene.required: clip requires non-empty "scene"',
        field: "scene",
        fix: "Set \"scene\" to a registered scene id from `nextframe scenes`.",
      });
    }
    pushRequiredTime(issues, clip, "begin");
    pushRequiredTime(issues, clip, "end");
    pushUnitRange(issues, "opacity", clip.opacity);
    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
  validateTrack(track) {
    const issues: Issue[] = [];
    if (!Array.isArray(track.clips)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'scene.clips.required: track requires "clips[]"',
        field: "clips",
      });
    }

    const theme = getTrackParam(track, "theme");
    if (theme !== undefined && (typeof theme !== "string" || theme.trim().length === 0)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'scene.theme.type: "theme" must be a non-empty string',
        field: "theme",
      });
    }

    pushUnitRange(issues, "opacity", getTrackParam(track, "opacity"));

    const blendMode = getTrackParam(track, "blend_mode");
    if (blendMode !== undefined && (typeof blendMode !== "string" || blendMode.trim().length === 0)) {
      issues.push({
        code: "KIND_SCHEMA_VIOLATION",
        message: 'scene.blend_mode.type: "blend_mode" must be a non-empty string',
        field: "blend_mode",
      });
    }

    return issues.length > 0 ? { ok: false, issues } : { ok: true };
  },
};
