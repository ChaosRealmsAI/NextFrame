// State derivation for nf-core-app.
//
// Pure functions. No side effects. No wall-clock time.
// Same (t, resolved) in → same state out. This is the bedrock guarantee
// that lets play / edit / record modes share one engine heart.

const EASING = {
  linear: (u) => u,
  "ease-in": (u) => u * u,
  "ease-out": (u) => 1 - (1 - u) * (1 - u),
  "ease-in-out": (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
};

function clamp01(u) {
  if (u < 0) return 0;
  if (u > 1) return 1;
  return u;
}

function applyEasing(u, mode) {
  const fn = EASING[mode] || EASING.linear;
  return fn(clamp01(u));
}

// Per-prop lerp: numbers linearly, strings pick latest (u<0.5 → a else b),
// arrays/objects recurse on numeric leaves. Booleans/null pass through from `a`.
function lerpValue(a, b, u) {
  if (typeof a === "number" && typeof b === "number") {
    return a + (b - a) * u;
  }
  if (typeof a === "string" || typeof b === "string") {
    return u < 0.5 ? a : b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const av = i < a.length ? a[i] : b[i];
      const bv = i < b.length ? b[i] : a[i];
      out[i] = lerpValue(av, bv, u);
    }
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const out = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const av = k in a ? a[k] : b[k];
      const bv = k in b ? b[k] : a[k];
      out[k] = lerpValue(av, bv, u);
    }
    return out;
  }
  return a;
}

// Merge prop object from kf {t, ...props} into pure {props} payload.
function kfProps(kf) {
  if (!kf || typeof kf !== "object") return {};
  const out = {};
  for (const k of Object.keys(kf)) {
    if (k === "t" || k === "easing") continue;
    out[k] = kf[k];
  }
  return out;
}

// Sort keyframes by t ascending (stable copy, does not mutate input).
function sortKfs(keyframes) {
  return [...keyframes].sort((x, y) => (x.t ?? 0) - (y.t ?? 0));
}

// interpolateKeyframes:
//   - kfs: Array<{t, ...props}>
//   - t: number
//   - mode: default easing if no per-kf easing specified
//
// Contract:
//   - empty → {}
//   - 1 kf → its props
//   - t ≤ first → first props
//   - t ≥ last → last props
//   - else lerp neighbors using the hi-kf's easing (falls back to mode)
export function interpolateKeyframes(kfs, t, mode = "linear") {
  if (!Array.isArray(kfs) || kfs.length === 0) return {};
  const sorted = sortKfs(kfs);
  if (sorted.length === 1) return kfProps(sorted[0]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (t <= (first.t ?? 0)) return kfProps(first);
  if (t >= (last.t ?? 0)) return kfProps(last);
  let lo = first;
  let hi = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= (a.t ?? 0) && t <= (b.t ?? 0)) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = (hi.t ?? 0) - (lo.t ?? 0);
  const raw = span <= 0 ? 0 : (t - (lo.t ?? 0)) / span;
  const easingMode = hi.easing || mode;
  const u = applyEasing(raw, easingMode);
  const loProps = kfProps(lo);
  const hiProps = kfProps(hi);
  const out = {};
  const keys = new Set([...Object.keys(loProps), ...Object.keys(hiProps)]);
  for (const k of keys) {
    const av = k in loProps ? loProps[k] : hiProps[k];
    const bv = k in hiProps ? hiProps[k] : loProps[k];
    out[k] = lerpValue(av, bv, u);
  }
  return out;
}

// activeTracksAt:
//   - returns tracks whose [in, out] contain t
//   - if a track has no `in` / `out`, it's always active
//   - Source of truth: resolved.tracks[]
export function activeTracksAt(t, resolved) {
  const tracks = (resolved && Array.isArray(resolved.tracks)) ? resolved.tracks : [];
  const out = [];
  for (const tr of tracks) {
    if (!tr || typeof tr !== "object") continue;
    const hasIn = typeof tr.in === "number";
    const hasOut = typeof tr.out === "number";
    if (hasIn && t < tr.in) continue;
    if (hasOut && t > tr.out) continue;
    out.push(tr);
  }
  return out;
}

// currentValues: per-track interpolated props at time t.
// Respects optional track.in offset — keyframe `t` values are relative to `in`
// when `in` is set; otherwise absolute. Design: AI-authored tracks think in
// "0 = my start" terms, not "ms since world began".
export function currentValues(track, t) {
  if (!track || typeof track !== "object") return {};
  const kfs = Array.isArray(track.keyframes) ? track.keyframes : [];
  const relT = typeof track.in === "number" ? t - track.in : t;
  const easing = track.easing || "linear";
  return interpolateKeyframes(kfs, relT, easing);
}

// deriveState: full state envelope used by runtime / track-host.
// Shape documented in CLAUDE.md: {t, viewport, tracks, selected, data}.
export function deriveState(t, resolved) {
  const viewport = resolved && resolved.viewport
    ? resolved.viewport
    : { ratio: "16:9", w: 1920, h: 1080 };
  const active = activeTracksAt(t, resolved);
  const tracksState = active.map((tr) => ({
    id: tr.id || tr.kind || "unknown",
    kind: tr.kind,
    in: tr.in ?? null,
    out: tr.out ?? null,
    values: currentValues(tr, t),
    keyframes: Array.isArray(tr.keyframes) ? tr.keyframes : [],
  }));
  const selected = resolved && resolved.selected ? resolved.selected : null;
  const data = resolved && resolved.data ? resolved.data : {};
  return {
    t,
    viewport,
    tracks: tracksState,
    selected,
    data,
  };
}
