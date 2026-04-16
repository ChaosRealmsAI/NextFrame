import { interp } from "./interp.js";
import { expandLayer } from "./expand.js";
import { gradientRef, parseGradient } from "./gradient.js";
import { SHAPES } from "../shapes/index.js";
import { attrs } from "../shapes/shared.js";

const meta = { name: "renderMotion", kind: "engine", description: "Pure SVG renderer for motion configs" };
const num = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function resolveTrack(tracks, key, t) {
  return tracks && key in tracks ? interp(tracks[key], t) : null;
}

function xy(value, fallback = [0, 0]) {
  if (Array.isArray(value)) return [num(value[0], fallback[0]), num(value[1], fallback[1])];
  return fallback.slice();
}

function scalePair(layer, tracks, t) {
  const baseScale = Array.isArray(layer.scale) ? layer.scale : [num(layer.scale, 1), num(layer.scale, 1)];
  const trackScale = resolveTrack(tracks, "scale", t);
  const trackScaleX = resolveTrack(tracks, "scaleX", t);
  const trackScaleY = resolveTrack(tracks, "scaleY", t);
  const sx = Array.isArray(trackScale) ? num(trackScale[0], 1) : num(trackScale, 1);
  const sy = Array.isArray(trackScale) ? num(trackScale[1], sx) : num(trackScale, 1);
  return [
    num(baseScale[0], 1) * sx * num(trackScaleX, 1),
    num(baseScale[1], 1) * sy * num(trackScaleY, 1),
  ];
}

function layerState(layer, t) {
  const tracks = layer.tracks || {};
  const baseAt = xy(layer.at, [num(layer.x), num(layer.y)]);
  const absoluteAt = resolveTrack(tracks, "at", t) || resolveTrack(tracks, "position", t);
  const offset = resolveTrack(tracks, "offset", t) || resolveTrack(tracks, "translate", t) || [num(resolveTrack(tracks, "x", t)), num(resolveTrack(tracks, "y", t))];
  const at = absoluteAt ? xy(absoluteAt, baseAt) : [baseAt[0] + num(offset[0], 0), baseAt[1] + num(offset[1], 0)];
  const rotate = num(layer.rotate, 0) + num(resolveTrack(tracks, "rotate", t), 0);
  const [scaleX, scaleY] = scalePair(layer, tracks, t);
  const opacity = Math.max(0, Math.min(1, num(layer.opacity, 1) * num(resolveTrack(tracks, "opacity", t), 1)));
  return { at, rotate, scaleX, scaleY, opacity, tracks };
}

function resolveFill(fill, t, defs) {
  if (!fill || typeof fill !== "object" || Array.isArray(fill)) return fill;
  const gradient = parseGradient(fill, t);
  if (!gradient) return fill;
  defs.set(gradient.id, gradient.defsXml);
  return gradientRef(gradient.id);
}

function renderLayers(items, t, motion, defs) {
  const out = [];
  for (const item of items || []) for (const layer of expandLayer(item || {})) {
    const state = layerState(layer, t);
    if (state.opacity > 0) out.push(renderShape(layer, state, t, motion, defs));
  }
  return out.join("");
}

function renderShape(layer, state, t, motion, defs) {
  const shapeName = layer.shape || (layer.type === "shape" ? "circle" : layer.type);
  const shape = SHAPES[shapeName];
  const d = shapeName === "path" ? resolveTrack(state.tracks, "d", t) || layer.path : layer.path;
  // resolve string-valued tracks (color/path/etc.) so shape function sees animated values
  const fillTrack = resolveTrack(state.tracks, "fill", t);
  const strokeTrack = resolveTrack(state.tracks, "stroke", t);
  const radiusTrack = resolveTrack(state.tracks, "radius", t);
  const widthTrack = resolveTrack(state.tracks, "width", t);
  const heightTrack = resolveTrack(state.tracks, "height", t);
  const resolvedLayer = {
    ...layer, t, motion: undefined, tracks: state.tracks, opacity: state.opacity,
    fill: resolveFill(fillTrack ?? layer.fill, t, defs),
    stroke: strokeTrack ?? layer.stroke,
    radius: radiusTrack ?? layer.radius,
    width: widthTrack ?? layer.width,
    height: heightTrack ?? layer.height,
  };
  const fallback = d ? `<path${attrs({ d, fill: resolvedLayer.fill ?? "#000000", stroke: resolvedLayer.stroke, "stroke-width": resolvedLayer.stroke ? layer.strokeWidth ?? 1 : null, "vector-effect": "non-scaling-stroke" })}/>` : "";
  const ctx = motion.renderChildren ? motion : { ...motion, renderChildren: (items) => renderLayers(items, t, motion, defs) };
  resolvedLayer.motion = ctx;
  const body = typeof shape === "function" ? shape(resolvedLayer) : fallback;
  if (!body) return "";
  const transform = `translate(${state.at[0].toFixed(3)} ${state.at[1].toFixed(3)}) rotate(${state.rotate.toFixed(3)}) scale(${state.scaleX.toFixed(3)} ${state.scaleY.toFixed(3)})`;
  return `<g${layer.id ? ` data-layer="${esc(layer.id)}"` : ""} transform="${transform}" opacity="${state.opacity.toFixed(3)}">${body}</g>`;
}

export function renderMotion(host = null, t = 0, motion = {}) {
  const size = Array.isArray(motion.size) ? motion.size : [motion.width, motion.height];
  const width = Math.max(1, num(size[0], num(host && host.width, 1920)));
  const height = Math.max(1, num(size[1], num(host && host.height, 1080)));
  const defs = new Map();
  const body = renderLayers(motion.layers, num(t), motion, defs);
  const defsXml = defs.size ? `<defs>${Array.from(defs.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([, xml]) => xml).join("")}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defsXml}${body}</svg>`;
}

export { meta };
