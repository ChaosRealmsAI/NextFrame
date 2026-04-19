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
// liteResolve — v1.19.1 runtime-internal resolve pass (replaces engine's
// resolve.ts for consumers that skip the bundler: shell-mac / recorder / live
// preview). Accepts raw `SourceRaw` object and returns a `Resolved`-shaped
// object compatible with getStateAt().
//
// Scope (kept minimal — engine's full resolve.ts does more):
//   ✅ expr parse (literal ms/s/m, anchor refs, + / -)
//   ✅ topo sort anchors · eval exprs → absolute ms
//   ✅ duration resolution
//   ✅ clip begin/end → begin_ms/end_ms
//   ✅ viewport passthrough
//   ❌ AJV schema validation (skipped — engine's job; runtime trusts source)
//   ❌ describe() loading (tracks are loaded separately via TRACKS map)
//
// Back-compat: runtime still reads pre-resolved `#nf-resolved` JSON first
// (bundler.html path). liteResolve is a fallback for raw-source consumers.
// -----------------------------------------------------------------------------
function liteResolve(source) {
  if (!source || typeof source !== "object") {
    throw new Error("liteResolve: source must be an object");
  }
  if (!source.viewport) throw new Error("liteResolve: source.viewport missing");
  if (typeof source.duration !== "string") throw new Error("liteResolve: source.duration must be string");
  if (!Array.isArray(source.tracks)) throw new Error("liteResolve: source.tracks must be array");

  const anchorsRaw = source.anchors || {};

  // --- Parse all expr strings to AST ---
  // Shared with nf-core-engine/src/expr.ts grammar (FM-SHAPE single source).
  const parsedAnchors = {};
  for (const name of Object.keys(anchorsRaw)) {
    const a = anchorsRaw[name];
    if (typeof a.at === "string") {
      parsedAnchors[name] = { kind: "point", exprs: { at: _parseExpr(a.at) } };
    } else if (typeof a.begin === "string" && typeof a.end === "string") {
      parsedAnchors[name] = {
        kind: "range",
        exprs: { begin: _parseExpr(a.begin), end: _parseExpr(a.end) },
      };
    } else {
      throw new Error(`liteResolve: anchor '${name}' needs {at} or {begin,end}`);
    }
  }
  const durationExpr = _parseExpr(source.duration);

  // Collect parsed clips.
  const parsedClips = [];
  for (const track of source.tracks) {
    const clips = track.clips || [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      parsedClips.push({
        id: c.id || `${track.id}#${i}`,
        trackId: track.id,
        beginExpr: _parseExpr(c.begin),
        endExpr: _parseExpr(c.end),
        params: c.params || {},
      });
    }
  }

  // --- Build ref graph (inter-anchor only; intra-anchor self-refs allowed) ---
  const refGraph = {};
  for (const name of Object.keys(parsedAnchors)) {
    const deps = new Set();
    const pa = parsedAnchors[name];
    for (const key of Object.keys(pa.exprs)) {
      const ast = pa.exprs[key];
      if (ast) _collectRefs(ast, deps);
    }
    deps.delete(name); // self-refs resolved intra-anchor
    refGraph[name] = [...deps];
  }

  // --- Topo sort anchors (Kahn) ---
  const order = _topoSort(refGraph);

  // --- Eval anchor exprs in topo order ---
  const resolvedAnchors = {};
  for (const name of order) {
    const pa = parsedAnchors[name];
    if (!pa) continue;
    if (pa.kind === "point") {
      const at_ms = Math.round(_evalExpr(pa.exprs.at, resolvedAnchors));
      resolvedAnchors[name] = { kind: "point", at_ms };
    } else {
      const begin_ms = Math.round(_evalExpr(pa.exprs.begin, resolvedAnchors));
      // Partial insert so end-expr can ref self.begin.
      resolvedAnchors[name] = { kind: "range", begin_ms, end_ms: begin_ms };
      const end_ms = Math.round(_evalExpr(pa.exprs.end, resolvedAnchors));
      resolvedAnchors[name] = { kind: "range", begin_ms, end_ms };
    }
  }

  // --- Resolve duration ---
  const duration_ms = Math.round(_evalExpr(durationExpr, resolvedAnchors));
  if (duration_ms <= 0) {
    throw new Error(`liteResolve: duration_ms=${duration_ms} must be > 0`);
  }

  // --- Resolve clips per track ---
  const resolvedTracks = [];
  for (const track of source.tracks) {
    const rClips = [];
    for (const pc of parsedClips) {
      if (pc.trackId !== track.id) continue;
      const begin_ms = Math.round(_evalExpr(pc.beginExpr, resolvedAnchors));
      const end_ms = Math.round(_evalExpr(pc.endExpr, resolvedAnchors));
      rClips.push({
        id: pc.id,
        trackId: track.id,
        begin_ms,
        end_ms,
        params: pc.params,
      });
    }
    resolvedTracks.push({
      id: track.id,
      kind: track.kind,
      src: track.src,
      clips: rClips,
    });
  }

  const out = {
    viewport: source.viewport,
    duration_ms,
    anchors: resolvedAnchors,
    tracks: resolvedTracks,
  };
  if (source.meta !== undefined) out.meta = source.meta;
  return out;
}

// Expr parser — recursive-descent, shared grammar with expr.ts.
//   Expr     = Term (('+' | '-') Term)*
//   Term     = Duration | AnchorRef
//   Duration = Number Unit?     (Unit: 'ms' | 's' | 'm'; bare 0 allowed)
//   AnchorRef= Ident ('.' Ident)?
function _parseExpr(src) {
  if (typeof src !== "string" || src.length === 0) {
    throw new Error(`liteResolve: expr must be non-empty string (got ${JSON.stringify(src)})`);
  }
  const st = { src, pos: 0 };
  const ast = _parseAddSub(st);
  _skipWs(st);
  if (st.pos < src.length) {
    throw new Error(`liteResolve: unexpected '${src[st.pos]}' in '${src}' at col ${st.pos}`);
  }
  return ast;
}
function _skipWs(st) {
  while (st.pos < st.src.length) {
    const c = st.src[st.pos];
    if (c === " " || c === "\t") st.pos++;
    else break;
  }
}
function _isDigit(c) { return c >= "0" && c <= "9"; }
function _isIdStart(c) { return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_"; }
function _isIdCont(c) { return _isIdStart(c) || _isDigit(c); }
function _parseAddSub(st) {
  let left = _parseTerm(st);
  while (true) {
    _skipWs(st);
    const op = st.src[st.pos];
    if (op !== "+" && op !== "-") break;
    st.pos++;
    const right = _parseTerm(st);
    left = { type: "binop", op, left, right };
  }
  return left;
}
function _parseTerm(st) {
  _skipWs(st);
  const c = st.src[st.pos];
  if (_isDigit(c)) {
    const start = st.pos;
    while (st.pos < st.src.length && _isDigit(st.src[st.pos])) st.pos++;
    if (st.src[st.pos] === "." && _isDigit(st.src[st.pos + 1])) {
      st.pos++;
      while (st.pos < st.src.length && _isDigit(st.src[st.pos])) st.pos++;
    }
    const n = Number(st.src.slice(start, st.pos));
    // Unit: 'ms' / 's' / 'm' · bare 0 = 0ms sentinel.
    let factor;
    if (st.src.startsWith("ms", st.pos)) { st.pos += 2; factor = 1; }
    else if (st.src[st.pos] === "s") { st.pos++; factor = 1000; }
    else if (st.src[st.pos] === "m") { st.pos++; factor = 60000; }
    else if (n === 0) { factor = 1; }
    else throw new Error(`liteResolve: duration '${n}' needs unit (ms/s/m) in '${st.src}'`);
    return { type: "dur", ms: n * factor };
  }
  if (_isIdStart(c)) {
    const start = st.pos;
    st.pos++;
    while (st.pos < st.src.length && _isIdCont(st.src[st.pos])) st.pos++;
    const head = st.src.slice(start, st.pos);
    const path = [head];
    if (st.src[st.pos] === ".") {
      st.pos++;
      const fStart = st.pos;
      if (!_isIdStart(st.src[st.pos])) {
        throw new Error(`liteResolve: expected field name after '.' in '${st.src}' at col ${st.pos}`);
      }
      st.pos++;
      while (st.pos < st.src.length && _isIdCont(st.src[st.pos])) st.pos++;
      path.push(st.src.slice(fStart, st.pos));
    }
    return { type: "ref", path };
  }
  throw new Error(`liteResolve: expected number or identifier in '${st.src}' at col ${st.pos}`);
}
function _collectRefs(ast, out) {
  if (ast.type === "ref") { if (ast.path[0]) out.add(ast.path[0]); }
  else if (ast.type === "binop") { _collectRefs(ast.left, out); _collectRefs(ast.right, out); }
}
function _evalExpr(ast, resolvedAnchors) {
  if (ast.type === "dur") return ast.ms;
  if (ast.type === "binop") {
    const l = _evalExpr(ast.left, resolvedAnchors);
    const r = _evalExpr(ast.right, resolvedAnchors);
    return ast.op === "+" ? l + r : l - r;
  }
  // ref
  const head = ast.path[0];
  const field = ast.path[1];
  const ra = resolvedAnchors[head];
  if (!ra) throw new Error(`liteResolve: anchor '${head}' not resolved (topo order bug or undefined ref)`);
  if (field === undefined) {
    if (ra.kind === "point") return ra.at_ms || 0;
    return ra.begin_ms || 0;
  }
  if (field === "at") return ra.at_ms || 0;
  if (field === "begin") return ra.begin_ms || 0;
  if (field === "end") return ra.end_ms || 0;
  throw new Error(`liteResolve: unknown field '${head}.${field}' (valid: .at/.begin/.end)`);
}
// Kahn topo sort · deterministic (sorted queue).
function _topoSort(graph) {
  const nodes = Object.keys(graph);
  const nodeSet = new Set(nodes);
  const indeg = new Map();
  for (const n of nodes) indeg.set(n, 0);
  const reverse = new Map();
  for (const n of nodes) reverse.set(n, []);
  for (const n of nodes) {
    for (const d of graph[n]) {
      if (!nodeSet.has(d)) continue; // unknown refs → deferred to eval-time throw
      reverse.get(d).push(n);
      indeg.set(n, (indeg.get(n) || 0) + 1);
    }
  }
  const queue = [];
  for (const n of nodes) if ((indeg.get(n) || 0) === 0) queue.push(n);
  queue.sort();
  const order = [];
  while (queue.length > 0) {
    const n = queue.shift();
    order.push(n);
    const nexts = (reverse.get(n) || []).slice().sort();
    for (const m of nexts) {
      const d = (indeg.get(m) || 0) - 1;
      indeg.set(m, d);
      if (d === 0) queue.push(m);
    }
  }
  if (order.length < nodes.length) {
    const remaining = nodes.filter((n) => !order.includes(n));
    throw new Error(`liteResolve: anchor cycle among [${remaining.join(", ")}]`);
  }
  return order;
}

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
function boot(options) {
  options = options || {};
  const mode = options.mode || "play";
  // Accept both `stageSelector` (original) and `stage` (shell-mac convention).
  const stageSelector = options.stageSelector || options.stage || "#nf-stage";
  const autoplay = options.autoplay !== false;
  const initialLoop = options.loop === true;

  const doc = globalThis.document;
  if (!doc) throw new Error("boot: document not available (browser-only)");

  // Resolved + track sources come from 3 possible consumers (v1.19.1):
  //   1. bundler.html          -> script#nf-resolved JSON (pre-resolved)
  //   2. shell-mac / recorder  -> options.source (raw SourceRaw) + options.tracks map
  //                              OR window.__NF_SOURCE__ + window.__NF_TRACKS__
  // Runtime performs lite-resolve when only raw source is provided — avoids
  // hard dep on the engine's Node-only resolve pipeline for live consumers.
  let resolved = null;
  let trackSources = null;
  const resolvedEl = doc.getElementById("nf-resolved");
  const tracksEl = doc.getElementById("nf-tracks");
  const win = typeof window !== "undefined" ? window : null;
  if (resolvedEl) {
    // Path 1 — bundler pre-resolved (back-compat).
    resolved = JSON.parse(resolvedEl.textContent || "{}");
    trackSources = tracksEl ? JSON.parse(tracksEl.textContent || "{}") : {};
  } else if (options.source) {
    // Path 2a — shell-mac passes raw source via options.
    resolved = liteResolve(options.source);
    trackSources = options.tracks || {};
  } else if (win && win.__NF_SOURCE__) {
    // Path 2b — window globals (shell-mac HTML template also sets these
    // for inspector/debug visibility).
    resolved = liteResolve(win.__NF_SOURCE__);
    trackSources = win.__NF_TRACKS__ || {};
  } else {
    throw new Error(
      "boot: no source available — need #nf-resolved DOM, options.source, or window.__NF_SOURCE__",
    );
  }

  // Compile tracks. v1.19.1: `trackSources` map keys may be either trackId
  // (bundler.html convention — one compiled track per track in resolved.tracks)
  // OR kind (shell-mac convention — dedup'd by kind since multiple tracks of
  // the same kind share one JS source). Build `trackRegistry` keyed by the
  // actual trackId (what renderState looks up) regardless of input shape.
  const compiledByKey = new Map();
  for (const key of Object.keys(trackSources)) {
    try {
      compiledByKey.set(key, loadTrack(trackSources[key]));
    } catch (err) {
      console.log(JSON.stringify({
        ts: _ts(), level: "error", source: "nf-runtime",
        msg: "track_load_failed", data: { key, error: String(err) },
      }));
    }
  }
  const trackRegistry = new Map();
  const resolvedTracks = (resolved && resolved.tracks) || [];
  for (const t of resolvedTracks) {
    // Prefer exact trackId match (bundler), fall back to kind (shell-mac dedup).
    const api = compiledByKey.get(t.id) || compiledByKey.get(t.kind);
    if (api) trackRegistry.set(t.id, api);
    else {
      console.log(JSON.stringify({
        ts: _ts(), level: "error", source: "nf-runtime",
        msg: "track_not_registered",
        data: { trackId: t.id, kind: t.kind, availableKeys: [...compiledByKey.keys()] },
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

    // ADR-045 / ADR-046 / ADR-054 / ADR-056 · record-mode media discipline +
    // external-t driver. Handles both <video> and <audio> persist elements.
    //   record mode: force mute + pause, drive currentTime from playhead.
    //   play mode:   only correct currentTime when drift exceeds tolerance so
    //                we don't break the browser's natural playback.
    // Audio-specific additions (per audio.js DOM contract):
    //   - data-nf-volume → el.volume (post-mount)
    //   - data-nf-t-max  → pause when (localT + from) exceeds cap (IS-2a)
    const isRecord = !!(doc.body && doc.body.dataset && doc.body.dataset.mode === "record");
    const mediaEls = stage.querySelectorAll("video[data-nf-persist], audio[data-nf-persist]");
    if (mediaEls && mediaEls.length > 0) {
      // Match media DOM ↔ activeClip by src attribute (independent of persist
      // key format — Track kinds hash src their own way, but src is the single
      // stable identity across render calls). audio.js params also expose src.
      const bySrc = new Map();
      for (const ac of state.activeClips) {
        if (ac.params && typeof ac.params.src === "string") {
          bySrc.set(ac.params.src, ac);
        }
      }
      for (let i = 0; i < mediaEls.length; i++) {
        const v = mediaEls[i];
        const isAudio = v.tagName === "AUDIO";
        const ac = bySrc.get(v.getAttribute("src"));
        if (isRecord) {
          v.muted = true;
          try { if (typeof v.pause === "function") v.pause(); } catch (_e) { /* noop */ }
        }
        // Audio-specific: apply volume from data-nf-volume (audio.js contract).
        // Video has no volume attribute surfaced in its Track contract yet, so
        // only AUDIO gets this treatment (keeps video v1.8 behaviour intact).
        if (isAudio) {
          const volAttr = v.getAttribute("data-nf-volume");
          if (volAttr != null && volAttr !== "") {
            const volNum = parseFloat(volAttr);
            if (!isNaN(volNum)) {
              try { v.volume = volNum; } catch (_e) { /* noop */ }
            }
          }
        }
        // Track-window upper bound (IS-2a · design-review ②): audio.js emits
        // data-nf-t-max as the absolute media-time cap (ms). When the current
        // localT + offset exceeds it, runtime must pause so audio/video don't
        // bleed past the Track window. Empty attribute = no cap.
        const tMaxAttr = v.getAttribute("data-nf-t-max");
        if (ac && tMaxAttr != null && tMaxAttr !== "") {
          const tMax = parseFloat(tMaxAttr);
          if (!isNaN(tMax)) {
            const fromMsCap = parseFloat(v.getAttribute("data-nf-t-offset") || "0") || 0;
            if ((ac.localT + fromMsCap) > tMax) {
              try { if (typeof v.pause === "function") v.pause(); } catch (_e) { /* noop */ }
            }
          }
        }
        // v1.10: late-mounted media autoplay. When a media element is freshly
        // diff-mounted (Track window just entered · e.g. audio-outro at t=6s)
        // and runtime is playing, call play() once. Guard via per-element
        // `data-nf-autoplayed` so we don't re-trigger on every RAF tick (which
        // would fight Chromium autoplay policy · FM-AUTOPLAY-POLICY). Also
        // gated by the page-level `_userEverPlayed` flag (set by play() from
        // user gesture) so we never call play() on page-first-render when the
        // user hasn't clicked ▶ yet (autoplay policy would silently reject).
        if (!isRecord && playing && _userEverPlayed) {
          const alreadyAutoplayed = v.getAttribute("data-nf-autoplayed") === "1";
          if (!alreadyAutoplayed && v.paused && typeof v.play === "function") {
            try {
              const p = v.play();
              if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (_e) { /* noop */ }
            v.setAttribute("data-nf-autoplayed", "1");
          }
        }
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
        // v1.11.3: runtime 到 duration_ms 停 RAF 后 · 强制暂停所有持久化 media ·
        // 否则 audio/video 元素仍按自身 duration 继续播 (media 独立于 RAF).
        _syncMediaFromGesture(false);
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
  // v1.10: set to true after the first user-gesture-driven play() call.
  // Gates post-mount autoplay for late-mounted media so we never call play()
  // on page-first-render before user interaction (autoplay policy rejects).
  let _userEverPlayed = false;

  // Helper: call el.play() / el.pause() on every persist <video>/<audio>
  // directly inside the click / key handler. BUG-20260419-01 round 3:
  // browsers only honour autoplay when play() fires synchronously inside the
  // user-gesture event; invoking it later inside RAF tick is rejected →
  // silent media. v1.10 extended to audio (ADR-054).
  function _syncMediaFromGesture(targetPlaying) {
    const vs = stage.querySelectorAll && stage.querySelectorAll("video[data-nf-persist], audio[data-nf-persist]");
    if (!vs) return;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      try {
        if (targetPlaying && v.paused) {
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
          // Mark autoplayed so post-mount RAF loop won't double-play this
          // element (fights Chromium autoplay policy per FM-AUTOPLAY-POLICY).
          v.setAttribute("data-nf-autoplayed", "1");
        } else if (!targetPlaying && !v.paused) {
          v.pause();
          v.removeAttribute("data-nf-autoplayed");
        }
      } catch (_e) { /* noop */ }
    }
  }
  // Backward-compat alias — older call sites / external references may still
  // use the v1.8 name. Keep both pointing at the same impl.
  const _syncVideosFromGesture = _syncMediaFromGesture;

  // Batch apply mode-driven discipline (record → mute + pause) to every
  // persist media element. Cheap — called from handle.play()/pause() so mode
  // flips take effect without waiting for the next renderState tick.
  function _syncMediaFromMode() {
    const mode = doc.body && doc.body.dataset ? doc.body.dataset.mode : null;
    const isRec = mode === "record";
    const els = stage.querySelectorAll("video[data-nf-persist], audio[data-nf-persist]");
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (isRec) {
        el.muted = true;
        try { if (typeof el.pause === "function") el.pause(); } catch (_e) { /* noop */ }
      }
      // play/edit mode: 不动 muted (保持用户设置)
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
      _userEverPlayed = true;
      // record-mode batch: mute + pause every persist media (cheap, ensures
      // mode flips take effect without waiting for renderState tick).
      _syncMediaFromMode();
      // Kick <video>/<audio> playback synchronously so browsers honour the
      // user gesture (the outer click handler). Don't wait for next RAF tick.
      _syncMediaFromGesture(true);
      if (rafId == null) rafId = _raf(tick);
      // BUG-20260419-03 fix 1: emit one tick so play-pause icon flips to ⏸
      // immediately. The RAF loop will supersede on its first frame anyway.
      emitTime(currentTMs());
    },
    pause() {
      if (!playing) {
        handle._paused = true;
        _syncMediaFromMode();
        _syncMediaFromGesture(false);
        // BUG-20260419-03 fix 1: still notify listeners so the play-pause icon
        // flips to ▶ even when pause is called while already paused (defensive).
        emitTime(currentTMs());
        return;
      }
      pausedAtMs = _perf() - startPerf;
      playing = false;
      handle._paused = true;
      _syncMediaFromMode();
      _syncMediaFromGesture(false);
      // BUG-20260419-03 fix 1: RAF is about to stop; without this emit the
      // icon stays on ⏸ until the next tick (never). Listeners must see the
      // transition to paused state.
      emitTime(pausedAtMs);
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
      // BUG-20260419-03 fix 2: if seek paused the runtime, videos/audios must
      // actually pause too. Without this, dragging the playhead leaves audio
      // playing from the pre-seek position while the frame/time says paused.
      // _syncMediaFromGesture(false) mirrors pause() behavior: every media
      // element gets .pause() and currentTime synced by renderState above.
      if (shouldPause) {
        _syncMediaFromGesture(false);
      }
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
    // BUG-20260419-01 round 6 · when a persist <video> is present the
    // runtime must NOT start its tick automatically — browsers block
    // unmuted autoplay so the <video> stays paused while RAF would advance
    // the timeline, leaving playhead/timecode out-of-sync with silent
    // media. Keep the whole runtime paused until the user gestures play;
    // scene-only timelines (no persist media) retain the v1.1/v1.2 autoplay
    // behaviour.
    const __hasPersistMedia = !!(stage.querySelector && stage.querySelector("video[data-nf-persist], audio[data-nf-persist]"));
    if (__hasPersistMedia) {
      playing = false;
      pausedAtMs = 0;
      handle._paused = true;
      emitTime(0);
    } else {
      rafId = _raf(tick);
    }
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
    // thereafter flips play/pause state (runtime + media in sync).
    // v1.10: extended selector to cover audio[data-nf-persist] too so click
    // handler works on audio-only bundles (no video track).
    const vs = doc.querySelectorAll('video[data-nf-persist], audio[data-nf-persist]');
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

  // BUG-20260419-01 round 5 · play-pause icon reflects EFFECTIVE state:
  // even when runtime._paused=false, if any persist <video> is paused OR
  // muted the user isn't actually hearing playback, so show ▶. Only when
  // runtime playing AND all videos active (unmuted + playing) show ⏸.
  function _effectivelyPlaying() {
    if (handle._paused) return false;
    const vs = doc.querySelectorAll("video[data-nf-persist]");
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.paused || v.muted) return false;
    }
    return true;
  }
  function _refreshPlayBtn() {
    if (playBtn) playBtn.textContent = _effectivelyPlaying() ? "⏸" : "▶";
  }

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
    _refreshPlayBtn();
    if (loopBtn) loopBtn.setAttribute("data-active", handle._loop ? "true" : "false");
  });

  // Keep button in sync with <video> native events (play / pause / unmute).
  // onTimeUpdate only fires when runtime tick is advancing t; clicking a
  // button that flips v.paused without runtime state change must still
  // update the icon immediately.
  const __bindVideoEvents = () => {
    const vs = doc.querySelectorAll("video[data-nf-persist]");
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.__nfIconBound) continue;
      v.__nfIconBound = true;
      ["play", "playing", "pause", "volumechange", "loadedmetadata"].forEach((ev) => {
        v.addEventListener(ev, _refreshPlayBtn);
      });
    }
  };
  __bindVideoEvents();
  // Also re-scan after each RAF tick (new persist <video> may appear when
  // the active clip set changes).
  handle.onTimeUpdate(() => __bindVideoEvents());

  // Emit one synthetic initial tick so UI reflects current state before first RAF.
  try { handle.onTimeUpdate; } catch (_e) { /* noop */ }
  const s0 = handle.getState();
  // Manually drive the listener set through a benign tick (direct reflect).
  if (playhead && duration_ms > 0) {
    playhead.style.setProperty("--ph-pct", ((s0.t_ms / duration_ms) * 100) + "%");
  }
  _refreshPlayBtn();
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