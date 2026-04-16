// TODO: implement per continuous behavior spec for drift
const meta = { name: "drift", category: "continuous", description: "Drift continuous behavior stub", default_duration: 6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 6 }] };
function drift(startAt = 0, duration = 6, opts = {}) {
  // TODO: return semantic tracks for drift
  return { tracks: {}, startAt, duration, opts };
}
drift.meta = meta;
export default drift;
