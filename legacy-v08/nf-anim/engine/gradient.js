import { interp } from "./interp.js";
import { attrs, num, slug, stable } from "../shapes/shared.js";

const meta = { name: "parseGradient", kind: "engine", description: "Resolve gradient fill specs into SVG defs" };
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const isTrack = (value) => Array.isArray(value) ? Array.isArray(value[0]) : !!(value && typeof value === "object" && (Array.isArray(value.keyframes) || value.track || Array.isArray(value.tracks)));
const point = (value, fallback) => Array.isArray(value) ? [num(value[0], fallback[0]), num(value[1], fallback[1])] : fallback.slice();
const stopList = (stops) => (Array.isArray(stops) ? stops : []).map((stop, index) => ({ offset: num(stop && stop.offset, index ? 1 : 0), color: stop && stop.color }));

function linearCoords(spec) {
  if (Array.isArray(spec.from) || Array.isArray(spec.to)) {
    const from = point(spec.from, [0, 0]);
    const to = point(spec.to, [1, 0]);
    return { x1: from[0], y1: from[1], x2: to[0], y2: to[1] };
  }
  if (spec.dir === "vertical") return { x1: 0, y1: 0, x2: 0, y2: 1 };
  if (spec.dir === "diagonal") return { x1: 0, y1: 0, x2: 1, y2: 1 };
  return { x1: 0, y1: 0, x2: 1, y2: 0 };
}

function stopXml(stop, t) {
  const color = isTrack(stop.color) ? interp(stop.color, t) : stop.color;
  return `<stop${attrs({ offset: stop.offset, "stop-color": color ?? "#000000" })}/>`;
}

export function parseGradient(spec = {}, t = 0) {
  if (!isObject(spec)) return null;
  const type = spec.type === "radial" ? "radial" : "linear";
  const stops = stopList(spec.stops);
  if (!stops.length) return null;
  // TODO: extend the normalized key if scene contracts add more gradient modes.
  const id = slug(stable({
    type,
    dir: type === "linear" ? spec.dir ?? null : null,
    from: type === "linear" && Array.isArray(spec.from) ? point(spec.from, [0, 0]) : null,
    to: type === "linear" && Array.isArray(spec.to) ? point(spec.to, [1, 0]) : null,
    cx: type === "radial" ? num(spec.cx, 0.5) : null,
    cy: type === "radial" ? num(spec.cy, 0.5) : null,
    r: type === "radial" ? num(spec.r, 0.5) : null,
    stops,
  }));
  const stopsXml = stops.map((stop) => stopXml(stop, t)).join("");
  if (type === "radial") {
    return {
      id,
      defsXml: `<radialGradient${attrs({ id, cx: num(spec.cx, 0.5), cy: num(spec.cy, 0.5), r: num(spec.r, 0.5) })}>${stopsXml}</radialGradient>`,
    };
  }
  return { id, defsXml: `<linearGradient${attrs({ id, ...linearCoords(spec) })}>${stopsXml}</linearGradient>` };
}

export function gradientRef(id) {
  return `url(#${id})`;
}

export { meta };
