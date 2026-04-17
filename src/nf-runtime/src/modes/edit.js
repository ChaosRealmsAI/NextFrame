// Edit mode — frozen t + writeback diff.
//
// No RAF loop. Exposes:
//   seek(t)                         — sets t, re-renders
//   setProps(trackId, path, value)  — mutates resolved copy, re-renders,
//                                     emits 'writeback_request' event
//   diff()                          — structured diff vs. initial resolved
//   requestWriteBack()              — posts diff to bridge via 'source_writeback'
//   addEventListener(kind, fn)      — subscribe to events
//
// Writeback payload is JSON-serialisable so native can diff against the
// on-disk source.json and apply byte-stable patches (ADR-025 §writeBack).

const WRITEBACK_EVENT = "writeback_request";

export function createEdit({ host, bridge, options = {} }) {
  const initial = deepClone(host.getResolved());
  const listeners = new Map();

  const emit = (kind, detail) => {
    const set = listeners.get(kind);
    if (!set) return;
    for (const fn of set) {
      try {
        fn({ kind, detail });
      } catch (_err) {
        // Listener errors never break the editor.
      }
    }
  };

  const addEventListener = (kind, fn) => {
    if (typeof fn !== "function") {
      throw new TypeError("edit.addEventListener: function required");
    }
    let set = listeners.get(kind);
    if (!set) {
      set = new Set();
      listeners.set(kind, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  };

  const seek = (t) => {
    host.setT(t);
    host.render();
  };

  const setProps = (trackId, propPath, value) => {
    host.patchResolved((resolved) => {
      const tracks = (resolved && resolved.tracks) || [];
      const track = tracks.find((tr) => tr && tr.id === trackId);
      if (!track) return resolved;
      writePath(track, splitPath(propPath), value);
      return resolved;
    });
    host.render();
    emit(WRITEBACK_EVENT, { trackId, propPath, value });
  };

  const diff = () => computeDiff(initial, host.getResolved());

  const requestWriteBack = () => {
    const payload = { source: "edit", diff: diff() };
    if (!bridge) return Promise.resolve({ ok: false, error: "no-bridge" });
    return bridge.sendMessage({ kind: "source_writeback", payload });
  };

  const resetInitial = () => {
    // After native confirmed writeback, the editor considers the current
    // state as the new baseline so future diffs are relative to it.
    const next = deepClone(host.getResolved());
    for (const k of Object.keys(initial)) delete initial[k];
    Object.assign(initial, next);
  };

  return {
    mode: "edit",
    seek,
    setProps,
    diff,
    requestWriteBack,
    resetInitial,
    addEventListener,
    getT: () => host.getT(),
    diagnose: () => ({
      mode: "edit",
      t: host.getT(),
      hasDiff: hasAny(diff()),
      ...host.diagnose(),
    }),
  };
}

function splitPath(path) {
  if (Array.isArray(path)) return path;
  if (typeof path !== "string") return [];
  return path
    .split(/[.[\]]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function writePath(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === null || typeof cur[k] !== "object") {
      cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (last) cur[last] = value;
}

function deepClone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
  return out;
}

function computeDiff(a, b) {
  const out = [];
  walk(a, b, [], out);
  return out;
}

function walk(a, b, path, out) {
  if (a === b) return;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (a !== b) out.push({ path: path.join("."), from: a, to: b });
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    walk(a[k], b[k], path.concat(k), out);
  }
}

function hasAny(diff) {
  return Array.isArray(diff) && diff.length > 0;
}


// Back-compat shim for walking-stub callers.
export function startEdit(arg) {
  if (arg && arg.host) return createEdit(arg);
  let t = 0;
  return {
    mode: "edit",
    freezeAt(time) { t = time; },
    currentT() { return t; },
  };
}
