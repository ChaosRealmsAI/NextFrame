import { clamp, toNumber, smoothstep, getStageSize } from "../scenes-v2-shared.js";

export default {
  id: "auroraGradient",
  type: "canvas",
  name: "Aurora Gradient",
  category: "Backgrounds",
  tags: ["aurora", "gradient", "background", "glow", "animated", "canvas"],
  description: "Flowing aurora gradient background with multiple radial color orbs using additive blending",

  params: {
    hueA:      { type: "number", default: 265, min: 0, max: 360,   desc: "Primary hue" },
    hueB:      { type: "number", default: 200, min: 0, max: 360,   desc: "Secondary hue" },
    hueC:      { type: "number", default: 330, min: 0, max: 360,   desc: "Tertiary hue" },
    speed:     { type: "number", default: 0.3, min: 0.05, max: 2,  desc: "Drift speed multiplier" },
    intensity: { type: "number", default: 0.8, min: 0, max: 1.5,   desc: "Color intensity" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const { width: fallbackW, height: fallbackH } = getStageSize(container);
    const W = Math.max(container.clientWidth || fallbackW, 1);
    const H = Math.max(container.clientHeight || fallbackH, 1);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    const hueA      = toNumber(params.hueA, 265);
    const hueB      = toNumber(params.hueB, 200);
    const hueC      = toNumber(params.hueC, 330);
    const speed     = toNumber(params.speed, 0.3);
    const intensity = toNumber(params.intensity, 0.8);

    const blobs = [
      { hue: hueA, phase: 0,   sx: 0.11, sy: 0.07, amp: 0.28, size: 0.55 },
      { hue: hueB, phase: 1.7, sx: 0.09, sy: 0.13, amp: 0.34, size: 0.68 },
      { hue: hueC, phase: 3.2, sx: 0.13, sy: 0.05, amp: 0.22, size: 0.42 },
      { hue: (hueA + hueB) / 2, phase: 4.9, sx: 0.07, sy: 0.11, amp: 0.3, size: 0.6 },
    ];

    return { canvas, ctx, W, H, blobs, speed, intensity };
  },

  update(els, localT, _params) {
    const { ctx, W, H, blobs, speed, intensity } = els;
    const S = Math.min(W, H);
    const t = localT * speed;
    const fadeIn = smoothstep(0, 0.6, localT);

    // Dark background
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#05050c");
    base.addColorStop(0.5, "#0a0714");
    base.addColorStop(1, "#03020a");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // Additive blending for aurora orbs
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const cx = W * (0.5 + Math.sin(t * b.sx + b.phase) * b.amp);
      const cy = H * (0.5 + Math.cos(t * b.sy + b.phase * 1.3) * b.amp * 0.7);
      const breath = 0.88 + 0.12 * Math.sin(t * 0.35 + i);
      const radius = S * b.size * breath;
      const alpha = clamp(0.45 * intensity * fadeIn, 0, 1);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `hsla(${b.hue}, 90%, 65%, ${alpha})`);
      grad.addColorStop(0.35, `hsla(${b.hue}, 85%, 55%, ${alpha * 0.55})`);
      grad.addColorStop(1, `hsla(${b.hue}, 80%, 40%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Restore and add vignette
    ctx.globalCompositeOperation = "source-over";
    const band = ctx.createLinearGradient(0, 0, 0, H);
    band.addColorStop(0, "rgba(0,0,0,0.55)");
    band.addColorStop(0.5, "rgba(0,0,0,0)");
    band.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, H);
  },

  destroy(els) {
    if (els.canvas && els.canvas.parentNode) {
      els.canvas.parentNode.removeChild(els.canvas);
    }
  },
};
