// TODO: implement per data behavior spec for lineDraw
const meta = { name: "lineDraw", category: "data", description: "Line Draw data behavior stub", default_duration: 1.5, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.5, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.5 }] };
function lineDraw(startAt = 0, duration = 1.5, opts = {}) {
  // TODO: return semantic tracks for lineDraw
  return { tracks: {}, startAt, duration, opts };
}
lineDraw.meta = meta;
export default lineDraw;
