// Scene registry stub — scenes directory was removed.
// All lookups return empty/null results.
import type { SceneEntry } from "../types.js";

export const REGISTRY: Map<string, SceneEntry> = new Map();

export function listScenes(): SceneEntry[] {
  return [];
}

export function getScene(_id: string): SceneEntry | null {
  return null;
}

export function getRegistry(): Map<string, SceneEntry> {
  return REGISTRY;
}

export function listScenesForRatio(_ratioId: string): SceneEntry[] {
  return [];
}
