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
const READY_KINDS = ["ready", "domReady"];
const FRAME_READY_KINDS = ["frameReady", "frame_ready"];

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
  stop();
  const options = arg || {};
  const mode = options.mode || legacyMode || "play";
  const resolved = pickResolved(options.resolved);
  const mount = pickMount(options.mount);
  const bridge = options.bridge || getBridge();
  let runtime;

  if (!options.engine && !options.tracks && typeof globalThis.__nfStart === "function") {
    runtime = startBundledApp({ mode, resolved, mount, bridge, options });
  } else {
    const engine = options.engine || defaultEngine();
    const tracks = options.tracks || defaultTrackHost();
    const host = createRenderHost({ engine, tracks, mount, resolved });
    host.setT(options.initialT || 0);
    host.render();

    switch (mode) {
      case "play":
        runtime = createPlay({ host, options });
        runtime.start?.();
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
  }

  currentRuntime = runtime;
  currentModeName = mode;
  exposeGlobals(runtime, bridge);
  return runtime;
}

function startBundledApp({ mode, resolved, mount, bridge, options }) {
  const win = options.win || globalThis;
  const previousTick = win.__nfTick;
  const app = globalThis.__nfStart({ mode, resolved, root: mount, win });
  let wrappedTick = null;
  if (mode === "record" && typeof win.__nfTick === "function") {
    const appTick = win.__nfTick;
    wrappedTick = async (seqOrT, maybeT) => {
      const seq = maybeT === undefined ? null : Number(seqOrT) || 0;
      const t = maybeT === undefined ? seqOrT : maybeT;
      const frame = await appTick(t);
      await postCompatMessages(bridge, FRAME_READY_KINDS, {
        seq,
        payload: { ...(frame || {}), t: Number(t) || 0, seq },
      });
      return frame;
    };
    win.__nfTick = wrappedTick;
  }
  const runtime = {
    mode,
    seek: (t) => app.seek?.(t),
    pause: () => app.pause?.(),
    resume: () => app.resume?.(),
    tick: (...args) => {
      if (mode !== "record" || typeof win.__nfTick !== "function") {
        return Promise.resolve({ t: app.currentT ?? 0 });
      }
      return win.__nfTick(...args);
    },
    getT: () => app.currentT ?? 0,
    diagnose: () => ({
      mode,
      t: app.currentT ?? 0,
      snapshot: app.snapshot ?? [],
      audio: app.audio ?? [],
    }),
    dispose: () => {
      if (mode === "record" && win.__nfTick === wrappedTick) {
        win.__nfTick = previousTick;
      }
    },
  };
  void postCompatMessages(bridge, READY_KINDS, { payload: runtime.diagnose() });
  return runtime;
}

async function postCompatMessages(bridge, kinds, extra = {}) {
  if (!bridge || typeof bridge.sendMessage !== "function") return;
  for (const kind of kinds) {
    try {
      await bridge.sendMessage({ kind, ...extra });
    } catch (_err) {
      // Compatibility bridge failures must never crash playback or recording.
    }
  }
}

function exposeGlobals(runtime, bridge) {
  const api = {
    start,
    stop,
    currentMode,
    mode: () => currentModeName,
    seek: (t) => runtime.seek?.(t),
    getT: () => runtime.getT?.() ?? 0,
    pause: () => runtime.pause?.(),
    resume: () => {
      if (typeof runtime.resume === "function") return runtime.resume();
      return runtime.start?.();
    },
    tick: (...args) => runtime.tick?.(...args),
    setProps: (id, path, v) => runtime.setProps?.(id, path, v),
    requestWriteBack: () => runtime.requestWriteBack?.(),
    diagnose: () => runtime.diagnose?.() ?? { mode: currentModeName },
    bridge,
  };
  globalThis.__nfRuntime = api;
  globalThis.__nfDiagnose = () => api.diagnose();
  if (currentModeName === "edit") {
    globalThis.__nfEditorDiagnose = () => api.diagnose();
  } else {
    delete globalThis.__nfEditorDiagnose;
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
  const bootstrap = globalThis.__nfRuntime || {};
  globalThis.__nfRuntime = {
    ...bootstrap,
    start,
    stop,
    currentMode,
    mode: () => currentModeName,
  };
  delete globalThis.__nfDiagnose;
  delete globalThis.__nfEditorDiagnose;
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
