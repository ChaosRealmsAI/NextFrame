// scenes/16x9/warm-editorial/bg-photoBlur.js
//
// photoBlur — 模糊照片底图。<img src=params.src> + CSS filter: blur(20px) + brightness(0.85) 铺满。

export default {
  id: "photoBlur",
  name: "photoBlur",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "bg",

  description: "模糊照片底图 — <img> 铺满 + blur(20px) + brightness(0.85)，为上层内容提供氛围底色",
  duration_hint: null,

  type: "media",
  frame_pure: true,
  assets: [],

  intent: `杂志排版的高级技法之一是「照片做底」— 用一张和内容相关的照片做模糊背景，让页面从「白纸」变成「有场景感的空间」。blur(20px) 把照片细节抹掉只留色调，brightness(0.85) 压暗让上层文字可读。这个组件接收一个 src 参数（照片 URL 或 base64），用 <img> 铺满 viewport，CSS object-fit: cover 保证不变形。入场是简单的 opacity 0→1 淡入 0.6s。适合配合 content-editorial 或 content-pullQuote 使用 — 底层照片给场景感，上层文字给信息。注意：照片色调应该偏暖（和 warm-editorial 主题一致），冷色照片会破坏氛围。`,

  when_to_use: [
    "需要场景感/氛围感的底图（书房、咖啡馆、城市夜景）",
    "配合 content-editorial 或 content-pullQuote 做背景",
    "章节转场时用照片暗示下一章内容",
  ],

  when_not_to_use: [
    "内容本身就是照片（用全屏 media 组件）",
    "需要清晰底图（blur 会抹掉所有细节）",
    "纯文字排版不需要照片氛围（用 bg-paperGrain）",
  ],

  limitations: [
    "src 必须是可访问的图片 URL 或 base64",
    "blur 半径固定 20px，不可自定义",
    "暗色照片 + brightness(0.85) 可能太暗，建议用中等亮度照片",
  ],

  inspired_by: "Medium 文章 hero image blur + Apple Music 专辑封面模糊背景 + Monocle 摄影专题页",
  used_in: [],

  requires: [],
  pairs_well_with: ["content-editorial", "content-pullQuote", "text-chapterTitle", "chrome-bookSpine"],
  conflicts_with: ["bg-paperGrain", "bg-warmGlow"],
  alternatives: ["bg-paperGrain"],

  visual_weight: "low",
  z_layer: "background",
  mood: ["atmospheric", "warm", "ambient"],

  tags: ["bg", "photo", "blur", "media", "background", "warm-editorial"],

  complexity: "simple",
  performance: { cost: "low", notes: "单 img 元素 + CSS filter" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · 模糊照片底图" },
  ],

  params: {
    src: {
      type: "string",
      required: true,
      semantic: "照片 URL 或 base64 data URI",
    },
    blur: {
      type: "number",
      default: 20,
      semantic: "模糊半径（px）",
    },
    brightness: {
      type: "number",
      default: 0.85,
      semantic: "亮度系数（0-1）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const src = String(params.src || "");
    const blur = Number(params.blur) || 20;
    const brightness = Number(params.brightness) || 0.85;

    const W = vp.width;
    const H = vp.height;

    // fade-in: 0 → 0.6s
    const p = Math.min(Math.max(t / 0.6, 0), 1);
    const opacity = 1 - Math.pow(1 - p, 3);

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: -${blur * 2}px;
        opacity: ${opacity.toFixed(3)};
        overflow: hidden;
      ">
        <img src="${escapeAttr(src)}" style="
          width: calc(100% + ${blur * 4}px);
          height: calc(100% + ${blur * 4}px);
          margin: -${blur * 2}px;
          object-fit: cover;
          filter: blur(${blur}px) brightness(${brightness});
        "/>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 0.6));
    return {
      sceneId: "photoBlur",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "image", role: "bg-photo", src: params.src || "", blur: params.blur || 20 },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'%3E%3Crect fill='%238b6b4a' width='1920' height='1080'/%3E%3Crect fill='%23c45a3c' x='200' y='100' width='400' height='600' rx='0'/%3E%3Crect fill='%23f7f3ec' x='800' y='200' width='600' height='400' rx='0'/%3E%3C/svg%3E",
      blur: 20,
      brightness: 0.85,
    };
  },
};

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
