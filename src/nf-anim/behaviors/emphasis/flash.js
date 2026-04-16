// TODO: implement per emphasis behavior spec for flash
const meta = { name: "flash", category: "emphasis", description: "Flash emphasis behavior stub", default_duration: 0.4, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 0.4, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 0.4 }] };
function flash(startAt = 0, duration = 0.4, opts = {}) {
  // TODO: return semantic tracks for flash
  return { tracks: {}, startAt, duration, opts };
}
flash.meta = meta;
export default flash;
