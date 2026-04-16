// TODO: implement per emphasis behavior spec for shake
const meta = { name: "shake", category: "emphasis", description: "Shake emphasis behavior stub", default_duration: 0.6, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.6, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.6 }] };
function shake(startAt = 0, duration = 0.6, opts = {}) {
  // TODO: return semantic tracks for shake
  return { tracks: {}, startAt, duration, opts };
}
shake.meta = meta;
export default shake;
