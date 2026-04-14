// engine-v2/ops.js — layer CRUD operations for v0.3 flat layers[] format.
// Each function reads/modifies timeline object, returns { ok, value/error }.

export function addLayer(timeline, opts) {
  if (!opts.scene) return { ok: false, error: { code: 'MISSING_SCENE', message: 'opts.scene is required' } };
  const id = opts.id || `${opts.scene}-${timeline.layers.length + 1}`;
  const layer = {
    id,
    scene: opts.scene,
    start: opts.start ?? 0,
    dur: opts.dur ?? 5,
  };
  if (opts.params) layer.params = opts.params;
  if (opts.enter) layer.enter = opts.enter;
  if (opts.exit) layer.exit = opts.exit;
  if (opts.blend) layer.blend = opts.blend;
  if (opts.opacity != null) layer.opacity = opts.opacity;
  timeline.layers.push(layer);
  return { ok: true, value: layer };
}

export function removeLayer(timeline, id) {
  const idx = timeline.layers.findIndex(l => l.id === id);
  if (idx === -1) return { ok: false, error: { code: 'NOT_FOUND', message: `layer "${id}" not found` } };
  const removed = timeline.layers.splice(idx, 1)[0];
  return { ok: true, value: removed };
}

export function moveLayer(timeline, id, newStart) {
  const layer = timeline.layers.find(l => l.id === id);
  if (!layer) return { ok: false, error: { code: 'NOT_FOUND', message: `layer "${id}" not found` } };
  if (typeof newStart !== 'number' || newStart < 0) {
    return { ok: false, error: { code: 'BAD_TIME', message: 'newStart must be a non-negative number' } };
  }
  layer.start = newStart;
  return { ok: true, value: layer };
}

export function resizeLayer(timeline, id, newDur) {
  const layer = timeline.layers.find(l => l.id === id);
  if (!layer) return { ok: false, error: { code: 'NOT_FOUND', message: `layer "${id}" not found` } };
  if (typeof newDur !== 'number' || newDur <= 0) {
    return { ok: false, error: { code: 'BAD_DUR', message: 'newDur must be positive' } };
  }
  layer.dur = newDur;
  return { ok: true, value: layer };
}

export function setLayerProp(timeline, id, key, value) {
  const layer = timeline.layers.find(l => l.id === id);
  if (!layer) return { ok: false, error: { code: 'NOT_FOUND', message: `layer "${id}" not found` } };
  if (key === 'params' && typeof value === 'object' && value !== null) {
    layer.params = { ...(layer.params || {}), ...value };
  } else {
    layer[key] = value;
  }
  return { ok: true, value: layer };
}

export function setLayerProps(timeline, id, props) {
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return { ok: false, error: { code: "BAD_PROPS", message: "props must be an object" } };
  }
  let result = null;
  for (const [key, value] of Object.entries(props)) {
    result = setLayerProp(timeline, id, key, value);
    if (!result.ok) return result;
  }
  return result || setLayerProp(timeline, id, "params", {});
}

export function listLayers(timeline) {
  return {
    ok: true,
    value: (timeline.layers || []).map(l => ({
      id: l.id,
      scene: l.scene,
      start: l.start,
      dur: l.dur,
      end: l.start + l.dur,
    })),
  };
}
