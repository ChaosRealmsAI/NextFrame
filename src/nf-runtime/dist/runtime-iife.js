(function(){
"use strict";
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
function diffAndMount(stage, html) {
  const doc = stage.ownerDocument || globalThis.document;
  const tmp = doc.createElement("div");
  tmp.innerHTML = html;

  // Collect persist elements on both sides.
  const newPersist = new Map();
  const newList = tmp.querySelectorAll("[data-nf-persist]");
  for (let i = 0; i < newList.length; i++) {
    const el = newList[i];
    newPersist.set(el.getAttribute("data-nf-persist"), el);
  }
  const oldPersist = new Map();
  const oldList = stage.querySelectorAll("[data-nf-persist]");
  for (let i = 0; i < oldList.length; i++) {
    const el = oldList[i];
    oldPersist.set(el.getAttribute("data-nf-persist"), el);
  }

  // Reuse old elements where the key matches on both sides.
  newPersist.forEach((newEl, key) => {
    const oldEl = oldPersist.get(key);
    if (!oldEl) return;
    // Copy non-identity attributes new → old.
    const attrs = newEl.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (!IDENTITY_ATTRS.has(a.name)) {
        oldEl.setAttribute(a.name, a.value);
      }
    }
    // Remove stale attributes that the new placeholder no longer carries.
    const oldAttrs = Array.from(oldEl.attributes);
    for (let i = 0; i < oldAttrs.length; i++) {
      const a = oldAttrs[i];
      if (IDENTITY_ATTRS.has(a.name)) continue;
      if (!newEl.hasAttribute(a.name)) {
        oldEl.removeAttribute(a.name);
      }
    }
    // Swap placeholder → old element inside the fragment.
    if (newEl.parentNode) {
      newEl.parentNode.replaceChild(oldEl, newEl);
    }
  });

  // Mount: clear stage + move fragment children in (old reused persist
  // elements ride along via the fragment, keeping their live state).
  stage.innerHTML = "";
  while (tmp.firstChild) {
    stage.appendChild(tmp.firstChild);
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
function boot(options) {
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
        } else {
          // play / edit mode: unmute + mirror runtime playing state.
          // BUG-20260419-01 · render HTML no longer carries muted attr so
          // browser starts with muted=true default → explicitly set false.
          // BUG-20260419-01 fix B · runtime 'playing' → also call v.play()
          // otherwise the <video> element stays paused (silent).
          v.muted = false;
          try {
            if (playing && v.paused) {
              const p = v.play();
              if (p && typeof p.catch === "function") p.catch(() => {});
            } else if (!playing && !v.paused) {
              v.pause();
            }
          } catch (_e) { /* noop */ }
        }
        if (ac) {
          const fromMs = parseFloat(v.getAttribute("data-nf-t-offset") || "0") || 0;
          const target = (ac.localT + fromMs) / 1000;
          if (isRecord || Math.abs((v.currentTime || 0) - target) > 0.1) {
            try { v.currentTime = target; } catch (_e) { /* noop */ }
          }
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

  // --- NFHandle ---
  const handle = {
    play() {
      if (playing) return;
      // If paused at end, restart from 0 (friendly default for user).
      if (pausedAtMs >= duration_ms) pausedAtMs = 0;
      startPerf = _perf() - pausedAtMs;
      playing = true;
      handle._paused = false;
      if (rafId == null) rafId = _raf(tick);
    },
    pause() {
      if (!playing) {
        handle._paused = true;
        return;
      }
      pausedAtMs = _perf() - startPerf;
      playing = false;
      handle._paused = true;
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
      renderState(getStateAt(resolved, Math.min(clamped, Math.max(0, duration_ms - 1))));
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
  bindBtn('button[data-nf="play-pause"]',  () => { if (handle._paused) handle.play(); else handle.pause(); });
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

// self-verify — attach __nf builtins to window.
// ai-coding-mindset #4: verification capabilities live INSIDE product code.
// Not a test helper; shipped runtime surface.
//
// Surface (v1.2 — full control surface exposed for AI-operable verification):
//   window.__nf.getState()        — pure read of current state (incl. loop + duration_ms)
//   window.__nf.seek(t, opts?)    — jump to t_ms (pause-by-default per ADR-035)
//   window.__nf.play()            — resume playback
//   window.__nf.pause()           — pause playback
//   window.__nf.setLoop(on)       — toggle loop mode
//   window.__nf.onTimeUpdate(cb)  — subscribe to RAF-tick time updates (returns unsubscribe)
//   window.__nf.screenshot()      — Promise<dataURL | snapshot>
//   window.__nf.log(level,msg,d)  — structured JSON line to console
//   window.__nf.simulate(op)      — AI-operable action dispatcher (walks same code path as UI)
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
    // op shape: { kind: 'seek' | 'play' | 'pause' | 'setLoop' | 'restart', t_ms?, enabled? }
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
        case "setLoop":
        case "loop": {
          const enabled = op.enabled !== undefined ? !!op.enabled : !handle._loop;
          handle.setLoop(enabled);
          handle.log("info", "simulate.setLoop", { enabled });
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

    // --- handle passthroughs (v1.2 control surface) ---
    // Bound to handle so callers may `const {seek} = window.__nf` without losing this.
    seek: handle.seek.bind(handle),
    play: handle.play.bind(handle),
    pause: handle.pause.bind(handle),
    setLoop: handle.setLoop.bind(handle),
    onTimeUpdate: handle.onTimeUpdate.bind(handle),
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