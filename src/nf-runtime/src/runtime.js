// nf-runtime — boot + RAF loop + getStateAt pure function.
// Zero dependencies. Plain JS. Runs in browser as IIFE; also importable in Node for tests.
//
// Contract (interfaces.json §5_runtime_boot_contract + v1.2 interfaces-delta §5_2 control-surface):
//   NFRuntime.boot(options) => NFHandle
//   getStateAt(resolved, t_ms) => pure state snapshot
//
// Design axioms (ADR-032):
//   - getStateAt is a pure function of (resolved, t_ms). Same input → same output.
//   - Wallclock drives playback (FM-AUDIO-CLOCK). No audio clock dependency.
//
// v1.2 additions (ADR-035):
//   - seek / play / pause / setLoop / onTimeUpdate on handle
//   - keyboard shortcuts (Space / Arrow / Home / End / l)
//   - timeline UI bindings (.playhead drag · .ruler click · .tracks click · .controls buttons)
//   - timeline DOM generation (track rows + clips + ruler ticks from resolved.tracks)

// Shared layout constant — width of .track-label column (px) · keeps playhead math in sync with CSS.
const LABEL_COL_PX = 140;

// -----------------------------------------------------------------------------
// getStateAt — pure, no globals, no Date.now, no Math.random
// -----------------------------------------------------------------------------
export function getStateAt(resolved, t_ms) {
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
export function loadTrack(src) {
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
// helpers — shared by boot / UI bindings
// -----------------------------------------------------------------------------
function _escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// -----------------------------------------------------------------------------
// diffAndMount — ADR-047 · data-nf-persist DOM diff
//
// Replaces `stage.innerHTML = html` so stateful elements (<video>, <audio>,
// <input>, <iframe>) survive re-renders. Elements that carry
// data-nf-persist="<key>" on both sides are reused by identity; everything
// else takes the old path (full rebuild) — scene Track (no persist attr)
// therefore behaves exactly like `innerHTML = html`.
//
// Algorithm (O(N), N = persist-element count per frame):
//   1. Parse new HTML into a throw-away fragment.
//   2. Index persist elements on both sides by their key.
//   3. For each shared key, copy non-identity attributes from the new
//      placeholder onto the old element, then swap the placeholder with the
//      old element inside the fragment (preserves .currentTime / .paused /
//      decoder state / focus / selection).
//   4. Wipe stage and move fragment children in. Old persist elements that
//      were reused are no longer live in `stage` at this moment (they now
//      live in the fragment) → they're moved back by appendChild, not
//      discarded. Old persist elements whose key is gone from the new HTML
//      are simply not re-appended (unmounted).
//
// IDENTITY_ATTRS never overwritten on the reused element — e.g. resetting
// `src` on a <video> would reset currentTime/decoder state.
// -----------------------------------------------------------------------------
const IDENTITY_ATTRS = new Set(["src", "type", "name", "data-nf-persist"]);

export function diffAndMount(stage, html) {
  const doc = stage.ownerDocument || globalThis.document;
  const tmp = doc.createElement("div");
  tmp.innerHTML = html;

  // Index old persist elements by key (still attached to stage).
  const oldPersist = new Map();
  const oldList = stage.querySelectorAll("[data-nf-persist]");
  for (let i = 0; i < oldList.length; i++) {
    const el = oldList[i];
    oldPersist.set(el.getAttribute("data-nf-persist"), el);
  }

  // Build the desired children list: for each top-level new child, either
  // reuse an existing persist element (NEVER detach it from stage) or use
  // the newly parsed element. Writing media (<video>/<audio>) must not
  // leave the document tree — Chromium pauses playback on detach.
  const desired = [];
  const reused = new Set();
  const topNew = Array.from(tmp.children);
  for (let i = 0; i < topNew.length; i++) {
    const nc = topNew[i];
    if (nc.nodeType === 1 && nc.hasAttribute && nc.hasAttribute("data-nf-persist")) {
      const key = nc.getAttribute("data-nf-persist");
      const oldEl = oldPersist.get(key);
      if (oldEl) {
        // Copy non-identity attrs to the old element.
        const attrs = nc.attributes;
        for (let j = 0; j < attrs.length; j++) {
          const a = attrs[j];
          if (!IDENTITY_ATTRS.has(a.name)) {
            oldEl.setAttribute(a.name, a.value);
          }
        }
        // Remove stale non-identity attrs that the new snapshot dropped.
        const oldAttrs = Array.from(oldEl.attributes);
        for (let j = 0; j < oldAttrs.length; j++) {
          const a = oldAttrs[j];
          if (IDENTITY_ATTRS.has(a.name)) continue;
          if (!nc.hasAttribute(a.name)) {
            oldEl.removeAttribute(a.name);
          }
        }
        desired.push(oldEl);
        reused.add(key);
        continue;
      }
    }
    desired.push(nc);
  }

  // Remove stage children that are neither reused persist elements nor
  // part of the new snapshot. Non-persist old children are always removed.
  const children = Array.from(stage.children);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const key = c.nodeType === 1 && c.getAttribute && c.getAttribute("data-nf-persist");
    if (key && reused.has(key)) continue; // keep — will be re-ordered below
    stage.removeChild(c);
  }

  // Ensure `desired` is the ordered child list of stage WITHOUT detaching
  // already-mounted persist elements (insertBefore a live node to its own
  // parent at the same position is a no-op in DOM spec).
  for (let i = 0; i < desired.length; i++) {
    const want = desired[i];
    const current = stage.children[i];
    if (current !== want) {
      stage.insertBefore(want, current || null);
    }
  }
}

function _fmtTime(t_ms) {
  // mm:ss.sss — deterministic, no locale.
  const t = Math.max(0, t_ms | 0);
  const mm = Math.floor(t / 60000);
  const ss = Math.floor((t % 60000) / 1000);
  const ms = t % 1000;
  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
  const pad3 = (n) => (n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n);
  return pad2(mm) + ":" + pad2(ss) + "." + pad3(ms);
}

// -----------------------------------------------------------------------------
// boot — wire up DOM, RAF loop, self-verify
// -----------------------------------------------------------------------------
export function boot(options) {
  options = options || {};
  const mode = options.mode || "play";
  const stageSelector = options.stageSelector || "#nf-stage";
  const autoplay = options.autoplay !== false;
  const initialLoop = options.loop === true;

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
  let looping = initialLoop;
  let rafId = null;
  let renderCalls = 0;
  let lastRenderMs = 0;
  const listeners = new Set();
  const duration_ms = (resolved && typeof resolved.duration_ms === "number")
    ? resolved.duration_ms
    : 0;

  function currentTMs() {
    if (!playing) return pausedAtMs;
    return _perf() - startPerf;
  }

  function emitTime(t) {
    if (listeners.size === 0) return;
    for (const cb of listeners) {
      try { cb(t); } catch (err) {
        console.log(JSON.stringify({
          ts: _ts(), level: "error", source: "nf-runtime",
          msg: "onTimeUpdate_cb_failed", data: { error: String(err) },
        }));
      }
    }
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
    // ADR-047 · stateful-element-safe mount (replaces stage.innerHTML = html).
    diffAndMount(stage, html);

    // ADR-045 / ADR-046 · record-mode audio discipline + external-t driver.
    // record mode: force mute + pause, drive currentTime from playhead.
    // play mode: only correct currentTime when drift exceeds tolerance so we
    // don't break the browser's natural playback.
    const isRecord = !!(doc.body && doc.body.dataset && doc.body.dataset.mode === "record");
    const videoEls = stage.querySelectorAll("video[data-nf-persist]");
    if (videoEls && videoEls.length > 0) {
      // Match video DOM ↔ activeClip by src attribute (independent of persist
      // key format — Track kinds hash src their own way, but src is the single
      // stable identity across render calls).
      const bySrc = new Map();
      for (const ac of state.activeClips) {
        if (ac.params && typeof ac.params.src === "string") {
          bySrc.set(ac.params.src, ac);
        }
      }
      for (let i = 0; i < videoEls.length; i++) {
        const v = videoEls[i];
        const ac = bySrc.get(v.getAttribute("src"));
        if (isRecord) {
          v.muted = true;
          try { if (typeof v.pause === "function") v.pause(); } catch (_e) { /* noop */ }
        }
        // play / edit mode: DO NOT touch v.muted or call v.play()/pause()
        // every RAF tick. Chromium re-evaluates autoplay policy on mute
        // state change and will pause the video when not inside a user
        // gesture. Muted autoplay is bootstrapped once after first diff
        // (see post-mount below); unmute + play happens in the click
        // handler (inherits the user gesture).
        if (ac && (isRecord || _seekForceSync)) {
          // Drive v.currentTime from outside only when: (a) record mode
          // (recorder provides external t), or (b) explicit seek jump.
          // Do NOT write currentTime on every tick in play mode — that
          // triggers a seeking/seeked cycle and silently stops playback.
          const fromMs = parseFloat(v.getAttribute("data-nf-t-offset") || "0") || 0;
          const target = (ac.localT + fromMs) / 1000;
          try { v.currentTime = target; } catch (_e) { /* noop */ }
        }
      }
    }

    renderCalls++;
    lastRenderMs = _perf() - t0;
  }

  function tick() {
    rafId = null;
    if (!playing) return;
    let t = _perf() - startPerf;
    if (t >= duration_ms) {
      if (looping) {
        startPerf = _perf();
        t = 0;
      } else {
        playing = false;
        pausedAtMs = duration_ms;
        renderState(getStateAt(resolved, Math.max(0, duration_ms - 1)));
        emitTime(duration_ms);
        return;
      }
    }
    renderState(getStateAt(resolved, t));
    emitTime(t);
    rafId = _raf(tick);
  }

  // One-shot flag: when seek() calls renderState it wants <video>.currentTime
  // jumped to the target. In play mode the normal tick must NOT touch
  // currentTime (that breaks natural playback). Only record mode external-t
  // driver + explicit seek call use this write path.
  let _seekForceSync = false;

  // Helper: call v.play() / v.pause() on every persist <video> directly
  // inside the click / key handler. BUG-20260419-01 round 3: browsers only
  // honour autoplay when play() fires synchronously inside the user-gesture
  // event; invoking it later inside RAF tick is rejected → silent video.
  function _syncVideosFromGesture(targetPlaying) {
    const vs = stage.querySelectorAll && stage.querySelectorAll("video[data-nf-persist]");
    if (!vs) return;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      try {
        if (targetPlaying && v.paused) {
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } else if (!targetPlaying && !v.paused) {
          v.pause();
        }
      } catch (_e) { /* noop */ }
    }
  }

  // --- NFHandle ---
  const handle = {
    play() {
      if (playing) return;
      // If paused at end, restart from 0 (friendly default for user).
      if (pausedAtMs >= duration_ms) pausedAtMs = 0;
      startPerf = _perf() - pausedAtMs;
      playing = true;
      handle._paused = false;
      // Kick <video> playback synchronously so browsers honour the user
      // gesture (the outer click handler). Don't wait for next RAF tick.
      _syncVideosFromGesture(true);
      if (rafId == null) rafId = _raf(tick);
    },
    pause() {
      if (!playing) {
        handle._paused = true;
        _syncVideosFromGesture(false);
        return;
      }
      pausedAtMs = _perf() - startPerf;
      playing = false;
      handle._paused = true;
      _syncVideosFromGesture(false);
    },
    seek(t_ms, opts) {
      const shouldPause = !opts || opts.pause !== false; // default: pause on seek
      const clamped = Math.max(0, Math.min(t_ms, duration_ms));
      if (shouldPause) {
        playing = false;
        pausedAtMs = clamped;
        handle._paused = true;
      } else {
        if (playing) {
          startPerf = _perf() - clamped;
        } else {
          pausedAtMs = clamped;
        }
      }
      // Force <video>.currentTime to jump this once (renderState normally
      // avoids writing currentTime in play mode to preserve playback).
      _seekForceSync = true;
      renderState(getStateAt(resolved, Math.min(clamped, Math.max(0, duration_ms - 1))));
      _seekForceSync = false;
      emitTime(clamped);
    },
    setLoop(enabled) {
      looping = !!enabled;
      handle._loop = looping;
    },
    onTimeUpdate(cb) {
      if (typeof cb !== "function") return () => {};
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getState() {
      const t_ms = currentTMs();
      const state = getStateAt(resolved, Math.min(t_ms, Math.max(0, duration_ms - 1)));
      return {
        mode,
        t_ms,
        playing,
        loop: looping,
        duration_ms,
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
        listeners: listeners.size,
      };
    },
    // Exposed flags (read-only by convention · mutated only via methods above).
    _paused: !autoplay,
    _loop: initialLoop,
  };

  if (autoplay) {
    // Render one frame first so persist <video> elements exist in the stage.
    renderState(getStateAt(resolved, 0));
    // Muted autoplay is always allowed (Chromium/Safari/Firefox). Start
    // every persist <video> muted so the picture-in-picture window shows
    // motion right away; the play-pause button click handler will unmute
    // inside the user gesture.
    const __bootVs = stage.querySelectorAll && stage.querySelectorAll("video[data-nf-persist]");
    if (__bootVs) {
      for (let __i = 0; __i < __bootVs.length; __i++) {
        const __v = __bootVs[__i];
        try {
          __v.muted = true;
          const __p = __v.play();
          if (__p && typeof __p.catch === "function") __p.catch(() => {});
        } catch (_e) { /* noop */ }
      }
    }
    rafId = _raf(tick);
  } else {
    // Render initial frame at t=0 so stage isn't blank when paused.
    renderState(getStateAt(resolved, 0));
    emitTime(0);
  }

  // ---------------------------------------------------------------------------
  // v1.2 · timeline DOM render (track rows + clips + ruler ticks)
  // ---------------------------------------------------------------------------
  _renderTimelineDom(doc, resolved, duration_ms);

  // ---------------------------------------------------------------------------
  // v1.2 · keyboard shortcuts (Space / Arrow / Home / End / l)
  // ---------------------------------------------------------------------------
  _bindKeyboard(doc, handle, duration_ms);

  // ---------------------------------------------------------------------------
  // v1.2 · timeline UI bindings (.controls buttons · playhead drag · ruler click)
  // ---------------------------------------------------------------------------
  _bindTimelineUi(doc, handle, duration_ms);

  return handle;
}

// -----------------------------------------------------------------------------
// Timeline DOM render — inject .track-row × N + clips + ruler ticks.
// bundler produces empty shell; runtime fills it after reading resolved.
// -----------------------------------------------------------------------------
function _renderTimelineDom(doc, resolved, duration_ms) {
  const tracksEl = doc.querySelector(".tracks");
  if (tracksEl && resolved && resolved.tracks && duration_ms > 0) {
    // Wipe anything already in there (idempotent re-render on boot).
    // We keep .playhead sibling if present (reparent after), else it stays a sibling.
    const playhead = tracksEl.querySelector(".playhead");
    tracksEl.innerHTML = "";

    resolved.tracks.forEach((t) => {
      const row = doc.createElement("div");
      row.className = "track-row";
      row.innerHTML =
        '<div class="track-label">🎬 ' + _escapeHtml(t.id) + '</div>' +
        '<div class="track-lane"></div>';
      const lane = row.querySelector(".track-lane");
      (t.clips || []).forEach((c) => {
        const clip = doc.createElement("div");
        clip.className = "clip";
        const leftPct = (c.begin_ms / duration_ms) * 100;
        const widthPct = ((c.end_ms - c.begin_ms) / duration_ms) * 100;
        clip.style.left = leftPct + "%";
        clip.style.width = widthPct + "%";
        clip.innerHTML =
          '<b>' + _escapeHtml(c.id || (t.id + '#' + 0)) + '</b>' +
          '<span>' + (c.begin_ms / 1000).toFixed(1) + 's → ' +
          (c.end_ms / 1000).toFixed(1) + 's</span>';
        lane.appendChild(clip);
      });
      tracksEl.appendChild(row);
    });

    // Re-append playhead as last sibling so it overlays rows.
    if (playhead) tracksEl.appendChild(playhead);
  }

  // Ruler ticks — every second, major tick + label.
  const rulerEl = doc.querySelector(".ruler");
  if (rulerEl && duration_ms > 0) {
    rulerEl.innerHTML = "";
    const secs = Math.ceil(duration_ms / 1000);
    for (let s = 0; s <= secs; s++) {
      const pct = (s * 1000 / duration_ms) * 100;
      const tick = doc.createElement("div");
      tick.className = "ruler-tick major";
      tick.style.left = pct + "%";
      rulerEl.appendChild(tick);
      const label = doc.createElement("div");
      label.className = "ruler-label";
      label.style.left = pct + "%";
      label.textContent = s + "s";
      rulerEl.appendChild(label);
    }
  }
}

// -----------------------------------------------------------------------------
// Keyboard bindings — Space / Arrow / Home / End / l.
// Skip when focus is in INPUT/TEXTAREA (future edit mode).
// -----------------------------------------------------------------------------
function _bindKeyboard(doc, handle, duration_ms) {
  const win = globalThis.window;
  if (!win) return;
  win.addEventListener("keydown", (e) => {
    const active = doc.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    const cur = handle.getState().t_ms;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (handle._paused) handle.play(); else handle.pause();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      handle.seek(Math.max(0, cur - 33), { pause: true });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handle.seek(Math.min(duration_ms, cur + 33), { pause: true });
    } else if (e.key === "Home") {
      e.preventDefault();
      handle.seek(0, { pause: true });
    } else if (e.key === "End") {
      e.preventDefault();
      handle.seek(duration_ms, { pause: true });
    } else if (e.key === "l" || e.key === "L") {
      handle.setLoop(!handle._loop);
    }
  });
}

// -----------------------------------------------------------------------------
// Timeline UI bindings — buttons + playhead drag + ruler/tracks click.
// -----------------------------------------------------------------------------
function _bindTimelineUi(doc, handle, duration_ms) {
  const win = globalThis.window;

  const bindBtn = (sel, fn) => {
    const el = doc.querySelector(sel);
    if (el) el.addEventListener("click", fn);
  };
  bindBtn('button[data-nf="to-start"]',    () => handle.seek(0, { pause: true }));
  bindBtn('button[data-nf="prev-frame"]',  () => handle.seek(Math.max(0, handle.getState().t_ms - 33), { pause: true }));
  bindBtn('button[data-nf="play-pause"]',  () => {
    // BUG-20260419-01 round 4 · muted-autoplay + gesture-unmute pattern.
    // Boot mutes videos so autoplay is allowed (Chromium autoplay policy).
    // First click = user gesture → unmute + ensure playing. Toggling
    // thereafter flips play/pause state (runtime + video in sync).
    const vs = doc.querySelectorAll('video[data-nf-persist]');
    const anyMuted = Array.prototype.slice.call(vs).some((v) => v.muted);
    const anyVideoPaused = Array.prototype.slice.call(vs).some((v) => v.paused);
    if (anyMuted || handle._paused || anyVideoPaused) {
      // Unmute + play inside the user-gesture call stack.
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        try {
          v.muted = false;
          v.volume = 1.0;
          if (v.paused) {
            const pr = v.play();
            if (pr && typeof pr.catch === 'function') pr.catch(() => {});
          }
        } catch (_e) { /* noop */ }
      }
      if (handle._paused) handle.play();
    } else {
      // All videos already unmuted + playing + runtime playing → pause.
      handle.pause();
    }
  });
  bindBtn('button[data-nf="next-frame"]',  () => handle.seek(Math.min(duration_ms, handle.getState().t_ms + 33), { pause: true }));
  bindBtn('button[data-nf="to-end"]',      () => handle.seek(duration_ms, { pause: true }));
  bindBtn('button[data-nf="loop-toggle"]', () => handle.setLoop(!handle._loop));

  const playhead = doc.querySelector(".playhead");
  const ruler    = doc.querySelector(".ruler");
  const tracks   = doc.querySelector(".tracks");

  const msFromPageX = (pageX) => {
    if (!tracks) return 0;
    const rect = tracks.getBoundingClientRect();
    const laneX = rect.left + LABEL_COL_PX;
    const laneW = Math.max(1, rect.width - LABEL_COL_PX);
    const frac = (pageX - laneX) / laneW;
    return Math.max(0, Math.min(duration_ms, frac * duration_ms));
  };

  let dragging = false;
  if (playhead) {
    playhead.addEventListener("mousedown", (e) => { dragging = true; e.preventDefault(); });
  }
  if (win) {
    win.addEventListener("mousemove", (e) => {
      if (dragging) handle.seek(msFromPageX(e.pageX), { pause: true });
    });
    win.addEventListener("mouseup", () => { dragging = false; });
  }
  if (ruler) {
    ruler.addEventListener("click", (e) => handle.seek(msFromPageX(e.pageX), { pause: true }));
  }
  if (tracks) {
    tracks.addEventListener("click", (e) => {
      // click on a clip shouldn't seek — user may interact with it later.
      if (e.target && e.target.closest && e.target.closest(".clip")) return;
      handle.seek(msFromPageX(e.pageX), { pause: true });
    });
    // mousedown on track-lane (not on clip) also starts drag-seek feel.
    tracks.addEventListener("mousedown", (e) => {
      if (e.target && e.target.closest && e.target.closest(".clip")) return;
      dragging = true;
      handle.seek(msFromPageX(e.pageX), { pause: true });
      e.preventDefault();
    });
  }

  // Subscribe onTimeUpdate to sync .playhead + timecode + play-pause icon + loop button state.
  const phLabel  = doc.querySelector(".ph-label");
  const tcNow    = doc.querySelector(".timecode .now");
  const tcTotal  = doc.querySelector(".timecode .total");
  const playBtn  = doc.querySelector('button[data-nf="play-pause"]');
  const loopBtn  = doc.querySelector('button[data-nf="loop-toggle"]');

  if (tcTotal) tcTotal.textContent = _fmtTime(duration_ms);

  handle.onTimeUpdate((t) => {
    if (playhead && duration_ms > 0) {
      const pct = (t / duration_ms) * 100;
      playhead.style.left =
        "calc(" + LABEL_COL_PX + "px + (100% - " + LABEL_COL_PX + "px) * " + (t / duration_ms) + ")";
      // Fallback: also set a CSS var for pct so simple layouts can use it.
      playhead.style.setProperty("--ph-pct", pct + "%");
    }
    if (phLabel) phLabel.textContent = (t / 1000).toFixed(3) + "s";
    if (tcNow) tcNow.textContent = _fmtTime(t);
    if (playBtn) playBtn.textContent = handle._paused ? "▶" : "⏸";
    if (loopBtn) loopBtn.setAttribute("data-active", handle._loop ? "true" : "false");
  });

  // Emit one synthetic initial tick so UI reflects current state before first RAF.
  try { handle.onTimeUpdate; } catch (_e) { /* noop */ }
  const s0 = handle.getState();
  // Manually drive the listener set through a benign tick (direct reflect).
  if (playhead && duration_ms > 0) {
    playhead.style.setProperty("--ph-pct", ((s0.t_ms / duration_ms) * 100) + "%");
  }
  if (playBtn) playBtn.textContent = handle._paused ? "▶" : "⏸";
  if (loopBtn) loopBtn.setAttribute("data-active", handle._loop ? "true" : "false");
  if (tcNow) tcNow.textContent = _fmtTime(s0.t_ms);
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
