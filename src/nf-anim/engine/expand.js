import { mulberry32 } from "./scheduler.js";

const meta = { name: "expandLayer", kind: "engine", description: "Expand composite layers into renderable leaves" };
const isObject = (value) => value && typeof value === "object";
const num = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clone = (value) => Array.isArray(value) ? value.map(clone) : isObject(value) ? { ...value } : value;

function shiftTrack(track, offset) {
  if (Array.isArray(track)) return track.map((frame) => Array.isArray(frame) ? [num(frame[0]) + offset, clone(frame[1]), frame[2]] : frame);
  if (!isObject(track)) return track;
  if (track.keyframes && Array.isArray(track.keyframes)) return { ...track, keyframes: shiftTrack(track.keyframes, offset) };
  if (track.track) return { ...track, track: shiftTrack(track.track, offset) };
  if (track.tracks && Array.isArray(track.tracks)) return { ...track, tracks: track.tracks.map((entry) => shiftTrack(entry, offset)) };
  return clone(track);
}

function stackTrack(left, right) {
  if (!left) return right;
  if (!right) return left;
  const tracks = left.mode === "stack" ? left.tracks.slice() : [left];
  tracks.push(right);
  return { mode: "stack", tracks };
}

function flatten(items, out = []) {
  for (const item of items || []) {
    if (!item) continue;
    if (Array.isArray(item)) flatten(item, out);
    else out.push(item);
  }
  return out;
}

function mergeTracks(layer) {
  const merged = {};
  const baseTracks = isObject(layer.tracks) ? layer.tracks : {};
  for (const key of Object.keys(baseTracks)) merged[key] = clone(baseTracks[key]);
  for (const behavior of flatten(layer.behaviors || [])) {
    const offset = num(behavior.startAt);
    const tracks = isObject(behavior.tracks) ? behavior.tracks : {};
    for (const [key, value] of Object.entries(tracks)) merged[key] = stackTrack(merged[key], shiftTrack(value, offset));
  }
  return merged;
}

function leafLayer(layer, overrides = {}) {
  const next = { ...layer, ...overrides, type: "shape", behaviors: undefined, tracks: undefined };
  delete next.behaviors;
  return next;
}

function rippleLayers(layer, tracks) {
  const count = Math.max(1, Math.floor(num(layer.count ?? layer.rings, 3)));
  const duration = Math.max(0.001, num(layer.duration, 0.9));
  const delay = num(layer.perRingDelay, duration / (count + 1));
  const baseScale = num(layer.fromScale, 0.2);
  const maxScale = num(layer.maxScale, 2.8);
  const opacity = num(layer.opacity, 0.85);
  const base = { ...leafLayer(layer, { fill: layer.fill ?? "none", stroke: layer.stroke || layer.color || "#ffffff", strokeWidth: num(layer.strokeWidth, 2) }), tracks };
  return Array.from({ length: count }, (_, index) => {
    const start = num(layer.startAt) + delay * index;
    const effectTracks = {
      scale: [[start, baseScale], [start + duration, maxScale, "outCirc"]],
      opacity: [[start, opacity], [start + duration, 0, "outExpo"]],
    };
    return { ...base, id: `${layer.id || "ripple"}:${index}`, tracks: mergeTracks({ tracks, behaviors: [{ tracks: effectTracks }] }) };
  });
}

function burstLayers(layer, tracks) {
  const count = Math.max(1, Math.floor(num(layer.count ?? layer.particles, 8)));
  const duration = Math.max(0.001, num(layer.duration, 0.6));
  const distance = num(layer.distance, 72);
  const radius = num(layer.radius ?? layer.particleSize, 6);
  const rng = mulberry32(num(layer.seed, 1));
  const base = { ...leafLayer(layer, { shape: layer.particleShape || layer.shape || "circle", radius, r: radius }), tracks };
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count + (rng() - 0.5) * 0.35;
    const length = distance * (0.7 + rng() * 0.45);
    const offset = [Math.cos(angle) * length, Math.sin(angle) * length];
    const start = num(layer.startAt);
    const mid = start + duration * 0.35;
    const effectTracks = {
      offset: [[start, [0, 0]], [start + duration, offset, "outCubic"]],
      scale: [[start, 0.2], [mid, 1.1, "outBack"], [start + duration, 0.35, "outCirc"]],
      opacity: [[start, num(layer.opacity, 1)], [start + duration, 0, "outExpo"]],
    };
    return { ...base, id: `${layer.id || "burst"}:${index}`, tracks: mergeTracks({ tracks, behaviors: [{ tracks: effectTracks }] }) };
  });
}

export function expandLayer(layer = {}) {
  const tracks = mergeTracks(layer);
  if (layer.type === "ripple") return rippleLayers(layer, tracks);
  if (layer.type === "burst") return burstLayers(layer, tracks);
  return [{ ...leafLayer(layer), tracks }];
}

export { meta };
