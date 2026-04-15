import type { KindSchema } from "./types.js";

export const schema: KindSchema = {
  kind: "animation",
  clipFields: ["at", "value", "ease"],
  trackFields: ["target"],
  validateClip(clip) {
    if (typeof clip.at !== "string" || clip.at.length === 0) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'animation clip requires "at"', field: "at" }] };
    }
    if (clip.value === undefined) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'animation clip requires "value"', field: "value" }] };
    }
    return { ok: true };
  },
  validateTrack(track) {
    if (!Array.isArray(track.clips)) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'animation track requires "clips[]"', field: "clips" }] };
    }
    return { ok: true };
  },
};
