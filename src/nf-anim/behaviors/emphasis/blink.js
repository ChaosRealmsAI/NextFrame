// TODO: implement per emphasis behavior spec for blink
const meta = { name: "blink", category: "emphasis", description: "Blink emphasis behavior stub", default_duration: 0.8, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.8, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.8 }] };
function blink(startAt = 0, duration = 0.8, opts = {}) {
  // TODO: return semantic tracks for blink
  return { tracks: {}, startAt, duration, opts };
}
blink.meta = meta;
export default blink;
