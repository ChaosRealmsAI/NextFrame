// Track host — aggregates Track.render(t, keyframes, viewport) outputs into
// a stable DOM tree mounted in `mount`.
//
// Key design points:
//   1. Each track gets a wrapper <div data-track-id="...">. The wrapper
//      itself is stable across re-renders; we replace its children.
//   2. Children that carry `data-nf-persist="1"` (e.g., <video>) are
//      RECONCILED by tag+data-nf-key instead of replaced — replacing a
//      <video> resets playback state and can break frame-accurate recording.
//      Reference: legacy build.js innerHTML destroys video elements.
//   3. Zero external imports. Runs in WKWebView or node+dom-shim.

const registry = new Map();

// registerTrack(name, module) — module must expose `render(t, kfs, vp)`.
export function registerTrack(name, mod) {
  if (typeof name !== "string" || !mod || typeof mod.render !== "function") return false;
  registry.set(name, mod);
  return true;
}

// registerTracksFromGlobal(win) — scan `win.__nfTracks` produced by bundler
// and register each. Called once after bundle loads.
export function registerTracksFromGlobal(win) {
  const g = win || globalThis;
  const map = g.__nfTracks;
  if (!map || typeof map !== "object") return 0;
  let n = 0;
  for (const [name, mod] of Object.entries(map)) {
    if (registerTrack(name, mod)) n++;
  }
  return n;
}

export function getTrackRegistry() {
  return registry;
}

export function clearTrackRegistry() {
  registry.clear();
}

function getDoc(mount) {
  if (mount && mount.ownerDocument) return mount.ownerDocument;
  if (typeof globalThis !== "undefined" && globalThis.document) return globalThis.document;
  return null;
}

// Find-or-create the per-track wrapper <div data-track-id="X">.
function ensureWrapper(mount, trackId, doc) {
  const children = mount.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el && el.getAttribute && el.getAttribute("data-track-id") === trackId) {
      return el;
    }
  }
  const wrap = doc.createElement("div");
  wrap.setAttribute("data-track-id", trackId);
  wrap.style.position = "absolute";
  wrap.style.inset = "0";
  mount.appendChild(wrap);
  return wrap;
}

// Persist key for a candidate child: combination of tagName + optional
// data-nf-key attr. Video/audio elements that don't have a data-nf-key
// fall back to tagName — which is enough for single-media-per-track.
function persistKey(el) {
  if (!el || !el.getAttribute) return null;
  if (el.getAttribute("data-nf-persist") !== "1") return null;
  const key = el.getAttribute("data-nf-key");
  const tag = (el.tagName || "").toLowerCase();
  return key ? `${tag}#${key}` : tag;
}

// Copy style properties from a .style host onto another, plus attribute list.
function syncAttributes(target, source) {
  if (!target || !source) return;
  // Sync attributes
  if (source.attributes && target.setAttribute) {
    const srcAttrs = source.attributes;
    const seen = new Set();
    for (let i = 0; i < srcAttrs.length; i++) {
      const a = srcAttrs[i];
      seen.add(a.name);
      if (target.getAttribute(a.name) !== a.value) {
        target.setAttribute(a.name, a.value);
      }
    }
    // Remove attributes on target that aren't on source (skip data-nf-* markers).
    if (target.attributes) {
      const toRemove = [];
      const tAttrs = target.attributes;
      for (let i = 0; i < tAttrs.length; i++) {
        const a = tAttrs[i];
        if (!seen.has(a.name) && !a.name.startsWith("data-nf-")) {
          toRemove.push(a.name);
        }
      }
      for (const name of toRemove) target.removeAttribute(name);
    }
  }
  // Sync style — copy the raw cssText when possible.
  if (source.style && target.style) {
    if (typeof source.style.cssText === "string" && typeof target.style.cssText === "string") {
      target.style.cssText = source.style.cssText;
    }
  }
}

// Reconcile a single track wrapper's children against fresh DOM node from render.
// - If the new dom carries data-nf-persist and an existing persist child matches
//   the same key, sync attrs/style (don't detach/reattach).
// - Otherwise clear the wrapper and append the new dom.
function reconcileWrapper(wrap, newNode) {
  if (!wrap || !newNode) return;
  const newKey = persistKey(newNode);
  if (newKey) {
    // Look for an existing child with same persist key
    const children = wrap.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      const existing = children[i];
      if (persistKey(existing) === newKey) {
        syncAttributes(existing, newNode);
        return;
      }
    }
  }
  // No match → replace children outright. Use explicit removeChild loop
  // (no innerHTML, per project rules and to keep DOM shims happy).
  while (wrap.firstChild) {
    wrap.removeChild(wrap.firstChild);
  }
  wrap.appendChild(newNode);
}

// render(t, resolvedOrState, mount, [opts]) — main entry.
// Accepts either a resolved bundle (will call deriveState itself) or a
// pre-derived state envelope. `opts.deriveState` lets callers inject
// state.js's deriveState without circular deps; when not provided we use
// whatever `resolvedOrState.tracks[0].values` tells us. The simple path
// (state already contains computed values) is the production path.
export function renderTracks(state, mount, opts = {}) {
  if (!state || !mount) return { snapshot: [], audio: [] };
  const doc = getDoc(mount);
  if (!doc) return { snapshot: [], audio: [] };
  const trackStates = Array.isArray(state.tracks) ? state.tracks : [];
  const snapshot = [];
  const audioRefs = [];
  const activeIds = new Set();
  for (const ts of trackStates) {
    const kind = ts.kind || ts.id;
    const mod = registry.get(kind);
    if (!mod || typeof mod.render !== "function") {
      snapshot.push({ id: ts.id, kind, mounted: false, reason: "no-track" });
      continue;
    }
    const id = String(ts.id || kind);
    activeIds.add(id);
    const wrap = ensureWrapper(mount, id, doc);
    // Build a 1-kf array carrying the interpolated values, so Track.render
    // sees exact prop values via its own pickProps path (picks the single kf).
    const kfs = [{ t: state.t, ...(ts.values || {}) }];
    let out;
    try {
      out = mod.render(state.t, kfs, state.viewport);
    } catch (_err) {
      snapshot.push({ id, kind, mounted: false, reason: "render-threw" });
      continue;
    }
    if (!out || !out.dom) {
      snapshot.push({ id, kind, mounted: false, reason: "no-dom" });
      continue;
    }
    reconcileWrapper(wrap, out.dom);
    if (out.audio) audioRefs.push({ id, ...out.audio });
    snapshot.push({ id, kind, mounted: true });
  }
  // Remove wrappers for tracks that are no longer active (purges stale DOM).
  const children = Array.from(mount.childNodes || []);
  for (const el of children) {
    if (!el || !el.getAttribute) continue;
    const tid = el.getAttribute("data-track-id");
    if (tid && !activeIds.has(tid)) {
      mount.removeChild(el);
    }
  }
  return { snapshot, audio: audioRefs };
}
