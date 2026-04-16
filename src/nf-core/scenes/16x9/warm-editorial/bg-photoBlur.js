// scenes/16x9/warm-editorial/bg-photoBlur.js
// Blurred photo background — real URL from picsum/placeholder, heavy blur.

export default {
  id: "photoBlur",
  name: "模糊照片底图",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "bg",
  description: "真实照片铺满 + blur(20px) + brightness(0.85) + warm sepia overlay — 暖色书房氛围",
  duration_hint: null,
  type: "media",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的氛围底层。设计取舍：
    1. 真实照片打底 — 避免 AI 生成图的"机器感"，picsum.photos 随机一张真照片起步。
    2. blur(20px) 重度虚化 — 照片内容不重要，要的是色调和质感。
    3. brightness(0.85) — 稍降亮度让米白文字有对比度。
    4. 叠加 warm sepia 半透明层（#c45a3c at 0.08）— 强化主题暖色调，避免照片色偏。
    5. sample().src 必须真实可访问 URL — 用 picsum.photos/1920/1080 保证 placeholder 可见。
    6. 不随 t 变（frame_pure）— 底层稳定，不分散注意力。
  `,
  when_to_use: ["需要真实照片氛围但又不想照片抢戏", "书房/咖啡馆/图书馆场景的底图", "任何需要『暖调底』的 editorial 镜头"],
  when_not_to_use: ["需要清晰照片作为视觉主体（用原图 media）", "纯色背景足够（用 bg-warmGlow）"],
  limitations: ["依赖外部 URL，离线时需替换为本地图"],
  inspired_by: "Apple Keynote 背景虚化 / Monocle 封面软焦",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-editorial", "content-pullQuote"],
  conflicts_with: ["bg-paperGrain", "bg-warmGlow"],
  alternatives: ["bg-paperGrain", "bg-warmGlow"],
  visual_weight: "light",
  z_layer: "background",
  mood: ["calm", "literate"],
  tags: ["photo", "blur", "ambient", "warm"],
  complexity: "simple",
  performance: "medium",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    src: { type: "string", required: true, semantic: "照片 URL（必须可访问）" },
    blur: { type: "number", default: 20, semantic: "模糊半径 px" },
    brightness: { type: "number", default: 0.85, semantic: "亮度 0-1" },
  },
  enter: null,
  exit: null,
  render(host, _t, params, vp) {
    const src = params.src || "https://picsum.photos/seed/editorial/1920/1080";
    const blur = Number(params.blur) || 20;
    const brightness = Number(params.brightness) || 0.85;
    host.innerHTML = `
      <div style="position: absolute; inset: 0; overflow: hidden; background: #f7f3ec;">
        <img src="${escapeHtml(src)}" style="
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          filter: blur(${blur}px) brightness(${brightness}) saturate(0.85);
          transform: scale(1.15);
        " alt="">
        <div style="
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(196,90,60,.12) 0%, rgba(44,36,24,.04) 60%, rgba(139,107,74,.1) 100%);
          mix-blend-mode: multiply;
        "></div>
        <div style="
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(44,36,24,.15) 100%);
        "></div>
      </div>
    `;
  },
  describe(_t, params, vp) {
    return { sceneId: "photoBlur", phase: "persistent", visible: true, params, viewport: vp };
  },
  sample() {
    return {
      src: "https://picsum.photos/seed/editorial-library/1920/1080",
      blur: 24,
      brightness: 0.8,
    };
  },
};

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
