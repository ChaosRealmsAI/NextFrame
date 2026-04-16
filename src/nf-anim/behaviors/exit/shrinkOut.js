// TODO: implement per exit behavior spec for shrinkOut
const meta = { name: "shrinkOut", category: "exit", description: "Shrink Out exit behavior stub", default_duration: 0.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.5 }] };
function shrinkOut(startAt = 0, duration = 0.5, opts = {}) {
  // TODO: return semantic tracks for shrinkOut
  return { tracks: {}, startAt, duration, opts };
}
shrinkOut.meta = meta;
export default shrinkOut;
