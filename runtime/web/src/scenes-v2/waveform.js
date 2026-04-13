import { toNumber, clamp, lerp } from "../scenes-v2-shared.js";

export default {
  id: "waveform",
  type: "canvas",
  name: "Waveform",
  category: "Effects",
  defaultParams: {
    bars: 64,
    color: "#6ee7ff",
    mirrorY: true,
    beatSpeed: 2,
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);

    const barCount = clamp(toNumber(params.bars, 64), 8, 256) | 0;
    const offsets = new Float64Array(barCount);
    let seed = 197;
    for (let i = 0; i < barCount; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      offsets[i] = (seed / 0x7fffffff) * Math.PI * 2;
    }
    canvas._data = { offsets };
    return canvas;
  },

  update(canvas, localT, params) {
    const ctx = canvas.getContext("2d");
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const W = canvas.width;
    const H = canvas.height;

    const barCount = clamp(toNumber(params.bars, 64), 8, 256) | 0;
    const color = params.color || "#6ee7ff";
    const mirror = params.mirrorY !== false;
    const beatSpeed = toNumber(params.beatSpeed, 2);
    const { offsets } = canvas._data;
    const t = localT * beatSpeed;

    ctx.clearRect(0, 0, W, H);

    const gap = 2;
    const totalGap = gap * (barCount - 1);
    const barW = Math.max(1, (W * 0.7 - totalGap) / barCount);
    const startX = W * 0.15;
    const centerY = H / 2;
    const maxBarH = H * 0.35;

    for (let i = 0; i < barCount; i++) {
      const off = i < offsets.length ? offsets[i] : i;
      const w1 = Math.sin(t * 3.2 + off) * 0.35;
      const w2 = Math.sin(t * 1.8 + off * 1.4) * 0.3;
      const w3 = Math.sin(t * 5.5 + off * 0.6) * 0.2;
      const beat = Math.pow(Math.abs(Math.sin(t * Math.PI * 0.5)), 4) * 0.15;
      const raw = clamp(0.5 + w1 + w2 + w3 + beat, 0, 1);
      const barH = lerp(maxBarH * 0.05, maxBarH, raw);
      const x = startX + i * (barW + gap);

      // Glow: draw a wider transparent version behind
      const glowGrad = ctx.createLinearGradient(x, centerY - barH, x, centerY + (mirror ? barH : 0));
      glowGrad.addColorStop(0, color + "44");
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      const glowW = barW + 4;
      ctx.fillRect(x - 2, centerY - barH, glowW, barH + (mirror ? barH : 0));

      // Main bar
      const grad = ctx.createLinearGradient(x, centerY - barH, x, centerY);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + "88");
      ctx.fillStyle = grad;

      const rx = Math.min(barW / 2, 3);
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH, barW, barH, [rx, rx, 0, 0]);
      ctx.fill();

      if (mirror) {
        const mGrad = ctx.createLinearGradient(x, centerY, x, centerY + barH);
        mGrad.addColorStop(0, color + "66");
        mGrad.addColorStop(1, color + "11");
        ctx.fillStyle = mGrad;
        ctx.beginPath();
        ctx.roundRect(x, centerY, barW, barH, [0, 0, rx, rx]);
        ctx.fill();
      }
    }
  },

  destroy(canvas) { canvas._data = null; canvas.remove(); },
};
