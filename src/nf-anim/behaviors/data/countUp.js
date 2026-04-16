// TODO: implement per data behavior spec for countUp
const meta = { name: "countUp", category: "data", description: "Count Up data behavior stub", default_duration: 1.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.5 }] };
function countUp(startAt = 0, duration = 1.5, opts = {}) {
  // TODO: return semantic tracks for countUp
  return { tracks: {}, startAt, duration, opts };
}
countUp.meta = meta;
export default countUp;
