// Render host — the glue between `getStateAt(t)` and the DOM.
//
// Shared by all three modes. It:
//   1. Calls the engine (core-app.getStateAt) to derive a state object,
//      then uses `renderTracks(state, tracks)` to produce a DOM fragment.
//   2. Mounts returned DOM nodes onto `mount` element, preserving any node
//      marked `data-nf-persist="1"` across re-renders (video elements etc.).
//   3. Keeps the current `t` and a shallow copy of `resolved` so edit/record
//      modes can mutate & re-render without side-effecting the source.
//
// Engine & tracks are peer deps injected through constructor — no static
// import of sibling crates, keeping this crate installable on its own.

const PERSIST_ATTR = "data-nf-persist";

function keyOf(node) {
  if (!node) return null;
  if (typeof node.getAttribute === "function") {
    const k = node.getAttribute(PERSIST_ATTR);
    if (k && k !== "0") return k;
  }
  return null;
}

function isPersist(node) {
  return keyOf(node) !== null;
}

export function createRenderHost({ engine, tracks, mount, resolved }) {
  if (!engine || typeof engine.getStateAt !== "function") {
    throw new TypeError("render-host: engine.getStateAt required");
  }
  if (!tracks || typeof tracks.renderTracks !== "function") {
    throw new TypeError("render-host: tracks.renderTracks required");
  }
  if (!mount) throw new TypeError("render-host: mount required");

  let currentT = 0;
  let resolvedCopy = resolved ? deepClone(resolved) : null;
  let lastRenderCount = 0;

  const render = () => {
    const state = engine.getStateAt(currentT, resolvedCopy);
    const trackList = (resolvedCopy && resolvedCopy.tracks) || [];
    const out = tracks.renderTracks(state, trackList);
    mountNodes(mount, out.nodes || []);
    lastRenderCount = (out.nodes || []).length;
    return { state, audio: out.audio || [] };
  };

  const setT = (t) => {
    currentT = Number(t) || 0;
  };

  const getT = () => currentT;

  const getResolved = () => resolvedCopy;

  const patchResolved = (patcher) => {
    if (typeof patcher !== "function") {
      throw new TypeError("render-host.patchResolved: function required");
    }
    resolvedCopy = patcher(resolvedCopy) ?? resolvedCopy;
  };

  const diagnose = () => ({
    t: currentT,
    renderedNodes: lastRenderCount,
    tracks: ((resolvedCopy && resolvedCopy.tracks) || []).length,
  });

  return { render, setT, getT, getResolved, patchResolved, diagnose };
}

function mountNodes(mount, nodes) {
  // Preserve persist nodes across renders. Match by key.
  const keep = new Map();
  const existing = mount.children ? Array.from(mount.children) : [];
  for (const child of existing) {
    if (isPersist(child)) keep.set(keyOf(child), child);
  }

  // Clear non-persist children.
  if (typeof mount.replaceChildren === "function") {
    mount.replaceChildren();
  } else {
    // jsdom / fake element fallback
    mount.children = [];
    if (typeof mount.appendChild !== "function") {
      mount.appendChild = function appendChild(node) {
        this.children.push(node);
        return node;
      };
    }
  }

  for (const node of nodes) {
    if (!node) continue;
    const k = keyOf(node);
    if (k && keep.has(k)) {
      mount.appendChild(keep.get(k));
      keep.delete(k);
    } else {
      mount.appendChild(node);
    }
  }
}

function deepClone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
  return out;
}
