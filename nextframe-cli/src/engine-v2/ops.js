import { cloneTimeline } from "./timeline.js";

export function addLayer(timeline, opts) {
  const working = ensureTimeline(timeline);
  if (!opts || typeof opts !== "object") {
    return { ok: false, error: { code: "BAD_LAYER", message: "layer payload must be an object" } };
  }
  if (!opts.id || typeof opts.id !== "string") {
    return { ok: false, error: { code: "MISSING_ID", message: "layer id is required" } };
  }
  if ((working.layers || []).some((layer) => layer.id === opts.id)) {
    return { ok: false, error: { code: "DUPLICATE_ID", message: `layer "${opts.id}" already exists` } };
  }
  if (!opts.scene || typeof opts.scene !== "string") {
    return { ok: false, error: { code: "MISSING_SCENE", message: "layer scene is required" } };
  }
  if (!Number.isFinite(Number(opts.start)) || Number(opts.start) < 0) {
    return { ok: false, error: { code: "BAD_START", message: "layer start must be >= 0" } };
  }
  if (!Number.isFinite(Number(opts.dur)) || Number(opts.dur) <= 0) {
    return { ok: false, error: { code: "BAD_DUR", message: "layer dur must be > 0" } };
  }

  const layer = {
    ...cloneTimeline(opts),
    start: Number(opts.start),
    dur: Number(opts.dur),
  };
  working.layers.push(layer);
  return { ok: true, value: layer };
}

export function removeLayer(timeline, id) {
  const working = ensureTimeline(timeline);
  const index = working.layers.findIndex((layer) => layer.id === id);
  if (index === -1) {
    return { ok: false, error: { code: "NOT_FOUND", message: `layer "${id}" not found` } };
  }
  const [removed] = working.layers.splice(index, 1);
  return { ok: true, value: removed };
}

export function moveLayer(timeline, id, start) {
  const layer = findMutableLayer(timeline, id);
  if (!layer.ok) return layer;
  if (!Number.isFinite(Number(start)) || Number(start) < 0) {
    return { ok: false, error: { code: "BAD_START", message: "start must be >= 0" } };
  }
  layer.value.start = Number(start);
  return { ok: true, value: layer.value };
}

export function resizeLayer(timeline, id, dur) {
  const layer = findMutableLayer(timeline, id);
  if (!layer.ok) return layer;
  if (!Number.isFinite(Number(dur)) || Number(dur) <= 0) {
    return { ok: false, error: { code: "BAD_DUR", message: "dur must be > 0" } };
  }
  layer.value.dur = Number(dur);
  return { ok: true, value: layer.value };
}

export function setLayerProps(timeline, id, props) {
  const layer = findMutableLayer(timeline, id);
  if (!layer.ok) return layer;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return { ok: false, error: { code: "BAD_PROPS", message: "props must be an object" } };
  }
  Object.assign(layer.value, cloneTimeline(props));
  if (layer.value.start !== undefined) layer.value.start = Number(layer.value.start);
  if (layer.value.dur !== undefined) layer.value.dur = Number(layer.value.dur);
  return { ok: true, value: layer.value };
}

export function listLayers(timeline) {
  const working = ensureTimeline(timeline);
  return {
    ok: true,
    value: working.layers.map((layer) => ({
      id: layer.id,
      scene: layer.scene,
      start: layer.start,
      dur: layer.dur,
      end: layer.start + layer.dur,
    })),
  };
}

function ensureTimeline(timeline) {
  if (!timeline || typeof timeline !== "object") {
    return { layers: [] };
  }
  if (!Array.isArray(timeline.layers)) {
    timeline.layers = [];
  }
  return timeline;
}

function findMutableLayer(timeline, id) {
  const working = ensureTimeline(timeline);
  const layer = working.layers.find((entry) => entry.id === id);
  if (!layer) {
    return { ok: false, error: { code: "NOT_FOUND", message: `layer "${id}" not found` } };
  }
  return { ok: true, value: layer };
}
