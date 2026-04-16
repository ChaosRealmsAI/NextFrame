// TODO: implement per effects behavior spec for burst
const meta = { name: "burst", category: "effects", description: "Burst effects behavior stub", default_duration: 0.6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.6 }] };
function burst(startAt = 0, duration = 0.6, opts = {}) {
  // TODO: return semantic tracks for burst
  return { tracks: {}, startAt, duration, opts };
}
burst.meta = meta;
export default burst;
