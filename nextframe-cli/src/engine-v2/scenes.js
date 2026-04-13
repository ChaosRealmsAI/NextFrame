import SCENE_REGISTRY from "../../../runtime/web/src/scenes-v2/index.js";

const SCENE_ENTRIES = Object.values(SCENE_REGISTRY)
  .filter((scene) => scene && typeof scene === "object" && typeof scene.id === "string")
  .map((scene) => ({
    id: scene.id,
    name: scene.name || scene.id,
    type: scene.type || "unknown",
    category: scene.category || "Other",
    params: Object.entries(scene.defaultParams || {}).map(([name, defaultValue]) => ({
      name,
      type: inferParamType(defaultValue),
      default: defaultValue,
    })),
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

export const SCENE_META = new Map(SCENE_ENTRIES.map((scene) => [scene.id, scene]));

export function listScenes() {
  return SCENE_ENTRIES;
}

export function getScene(id) {
  return SCENE_META.get(id) || null;
}

function inferParamType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}
