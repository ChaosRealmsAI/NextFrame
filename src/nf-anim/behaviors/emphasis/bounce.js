// TODO: implement per emphasis behavior spec for bounce
const meta = { name: "bounce", category: "emphasis", description: "Bounce emphasis behavior stub", default_duration: 1, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1 }] };
function bounce(startAt = 0, duration = 1, opts = {}) {
  // TODO: return semantic tracks for bounce
  return { tracks: {}, startAt, duration, opts };
}
bounce.meta = meta;
export default bounce;
