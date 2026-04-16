// scenes/16x9/warm-editorial/bg-linenTexture.js
//
// linenTexture — 亚麻布纹理，canvas 2D 逐像素噪声模拟编织纹理

export default {
  // ===== Identity =====
  id: "linenTexture",
  name: "Linen Texture",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "warm-editorial",
  role: "bg",

  // ===== Semantics =====
  description: "亚麻布纹理底 — canvas 2D 逐像素噪声模拟编织纹理，底色 #f7f3ec + 微弱交叉线",
  duration_hint: null,

  // ===== Render type =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `和 paperGrain 是同一个需求的不同解法。paperGrain 是"纸"的颗粒感，linenTexture 是"布"的编织感 — 亚麻桌布或书封布面。实现方式：在 #f7f3ec 底色上用 mulberry32 确定性噪声逐像素画横竖交叉的极淡细线，模拟亚麻布的经纬纹理。细线颜色是 ink #2c2418 的 alpha 0.02-0.04，肉眼看是"底色有质感"但说不出是什么。为了避免完美重复的机械感，每条线的 alpha 和位置都有微小的噪声偏移。纹理是静态的（不随 t 变化）— 布不会动。但因为 frame_pure 的要求，每帧都重新计算（canvas 不缓存）。这个组件是 warm-editorial 三个底色组件之一（paperGrain / warmGlow / linenTexture），互斥使用。`,

  when_to_use: [
    "需要布面质感而不是纸面质感的底色",
    "书封、精装书、亚麻桌布氛围的场景",
    "和 paperGrain 换着用以增加同主题内的视觉变化",
  ],

  when_not_to_use: [
    "已经有 paperGrain 或 warmGlow（三者互斥）",
    "需要动态底色（这是静态纹理）",
    "4K 输出时逐像素绘制性能可能不够（1080p OK）",
  ],

  limitations: [
    "纹理是静态的，不随 t 变化",
    "逐像素绘制在 4K 下可能有帧率问题",
    "alpha 极低，720p 以下分辨率基本不可见",
  ],

  inspired_by: "精装书布面封面 + Muji 亚麻产品包装 + Apple 早期 iOS 的 linen texture（但极淡化）",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["dustMotes", "content-editorial", "content-pullQuote", "text-chapterTitle", "chrome-bookSpine"],
  conflicts_with: ["paperGrain", "warmGlow"],
  alternatives: ["paperGrain", "warmGlow"],

  // ===== Visual weight =====
  visual_weight: "light",
  z_layer: "background",
  mood: ["calm", "literary", "warm", "tactile"],

  // ===== Index =====
  tags: ["linenTexture", "bg", "canvas", "linen", "texture", "fabric", "weave", "warm-editorial", "亚麻", "布纹"],

  // ===== Engineering =====
  complexity: "medium",
  performance: { cost: "medium", notes: "逐像素 noise + 交叉线绘制；1080p ~2ms/frame" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial canvas — linen texture for editorial theme" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    intensity: {
      type: "number",
      default: 0.03,
      semantic: "纹理强度（alpha 倍率），建议 0.02-0.06",
    },
    lineSpacing: {
      type: "number",
      default: 4,
      semantic: "经纬线间距（px），建议 3-6",
    },
    seed: {
      type: "number",
      default: 31,
      semantic: "确定性种子",
    },
  },

  // ===== Animation hooks =====
  enter: null,
  exit: null,

  // ========================================
  // ===== 3 functions =====
  // ========================================

  render(ctx, _t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const intensity = num(params.intensity, 0.03);
    const spacing = clampInt(params.lineSpacing, 4, 2, 8);
    const seed = Math.floor(Number(params.seed) || 31);

    // fill base paper color: #f7f3ec
    ctx.fillStyle = "#f7f3ec";
    ctx.fillRect(0, 0, W, H);

    // --- mulberry32 PRNG ---
    let rngState = seed;
    const rng = () => {
      rngState |= 0;
      rngState = rngState + 0x6D2B79F5 | 0;
      let t = Math.imul(rngState ^ rngState >>> 15, 1 | rngState);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    // --- per-pixel grain layer (sparse sampling for performance) ---
    // Instead of every pixel, sample every 2nd pixel for speed
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;
    const grainAlpha = intensity * 255;

    // ink color components: #2c2418
    const inkR = 44, inkG = 36, inkB = 24;

    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const n = rng();
        if (n > 0.7) continue; // skip 30% for organic look

        const alpha = n * grainAlpha;
        const idx = (y * W + x) * 4;

        // blend ink color into paper at very low alpha
        const invA = 1 - alpha / 255;
        data[idx] = Math.floor(data[idx] * invA + inkR * (alpha / 255));
        data[idx + 1] = Math.floor(data[idx + 1] * invA + inkG * (alpha / 255));
        data[idx + 2] = Math.floor(data[idx + 2] * invA + inkB * (alpha / 255));
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // --- woven cross-hatch lines (horizontal + vertical) ---
    ctx.globalCompositeOperation = "multiply";

    // horizontal weft lines
    for (let y = 0; y < H; y += spacing) {
      const lineAlpha = (0.015 + rng() * 0.025) * (intensity / 0.03);
      ctx.strokeStyle = `rgba(44, 36, 24, ${lineAlpha.toFixed(4)})`;
      ctx.lineWidth = 0.5 + rng() * 0.5;
      ctx.beginPath();

      let x = 0;
      ctx.moveTo(x, y + (rng() - 0.5) * 0.8);
      while (x < W) {
        x += 12 + rng() * 8;
        const wobble = (rng() - 0.5) * 0.6;
        ctx.lineTo(x, y + wobble);
      }
      ctx.stroke();
    }

    // vertical warp lines
    for (let x = 0; x < W; x += spacing) {
      const lineAlpha = (0.012 + rng() * 0.02) * (intensity / 0.03);
      ctx.strokeStyle = `rgba(44, 36, 24, ${lineAlpha.toFixed(4)})`;
      ctx.lineWidth = 0.5 + rng() * 0.4;
      ctx.beginPath();

      let y = 0;
      ctx.moveTo(x + (rng() - 0.5) * 0.8, y);
      while (y < H) {
        y += 12 + rng() * 8;
        const wobble = (rng() - 0.5) * 0.6;
        ctx.lineTo(x + wobble, y);
      }
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";

    // --- subtle warm vignette at edges ---
    const vigGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, W * 0.2, W * 0.5, H * 0.45, W * 0.75);
    vigGrad.addColorStop(0, "rgba(247, 243, 236, 0)");
    vigGrad.addColorStop(1, "rgba(227, 221, 211, 0.15)");
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, W, H);
  },

  describe(_t, params, vp) {
    return {
      sceneId: "linenTexture",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "canvas-texture", role: "background", style: "linen-weave" },
        { type: "base-color", role: "paper", color: "#f7f3ec" },
        { type: "crosshatch", role: "weave-lines", spacing: clampInt(params.lineSpacing, 4, 2, 8) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      intensity: 0.03,
      lineSpacing: 4,
      seed: 31,
    };
  },
};

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
