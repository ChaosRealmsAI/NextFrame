const round = (v) => Number(Number(v || 0).toFixed(3));
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const at = (s, d, p) => s + d * p;
const pair = (v, fb) => Array.isArray(v) ? v : [v ?? fb[0], v ?? fb[1]];
const attr = (k, v) => v === undefined || v === null || v === "" ? "" : ` ${k}="${esc(v)}"`;
const curve = (cx, cy, r, a) => [round(Math.cos(a) * r + cx), round(Math.sin(a) * r + cy)];

export const EASE = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) ** 2,
  inOut: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outElastic: t => {
    const c = 2 * Math.PI / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  },
  outBounce: t => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

export function interp(track, t) {
  if (!Array.isArray(track) || track.length === 0) return 0;
  if (t <= track[0][0]) return track[0][1];
  if (t >= track[track.length - 1][0]) return track[track.length - 1][1];
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, v0] = track[i];
    const [t1, v1, ease = "inOut"] = track[i + 1];
    if (t < t0 || t > t1) continue;
    const p = (t - t0) / (t1 - t0 || 1);
    const k = (EASE[ease] || EASE.inOut)(p);
    return Array.isArray(v0) ? v0.map((a, j) => a + ((v1[j] ?? a) - a) * k) : v0 + (v1 - v0) * k;
  }
  return track[track.length - 1][1];
}

const orbitTrack = (s, d, r, turns = 1) => {
  const steps = 8;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const a = turns * Math.PI * 2 * p - Math.PI / 2;
    out.push([at(s, d, p), curve(0, 0, r, a), i ? "linear" : undefined]);
  }
  return out;
};

const BEHAVIOR_DEFS = {
  impact: { description: "anticipation -> squash -> stretch -> settle", params: ["startAt", "duration"] },
  pulse: { description: "loop-safe breathe scale + opacity", params: ["startAt", "duration", "minScale", "maxScale"] },
  shake: { description: "rapid lateral emphasis shake", params: ["startAt", "duration", "amplitude"] },
  wobble: { description: "rotational wobble with decay", params: ["startAt", "duration", "angle"] },
  pop: { description: "scale-in overshoot then settle", params: ["startAt", "duration"] },
  orbit: { description: "offset moves in a circular orbit", params: ["startAt", "duration", "radius", "turns"] },
  swing: { description: "pendulum-like rotation", params: ["startAt", "duration", "angle"] },
  blink: { description: "visibility blink pulse", params: ["startAt", "duration"] },
  dart: { description: "fast in from offscreen with rebound", params: ["startAt", "duration", "distance"] },
  rise: { description: "fade and rise into place", params: ["startAt", "duration", "distance"] },
  drift: { description: "gentle ambient offset drift", params: ["startAt", "duration", "dx", "dy"] },
  typewriter: { description: "reveals glyph count linearly", params: ["startAt", "duration", "chars"] },
};

export const BEHAVIORS = {
  impact(s = 0, d = 1.5) {
    return {
      opacity: [[s, 0], [at(s, d, 0.08), 1, "out"]],
      scale: [[s, [0, 0]], [at(s, d, 0.2), [70, 70], "out"], [at(s, d, 0.33), [85, 55], "inOut"], [at(s, d, 0.6), [115, 130], "outBack"], [at(s, d, 0.82), [103, 97], "inOut"], [at(s, d, 0.92), [98, 102], "inOut"], [s + d, [100, 100], "out"]],
    };
  },
  pulse(s = 0, d = 2, o = {}) {
    const lo = o.minScale ?? 80;
    const hi = o.maxScale ?? 110;
    const oa = o.minOpacity ?? 0.55;
    const ob = o.maxOpacity ?? 1;
    return { scale: [[s, [lo, lo]], [at(s, d, 0.5), [hi, hi], "inOut"], [s + d, [lo, lo], "inOut"]], opacity: [[s, oa], [at(s, d, 0.5), ob, "inOut"], [s + d, oa, "inOut"]] };
  },
  shake(s = 0, d = 0.6, o = {}) {
    const a = o.amplitude ?? 18;
    return { offset: [[s, [0, 0]], [at(s, d, 0.12), [-a, 0], "out"], [at(s, d, 0.24), [a, 0], "out"], [at(s, d, 0.38), [-a * 0.7, 0], "out"], [at(s, d, 0.54), [a * 0.5, 0], "out"], [s + d, [0, 0], "out"]] };
  },
  wobble(s = 0, d = 1, o = {}) {
    const a = o.angle ?? 12;
    return { rotate: [[s, 0], [at(s, d, 0.22), a, "out"], [at(s, d, 0.45), -a * 0.85, "out"], [at(s, d, 0.7), a * 0.45, "out"], [s + d, 0, "out"]] };
  },
  pop(s = 0, d = 0.8) {
    return { opacity: [[s, 0], [at(s, d, 0.18), 1, "out"]], scale: [[s, [70, 70]], [at(s, d, 0.46), [120, 120], "outBack"], [at(s, d, 0.72), [96, 96], "inOut"], [s + d, [100, 100], "out"]] };
  },
  orbit(s = 0, d = 2, o = {}) {
    const turns = o.turns ?? 1;
    return { offset: orbitTrack(s, d, o.radius ?? 80, turns), rotate: [[s, 0], [s + d, 360 * turns, "linear"]] };
  },
  swing(s = 0, d = 1.2, o = {}) {
    const a = o.angle ?? 18;
    return { rotate: [[s, -a], [at(s, d, 0.3), a, "out"], [at(s, d, 0.58), -a * 0.55, "out"], [at(s, d, 0.8), a * 0.25, "out"], [s + d, 0, "out"]] };
  },
  blink(s = 0, d = 0.8, o = {}) {
    const on = o.maxOpacity ?? 1;
    const off = o.minOpacity ?? 0;
    return { opacity: [[s, off], [at(s, d, 0.14), on, "out"], [at(s, d, 0.42), off, "out"], [at(s, d, 0.66), on, "out"], [s + d, on, "out"]] };
  },
  dart(s = 0, d = 0.9, o = {}) {
    const dist = o.distance ?? 220;
    const ox = o.fromX ?? -dist;
    const oy = o.fromY ?? 0;
    return { opacity: [[s, 0], [at(s, d, 0.18), 1, "out"]], offset: [[s, [ox, oy]], [at(s, d, 0.72), [16, 0], "outBack"], [s + d, [0, 0], "inOut"]] };
  },
  rise(s = 0, d = 1, o = {}) {
    const dist = o.distance ?? 80;
    return { opacity: [[s, 0], [at(s, d, 0.45), 1, "out"]], offset: [[s, [0, dist]], [s + d, [0, 0], "outBack"]] };
  },
  drift(s = 0, d = 3, o = {}) {
    const dx = o.dx ?? 26;
    const dy = o.dy ?? -18;
    return { offset: [[s, [0, 0]], [at(s, d, 0.5), [dx, dy], "inOut"], [s + d, [dx * 1.5, dy * 1.5], "inOut"]], opacity: [[s, 0.86], [at(s, d, 0.5), 1, "inOut"], [s + d, 0.9, "inOut"]] };
  },
  typewriter(s = 0, d = 1, o = {}) {
    return { reveal: [[s, 0], [s + d, o.chars ?? 12, "linear"]], opacity: [[s, 1], [s + d, 1, "linear"]] };
  },
};

const paint = (l, d = {}) => {
  const fillRaw = l.fill === undefined ? d.fill : l.fill;
  const fill = fillRaw === "gradient:heart" ? "url(#nf-motion-heart)" : fillRaw;
  return `${attr("fill", fill ?? "none")}${attr("stroke", l.stroke === undefined ? d.stroke : l.stroke)}${attr("stroke-width", l.strokeWidth ?? d.strokeWidth)}${attr("stroke-linecap", l.linecap || d.linecap)}${attr("stroke-linejoin", l.linejoin || d.linejoin)}${attr("stroke-dasharray", l.dasharray)}${attr("stroke-dashoffset", l.dashoffset)}${attr("fill-opacity", l.fillOpacity)}${attr("stroke-opacity", l.strokeOpacity)}${attr("vector-effect", l.vectorEffect || d.vectorEffect)}`;
};

const SHAPE_DEFS = {
  heart: { description: "filled heart icon", render: l => `<path d="M0,-15C0,-40 -30,-55 -55,-45C-85,-30 -90,10 -60,35C-30,55 -5,65 0,75C5,65 30,55 60,35C90,10 85,-30 55,-45C30,-55 0,-40 0,-15Z"${paint(l, { fill: "url(#nf-motion-heart)" })}/>` },
  sparkle: { description: "small eight-point sparkle", render: l => `<path d="M0,-18L4,-4L18,0L4,4L0,18L-4,4L-18,0L-4,-4Z"${paint(l, { fill: "#ffffff" })}/>` },
  circle: { description: "unit circle", render: l => `<circle cx="0" cy="0" r="50"${paint(l, { fill: "#ffffff" })}/>` },
  ring: { description: "outline ring", render: l => `<circle cx="0" cy="0" r="50"${paint(l, { fill: "none", stroke: "#ffffff", strokeWidth: 4, vectorEffect: "non-scaling-stroke" })}/>` },
  star: { description: "five-point star", render: l => `<polygon points="0,-50 14,-15 48,-15 23,8 31,42 0,23 -31,42 -23,8 -48,-15 -14,-15"${paint(l, { fill: "#ffffff" })}/>` },
  arrow: { description: "directional arrow", render: l => `<path d="M-60,-16L18,-16L18,-38L70,0L18,38L18,16L-60,16Z"${paint(l, { fill: "#da7756" })}/>` },
  check: { description: "check mark", render: l => `<path d="M-44,2L-12,34L46,-30"${paint(l, { fill: "none", stroke: "#7ec699", strokeWidth: 10, linecap: "round", linejoin: "round", vectorEffect: "non-scaling-stroke" })}/>` },
  cross: { description: "cross mark", render: l => `<path d="M-34,-34L34,34M34,-34L-34,34"${paint(l, { fill: "none", stroke: "#e06c75", strokeWidth: 10, linecap: "round", vectorEffect: "non-scaling-stroke" })}/>` },
  plus: { description: "plus sign", render: l => `<path d="M0,-42V42M-42,0H42"${paint(l, { fill: "none", stroke: "#f5ece0", strokeWidth: 10, linecap: "round", vectorEffect: "non-scaling-stroke" })}/>` },
  bolt: { description: "lightning bolt", render: l => `<path d="M-8,-50L28,-12H6L18,50L-30,8H-8Z"${paint(l, { fill: "#ffb44d" })}/>` },
  drop: { description: "teardrop", render: l => `<path d="M0,-54C20,-28 36,-10 36,14C36,41 20,56 0,56C-20,56 -36,41 -36,14C-36,-10 -20,-28 0,-54Z"${paint(l, { fill: "#8ab4cc" })}/>` },
  cloud: { description: "soft cloud", render: l => `<path d="M-44,24H36C55,24 66,14 66,-2C66,-20 53,-32 36,-32C31,-50 15,-60 -4,-60C-26,-60 -44,-45 -48,-24C-66,-22 -80,-10 -80,8C-80,18 -74,24 -62,24Z"${paint(l, { fill: "#f5ece0" })}/>` },
  leaf: { description: "leaf silhouette", render: l => `<path d="M-42,18C-20,-40 18,-60 58,-54C52,-16 30,20 -18,46C2,20 14,0 22,-22C4,-2 -16,12 -42,18Z"${paint(l, { fill: "#7ec699" })}/>` },
  flame: { description: "flame glyph", render: l => `<path d="M10,-56C18,-30 -10,-18 0,2C6,-10 26,-2 26,20C26,42 10,56 -10,56C-34,56 -52,36 -52,10C-52,-10 -38,-28 -18,-42C-20,-10 0,-10 10,-56Z"${paint(l, { fill: "#ff8d54" })}/>` },
  bell: { description: "notification bell", render: l => `<path d="M0,-54C22,-54 38,-38 38,-12V12C38,22 44,32 52,38H-52C-44,32 -38,22 -38,12V-12C-38,-38 -22,-54 0,-54ZM-14,50H14C11,61 5,66 0,66C-5,66 -11,61 -14,50Z"${paint(l, { fill: "#d4b483" })}/>` },
  dot: { description: "small dot", render: l => `<circle cx="0" cy="0" r="12"${paint(l, { fill: "#ffffff" })}/>` },
  square: { description: "rounded square", render: l => `<rect x="-40" y="-40" width="80" height="80" rx="12"${paint(l, { fill: "#f5ece0" })}/>` },
  triangle: { description: "equilateral triangle", render: l => `<polygon points="0,-52 48,34 -48,34"${paint(l, { fill: "#f5ece0" })}/>` },
  hexagon: { description: "hexagon", render: l => `<polygon points="-44,0 -22,-38 22,-38 44,0 22,38 -22,38"${paint(l, { fill: "#f5ece0" })}/>` },
  path: { description: "custom SVG path from layer.path", render: l => `<path d="${esc(l.path || l.d || "M-50 0L50 0")}"${paint(l, { fill: "none", stroke: "#f5ece0", strokeWidth: 8, linecap: "round", linejoin: "round", vectorEffect: "non-scaling-stroke" })}/>` },
};

export const SHAPES = Object.fromEntries(Object.entries(SHAPE_DEFS).map(([k, v]) => [k, v.render]));

export function expandLayer(layer) {
  if (layer.type === "ripple") {
    const s = layer.startAt || 0;
    const d = layer.duration || 0.9;
    const max = ((layer.maxRadius || 200) / 50) * 100;
    return [{ type: "shape", shape: "ring", at: layer.at, stroke: layer.color || "#ff9ab8", strokeWidth: layer.strokeWidth || 4, tracks: { scale: [[s, [40, 40]], [s + d, [max, max], "out"]], opacity: [[s, 0.8], [s + d, 0, "in"]] } }];
  }
  if (layer.type === "burst") {
    const s = layer.startAt || 0;
    const d = layer.duration || 0.6;
    const n = layer.particles || 8;
    const dist = layer.distance || 180;
    const out = [];
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2;
      out.push({ type: "shape", shape: layer.shape || "sparkle", at: layer.at, size: layer.size || 18, fill: layer.color || "#ffb74d", rotate: round(i / n * 360), tracks: { offset: [[s, [0, 0]], [s + d, [round(Math.cos(ang) * dist), round(Math.sin(ang) * dist)], "out"]], scale: [[s, [0, 0]], [at(s, d, 0.3), [140, 140], "out"], [s + d, [60, 60], "inOut"]], opacity: [[s, 0], [at(s, d, 0.15), 1, "out"], [at(s, d, 0.75), 1], [s + d, 0, "in"]] } });
    }
    return out;
  }
  if (layer.behavior && BEHAVIORS[layer.behavior]) {
    const preset = BEHAVIORS[layer.behavior](layer.startAt || 0, layer.duration, layer);
    return [{ ...layer, tracks: { ...preset, ...(layer.tracks || {}) } }];
  }
  return [layer];
}

const renderLayer = (layer, t, w, h) => {
  const tracks = layer.tracks || {};
  const opacity = tracks.opacity ? interp(tracks.opacity, t) : (layer.opacity ?? 1);
  if (opacity <= 0.001) return "";
  const scaleTrack = tracks.scale ? interp(tracks.scale, t) : [100, 100];
  const sizeTrack = tracks.size ? interp(tracks.size, t) : (layer.size ?? 100);
  const size = pair(sizeTrack, [100, 100]);
  const scale = pair(scaleTrack, [100, 100]);
  const offset = pair(tracks.offset ? interp(tracks.offset, t) : layer.offset, [0, 0]);
  const rotate = tracks.rotate ? interp(tracks.rotate, t) : (layer.rotate || 0);
  const dasharray = tracks.dasharray ? interp(tracks.dasharray, t) : layer.dasharray;
  const dashoffset = tracks.dashoffset ? interp(tracks.dashoffset, t) : layer.dashoffset;
  const [cx, cy] = layer.at || [w / 2, h / 2];
  const sx = round(size[0] / 100 * scale[0] / 100);
  const sy = round(size[1] / 100 * scale[1] / 100);
  const tx = round(cx + offset[0]);
  const ty = round(cy + offset[1]);
  const shapeFn = SHAPES[layer.shape];
  if (!shapeFn) return "";
  const inner = shapeFn({ ...layer, dasharray, dashoffset });
  return `<g transform="translate(${tx} ${ty}) rotate(${round(rotate)}) scale(${sx} ${sy})" opacity="${round(opacity)}">${inner}</g>`;
};

export function renderMotion(host, t, motion) {
  const [w, h] = motion.size || [400, 400];
  const expanded = (motion.layers || []).flatMap(expandLayer);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(w)} ${round(h)}" width="100%" height="100%"><defs><linearGradient id="nf-motion-heart" x1="0" y1="-70" x2="0" y2="70" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ff5889"/><stop offset="100%" stop-color="#e62566"/></linearGradient></defs>${expanded.map(layer => renderLayer(layer, t, w, h)).join("")}</svg>`;
  if (host && typeof host === "object") {
    if ("innerHTML" in host) host.innerHTML = svg;
    if (Array.isArray(host.children)) { host.children.length = 0; host.children.push(svg); }
    host._nfMotionSvg = svg;
  }
  return svg;
}

export function listBehaviors() {
  return Object.entries(BEHAVIOR_DEFS).map(([name, meta]) => ({ name, ...meta }));
}

export function listShapes() {
  return Object.entries(SHAPE_DEFS).map(([name, meta]) => ({ name, description: meta.description }));
}
