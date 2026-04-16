// TODO: implement per effects behavior spec for morph
const meta = { name: "morph", category: "effects", description: "Morph effects behavior stub", default_duration: 1.2, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1.2, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1.2 }] };
function morph(startAt = 0, duration = 1.2, opts = {}) {
  // TODO: return semantic tracks for morph
  return { tracks: {}, startAt, duration, opts };
}
morph.meta = meta;
export default morph;
