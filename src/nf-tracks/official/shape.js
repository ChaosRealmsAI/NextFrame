// Official Track: shape. Single file, zero imports, pure render.
// Produces an SVG element for rect/circle/line primitives.

const SVG_NS = "http://www.w3.org/2000/svg";

export function describe() {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "nf-track-shape",
    type: "object",
    additionalProperties: false,
    required: ["kind"],
    properties: {
      kind: { type: "string", enum: ["rect", "circle", "line"] },
      x: { type: "number", minimum: 0, maximum: 1, default: 0.25 },
      y: { type: "number", minimum: 0, maximum: 1, default: 0.25 },
      w: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
      h: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
      color: { type: "string", pattern: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$", default: "#38bdf8" },
      opacity: { type: "number", minimum: 0, maximum: 1, default: 1 },
    },
  };
}

export function sample() {
  return { kind: "rect", x: 0.25, y: 0.25, w: 0.5, h: 0.5, color: "#38bdf8", opacity: 1 };
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function pickProps(t, keyframes) {
  const base = sample();
  if (!Array.isArray(keyframes) || keyframes.length === 0) return base;
  if (keyframes.length === 1) return { ...base, ...keyframes[0] };
  const sorted = [...keyframes].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= (sorted[i].t ?? 0) && t <= (sorted[i + 1].t ?? 1)) {
      lo = sorted[i];
      hi = sorted[i + 1];
      break;
    }
  }
  const span = (hi.t ?? 1) - (lo.t ?? 0);
  const u = span <= 0 ? 0 : Math.max(0, Math.min(1, (t - (lo.t ?? 0)) / span));
  const out = { ...base, ...lo };
  for (const key of ["x", "y", "w", "h", "opacity"]) {
    if (typeof lo[key] === "number" && typeof hi[key] === "number") {
      out[key] = lerp(lo[key], hi[key], u);
    }
  }
  return out;
}

export function render(t, keyframes, viewport) {
  const props = pickProps(t, keyframes);
  const vw = viewport?.w ?? 1920;
  const vh = viewport?.h ?? 1080;
  const doc = globalThis.document;
  const svg = doc.createElementNS
    ? doc.createElementNS(SVG_NS, "svg")
    : doc.createElement("svg");
  svg.setAttribute("width", String(vw));
  svg.setAttribute("height", String(vh));
  svg.style.position = "absolute";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.opacity = String(props.opacity);
  const x = props.x * vw;
  const y = props.y * vh;
  const w = props.w * vw;
  const h = props.h * vh;
  let shape;
  if (props.kind === "rect") {
    shape = doc.createElementNS ? doc.createElementNS(SVG_NS, "rect") : doc.createElement("rect");
    shape.setAttribute("x", String(x));
    shape.setAttribute("y", String(y));
    shape.setAttribute("width", String(w));
    shape.setAttribute("height", String(h));
    shape.setAttribute("fill", props.color);
  } else if (props.kind === "circle") {
    shape = doc.createElementNS ? doc.createElementNS(SVG_NS, "circle") : doc.createElement("circle");
    shape.setAttribute("cx", String(x + w / 2));
    shape.setAttribute("cy", String(y + h / 2));
    shape.setAttribute("r", String(Math.min(w, h) / 2));
    shape.setAttribute("fill", props.color);
  } else {
    shape = doc.createElementNS ? doc.createElementNS(SVG_NS, "line") : doc.createElement("line");
    shape.setAttribute("x1", String(x));
    shape.setAttribute("y1", String(y));
    shape.setAttribute("x2", String(x + w));
    shape.setAttribute("y2", String(y + h));
    shape.setAttribute("stroke", props.color);
    shape.setAttribute("stroke-width", "2");
  }
  svg.appendChild(shape);
  return { dom: svg };
}
