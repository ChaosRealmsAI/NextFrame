// TODO: implement SVG string rendering for motion configs
const meta = { name: "renderMotion", kind: "engine", description: "Renderer stub" };
export function renderMotion(host = {}, t = 0, motion = {}) {
  // TODO: convert motion config to SVG string
  return `<svg data-host="${host.id || "stub"}" data-time="${t}"></svg>`;
}
export { meta };
