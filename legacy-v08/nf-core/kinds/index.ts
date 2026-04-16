import { schema as audio } from "./audio.js";
import { schema as scene } from "./scene.js";
import { schema as subtitle } from "./subtitle.js";
import { schema as animation } from "./animation.js";
import type { Kind, KindSchema, Clip, Track, KindValidationResult } from "./types.js";

export const KindRegistry: Record<Kind, KindSchema> = {
  audio,
  scene,
  subtitle,
  animation,
};

export function getKind(name: string): KindSchema | null {
  return KindRegistry[name as Kind] || null;
}

export function listKinds(): Kind[] {
  return Object.keys(KindRegistry) as Kind[];
}

function unsupportedKind(kind: string, field: string): KindValidationResult {
  return {
    ok: false,
    issues: [{
      code: "UNSUPPORTED_KIND",
      message: `unsupported kind "${kind}"`,
      field,
      fix: `Use one of: ${listKinds().join(", ")}.`,
    }],
  };
}

export function validateClipForKind(kind: string, clip: Clip): KindValidationResult {
  const schema = getKind(kind);
  if (!schema) {
    return unsupportedKind(kind, "kind");
  }
  return schema.validateClip(clip as Clip<Kind>);
}

export function validateTrackForKind(kind: string, track: Track): KindValidationResult {
  const schema = getKind(kind);
  if (!schema) {
    return unsupportedKind(kind, "kind");
  }
  return schema.validateTrack(track as Track<Kind>);
}
