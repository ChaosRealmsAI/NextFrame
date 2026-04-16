// TODO: implement keyframe interpolation for scalar and structured tracks
const meta = { name: "interp", kind: "engine", description: "Track interpolation stub" };
export function interp(track = [], t = 0) {
  // TODO: resolve track sampling at time t
  return { track, t, value: null };
}
export { meta };
