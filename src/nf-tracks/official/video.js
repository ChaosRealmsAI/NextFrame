// Official Track: video. Single file, zero imports, pure render.
// Critical: the <video> element carries data-nf-persist="1" so the
// framework's re-render does not destroy it (cf. build.js innerHTML replace).

export function describe() {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "nf-track-video",
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
      loop: { type: "boolean", default: false },
      mute: { type: "boolean", default: true },
    },
  };
}

export function sample() {
  return {
    src: "https://example.com/sample.mp4",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    opacity: 1,
    loop: true,
    mute: true,
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
  const el = globalThis.document.createElement("video");
  el.setAttribute("src", String(props.src ?? ""));
  el.setAttribute("data-nf-persist", "1");
  el.setAttribute("playsinline", "1");
  if (props.loop) el.setAttribute("loop", "1");
  if (props.mute) el.setAttribute("muted", "1");
  el.muted = !!props.mute;
  el.loop = !!props.loop;
  const style = el.style;
  style.position = "absolute";
  style.left = `${props.x * vw}px`;
  style.top = `${props.y * vh}px`;
  style.width = `${props.w * vw}px`;
  style.height = `${props.h * vh}px`;
  style.opacity = String(props.opacity);
  style.objectFit = "cover";
  return { dom: el, audio: { ref: el, volume: props.mute ? 0 : 1 } };
}
