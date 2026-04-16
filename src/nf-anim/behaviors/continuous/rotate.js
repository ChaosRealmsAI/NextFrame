// TODO: implement per continuous behavior spec for rotate
const meta = { name: "rotate", category: "continuous", description: "Rotate continuous behavior stub", default_duration: 4, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 4, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 4 }] };
function rotate(startAt = 0, duration = 4, opts = {}) {
  // TODO: return semantic tracks for rotate
  return { tracks: {}, startAt, duration, opts };
}
rotate.meta = meta;
export default rotate;
