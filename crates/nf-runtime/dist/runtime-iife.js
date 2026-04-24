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
  if (typeof source.duration !== "string" && typeof source.duration !== "number") {
    throw new Error("liteResolve: source.duration must be string|number");
  }
  if (!Array.isArray(source.tracks)) throw new Error("liteResolve: source.tracks must be array");

  const anchorsRaw = source.anchors || {};

  // --- Parse all expr strings to AST ---
  // Shared with nf-core-engine/src/expr.ts grammar (FM-SHAPE single source).
  const parsedAnchors = {};
  for (const name of Object.keys(anchorsRaw)) {
    const a = anchorsRaw[name];
    if (typeof a.at === "string" || typeof a.at === "number") {
      parsedAnchors[name] = { kind: "point", exprs: { at: _parseExpr(a.at) } };
    } else if (
      (typeof a.begin === "string" || typeof a.begin === "number") &&
      (typeof a.end === "string" || typeof a.end === "number")
    ) {
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

  // --- Resolve clips per track · v1.42: resolve $ref from data/theme ---
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
        params: _resolveRefs(pc.params, source.data, source.theme, pc.id),
      });
    }
    resolvedTracks.push({
      id: track.id,
      kind: track.kind,
      src: track.src,
      muted: track.muted === true,
      solo: track.solo === true,
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
  if (source.data !== undefined) out.data = source.data;
  if (source.theme !== undefined) out.theme = source.theme;
  if (source.components !== undefined) out.components = source.components;
  return out;
}

// v1.42 · $ref resolver (ADR-063 data/theme schema v2).
// Recursively replaces `{$ref:"#/data/x"}` or `{$ref:"#/theme/y"}` (JSON Pointer)
// with the actual value. Throws with available keys hint if unresolved.
function _resolveRefs(value, data, theme, clipId) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => _resolveRefs(v, data, theme, clipId));
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "$ref" && typeof value.$ref === "string") {
    return _resolveOneRef(value.$ref, data, theme, clipId);
  }
  const out = {};
  for (const k of keys) out[k] = _resolveRefs(value[k], data, theme, clipId);
  return out;
}
function _resolveOneRef(ref, data, theme, clipId) {
  if (ref.indexOf("#/") !== 0) {
    throw new Error("liteResolve: $ref '" + ref + "' must start with '#/' (clip " + clipId + ")");
  }
  const parts = ref.slice(2).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  const root = parts[0];
  let cur;
  if (root === "data") cur = data;
  else if (root === "theme") cur = theme;
  else throw new Error("liteResolve: $ref '" + ref + "' root must be 'data' or 'theme' (clip " + clipId + ")");
  if (cur === undefined) {
    throw new Error("liteResolve: $ref '" + ref + "' · source.json has no '" + root + "' section (clip " + clipId + ")");
  }
  for (let i = 1; i < parts.length; i++) {
    const key = parts[i];
    if (cur === null || typeof cur !== "object") {
      throw new Error("liteResolve: $ref '" + ref + "' walks into non-object at '" + parts.slice(0, i).join("/") + "' (clip " + clipId + ")");
    }
    if (!(key in cur)) {
      const availAll = Object.keys(cur).slice(0, 10).join(", ");
      throw new Error("liteResolve: $ref '" + ref + "' unresolved at key '" + key + "' · available at #/" + parts.slice(0, i).join("/") + ": [" + availAll + "] (clip " + clipId + ")");
    }
    cur = cur[key];
  }
  return cur;
}

// Expr parser — recursive-descent, shared grammar with expr.ts.
//   Expr     = Term (('+' | '-') Term)*
//   Term     = Duration | AnchorRef
//   Duration = Number Unit?     (Unit: 'ms' | 's' | 'm'; bare 0 allowed)
//   AnchorRef= Ident ('.' Ident)?
function _parseExpr(src) {
  if (typeof src === "number" && Number.isFinite(src)) {
    return { type: "dur", ms: src };
  }
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
    else { factor = 1; }
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
function _sampleKeyframes(keyframes, localT, fallback) {
  if (!Array.isArray(keyframes)) return fallback;
  const points = keyframes
    .map((frame) => ({
      t: Number(frame && frame.t),
      v: Number(frame && frame.v),
    }))
    .filter((frame) => Number.isFinite(frame.t) && Number.isFinite(frame.v))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return fallback;
  if (localT <= points[0].t) return points[0].v;
  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i];
    const right = points[i + 1];
    if (localT === left.t) return left.v;
    if (localT <= right.t) {
      if (right.t <= left.t) return right.v;
      const progress = Math.max(0, Math.min(1, (localT - left.t) / (right.t - left.t)));
      return left.v + (right.v - left.v) * progress;
    }
  }
  return points[points.length - 1].v;
}

function _paramsAtLocalT(value, localT) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => _paramsAtLocalT(item, localT));
  const out = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    if (key.endsWith("_keyframes")) continue;
    out[key] = _paramsAtLocalT(value[key], localT);
  }
  for (const key of keys) {
    if (!key.endsWith("_keyframes")) continue;
    const baseKey = key.slice(0, -10);
    if (!baseKey) continue;
    const sampled = _sampleKeyframes(value[key], localT, out[baseKey]);
    if (typeof sampled !== "undefined") out[baseKey] = sampled;
  }
  return out;
}
function getStateAt(resolved, t_ms) {
  const duration_ms = resolved && typeof resolved.duration_ms === "number"
    ? resolved.duration_ms
    : 0;
  const viewport = resolved && resolved.viewport
    ? resolved.viewport
    : { w: 1920, h: 1080 };

  const activeClips = [];
  const activeById = new Map();
  const clipById = new Map();
  const activeTransitions = [];
  const tracks = (resolved && resolved.tracks) || [];
  const hasSolo = tracks.some((track) => track && track.solo === true);
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (!track || track.muted === true) continue;
    if (hasSolo && track.solo !== true) continue;
    const trackId = track.id;
    const clips = track.clips || [];
    for (let ci = 0; ci < clips.length; ci++) {
      const clip = clips[ci];
      const b = clip.begin_ms;
      const e = clip.end_ms;
      if (typeof b !== "number" || typeof e !== "number") continue;
      const clipId = clip.id || `${trackId}#${ci}`;
      clipById.set(clipId, {
        trackId,
        clipIdx: ci,
        clipId,
        begin_ms: b,
        end_ms: e,
      });
      // half-open interval [begin_ms, end_ms)
      if (t_ms >= b && t_ms < e) {
        const localT = t_ms - b;
        const active = {
          trackId,
          clipIdx: ci,
          clipId,
          params: _paramsAtLocalT(clip.params || {}, localT),
          localT,
          opacity: 1,
          transition: null,
        };
        activeClips.push(active);
        activeById.set(clipId, active);
      }
    }
  }

  const transitions = resolved && resolved.meta && Array.isArray(resolved.meta.transitions)
    ? resolved.meta.transitions
    : [];
  for (let i = 0; i < transitions.length; i++) {
    const transition = transitions[i];
    if (!transition || typeof transition !== "object") continue;
    const between = Array.isArray(transition.between) ? transition.between : [];
    if (between.length !== 2) continue;
    const type = transition.type === "dissolve" ? "dissolve" : (transition.type === "fade" ? "fade" : "");
    const requestedDuration = Number(transition.duration_ms);
    if (!type || !Number.isFinite(requestedDuration) || requestedDuration <= 0) continue;
    const fromRef = clipById.get(String(between[0] || ""));
    const toRef = clipById.get(String(between[1] || ""));
    if (!fromRef || !toRef || fromRef.trackId !== toRef.trackId) continue;
    if (Math.abs(fromRef.clipIdx - toRef.clipIdx) !== 1) continue;
    const overlapStart = Math.max(fromRef.begin_ms, toRef.begin_ms);
    const overlapEnd = Math.min(fromRef.end_ms, toRef.end_ms);
    const overlapDuration = overlapEnd - overlapStart;
    if (!(overlapDuration > 0)) continue;
    const effectiveDuration = Math.min(overlapDuration, requestedDuration);
    const windowStart = overlapStart;
    const windowEnd = windowStart + effectiveDuration;
    if (!(t_ms >= windowStart && t_ms < windowEnd)) continue;
    const fromActive = activeById.get(fromRef.clipId);
    const toActive = activeById.get(toRef.clipId);
    if (!fromActive || !toActive) continue;
    const progress = Math.max(0, Math.min(1, (t_ms - windowStart) / effectiveDuration));
    const fromOpacity = 1 - progress;
    const toOpacity = progress;
    fromActive.opacity *= fromOpacity;
    toActive.opacity *= toOpacity;
    fromActive.transition = {
      type,
      role: "out",
      progress,
      duration_ms: effectiveDuration,
      between: [fromRef.clipId, toRef.clipId],
    };
    toActive.transition = {
      type,
      role: "in",
      progress,
      duration_ms: effectiveDuration,
      between: [fromRef.clipId, toRef.clipId],
    };
    activeTransitions.push({
      type,
      between: [fromRef.clipId, toRef.clipId],
      duration_ms: effectiveDuration,
      window_begin_ms: windowStart,
      window_end_ms: windowEnd,
      progress,
      from_opacity: fromOpacity,
      to_opacity: toOpacity,
    });
  }

  return {
    t: t_ms,
    t_ms,
    duration_ms,
    viewport,
    activeClips,
    activeTransitions,
  };
}

// -----------------------------------------------------------------------------
// loadTrack — compile a track source string into { describe, sample, render }
// -----------------------------------------------------------------------------
function loadTrack(src) {
  // Tracks are written as ES modules (`export function describe() {}`) per
  // Track ABI, but some legacy tests still hand in `module.exports = {...}`.
  // Support both shapes so the loader stays back-compat.
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
    "const module = { exports: {} };\n" +
    "const exports = module.exports;\n" +
    rewritten +
    "\n;const __nfExports = {};\n" +
    names.map((n) => "if (typeof " + n + " === 'function') __nfExports." + n + " = " + n + ";").join("\n") +
    "\nif (module.exports && Object.keys(module.exports).length > 0) return module.exports;\n" +
    "\nreturn __nfExports;\n";
  const fn = new Function(body);
  const api = fn();
  if (typeof api.describe !== "function" || typeof api.render !== "function") {
    throw new Error("track: missing describe() or render() export");
  }
  return api;
}

function loadComponent(src) {
  if (typeof src !== "string" || src.length === 0) {
    throw new Error("component: source must be non-empty string");
  }
  const names = [];
  const rewritten = src.replace(
    /^(\s*)export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    (_m, indent, name) => { names.push(name); return indent + "function " + name + "("; },
  );
  const body =
    '"use strict";\n' +
    "const module = { exports: {} };\n" +
    "const exports = module.exports;\n" +
    rewritten +
    "\n;const __nfExports = {};\n" +
    names.map((n) => "if (typeof " + n + " === 'function') __nfExports." + n + " = " + n + ";").join("\n") +
    "\nif (module.exports && Object.keys(module.exports).length > 0) return module.exports;\n" +
    "\nreturn __nfExports;\n";
  const fn = new Function(body);
  const api = fn();
  if (!api || (typeof api.mount !== "function" && typeof api.update !== "function")) {
    throw new Error("component: missing mount() or update() export");
  }
  return api;
}

function _installThemeStyle(doc, resolved) {
  const css = resolved && resolved.theme && typeof resolved.theme.css === "string"
    ? resolved.theme.css
    : "";
  if (!doc || !css) return;
  let style = doc.getElementById("nf-theme-v2");
  if (!style) {
    style = doc.createElement("style");
    style.id = "nf-theme-v2";
    (doc.head || doc.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

function _decodeJsonAttr(el, name) {
  if (!el || typeof el.getAttribute !== "function") return {};
  const raw = el.getAttribute(name);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_err) {
    return {};
  }
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

function _injectRootAttrs(html, attrs) {
  if (typeof html !== "string" || html.length === 0) return "";
  const leading = (html.match(/^\s*/) || [""])[0];
  const body = html.slice(leading.length);
  const match = body.match(/^<([A-Za-z][A-Za-z0-9:_-]*)([^>]*)>/);
  if (!match) return html;
  const insert = Object.entries(attrs || {})
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => ` ${key}="${_escapeHtml(value)}"`)
    .join("");
  return leading + `<${match[1]}${insert}${match[2]}>` + body.slice(match[0].length);
}

function _applyClipOpacities(stage, state) {
  if (!stage || !state || !Array.isArray(state.activeClips)) return;
  const activeById = new Map();
  for (const clip of state.activeClips) {
    if (clip && clip.clipId) activeById.set(clip.clipId, clip);
  }
  const els = stage.querySelectorAll("[data-nf-runtime-clip]");
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const clipId = el.getAttribute("data-nf-runtime-clip") || "";
    const active = activeById.get(clipId);
    const factor = active && typeof active.opacity === "number"
      ? Math.max(0, Math.min(1, active.opacity))
      : 1;
    const baseOpacity = parseFloat(el.style.opacity || "1");
    const base = Number.isFinite(baseOpacity) ? baseOpacity : 1;
    el.style.opacity = String(Number((base * factor).toFixed(4)));
    el.setAttribute("data-nf-transition-opacity", String(Number(factor.toFixed(4))));
  }
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
const RESOLVE_CACHE_KEY = "__NF_RUNTIME_RESOLVE_CACHE__";
function diffAndMount(stage, html, commit_token) {
  const doc = stage.ownerDocument || globalThis.document;
  if (commit_token && stage && stage.dataset) {
    stage.dataset.nfCommitToken = String(commit_token);
  }
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

  // v1.41 · Collect old persist elements whose key is NOT in the new snapshot
  // (they're not in `reused`). Runtime uses these to dispatch L2 unmount().
  // Note: these Elements are now detached from `stage` (removed above), but
  // the Element reference is still live — Track's unmount() can still read
  // el._nfState / cleanup WebGL context / etc.
  const removedPersistEls = [];
  for (const [key, oldEl] of oldPersist) {
    if (!reused.has(key)) removedPersistEls.push(oldEl);
  }
  return { removedPersistEls };
}

function _readResolvedCache(win, token) {
  if (!win || !token) return null;
  const cache = win[RESOLVE_CACHE_KEY];
  if (!cache || cache.token !== token || !cache.resolved) return null;
  return cache.resolved;
}

function _writeResolvedCache(win, token, resolved) {
  if (!win || !token || !resolved) return;
  win[RESOLVE_CACHE_KEY] = { token, resolved };
}

function _attrNum(el, name, fallback) {
  if (!el || typeof el.getAttribute !== "function") return fallback;
  const raw = el.getAttribute(name);
  if (raw == null || raw === "") return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function _attrBool(el, name) {
  if (!el || typeof el.getAttribute !== "function") return false;
  const raw = el.getAttribute(name);
  return raw === "1" || raw === "true";
}

function _videoProxyEls(stage) {
  if (!stage || typeof stage.querySelectorAll !== "function") return [];
  return stage.querySelectorAll("[data-nf-video-proxy='1'][data-nf-persist]");
}

function _videoProxyState(el) {
  return {
    key: el && el.getAttribute ? (el.getAttribute("data-nf-video-key") || "") : "",
    src: el && el.getAttribute ? (el.getAttribute("data-nf-src") || "") : "",
    paused: _attrBool(el, "data-nf-video-paused"),
    muted: _attrBool(el, "data-nf-video-muted"),
    currentTime: _attrNum(el, "data-nf-video-current-time", 0),
    duration: _attrNum(el, "data-nf-video-duration", 0),
    readyState: _attrNum(el, "data-nf-video-ready-state", 0),
    frameReady: _attrBool(el, "data-nf-video-frame-ready"),
    playing: _attrBool(el, "data-nf-video-playing"),
    targetMs: _attrNum(el, "data-nf-video-target-ms", null),
    error: el && el.getAttribute ? (el.getAttribute("data-nf-video-error") || null) : null,
  };
}

function _postVideoProxy(el, payload) {
  if (!el || typeof el.querySelector !== "function") return false;
  const frame = el.querySelector("iframe[data-nf-video-frame='1']");
  if (!frame || !frame.contentWindow || typeof frame.contentWindow.postMessage !== "function") {
    return false;
  }
  const key = el.getAttribute("data-nf-video-key") || el.getAttribute("data-nf-persist") || "";
  try {
    frame.contentWindow.postMessage(
      Object.assign({ __nfVideoProxy: true, key }, payload || {}),
      "*",
    );
    return true;
  } catch (_e) {
    return false;
  }
}

function _afterVisualTick(win) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      if (win && typeof win.requestAnimationFrame === "function") {
        win.requestAnimationFrame(() => {
          win.requestAnimationFrame(finish);
        });
        if (typeof win.setTimeout === "function") win.setTimeout(finish, 34);
        return;
      }
    } catch (_e) {
      // fall through
    }
    if (win && typeof win.setTimeout === "function") {
      win.setTimeout(finish, 34);
      return;
    }
    if (typeof globalThis.setTimeout === "function") {
      globalThis.setTimeout(finish, 34);
      return;
    }
    finish();
  });
}

function _waitForVideoProxies(stage, targetMs, timeoutMs, perf, win) {
  return _afterVisualTick(win).then(() => new Promise((resolve) => {
    const started = perf();
    const check = () => {
      const els = Array.from(_videoProxyEls(stage) || []);
      if (els.length === 0) {
        resolve({ ok: true, active_videos: 0, waited_ms: perf() - started, clips: [] });
        return;
      }
      const clips = els.map((el) => _videoProxyState(el));
      const ready = clips.every((clip) => {
        const wantMs = typeof clip.targetMs === "number" ? clip.targetMs : targetMs;
        if (!clip.frameReady || clip.readyState < 2) return false;
        if (typeof wantMs === "number" && wantMs >= 0) {
          return Math.abs((clip.currentTime * 1000) - wantMs) <= 80;
        }
        return true;
      });
      if (ready) {
        resolve({ ok: true, active_videos: clips.length, waited_ms: perf() - started, clips });
        return;
      }
      if ((perf() - started) >= timeoutMs) {
        resolve({
          ok: false,
          timed_out: true,
          active_videos: clips.length,
          waited_ms: perf() - started,
          clips,
        });
        return;
      }
      const setTimer = (win && typeof win.setTimeout === "function")
        ? win.setTimeout.bind(win)
        : (typeof globalThis.setTimeout === "function" ? globalThis.setTimeout.bind(globalThis) : null);
      if (!setTimer) {
        resolve({
          ok: false,
          timed_out: true,
          active_videos: clips.length,
          waited_ms: perf() - started,
          clips,
        });
        return;
      }
      setTimer(check, 16);
    };
    check();
  }));
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
  const commitToken = options.commit_token || (win && win.__NF_COMMIT_TOKEN__) || "";
  if (resolvedEl) {
    // Path 1 — bundler pre-resolved (back-compat).
    resolved = JSON.parse(resolvedEl.textContent || "{}");
    trackSources = tracksEl ? JSON.parse(tracksEl.textContent || "{}") : {};
  } else if (options.source) {
    // Path 2a — shell-mac passes raw source via options.
    resolved = _readResolvedCache(win, commitToken) || liteResolve(options.source);
    _writeResolvedCache(win, commitToken, resolved);
    trackSources = options.tracks || {};
  } else if (win && win.__NF_SOURCE__) {
    // Path 2b — window globals (shell-mac HTML template also sets these
    // for inspector/debug visibility).
    resolved = _readResolvedCache(win, commitToken) || liteResolve(win.__NF_SOURCE__);
    _writeResolvedCache(win, commitToken, resolved);
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
  const resolvedTrackById = new Map();
  for (const t of resolvedTracks) {
    resolvedTrackById.set(t.id, t);
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
  _installThemeStyle(doc, resolved);

  const componentRegistry = new Map();
  const componentSources = (resolved && resolved.components) || {};
  for (const key of Object.keys(componentSources)) {
    try {
      componentRegistry.set(key, loadComponent(componentSources[key]));
    } catch (err) {
      console.log(JSON.stringify({
        ts: _ts(), level: "error", source: "nf-runtime",
        msg: "component_load_failed", data: { component: key, error: String(err) },
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
  const mountedComponents = new Map();

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

  function componentRootFor(trackId, componentId) {
    const roots = stage.querySelectorAll("[data-nf-component-root='1']");
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      if (
        root.getAttribute("data-nf-component-track") === trackId &&
        root.getAttribute("data-nf-component") === componentId
      ) {
        return root;
      }
    }
    return null;
  }

  function syncComponents(state) {
    const activeKeys = new Set();
    for (const ac of state.activeClips) {
      const resolvedTrack = resolvedTrackById.get(ac.trackId);
      if (!resolvedTrack || resolvedTrack.kind !== "component") continue;
      const p = ac.params || {};
      const componentId = typeof p.component === "string" ? p.component : "";
      if (!componentId) continue;
      const api = componentRegistry.get(componentId);
      if (!api) continue;
      const root = componentRootFor(ac.trackId, componentId);
      if (!root) continue;
      const clip = (resolvedTrack.clips || [])[ac.clipIdx] || {};
      const span = Math.max(1, (clip.end_ms || 0) - (clip.begin_ms || 0));
      const key = root.getAttribute("data-nf-persist") || `${ac.trackId}:${ac.clipId}:${componentId}`;
      activeKeys.add(key);
      const ctx = {
        timeMs: state.t_ms,
        localTimeMs: ac.localT,
        progress: Math.max(0, Math.min(1, ac.localT / span)),
        durationMs: span,
        params: p.params || _decodeJsonAttr(root, "data-nf-component-params"),
        style: p.style || _decodeJsonAttr(root, "data-nf-component-style"),
        track: p.track || { id: ac.trackId },
        theme: (resolved && resolved.theme) || {},
        viewport: state.viewport,
        mode,
      };
      if (!mountedComponents.has(key)) {
        try {
          if (typeof api.mount === "function") api.mount(root, ctx);
          mountedComponents.set(key, { root, api, componentId });
        } catch (err) {
          console.log(JSON.stringify({ ts: _ts(), level: "error", source: "nf-runtime",
            msg: "component_mount_failed", data: { component: componentId, error: String(err) } }));
          continue;
        }
      }
      try {
        if (typeof api.update === "function") api.update(root, ctx);
      } catch (err) {
        console.log(JSON.stringify({ ts: _ts(), level: "error", source: "nf-runtime",
          msg: "component_update_failed", data: { component: componentId, error: String(err) } }));
      }
    }

    for (const [key, mounted] of Array.from(mountedComponents.entries())) {
      if (activeKeys.has(key)) continue;
      try {
        if (mounted.api && typeof mounted.api.destroy === "function") {
          mounted.api.destroy(mounted.root);
        }
      } catch (err) {
        console.log(JSON.stringify({ ts: _ts(), level: "error", source: "nf-runtime",
          msg: "component_destroy_failed", data: { component: mounted.componentId, error: String(err) } }));
      }
      mountedComponents.delete(key);
    }
  }

  function renderState(state) {
    const t0 = _perf();
    let html = "";
    for (const ac of state.activeClips) {
      const track = trackRegistry.get(ac.trackId);
      if (!track) continue;
      try {
        html += _injectRootAttrs(track.render(ac.localT, ac.params, state.viewport), {
          "data-nf-runtime-clip": ac.clipId,
          "data-nf-runtime-track": ac.trackId,
        });
      } catch (err) {
        console.log(JSON.stringify({
          ts: _ts(), level: "error", source: "nf-runtime",
          msg: "track_render_failed",
          data: { trackId: ac.trackId, clipIdx: ac.clipIdx, error: String(err) },
        }));
      }
    }
    // ADR-047 · stateful-element-safe mount (replaces stage.innerHTML = html).
    const mountResult = diffAndMount(stage, html, commitToken);
    syncComponents(state);

    if (mountResult && mountResult.removedPersistEls) {
      for (const removed of mountResult.removedPersistEls) {
        const tagName = removed && removed.tagName ? String(removed.tagName).toUpperCase() : "";
        if (tagName === "VIDEO" || tagName === "AUDIO") {
          try { if (typeof removed.pause === "function") removed.pause(); } catch (_e) { /* noop */ }
          try { removed.removeAttribute("data-nf-autoplayed"); } catch (_e) { /* noop */ }
        } else if (tagName === "IFRAME" && removed.contentWindow && typeof removed.contentWindow.postMessage === "function") {
          try { removed.contentWindow.postMessage("pause", "*"); } catch (_e) { /* noop */ }
          try { removed.contentWindow.postMessage({ type: "pause" }, "*"); } catch (_e) { /* noop */ }
        }
      }
    }

    // --- v1.41 · L2 生命周期 dispatch (ADR-063) -------------------------------
    // L2 Track 的 render() 输出 HTML 含 [data-nf-persist][data-nf-track-id=<trackId>]
    // 根元素。runtime 按 data-nf-track-id 反查 trackRegistry · 按 level 分路径：
    //   level=2 且元素首次出现 → mount(el, params, viewport) · 设 el._nfState
    //   level=2 且已 mount     → update(el, t, params)
    //   diffAndMount 返回 removedPersistEls 里 level=2 → unmount(el)
    // L1 Track 不输出 data-nf-track-id · 不会进这块 · 行为字节级不变。
    // Build L2 lookup: data-nf-track-id in render output holds the KIND (not
    // runtime-assigned trackId, which render can't know). Match persist elements
    // by kind → ac + track. Multi-instance-of-same-kind: ambiguous (rare).
    const l2ByKind = new Map();
    for (const ac of state.activeClips) {
      const tr = trackRegistry.get(ac.trackId);
      if (!tr) continue;
      let d = null;
      try { d = tr.describe(); } catch (_e) { d = null; }
      if (d && d.level === 2 && typeof d.kind === "string") {
        l2ByKind.set(d.kind, { track: tr, ac });
      }
    }
    if (mountResult && mountResult.removedPersistEls) {
      for (const removed of mountResult.removedPersistEls) {
        const kind = removed.getAttribute && removed.getAttribute("data-nf-track-id");
        if (!kind) continue;
        // On removal, ac may be gone — try trackRegistry lookup by last known kind
        let track = null;
        for (const [, entry] of l2ByKind) {
          try { if (entry.track.describe && entry.track.describe().kind === kind) { track = entry.track; break; } } catch (_e) {}
        }
        if (track && typeof track.unmount === "function" && removed._nfState) {
          try { track.unmount(removed); } catch (err) {
            console.log(JSON.stringify({ ts: _ts(), level: "error", source: "nf-runtime",
              msg: "l2_unmount_failed", data: { kind, error: String(err) } }));
          }
          removed._nfState = null;
        }
      }
    }
    // Mount + update current L2 elements (matched by kind).
    const l2Els = stage.querySelectorAll("[data-nf-persist][data-nf-track-id]");
    for (let i = 0; i < l2Els.length; i++) {
      const el = l2Els[i];
      const kind = el.getAttribute("data-nf-track-id");
      const entry = l2ByKind.get(kind);
      if (!entry) continue;
      const { track, ac } = entry;
      // Mount-once.
      if (!el._nfState && typeof track.mount === "function") {
        try {
          track.mount(el, ac.params, state.viewport);
          el._nfState = el._nfState || { mounted: true };
          console.log(JSON.stringify({ ts: _ts(), level: "info", source: "nf-runtime",
            msg: "l2_mount_called", data: { kind } }));
        } catch (err) {
          console.log(JSON.stringify({ ts: _ts(), level: "error", source: "nf-runtime",
            msg: "l2_mount_failed", data: { kind, error: String(err) } }));
        }
      }
      // Update every frame.
      if (el._nfState && typeof track.update === "function") {
        try { track.update(el, ac.localT, ac.params); } catch (err) {
          console.log(JSON.stringify({ ts: _ts(), level: "error", source: "nf-runtime",
            msg: "l2_update_failed", data: { kind, error: String(err) } }));
        }
      }
    }
    _applyClipOpacities(stage, state);
    // --- end L2 dispatch ------------------------------------------------------

    // ADR-045 / ADR-046 / ADR-054 / ADR-056 · record-mode media discipline +
    // external-t driver. Audio remains direct DOM. Official video v1.54
    // Fallback B runs in iframe isolate scope and is controlled only via
    // postMessage + JSON state attrs on the proxy wrapper.
    const isRecord = !!(doc.body && doc.body.dataset && doc.body.dataset.mode === "record");
    const bySrc = new Map();
    for (const ac of state.activeClips) {
      if (ac.params && typeof ac.params.src === "string") {
        bySrc.set(ac.params.src, ac);
      }
    }

    const audioEls = stage.querySelectorAll("audio[data-nf-persist]");
    for (let i = 0; i < audioEls.length; i++) {
      const v = audioEls[i];
      const ac = bySrc.get(v.getAttribute("src"));
      if (isRecord) {
        v.muted = true;
        try { if (typeof v.pause === "function") v.pause(); } catch (_e) { /* noop */ }
      }
      const volAttr = v.getAttribute("data-nf-volume");
      if (volAttr != null && volAttr !== "") {
        const volNum = parseFloat(volAttr);
        if (!isNaN(volNum)) {
          try { v.volume = volNum; } catch (_e) { /* noop */ }
        }
      }
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
        const fromMs = parseFloat(v.getAttribute("data-nf-t-offset") || "0") || 0;
        const target = (ac.localT + fromMs) / 1000;
        try { v.currentTime = target; } catch (_e) { /* noop */ }
      }
    }

    const proxyEls = _videoProxyEls(stage);
    for (let i = 0; i < proxyEls.length; i++) {
      const proxy = proxyEls[i];
      const ac = bySrc.get(proxy.getAttribute("data-nf-src"));
      if (isRecord) {
        _postVideoProxy(proxy, { type: "mute" });
        _postVideoProxy(proxy, { type: "pause" });
        proxy.setAttribute("data-nf-video-muted", "1");
        proxy.setAttribute("data-nf-video-paused", "1");
        proxy.setAttribute("data-nf-video-playing", "0");
      }
      if (!isRecord && playing && _userEverPlayed) {
        const alreadyAutoplayed = proxy.getAttribute("data-nf-autoplayed") === "1";
        const snap = _videoProxyState(proxy);
        if (!alreadyAutoplayed && snap.paused) {
          _postVideoProxy(proxy, { type: "play" });
          proxy.setAttribute("data-nf-autoplayed", "1");
        }
      }
      if (ac && (isRecord || _seekForceSync)) {
        const fromMs = parseFloat(proxy.getAttribute("data-nf-t-offset") || "0") || 0;
        const target = ac.localT + fromMs;
        proxy.setAttribute("data-nf-video-target-ms", String(target));
        proxy.setAttribute("data-nf-video-frame-ready", "0");
        _postVideoProxy(proxy, { type: "seek", t: target });
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
    const mediaEls = stage.querySelectorAll && stage.querySelectorAll("video[data-nf-persist], audio[data-nf-persist]");
    if (mediaEls) {
      for (let i = 0; i < mediaEls.length; i++) {
        const v = mediaEls[i];
        try {
          if (targetPlaying && v.paused) {
            const p = v.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
            v.setAttribute("data-nf-autoplayed", "1");
          } else if (!targetPlaying && !v.paused) {
            v.pause();
            v.removeAttribute("data-nf-autoplayed");
          }
        } catch (_e) { /* noop */ }
      }
    }
    const proxies = _videoProxyEls(stage);
    for (let i = 0; i < proxies.length; i++) {
      const proxy = proxies[i];
      try {
        if (targetPlaying) {
          _postVideoProxy(proxy, { type: "play" });
          proxy.setAttribute("data-nf-autoplayed", "1");
        } else {
          _postVideoProxy(proxy, { type: "pause" });
          proxy.removeAttribute("data-nf-autoplayed");
          proxy.setAttribute("data-nf-video-playing", "0");
          proxy.setAttribute("data-nf-video-paused", "1");
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
    const proxies = _videoProxyEls(stage);
    for (let i = 0; i < proxies.length; i++) {
      const proxy = proxies[i];
      if (!isRec) continue;
      _postVideoProxy(proxy, { type: "mute" });
      _postVideoProxy(proxy, { type: "pause" });
      proxy.setAttribute("data-nf-video-muted", "1");
      proxy.setAttribute("data-nf-video-paused", "1");
      proxy.setAttribute("data-nf-video-playing", "0");
    }
  }

  // --- NFHandle ---
  const handle = {
    play() {
      if (playing) {
        handle._paused = false;
        _userEverPlayed = true;
        _syncMediaFromMode();
        _syncMediaFromGesture(true);
        emitTime(currentTMs());
        return;
      }
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
          trackId: c.trackId,
          clipId: c.clipId,
          clipIdx: c.clipIdx,
          localT: c.localT,
          opacity: c.opacity,
          transition: c.transition || null,
        })),
        activeTransitions: state.activeTransitions || [],
      };
    },
    getCurrentAudioTracks() {
      const t_ms = currentTMs();
      const state = getStateAt(resolved, Math.min(t_ms, Math.max(0, duration_ms - 1)));
      return state.activeClips
        .filter((c) => {
          const track = resolvedTrackById.get(c.trackId);
          return track && track.kind === "audio";
        })
        .map((c) => {
          const track = resolvedTrackById.get(c.trackId) || {};
          return {
            trackId: c.trackId,
            clipId: c.clipId,
            kind: track.kind || null,
          };
        });
    },
    getDuration() {
      return duration_ms;
    },
    getVideoState() {
      const proxies = Array.from(_videoProxyEls(stage) || []).map((el) => _videoProxyState(el));
      return {
        count: proxies.length,
        active: proxies.length,
        all_playing: proxies.length === 0 ? true : proxies.every((clip) =>
          clip.playing && !clip.paused && !clip.muted && clip.frameReady
        ),
        clips: proxies.map((clip) => ({
          key: clip.key,
          src: clip.src,
          paused: clip.paused,
          muted: clip.muted,
          current_time_ms: Math.round(clip.currentTime * 1000),
          duration_ms: Math.round(clip.duration * 1000),
          ready_state: clip.readyState,
          frame_ready: clip.frameReady,
          error: clip.error,
        })),
      };
    },
    getMediaClock() {
      const proxies = Array.from(_videoProxyEls(stage) || []);
      for (let i = 0; i < proxies.length; i++) {
        const clip = _videoProxyState(proxies[i]);
        if (!clip.paused && clip.currentTime > 0) return clip.currentTime * 1000;
      }
      const media = stage.querySelector && stage.querySelector("video[data-nf-persist], audio[data-nf-persist]");
      if (media && !media.paused && media.currentTime > 0) {
        return media.currentTime * 1000;
      }
      return null;
    },
    unmuteAll() {
      const proxies = _videoProxyEls(stage);
      for (let i = 0; i < proxies.length; i++) {
        _postVideoProxy(proxies[i], { type: "unmute", volume: 1.0 });
        proxies[i].setAttribute("data-nf-video-muted", "0");
      }
      const videos = stage.querySelectorAll("video[data-nf-persist]");
      for (let i = 0; i < videos.length; i++) {
        try {
          videos[i].muted = false;
          videos[i].volume = 1.0;
        } catch (_e) { /* noop */ }
      }
      return handle.getVideoState();
    },
    waitForMediaReady(opts) {
      const timeoutMs = opts && typeof opts.timeout_ms === "number" ? opts.timeout_ms : 1500;
      const targetMs = opts && typeof opts.t_ms === "number" ? opts.t_ms : currentTMs();
      return _waitForVideoProxies(stage, targetMs, timeoutMs, _perf, win);
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
        video_proxy_count: (_videoProxyEls(stage) || []).length,
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
    const __hasPersistMedia = !!(
      (stage.querySelector && stage.querySelector("video[data-nf-persist], audio[data-nf-persist]")) ||
      (_videoProxyEls(stage) && _videoProxyEls(stage).length > 0)
    );
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
    const proxyState = typeof handle.getVideoState === "function"
      ? handle.getVideoState()
      : { clips: [] };
    const anyProxyMuted = Array.isArray(proxyState.clips)
      && proxyState.clips.some((v) => v.muted);
    const anyProxyPaused = Array.isArray(proxyState.clips)
      && proxyState.clips.some((v) => v.paused || !v.frame_ready);
    if (anyMuted || anyProxyMuted || handle._paused || anyVideoPaused || anyProxyPaused) {
      if (typeof handle.unmuteAll === "function") handle.unmuteAll();
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        try {
          v.muted = false;
          v.volume = 1.0;
        } catch (_e) { /* noop */ }
      }
      handle.play();
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
    const proxyState = typeof handle.getVideoState === "function"
      ? handle.getVideoState()
      : null;
    if (proxyState && Array.isArray(proxyState.clips) && proxyState.clips.length > 0) {
      return !!proxyState.all_playing;
    }
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
  if (win && typeof win.addEventListener === "function") {
    win.addEventListener("message", _refreshPlayBtn);
  }
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
//   window.__nf.getVideoState()   — JSON-only video proxy state for preview/export verify
//   window.__nf.waitForMediaReady(opts?) — await iframe video settle after seek/play
//   window.__nf.unmuteAll()       — gesture-safe unmute bridge for iframe video
//   window.__nf.getMediaClock()   — active media clock in ms when available
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
    getVideoState: handle.getVideoState ? handle.getVideoState.bind(handle) : (() => ({ count: 0, clips: [] })),
    waitForMediaReady: handle.waitForMediaReady
      ? handle.waitForMediaReady.bind(handle)
      : (() => Promise.resolve({ ok: true, active_videos: 0, clips: [] })),
    unmuteAll: handle.unmuteAll ? handle.unmuteAll.bind(handle) : (() => ({ count: 0, clips: [] })),
    getMediaClock: handle.getMediaClock ? handle.getMediaClock.bind(handle) : (() => null),
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
