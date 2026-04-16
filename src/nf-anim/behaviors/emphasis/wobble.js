// TODO: implement per emphasis behavior spec for wobble
const meta = { name: "wobble", category: "emphasis", description: "Wobble emphasis behavior stub", default_duration: 1, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1 }] };
function wobble(startAt = 0, duration = 1, opts = {}) {
  // TODO: return semantic tracks for wobble
  return { tracks: {}, startAt, duration, opts };
}
wobble.meta = meta;
export default wobble;
