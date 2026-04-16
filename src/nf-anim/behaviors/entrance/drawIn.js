// TODO: implement per entrance behavior spec for drawIn
const meta = { name: "drawIn", category: "entrance", description: "Draw In entrance behavior stub", default_duration: 0.9, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.9, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.9 }] };
function drawIn(startAt = 0, duration = 0.9, opts = {}) {
  // TODO: return semantic tracks for drawIn
  return { tracks: {}, startAt, duration, opts };
}
drawIn.meta = meta;
export default drawIn;
