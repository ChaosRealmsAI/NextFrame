// scenes/16x9/anthropic-warm/bg-warmGradient.js
//
// 暖棕渐变背景 - 主背景层：深暖棕底色 + 径向暗角 + 左上/右下柔光斑，所有 slide 的底部底色

export default {
  // ===== Identity =====
  id: "warmGradient",
  name: "暖棕渐变背景",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "bg",

  // ===== Semantics =====
  description: "主背景层：深暖棕底色 + 径向暗角 + 左上/右下柔光斑，所有 slide 的底部底色",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    anthropic-warm 主题的地基。选 #1a1510 深暖棕而非纯黑，是因为纯黑太冷、缺乏书房质感。
    径向暗角（center→corners rgba(0,0,0,.4)）防止四角视觉出血，把注意力向中心聚拢。
    左上金柔光斑 rgba(212,180,131,.04) 和右下橙柔光斑 rgba(218,119,86,.03) 给画面注入
    温度感，模拟窗边台灯漫反射——低调到几乎感觉不到，但去掉后画面会失去"暖"的气质。
    所有其他组件叠在此背景之上，不重复画这两层效果。
  `,

  when_to_use: [
    "每一张 slide 的最底层，z_layer=background",
    "需要建立 anthropic-warm 视觉基调的任何场景",
  ],

  when_not_to_use: [
    "已有自定义背景图/视频帧的场景——改用 bg-media 或直接在外层设置背景",
    "不用 anthropic-warm 主题的 ratio",
  ],

  limitations: [
    "纯静态，t 参数不驱动动画——如需动态背景需另建组件",
    "暗角强度写死 .4，无法通过 params 调节",
  ],

  inspired_by: "Anthropic 官方品牌暖橙 + 3Blue1Brown 深色教学背景",
  used_in: ["claude-code-源码讲解 E01-E07 全部 slide"],

  requires: [],
  pairs_well_with: ["chrome-titleBar", "chrome-footer", "content-keyPoints", "text-goldenQuote"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "background",
  mood: ["warm", "calm", "focused"],

  tags: ["background", "gradient", "warmth", "anthropic-warm", "base-layer"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure CSS, zero paint cost" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — deep warm brown base + vignette + dual light spots" },
  ],

  // ===== Params =====
  params: {
    vignette_opacity: {
      type: "number",
      default: 0.4,
      min: 0,
      max: 0.8,
      semantic: "四角暗角强度，0=无暗角，0.4=默认",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const vigOp = params.vignette_opacity != null ? params.vignette_opacity : 0.4;
    const w = vp.width;
    const h = vp.height;
    host.innerHTML = `
      <div style="
        position:absolute;inset:0;
        background:#1a1510;
        width:${w}px;height:${h}px;
        overflow:hidden;
      ">
        <!-- left-top warm gold spot -->
        <div style="
          position:absolute;top:0;left:0;
          width:${w * 0.55}px;height:${h * 0.55}px;
          background:radial-gradient(ellipse at 20% 20%, rgba(212,180,131,0.04) 0%, transparent 70%);
          pointer-events:none;
        "></div>
        <!-- right-bottom orange spot -->
        <div style="
          position:absolute;bottom:0;right:0;
          width:${w * 0.5}px;height:${h * 0.5}px;
          background:radial-gradient(ellipse at 80% 80%, rgba(218,119,86,0.03) 0%, transparent 70%);
          pointer-events:none;
        "></div>
        <!-- vignette -->
        <div style="
          position:absolute;inset:0;
          background:radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,${vigOp}) 100%);
          pointer-events:none;
        "></div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "warmGradient",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "background", role: "base", value: "#1a1510" },
        { type: "overlay", role: "vignette", value: `opacity ${params.vignette_opacity ?? 0.4}` },
        { type: "overlay", role: "light-spot-tl", value: "gold rgba(212,180,131,.04)" },
        { type: "overlay", role: "light-spot-br", value: "orange rgba(218,119,86,.03)" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { vignette_opacity: 0.4 };
  },
};
