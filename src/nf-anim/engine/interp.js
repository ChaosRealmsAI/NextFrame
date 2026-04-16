import { EASE } from "./easings.js";
import { lerpColor } from "./color.js";

const meta = { name: "interp", kind: "engine", description: "Keyframe interpolation for scalar and array tracks" };
const EPS = 1e-9;
const num = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clone = (value) => Array.isArray(value) ? value.map(clone) : value;
const sortFrames = (track) => track.filter((frame) => Array.isArray(frame) && frame.length >= 2).slice().sort((a, b) => num(a[0]) - num(b[0]));

function lerpValue(left, right, progress) {
  if (typeof left === "string" && typeof right === "string") return lerpColor(left, right, progress);
  if (typeof left === "number" && typeof right === "number") return left + (right - left) * progress;
  if (Array.isArray(left) && Array.isArray(right)) {
    const size = Math.max(left.length, right.length);
    const out = new Array(size);
    for (let i = 0; i < size; i++) {
      const a = i < left.length ? left[i] : left[left.length - 1];
      const b = i < right.length ? right[i] : right[right.length - 1];
      out[i] = typeof a === "number" && typeof b === "number" ? a + (b - a) * progress : progress < 1 ? clone(a) : clone(b);
    }
    return out;
  }
  return progress < 1 ? clone(left) : clone(right);
}

function boundsFor(spec) {
  const frames = Array.isArray(spec) ? sortFrames(spec) : Array.isArray(spec && spec.keyframes) ? sortFrames(spec.keyframes) : null;
  if (frames && frames.length) return { start: num(frames[0][0]), end: num(frames[frames.length - 1][0]), frames };
  if (spec && typeof spec === "object" && spec.mode === "stack" && Array.isArray(spec.tracks)) {
    const ranges = spec.tracks.map(boundsFor).filter(Boolean);
    if (!ranges.length) return null;
    return { start: ranges[0].start, end: ranges[ranges.length - 1].end };
  }
  if (spec && typeof spec === "object" && (spec.mode === "loop" || spec.mode === "yoyo")) {
    const inner = boundsFor(spec.track);
    if (!inner) return null;
    const span = Math.max(EPS, inner.end - inner.start);
    const count = Number.isFinite(spec.count) ? Math.max(0, spec.count) : 1;
    const factor = spec.mode === "yoyo" ? 2 : 1;
    return { start: inner.start, end: inner.start + span * count * factor };
  }
  return null;
}

function findIndex(frames, t) {
  if (frames.length <= 2 || t <= num(frames[1][0])) return 0;
  if (frames.length <= 8) {
    for (let i = 0; i < frames.length - 1; i++) {
      if (t <= num(frames[i + 1][0])) return i;
    }
    return frames.length - 2;
  }
  let low = 0;
  let high = frames.length - 2;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const left = num(frames[mid][0]);
    const right = num(frames[mid + 1][0]);
    if (t < left) high = mid - 1;
    else if (t > right) low = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(frames.length - 2, low));
}

function sampleFrames(frames, t, clamp) {
  if (!frames.length) return null;
  if (frames.length === 1) return clone(frames[0][1]);
  const start = num(frames[0][0]);
  const end = num(frames[frames.length - 1][0]);
  if (t <= start) return clamp ? clone(frames[0][1]) : (Math.abs(t - start) <= EPS ? clone(frames[0][1]) : null);
  if (t >= end) return clamp ? clone(frames[frames.length - 1][1]) : (Math.abs(t - end) <= EPS ? clone(frames[frames.length - 1][1]) : null);
  const index = findIndex(frames, t);
  const left = frames[index];
  const right = frames[index + 1];
  const span = Math.max(EPS, num(right[0]) - num(left[0]));
  const easing = EASE[right[2]] || EASE.linear;
  const progress = easing((t - num(left[0])) / span);
  return lerpValue(left[1], right[1], progress);
}

function sampleSpec(spec, t, clamp) {
  if (Array.isArray(spec) || Array.isArray(spec && spec.keyframes)) return sampleFrames(sortFrames(Array.isArray(spec) ? spec : spec.keyframes), t, clamp);
  if (!spec || typeof spec !== "object") return null;
  if (spec.mode === "stack" && Array.isArray(spec.tracks)) {
    for (let i = spec.tracks.length - 1; i >= 0; i--) {
      const value = sampleSpec(spec.tracks[i], t, false);
      if (value !== null) return value;
    }
    return spec.tracks.length ? sampleSpec(spec.tracks[0], t, clamp) : null;
  }
  if (spec.mode === "loop" || spec.mode === "yoyo") {
    const inner = boundsFor(spec.track);
    if (!inner) return null;
    const span = Math.max(EPS, inner.end - inner.start);
    const count = Number.isFinite(spec.count) ? Math.max(0, spec.count) : 1;
    const total = span * count * (spec.mode === "yoyo" ? 2 : 1);
    if (!clamp && (t < inner.start || t > inner.start + total)) return null;
    const limited = clamp ? Math.max(inner.start, Math.min(inner.start + total, t)) : t;
    const offset = Math.max(0, limited - inner.start);
    const cycle = spec.mode === "yoyo" ? span * 2 : span;
    const phase = cycle <= EPS ? 0 : offset % cycle;
    const local = spec.mode === "yoyo" && phase > span ? inner.end - (phase - span) : inner.start + Math.min(span, phase);
    if (count <= 0) return null;
    if (clamp && limited >= inner.start + total) return sampleSpec(spec.track, spec.mode === "yoyo" ? inner.start : inner.end, true);
    return sampleSpec(spec.track, local, true);
  }
  return null;
}

export function interp(track = [], t = 0) {
  return sampleSpec(track, num(t), true);
}

export { meta };
