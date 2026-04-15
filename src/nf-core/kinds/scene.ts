import type { KindSchema } from "./types.js";

export const schema: KindSchema = {
  kind: "scene",
  clipFields: ["scene", "params", "opacity"],
  trackFields: ["theme", "opacity", "blend_mode"],
  validateClip(clip) {
    if (typeof clip.scene !== "string" || clip.scene.length === 0) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'scene clip requires "scene"', field: "scene" }] };
    }
    return { ok: true };
  },
  validateTrack(track) {
    if (!Array.isArray(track.clips)) {
      return { ok: false, issues: [{ code: "KIND_SCHEMA_VIOLATION", message: 'scene track requires "clips[]"', field: "clips" }] };
    }
    return { ok: true };
  },
};
