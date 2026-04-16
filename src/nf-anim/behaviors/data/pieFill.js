// TODO: implement per data behavior spec for pieFill
const meta = { name: "pieFill", category: "data", description: "Pie Fill data behavior stub", default_duration: 1.2, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.2, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.2 }] };
function pieFill(startAt = 0, duration = 1.2, opts = {}) {
  // TODO: return semantic tracks for pieFill
  return { tracks: {}, startAt, duration, opts };
}
pieFill.meta = meta;
export default pieFill;
