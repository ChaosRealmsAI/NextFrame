import type { KindSchema } from "./types.js";

export const schema: KindSchema = {
  kind: "audio",
  clipFields: ["src", "volume", "src_in", "src_out", "fade_in", "fade_out"],
  trackFields: ["volume", "pan", "mute"],
  validateClip(clip) {
    if (typeof clip.src !== "string" || clip.src.length === 0) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'audio clip requires "src"', field: "src" }] };
    }
    return { ok: true };
  },
  validateTrack(track) {
    if (!Array.isArray(track.clips)) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'audio track requires "clips[]"', field: "clips" }] };
    }
    return { ok: true };
  },
};
