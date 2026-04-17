// nf-runtime — one WebView, three modes (play / edit / record).
//
// Entry point. The browser bundle (nf-core-engine output) places:
//   window.__nfResolved = {...resolved JSON...}
//   window.__nfTracks   = {id: TrackModule, ...}
// and then imports `start({mode, mount})` from this module.
//
// Core-app (getStateAt) and track-host (renderTracks) are peer deps injected
// via window globals so this crate stays installable on its own:
//   window.__nfEngine     = {getStateAt}            (from nf-core-app)
//   window.__nfTrackHost  = {renderTracks}          (from nf-core-app)
// When absent, runtime falls back to built-in walking-quality shims.

import { createRenderHost } from "./render-host.js";
import { getBridge } from "./bridge.js";
import { createPlay } from "./modes/play.js";
import { createEdit } from "./modes/edit.js";
import { createRecord } from "./modes/record.js";

let currentRuntime = null;
let currentModeName = null;

function defaultEngine() {
  return globalThis.__nfEngine || {
    getStateAt(t, resolved) {
      const viewport = (resolved && resolved.viewport) || { ratio: "16:9", w: 1920, h: 1080 };
      return { t, viewport, tracks: [], selected: null, data: {} };
    },
  };
}

function defaultTrackHost() {
  return globalThis.__nfTrackHost || {
    renderTracks(state, tracks) {
      const nodes = [];
      const audio = [];
      for (const track of tracks || []) {
        const impl = resolveTrack(track);
        if (!impl || typeof impl.render !== "function") continue;
        const out = impl.render(state.t, track.keyframes || [], state.viewport);
        if (out && out.dom) nodes.push(out.dom);
        if (out && out.audio) audio.push(out.audio);
      }
      return { nodes, audio };
    },
  };
}

function resolveTrack(track) {
  if (!track) return null;
  const registry = globalThis.__nfTracks || {};
  if (track.component && registry[track.component]) return registry[track.component];
  if (track.id && registry[track.id]) return registry[track.id];
  if (typeof track.render === "function") return track;
  return null;
}

function pickMount(mount) {
  if (mount) return mount;
  if (globalThis.document) {
    const byId = globalThis.document.getElementById?.("nf-root");
    if (byId) return byId;
    const body = globalThis.document.body;
    if (body) return body;
  }
  throw new Error("nf-runtime: no mount element (pass {mount} or ensure document.body)");
}

function pickResolved(resolved) {
  if (resolved) return resolved;
  if (globalThis.__nfResolved) return globalThis.__nfResolved;
  throw new Error("nf-runtime: no resolved timeline (pass {resolved} or set window.__nfResolved)");
}

export function start(arg, legacyMode) {
  // Back-compat: walking stub called start('play'). Support that path.
  if (typeof arg === "string") {
    return startLegacy(arg);
  }
  const options = arg || {};
  const mode = options.mode || legacyMode || "play";
  const resolved = pickResolved(options.resolved);
  const mount = pickMount(options.mount);
  const engine = options.engine || defaultEngine();
  const tracks = options.tracks || defaultTrackHost();
  const bridge = options.bridge || getBridge();

  const host = createRenderHost({ engine, tracks, mount, resolved });
  host.setT(options.initialT || 0);
  host.render();

  let runtime;
  switch (mode) {
    case "play":
      runtime = createPlay({ host, options });
      break;
    case "edit":
      runtime = createEdit({ host, bridge, options });
      break;
    case "record":
      runtime = createRecord({ host, bridge, options });
      break;
    default:
      throw new Error(`nf-runtime: unknown mode: ${mode}`);
  }

  currentRuntime = runtime;
  currentModeName = mode;
  exposeGlobals(runtime, host, bridge);
  return runtime;
}

function exposeGlobals(runtime, host, bridge) {
  const api = {
    mode: () => currentModeName,
    seek: (t) => (typeof runtime.seek === "function" ? runtime.seek(t) : host.setT(t)),
    getT: () => host.getT(),
    pause: () => runtime.pause?.(),
    resume: () => runtime.resume?.(),
    tick: (t) => runtime.tick?.(t),
    setProps: (id, path, v) => runtime.setProps?.(id, path, v),
    requestWriteBack: () => runtime.requestWriteBack?.(),
    diagnose: () => runtime.diagnose?.(),
    bridge,
  };
  globalThis.__nfRuntime = api;
  globalThis.__nfDiagnose = () => api.diagnose();
  if (currentModeName === "edit") {
    globalThis.__nfEditorDiagnose = () => api.diagnose();
  }
  // Record mode exposes __nfTick through createRecord directly.
}

export function currentMode() {
  return currentModeName;
}

export function stop() {
  if (currentRuntime && typeof currentRuntime.pause === "function") {
    currentRuntime.pause();
  }
  if (currentRuntime && typeof currentRuntime.dispose === "function") {
    currentRuntime.dispose();
  }
  currentRuntime = null;
  currentModeName = null;
}

// Legacy entry — used by the walking stub call sites.
function startLegacy(mode) {
  switch (mode) {
    case "play":
      return createPlayLegacy();
    case "edit":
      return createEditLegacy();
    case "record":
      return createRecordLegacy();
    default:
      throw new Error(`nf-runtime: unknown mode: ${mode}`);
  }
}

function createPlayLegacy() {
  let running = false;
  return {
    mode: "play",
    start() { running = true; },
    stop() { running = false; },
    isRunning() { return running; },
  };
}

function createEditLegacy() {
  let t = 0;
  return {
    mode: "edit",
    freezeAt(time) { t = time; },
    currentT() { return t; },
  };
}

function createRecordLegacy() {
  return {
    mode: "record",
    tick() {
      const t = globalThis.__nfTick ?? 0;
      return { t: typeof t === "function" ? 0 : t };
    },
  };
}
