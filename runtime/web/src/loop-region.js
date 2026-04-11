export const DEFAULT_LOOP_REGION = Object.freeze({
  in: 0,
  out: 30,
  enabled: false,
});

function readFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeLoopRegion(loopRegion, { duration } = {}) {
  const source = loopRegion && typeof loopRegion === "object" ? loopRegion : {};
  const safeDuration = Number.isFinite(Number(duration)) && Number(duration) >= 0
    ? Number(duration)
    : null;
  const defaultOut = safeDuration ?? DEFAULT_LOOP_REGION.out;
  let inPoint = readFiniteNumber(source.in, DEFAULT_LOOP_REGION.in);
  let outPoint = readFiniteNumber(source.out, defaultOut);

  if (safeDuration != null) {
    inPoint = clamp(inPoint, 0, safeDuration);
    outPoint = clamp(outPoint, 0, safeDuration);
  }

  if (outPoint < inPoint) {
    outPoint = inPoint;
  }

  return {
    in: inPoint,
    out: outPoint,
    enabled: Boolean(source.enabled),
  };
}

export function readLoopRegion(state, { duration } = {}) {
  return normalizeLoopRegion(state?.loopRegion, { duration });
}

export function updateLoopRegion(store, update, options = {}) {
  const current = readLoopRegion(store?.state, options);
  const patch = typeof update === "function" ? update(current) : update;
  const nextLoopRegion = normalizeLoopRegion(
    {
      ...current,
      ...(patch && typeof patch === "object" ? patch : {}),
    },
    options,
  );

  if (typeof store?.mutate === "function") {
    store.mutate((state) => {
      state.loopRegion = nextLoopRegion;
      if (Object.prototype.hasOwnProperty.call(state, "loop")) {
        state.loop = nextLoopRegion.enabled;
      }
    });
    return nextLoopRegion;
  }

  if (typeof store?.replace === "function") {
    store.replace({
      ...(store?.state ?? {}),
      loopRegion: nextLoopRegion,
      loop: nextLoopRegion.enabled,
    });
  }

  return nextLoopRegion;
}
