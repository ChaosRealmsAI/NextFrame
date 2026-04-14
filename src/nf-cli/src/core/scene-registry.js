// Runtime scene registry adapter for CLI scene listing and validation.

import * as runtimeScenes from "../../../nf-runtime/web/src/components/index.js";

const SCENE_ENTRIES = Object.entries(runtimeScenes)
  .map(([exportName, scene]) => normalizeScene(exportName, scene))
  .filter(Boolean);

export const REGISTRY = new Map(SCENE_ENTRIES.map((scene) => [scene.id, scene]));

export function listScenes() {
  return [...REGISTRY.values()];
}

export function getScene(id) {
  return REGISTRY.get(id) || null;
}

function normalizeScene(exportName, scene) {
  if (!scene || typeof scene !== "object") return null;

  const id = typeof scene.id === "string" && scene.id.trim() ? scene.id : exportName;
  return {
    ...scene,
    id,
    type: scene.type || "unknown",
    name: scene.name || id,
    category: scene.category || "Other",
    ratio: scene.ratio || null,
    defaultParams: getDefaultParams(scene),
  };
}

function getDefaultParams(scene) {
  if (scene.defaultParams && typeof scene.defaultParams === "object" && !Array.isArray(scene.defaultParams)) {
    return scene.defaultParams;
  }
  if (!scene.params || typeof scene.params !== "object" || Array.isArray(scene.params)) {
    return {};
  }

  const defaults = {};
  for (const [key, spec] of Object.entries(scene.params)) {
    if (spec && typeof spec === "object" && Object.hasOwn(spec, "default")) {
      defaults[key] = spec.default;
    }
  }
  return defaults;
}
