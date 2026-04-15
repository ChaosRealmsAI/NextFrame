import type { KindSchema } from "./types.js";

export const schema: KindSchema = {
  kind: "subtitle",
  clipFields: ["text", "style"],
  trackFields: ["font", "color", "position"],
  validateClip(clip) {
    if (typeof clip.text !== "string" || clip.text.trim().length === 0) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'subtitle clip requires non-empty "text"', field: "text" }] };
    }
    return { ok: true };
  },
  validateTrack(track) {
    if (!Array.isArray(track.clips)) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'subtitle track requires "clips[]"', field: "clips" }] };
    }
    return { ok: true };
  },
};
