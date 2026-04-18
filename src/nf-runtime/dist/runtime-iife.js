(function(){
"use strict";
// nf-runtime — boot + RAF loop + getStateAt pure function.
// Zero dependencies. Plain JS. Runs in browser as IIFE; also importable in Node for tests.
//
// Contract (interfaces.json §5_runtime_boot_contract):
//   NFRuntime.boot(options) => NFHandle
//   getStateAt(resolved, t_ms) => pure state snapshot
//
// Design axioms (ADR-032):
//   - getStateAt is a pure function of (resolved, t_ms). Same input → same output.
//   - Wallclock drives playback (FM-AUDIO-CLOCK). No audio clock dependency.

// -----------------------------------------------------------------------------
// getStateAt — pure, no globals, no Date.now, no Math.random
// -----------------------------------------------------------------------------
function getStateAt(resolved, t_ms) {
  const duration_ms = resolved && typeof resolved.duration_ms === "number"
    ? resolved.duration_ms
    : 0;
  const viewport = resolved && resolved.viewport
    ? resolved.viewport
    : { w: 1920, h: 1080 };

  const activeClips = [];
  const tracks = (resolved && resolved.tracks) || [];
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    const trackId = track.id;
    const clips = track.clips || [];
    for (let ci = 0; ci < clips.length; ci++) {
      const clip = clips[ci];
      const b = clip.begin_ms;
      const e = clip.end_ms;
      if (typeof b !== "number" || typeof e !== "number") continue;
      // half-open interval [begin_ms, end_ms)
      if (t_ms >= b && t_ms < e) {
        activeClips.push({
          trackId,
          clipIdx: ci,
          clipId: clip.id || `${trackId}#${ci}`,
          params: clip.params || {},
          localT: t_ms - b,
        });
      }
    }
  }

  return {
    t: t_ms,
    t_ms,
    duration_ms,
    viewport,
    activeClips,
  };
}

// -----------------------------------------------------------------------------
// loadTrack — compile a track source string into { describe, sample, render }
// -----------------------------------------------------------------------------
function loadTrack(src) {
  // Tracks are written as ES modules (`export function describe() {}`) per
  // Track ABI. Strip top-level `export function X(` → `function X(`, record
  // names, then `new Function` body returns them as an object.
  // Shared convention with nf-tracks/abi/index.js (FM-SHAPE single source).
  if (typeof src !== "string" || src.length === 0) {
    throw new Error("track: source must be non-empty string");
  }
  const names = [];
  const rewritten = src.replace(
    /^(\s*)export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    (_m, indent, name) => { names.push(name); return indent + "function " + name + "("; },
  );
  const body =
    '"use strict";\n' +
    rewritten +
    "\n;const __nfExports = {};\n" +
    names.map((n) => "if (typeof " + n + " === 'function') __nfExports." + n + " = " + n + ";").join("\n") +
    "\nreturn __nfExports;\n";
  const fn = new Function(body);
  const api = fn();
  if (typeof api.describe !== "function" || typeof api.render !== "function") {
    throw new Error("track: missing describe() or render() export");
  }
  return api;
}

// -----------------------------------------------------------------------------
// boot — wire up DOM, RAF loop, self-verify
// -----------------------------------------------------------------------------
function boot(options) {
  options = options || {};
  const mode = options.mode || "play";
  const stageSelector = options.stageSelector || "#nf-stage";
  const autoplay = options.autoplay !== false;
  const loop = options.loop === true;

  const doc = globalThis.document;
  if (!doc) throw new Error("boot: document not available (browser-only)");

  // Read resolved + track sources from inlined <script> JSON blocks.
  const resolvedEl = doc.getElementById("nf-resolved");
  const tracksEl = doc.getElementById("nf-tracks");
  if (!resolvedEl) throw new Error("boot: #nf-resolved not found");
  if (!tracksEl) throw new Error("boot: #nf-tracks not found");
  const resolved = JSON.parse(resolvedEl.textContent || "{}");
  const trackSources = JSON.parse(tracksEl.textContent || "{}");

  // Compile tracks.
  const trackRegistry = new Map();
  for (const trackId of Object.keys(trackSources)) {
    try {
      trackRegistry.set(trackId, loadTrack(trackSources[trackId]));
    } catch (err) {
      console.log(JSON.stringify({
        ts: _ts(), level: "error", source: "nf-runtime",
        msg: "track_load_failed", data: { trackId, error: String(err) },
      }));
    }
  }

  const stage = doc.querySelector(stageSelector);
  if (!stage) throw new Error(`boot: stage '${stageSelector}' not found`);

  // --- playback state (all internal; never leaked to getStateAt) ---
  let startPerf = _perf();
  let pausedAtMs = 0;
  let playing = autoplay;
  let rafId = null;
  let renderCalls = 0;
  let lastRenderMs = 0;

  function currentTMs() {
    if (!playing) return pausedAtMs;
    return _perf() - startPerf;
  }

  function renderState(state) {
    const t0 = _perf();
    let html = "";
    for (const ac of state.activeClips) {
      const track = trackRegistry.get(ac.trackId);
      if (!track) continue;
      try {
        html += track.render(ac.localT, ac.params, state.viewport);
      } catch (err) {
        console.log(JSON.stringify({
          ts: _ts(), level: "error", source: "nf-runtime",
          msg: "track_render_failed",
          data: { trackId: ac.trackId, clipIdx: ac.clipIdx, error: String(err) },
        }));
      }
    }
    stage.innerHTML = html;
    renderCalls++;
    lastRenderMs = _perf() - t0;
  }

  function tick() {
    rafId = null;
    if (!playing) return;
    let t = _perf() - startPerf;
    if (t >= resolved.duration_ms) {
      if (loop) {
        startPerf = _perf();
        t = 0;
      } else {
        playing = false;
        pausedAtMs = resolved.duration_ms;
        renderState(getStateAt(resolved, resolved.duration_ms - 1));
        return;
      }
    }
    renderState(getStateAt(resolved, t));
    rafId = _raf(tick);
  }

  // --- NFHandle ---
  const handle = {
    play() {
      if (playing) return;
      startPerf = _perf() - pausedAtMs;
      playing = true;
      if (rafId == null) rafId = _raf(tick);
    },
    pause() {
      if (!playing) return;
      pausedAtMs = _perf() - startPerf;
      playing = false;
    },
    seek(t_ms) {
      const clamped = Math.max(0, Math.min(t_ms, resolved.duration_ms));
      if (playing) {
        startPerf = _perf() - clamped;
      } else {
        pausedAtMs = clamped;
      }
      renderState(getStateAt(resolved, clamped));
    },
    getState() {
      const t_ms = currentTMs();
      const state = getStateAt(resolved, Math.min(t_ms, Math.max(0, resolved.duration_ms - 1)));
      return {
        mode,
        t_ms,
        playing,
        duration_ms: resolved.duration_ms,
        viewport: state.viewport,
        activeClips: state.activeClips.map((c) => ({
          trackId: c.trackId, clipIdx: c.clipIdx, localT: c.localT,
        })),
      };
    },
    screenshot() {
      // v1.1: return HTML snapshot + metadata; playwright driver converts to PNG.
      // Also provide SVG-foreignObject → dataURL path when available (browser only).
      const t_ms = currentTMs();
      const snapshot = {
        at_ms: t_ms,
        html: stage.outerHTML,
        viewport: resolved.viewport,
      };
      // Try SVG foreignObject path if browser supports it.
      try {
        if (globalThis.XMLSerializer && globalThis.btoa) {
          const vp = resolved.viewport || { w: 1920, h: 1080 };
          const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${vp.w}" height="${vp.h}">` +
            `<foreignObject width="100%" height="100%">` +
            `<div xmlns="http://www.w3.org/1999/xhtml">${stage.innerHTML}</div>` +
            `</foreignObject></svg>`;
          const dataUrl = "data:image/svg+xml;base64," + globalThis.btoa(unescape(encodeURIComponent(svg)));
          return Promise.resolve(dataUrl);
        }
      } catch (_err) {
        // fall through to snapshot path
      }
      return Promise.resolve(snapshot);
    },
    log(level, msg, data) {
      console.log(JSON.stringify({
        ts: _ts(), level, msg, data: data || {}, source: "nf-runtime",
      }));
    },
    __diagnostics() {
      return {
        tracks_loaded: trackRegistry.size,
        anchors_count: (resolved.anchors && Object.keys(resolved.anchors).length) || 0,
        resolved_bytes: JSON.stringify(resolved).length,
        render_calls: renderCalls,
        last_render_ms: lastRenderMs,
      };
    },
  };

  if (autoplay) {
    rafId = _raf(tick);
  } else {
    // Render initial frame at t=0 so stage isn't blank when paused.
    renderState(getStateAt(resolved, 0));
  }

  return handle;
}

// -----------------------------------------------------------------------------
// helpers — isolated so boot() itself stays free of env sniffing noise
// -----------------------------------------------------------------------------
function _perf() {
  // Wallclock driver. In browser = performance.now(); Node tests never call _perf.
  const g = globalThis;
  if (g.performance && typeof g.performance.now === "function") {
    return g.performance.now();
  }
  return Date.now();
}

function _raf(fn) {
  const g = globalThis;
  if (typeof g.requestAnimationFrame === "function") {
    return g.requestAnimationFrame(fn);
  }
  return setTimeout(() => fn(_perf()), 16);
}

function _ts() {
  // Log timestamps use wallclock epoch — acceptable (not part of pure state).
  return Date.now();
}

// self-verify — attach __nf builtins to window.
// ai-coding-mindset #4: verification capabilities live INSIDE product code.
// Not a test helper; shipped runtime surface.
//
// Surface:
//   window.__nf.getState()       — pure read of current state
//   window.__nf.screenshot()     — Promise<dataURL | snapshot>
//   window.__nf.log(level,msg,d) — structured JSON line to console
//   window.__nf.simulate(op)     — AI-operable action (same code path as user)
function attachSelfVerify(handle) {
  const g = globalThis;
  if (!g.window) return; // Node / non-browser — no-op.

  const nf = {
    // --- read-only state ---
    getState() {
      return handle.getState();
    },

    // --- capture ---
    screenshot() {
      return handle.screenshot();
    },

    // --- structured log ---
    log(level, msg, data) {
      handle.log(level, msg, data);
    },

    // --- action simulator — walks the same code path as UI interactions ---
    // op shape: { kind: 'seek' | 'play' | 'pause' | 'restart', t_ms?: number }
    simulate(op) {
      if (!op || typeof op.kind !== "string") {
        handle.log("error", "simulate.bad_op", { op });
        return { ok: false, error: "bad_op" };
      }
      switch (op.kind) {
        case "seek":
        case "seekTo": {
          const t = typeof op.t_ms === "number" ? op.t_ms : (op.t || 0);
          handle.seek(t);
          handle.log("info", "simulate.seek", { t_ms: t });
          return { ok: true };
        }
        case "play": {
          handle.play();
          handle.log("info", "simulate.play", {});
          return { ok: true };
        }
        case "pause": {
          handle.pause();
          handle.log("info", "simulate.pause", {});
          return { ok: true };
        }
        case "restart": {
          handle.seek(0);
          handle.play();
          handle.log("info", "simulate.restart", {});
          return { ok: true };
        }
        default:
          handle.log("error", "simulate.unknown_kind", { kind: op.kind });
          return { ok: false, error: "unknown_kind" };
      }
    },

    // Expose handle passthroughs so playwright flow works as-is.
    play: () => handle.play(),
    pause: () => handle.pause(),
    seek: (t) => handle.seek(t),
    __diagnostics: () => handle.__diagnostics(),
  };

  g.window.__nf = nf;
  return nf;
}

var __nf_boot = boot;
window.NFRuntime = {
  boot: function(options){ var h = __nf_boot(options); attachSelfVerify(h); return h; },
  getStateAt: getStateAt
};
window.__nf_boot = function(options){ return window.NFRuntime.boot(options || {}); };
})();