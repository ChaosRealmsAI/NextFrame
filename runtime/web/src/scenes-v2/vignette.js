import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "vignette",
  type: "canvas",
  name: "Vignette",
  category: "Effects",
  defaultParams: {
    intensity: 0.7,
    color: "#000000",
    radius: 0.5,
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);
    return canvas;
  },

  update(canvas, localT, params) {
    const ctx = canvas.getContext("2d");
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    const intensity = clamp(toNumber(params.intensity, 0.7), 0, 1);
    const color = params.color || "#000000";
    const radiusFrac = clamp(toNumber(params.radius, 0.5), 0.1, 1);

    ctx.clearRect(0, 0, W, H);

    // Elliptical vignette: use the diagonal as the outer radius
    const diag = Math.hypot(cx, cy);
    const innerRadius = diag * radiusFrac;
    const outerRadius = diag * 1.1;

    const grad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.5, color + alphaHex(intensity * 0.4));
    grad.addColorStop(1, color + alphaHex(intensity));

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  },

  destroy(canvas) {
    canvas.remove();
  },
};

/** Convert 0..1 alpha to 2-char hex suffix */
function alphaHex(alpha) {
  const val = Math.round(clamp(alpha, 0, 1) * 255);
  return val.toString(16).padStart(2, "0");
}
