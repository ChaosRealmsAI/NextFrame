import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "spectrumFall",
  type: "canvas",
  name: "Spectrum Waterfall",
  category: "Effects",
  tags: ["spectrum", "waterfall", "frequency", "audio", "neon", "music", "visualization", ],
  description: "频谱瀑布图 — 霓虹色频率能量从顶部流向底部，形成电子音乐风格的瀑布效果",
  usage: "电子音乐可视化、音频分析场景、作为视频背景层",
  themes: ["dark", "neon"],
  params: {
    bands:      { type: "number",  default: 64,        min: 16,  max: 256,  desc: "频段数量" },
    speed:      { type: "number",  default: 1.5,       min: 0.2, max: 8,    desc: "瀑布下落速度" },
    colorStart: { type: "string",  default: "#a855f7",                      desc: "低频颜色（紫）" },
    colorMid:   { type: "string",  default: "#6ee7ff",                      desc: "中频颜色（青）" },
    colorPeak:  { type: "string",  default: "#f0abfc",                      desc: "峰值颜色（亮紫粉）" },
    beatFreq:   { type: "number",  default: 2,         min: 0.5, max: 10,   desc: "节拍频率" },
    trailAlpha: { type: "number",  default: 0.85,      min: 0.5, max: 0.99, desc: "拖尾透明度（越高残影越长）" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    // Main display canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);

    // Off-screen buffer for waterfall trail
    const buf = document.createElement("canvas");
    buf.width = canvas.width;
    buf.height = canvas.height;

    const bands = clamp(toNumber(params.bands, 64), 16, 256) | 0;
    // Pre-compute per-band random offsets for organic motion
    const offsets = new Float64Array(bands);
    const freqs   = new Float64Array(bands);
    let seed = 421;
    for (let i = 0; i < bands; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      offsets[i] = (seed / 0x7fffffff) * Math.PI * 2;
      freqs[i]   = 1.5 + (i / bands) * 3.5; // higher freq bands oscillate faster
    }
    canvas._sf = { buf, offsets, freqs };
    return canvas;
  },

  update(canvas, localT, params) {
    const { buf, offsets, freqs } = canvas._sf;
    const cw = canvas.parentElement?.clientWidth  || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
      buf.width  = cw;
      buf.height = ch;
    }
    const W = canvas.width;
    const H = canvas.height;

    const bands     = clamp(toNumber(params.bands, 64), 16, 256) | 0;
    const speed     = toNumber(params.speed, 1.5);
    const beatFreq  = toNumber(params.beatFreq, 2);
    const trail     = clamp(toNumber(params.trailAlpha, 0.85), 0.5, 0.99);
    const cStart    = params.colorStart || "#a855f7";
    const cMid      = params.colorMid   || "#6ee7ff";
    const cPeak     = params.colorPeak  || "#f0abfc";

    const t = localT * speed;
    const beat = Math.pow(Math.abs(Math.sin(localT * beatFreq * Math.PI)), 3);

    // Compute current band magnitudes
    const mags = new Float64Array(bands);
    for (let i = 0; i < bands; i++) {
      const off = offsets[i] || 0;
      const fr  = freqs[i]   || 2;
      const w1 = Math.sin(t * fr       + off) * 0.35;
      const w2 = Math.sin(t * fr * 1.7 + off * 1.3) * 0.25;
      const w3 = Math.sin(t * fr * 0.5 + off * 0.7) * 0.2;
      // Low bands get extra beat pump
      const beatBoost = beat * (1 - i / bands) * 0.2;
      mags[i] = clamp(0.4 + w1 + w2 + w3 + beatBoost, 0, 1);
    }

    // ── Step 1: scroll the buffer down by `scrollPx` pixels ──
    const scrollPx = Math.max(1, (H / 120) * speed);
    const bufCtx = buf.getContext("2d");
    // Copy buffer down
    bufCtx.globalAlpha = trail;
    bufCtx.drawImage(buf, 0, 0, W, H, 0, scrollPx, W, H);
    bufCtx.globalAlpha = 1;

    // ── Step 2: paint the new top row of spectrum ──
    const bandW = W / bands;
    for (let i = 0; i < bands; i++) {
      const mag = mags[i];
      const x   = i * bandW;

      // Color: lerp cStart→cMid based on band position, then brighten toward cPeak at peak mag
      const bandFrac = i / (bands - 1);
      const color = lerpColor3(cStart, cMid, cPeak, bandFrac, mag);

      bufCtx.fillStyle = color;
      // Row height scaled by magnitude (thicker = louder)
      const rowH = Math.max(1, scrollPx * (0.3 + mag * 1.4));
      bufCtx.fillRect(x, 0, Math.ceil(bandW), rowH);

      // Glow smear
      const glow = bufCtx.createLinearGradient(x, 0, x, rowH * 3);
      glow.addColorStop(0, color + "cc");
      glow.addColorStop(1, "transparent");
      bufCtx.fillStyle = glow;
      bufCtx.fillRect(x, 0, Math.ceil(bandW), rowH * 3);
    }

    // ── Step 3: composite buffer onto main canvas ──
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(buf, 0, 0);

    // ── Step 4: draw live top-row bar chart overlay ──
    for (let i = 0; i < bands; i++) {
      const mag  = mags[i];
      const x    = i * bandW;
      const barH = mag * H * 0.35;
      const bandFrac = i / (bands - 1);
      const color = lerpColor3(cStart, cMid, cPeak, bandFrac, mag);

      // Solid bar
      ctx.fillStyle = color;
      ctx.fillRect(x, H * 0.0, Math.ceil(bandW) - 1, barH * 0.12);

      // Bright top cap
      ctx.fillStyle = cPeak + "ee";
      ctx.fillRect(x, H * 0.0, Math.ceil(bandW) - 1, 2);
    }
  },

  destroy(canvas) {
    delete canvas._sf;
  },
};

// ── Helpers ──
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3
    ? h.split("").map(c => c + c).join("")
    : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// 3-stop color lerp: start→mid based on bandFrac, then brighten toward peak based on mag
function lerpColor3(start, mid, peak, bandFrac, mag) {
  const base = lerpColor(start, mid, bandFrac);
  // When magnitude is high, blend toward peak
  const peakBlend = Math.pow(mag, 2.5) * 0.7;
  return lerpColorStr(base, peak, peakBlend);
}

function lerpColorStr(a, b, t) {
  const parse = c => {
    if (c.startsWith("rgb(")) {
      return c.replace("rgb(","").replace(")","").split(",").map(Number);
    }
    return hexToRgb(c);
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
