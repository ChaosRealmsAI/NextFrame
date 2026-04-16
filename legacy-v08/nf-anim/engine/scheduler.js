const meta = { name: "scheduler", kind: "engine", description: "Deterministic scheduler helpers" };
const isObject = (value) => value && typeof value === "object";
const clone = (value) => Array.isArray(value) ? value.map(clone) : isObject(value) ? { ...value } : value;

function wrapTracks(input, wrap) {
  if (Array.isArray(input)) return wrap(input.map((frame) => Array.isArray(frame) ? frame.slice() : frame));
  if (!isObject(input)) return input;
  if (input.tracks && isObject(input.tracks)) return { ...input, tracks: Object.fromEntries(Object.entries(input.tracks).map(([key, value]) => [key, wrapTracks(value, wrap)])) };
  if (input.keyframes && Array.isArray(input.keyframes)) return wrap({ ...input, keyframes: input.keyframes.map((frame) => Array.isArray(frame) ? frame.slice() : frame) });
  return clone(input);
}

function mulberry32(seed = 1) {
  let state = Math.floor(Number(seed) || 0) | 0;
  return () => {
    state = state + 0x6D2B79F5 | 0;
    let mix = Math.imul(state ^ state >>> 15, 1 | state);
    mix ^= mix + Math.imul(mix ^ mix >>> 7, 61 | mix);
    return ((mix ^ mix >>> 14) >>> 0) / 4294967296;
  };
}

function stagger(items = [], perItemDelay = 0) {
  const delay = Number(perItemDelay) || 0;
  return items.map((item, index) => {
    if (!isObject(item)) return item;
    const offset = delay * index;
    if (item.tracks) return { ...item, startAt: (Number(item.startAt) || 0) + offset };
    return { ...item, startAt: (Number(item.startAt) || 0) + offset };
  });
}

function loop(behavior = {}, count = 1) {
  return wrapTracks(behavior, (track) => ({ mode: "loop", track, count: Math.max(0, Number(count) || 0) }));
}

function yoyo(behavior = {}) {
  return wrapTracks(behavior, (track) => ({ mode: "yoyo", track, count: 1 }));
}

export { meta, mulberry32, stagger, loop, yoyo };
