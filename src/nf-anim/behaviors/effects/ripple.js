// TODO: implement per effects behavior spec for ripple
const meta = { name: "ripple", category: "effects", description: "Ripple effects behavior stub", default_duration: 0.9, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.9, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.9 }] };
function ripple(startAt = 0, duration = 0.9, opts = {}) {
  // TODO: return semantic tracks for ripple
  return { tracks: {}, startAt, duration, opts };
}
ripple.meta = meta;
export default ripple;
