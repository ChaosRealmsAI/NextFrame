// Official Track: image. Single file, zero imports, pure render.

export function describe() {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "nf-track-image",
    type: "object",
    additionalProperties: false,
    required: ["src"],
    properties: {
      src: { type: "string", minLength: 1 },
      x: { type: "number", minimum: 0, maximum: 1, default: 0 },
      y: { type: "number", minimum: 0, maximum: 1, default: 0 },
      w: { type: "number", minimum: 0, maximum: 1, default: 1 },
      h: { type: "number", minimum: 0, maximum: 1, default: 1 },
      opacity: { type: "number", minimum: 0, maximum: 1, default: 1 },
      fit: { type: "string", enum: ["contain", "cover", "fill"], default: "cover" },
    },
  };
}

export function sample() {
  return {
    src: "https://example.com/sample.png",
    x: 0.1,
    y: 0.1,
    w: 0.8,
    h: 0.8,
    opacity: 1,
    fit: "cover",
  };
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
  const el = globalThis.document.createElement("img");
  el.setAttribute("src", String(props.src ?? ""));
  const style = el.style;
  style.position = "absolute";
  style.left = `${props.x * vw}px`;
  style.top = `${props.y * vh}px`;
  style.width = `${props.w * vw}px`;
  style.height = `${props.h * vh}px`;
  style.opacity = String(props.opacity);
  style.objectFit = props.fit;
  return { dom: el };
}
