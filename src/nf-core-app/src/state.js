// State derivation. Walking stub: returns an empty envelope with `t` echoed.

export function deriveState(t, resolved) {
  const viewport = resolved && resolved.viewport
    ? resolved.viewport
    : { ratio: "16:9", w: 1920, h: 1080 };
  return {
    t,
    viewport,
    tracks: [],
    selected: null,
    data: {},
  };
}
