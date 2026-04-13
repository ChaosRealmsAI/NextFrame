import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "meshGrid",
  type: "canvas",
  name: "Mesh Grid",
  category: "Effects",
  defaultParams: {
    cols: 20,
    rows: 12,
    color: "#4a6fa5",
    amplitude: 8,
    frequency: 1,
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

    const cols = clamp(toNumber(params.cols, 20), 3, 60) | 0;
    const rows = clamp(toNumber(params.rows, 12), 3, 40) | 0;
    const color = params.color || "#4a6fa5";
    const amp = toNumber(params.amplitude, 8);
    const freq = toNumber(params.frequency, 1);

    ctx.clearRect(0, 0, W, H);

    const cellW = W / cols;
    const cellH = H / rows;
    const t = localT * freq * 0.5;

    // Compute displaced grid points
    const points = new Array((cols + 1) * (rows + 1));
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const bx = c * cellW;
        const by = r * cellH;
        // Displacement using sin waves for organic motion
        const dx = Math.sin(t + c * 0.4 + r * 0.3) * amp;
        const dy = Math.cos(t * 0.8 + c * 0.3 - r * 0.5) * amp;
        points[r * (cols + 1) + c] = [bx + dx, by + dy];
      }
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.6;

    // Draw horizontal lines
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const [px, py] = points[r * (cols + 1) + c];
        if (c === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Draw vertical lines
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      for (let r = 0; r <= rows; r++) {
        const [px, py] = points[r * (cols + 1) + c];
        if (r === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Draw dots at intersections
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const [px, py] = points[r * (cols + 1) + c];
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  },

  destroy(canvas) {
    canvas.remove();
  },
};
