import { interp } from "./interp.js";
import { attrs, num, slug, stable } from "../shapes/shared.js";

const meta = { name: "mask", kind: "engine", description: "Pure SVG mask helpers for animated layer clipping" };
const sample = (tracks, key, t) => tracks && key in tracks ? interp(tracks[key], t) : null;
const fix = (value) => +num(value, 0).toFixed(3);
const xy = (value, fallback = [0, 0]) => Array.isArray(value) ? [num(value[0], fallback[0]), num(value[1], fallback[1])] : fallback.slice();

function resolvedMask(spec = {}, t = 0) {
  const tracks = spec.tracks || {}, baseAt = xy(spec.at, [num(spec.x, 0), num(spec.y, 0)]), size = sample(tracks, "size", t) || spec.size || [];
  const absoluteAt = sample(tracks, "at", t) || sample(tracks, "position", t), dx = sample(tracks, "x", t), dy = sample(tracks, "y", t);
  const at = absoluteAt ? xy(absoluteAt, baseAt) : [baseAt[0] + num(dx, 0), baseAt[1] + num(dy, 0)];
  return {
    shape: spec.shape,
    at: at.map(fix),
    width: fix(sample(tracks, "width", t) ?? size[0] ?? spec.width),
    height: fix(sample(tracks, "height", t) ?? size[1] ?? spec.height),
    radius: fix(sample(tracks, "radius", t) ?? spec.radius),
    d: sample(tracks, "d", t) || spec.d || "",
  };
}

function maskShape(spec) {
  if (spec.shape === "rect") return `<rect${attrs({ x: spec.at[0], y: spec.at[1], width: Math.max(0, spec.width), height: Math.max(0, spec.height), fill: "#ffffff" })}/>`;
  if (spec.shape === "circle") return `<circle${attrs({ cx: spec.at[0], cy: spec.at[1], r: Math.max(0, spec.radius), fill: "#ffffff" })}/>`;
  if (spec.shape === "path" && spec.d) return `<path${attrs({ d: spec.d, fill: "#ffffff" })}/>`;
  return "";
}

export function parseMask(spec = {}, t = 0) {
  const resolved = resolvedMask(spec, t), body = maskShape(resolved);
  if (!body) return { id: "", defsXml: "" };
  const id = slug(`mask:${stable(resolved)}`);
  const defsXml = `<mask${attrs({ id, maskUnits: "userSpaceOnUse", maskContentUnits: "userSpaceOnUse" })}>${body}</mask>`;
  return { id, defsXml };
}

export function maskRef(id = "") {
  return id ? `url(#${id})` : null;
}

// TODO: extend mask primitives if the engine adds polygons or compound paths.
export { meta };
