// TODO: implement per data behavior spec for mapPin
const meta = { name: "mapPin", category: "data", description: "Map Pin data behavior stub", default_duration: 1, params: [{ name: "startAt", type: "number", default: 0, semantic: "when behavior starts (sec)" }, { name: "duration", type: "number", default: 1, semantic: "how long the behavior runs (sec)" }], examples: [{ startAt: 0, duration: 1 }] };
function mapPin(startAt = 0, duration = 1, opts = {}) {
  // TODO: return semantic tracks for mapPin
  return { tracks: {}, startAt, duration, opts };
}
mapPin.meta = meta;
export default mapPin;
