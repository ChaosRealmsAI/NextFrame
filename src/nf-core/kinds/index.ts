import { schema as audio } from "./audio.js";
import { schema as scene } from "./scene.js";
import { schema as subtitle } from "./subtitle.js";
import { schema as animation } from "./animation.js";
import type { Kind, KindSchema } from "./types.js";

export const KindRegistry: Record<Kind, KindSchema> = {
  audio,
  scene,
  subtitle,
  animation,
};

export function getKind(name: string) {
  return KindRegistry[name as Kind];
}

export function listKinds() {
  return Object.keys(KindRegistry) as Kind[];
}
