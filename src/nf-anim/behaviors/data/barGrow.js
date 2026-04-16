// TODO: implement per data behavior spec for barGrow
const meta = { name: "barGrow", category: "data", description: "Bar Grow data behavior stub", default_duration: 1, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1 }] };
function barGrow(startAt = 0, duration = 1, opts = {}) {
  // TODO: return semantic tracks for barGrow
  return { tracks: {}, startAt, duration, opts };
}
barGrow.meta = meta;
export default barGrow;
