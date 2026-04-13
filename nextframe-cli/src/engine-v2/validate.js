import { getScene } from "./scenes.js";
import { detectFormat, V3_SCHEMA } from "./timeline.js";

const BACKGROUND_CATEGORIES = new Set(["Backgrounds", "Effects", "Shader"]);

export function validateTimeline(timeline) {
  const errors = [];
  const warnings = [];
  const hints = [];
  const format = detectFormat(timeline);

  if (!timeline || typeof timeline !== "object") {
    return fail(errors, warnings, hints, "BAD_TIMELINE", "timeline must be an object");
  }
  if (format === "legacy") {
    return fail(errors, warnings, hints, "LEGACY_FORMAT", "legacy tracks/clips timelines are not supported");
  }

  if (timeline.schema !== V3_SCHEMA) {
    errors.push({
      code: "BAD_SCHEMA",
      message: `schema must be "${V3_SCHEMA}"`,
    });
  }

  for (const field of ["width", "height", "fps", "duration"]) {
    if (!Number.isFinite(Number(timeline[field])) || Number(timeline[field]) <= 0) {
      errors.push({ code: "BAD_FIELD", message: `${field} must be a positive number`, ref: field });
    }
  }

  for (const field of ["layers", "chapters", "markers", "assets"]) {
    if (!Array.isArray(timeline[field])) {
      errors.push({ code: "BAD_FIELD", message: `${field} must be an array`, ref: field });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, hints };
  }

  const ids = new Set();
  for (const [index, layer] of timeline.layers.entries()) {
    if (!layer || typeof layer !== "object") {
      errors.push({ code: "BAD_LAYER", message: `layer ${index + 1} must be an object` });
      continue;
    }
    if (!layer.id || typeof layer.id !== "string") {
      errors.push({ code: "MISSING_ID", message: `layer ${index + 1} is missing id` });
    } else if (ids.has(layer.id)) {
      errors.push({ code: "DUPLICATE_ID", message: `duplicate layer id "${layer.id}"`, ref: layer.id });
    } else {
      ids.add(layer.id);
    }

    if (!layer.scene || typeof layer.scene !== "string") {
      errors.push({ code: "MISSING_SCENE", message: `layer "${layer.id || index + 1}" is missing scene`, ref: layer.id });
    } else if (!getScene(layer.scene)) {
      errors.push({ code: "UNKNOWN_SCENE", message: `unknown scene "${layer.scene}"`, ref: layer.id || layer.scene });
    }

    if (!Number.isFinite(Number(layer.start)) || Number(layer.start) < 0) {
      errors.push({ code: "BAD_START", message: `layer "${layer.id || index + 1}" start must be >= 0`, ref: layer.id });
    }
    if (!Number.isFinite(Number(layer.dur)) || Number(layer.dur) <= 0) {
      errors.push({ code: "BAD_DUR", message: `layer "${layer.id || index + 1}" dur must be > 0`, ref: layer.id });
    }

    if (Number.isFinite(Number(layer.start)) && Number.isFinite(Number(layer.dur))) {
      const end = Number(layer.start) + Number(layer.dur);
      if (end > Number(timeline.duration) + 1e-6) {
        warnings.push({
          code: "OVERFLOW",
          message: `layer "${layer.id}" ends at ${end.toFixed(3)}s beyond timeline duration ${Number(timeline.duration).toFixed(3)}s`,
          ref: layer.id,
        });
      }
    }
  }

  for (const [index, chapter] of timeline.chapters.entries()) {
    if (!chapter || typeof chapter !== "object") {
      errors.push({ code: "BAD_CHAPTER", message: `chapter ${index + 1} must be an object` });
      continue;
    }
    if (!chapter.id || typeof chapter.id !== "string") {
      errors.push({ code: "MISSING_CHAPTER_ID", message: `chapter ${index + 1} is missing id` });
    }
    if (!Number.isFinite(Number(chapter.start))) {
      errors.push({ code: "BAD_CHAPTER_START", message: `chapter "${chapter.id || index + 1}" start must be numeric` });
    }
    if (chapter.end !== undefined && !Number.isFinite(Number(chapter.end))) {
      errors.push({ code: "BAD_CHAPTER_END", message: `chapter "${chapter.id || index + 1}" end must be numeric` });
    }
  }

  for (const [index, marker] of timeline.markers.entries()) {
    if (!marker || typeof marker !== "object") {
      errors.push({ code: "BAD_MARKER", message: `marker ${index + 1} must be an object` });
      continue;
    }
    if (!marker.id || typeof marker.id !== "string") {
      errors.push({ code: "MISSING_MARKER_ID", message: `marker ${index + 1} is missing id` });
    }
    if (!Number.isFinite(Number(marker.t))) {
      errors.push({ code: "BAD_MARKER_TIME", message: `marker "${marker.id || index + 1}" t must be numeric` });
    }
  }

  warnings.push(...findFullscreenOverlapWarnings(timeline.layers));

  return { ok: errors.length === 0, errors, warnings, hints };
}

export { detectFormat };

function fail(errors, warnings, hints, code, message) {
  errors.push({ code, message });
  return { ok: false, errors, warnings, hints };
}

function findFullscreenOverlapWarnings(layers) {
  const warnings = [];
  const contentLayers = layers.filter((layer) => {
    const scene = getScene(layer.scene);
    if (!scene) return false;
    if (BACKGROUND_CATEGORIES.has(scene.category)) return false;
    return !layer.x && !layer.y && !layer.w && !layer.h;
  });

  for (let index = 0; index < contentLayers.length; index++) {
    const left = contentLayers[index];
    const leftEnd = Number(left.start) + Number(left.dur);
    for (let inner = index + 1; inner < contentLayers.length; inner++) {
      const right = contentLayers[inner];
      const rightEnd = Number(right.start) + Number(right.dur);
      const overlap = Math.min(leftEnd, rightEnd) - Math.max(Number(left.start), Number(right.start));
      if (overlap > 0) {
        warnings.push({
          code: "FULLSCREEN_OVERLAP",
          message: `fullscreen content layers "${left.id}" and "${right.id}" overlap for ${overlap.toFixed(3)}s`,
          ref: left.id,
        });
      }
    }
  }

  return warnings;
}
