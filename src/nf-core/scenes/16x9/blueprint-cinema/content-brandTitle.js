// scenes/16x9/blueprint-cinema/content-brandTitle.js
// F2: NextFrame 大标题 + 副标题
export default {
  id: "brandTitle",
  name: "Brand Title",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "产品大标题居中展示，主名称橙红高亮，副标题灰蓝",
  duration_hint: 8,
  intent: "品牌标题需要绝对视觉焦点。主名称96px以上，副标题28px，颜色用--ac橙红强调品牌名，副标题用--ink2灰蓝区分层级。进场用scale+opacity，3s有光晕脉冲变化。",
  when_to_use: ["产品介绍第一帧","品牌reveal时刻"],
  when_not_to_use: ["中间过渡场景"],
  limitations: ["品牌名不超过16字"],
  inspired_by: "Apple产品发布大字幕",
  used_in: [],
  requires: [],
  pairs_well_with: ["questionHook"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "intense"],
  tags: ["brand", "title", "hero", "content", "blueprint-cinema"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure CSS text" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    brand: { type: "string", default: "NextFrame", semantic: "品牌名" },
    tagline: { type: "string", default: "JSON 进来，MP4 出去", semantic: "副标题" },
    sub: { type: "string", default: "AI 视频引擎 · 开源 · 可编程", semantic: "说明文字" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const k1 = eo(t / 0.8);
    const k2 = eo((t - 0.5) / 0.6);
    const k3 = eo((t - 1.0) / 0.6);
    const pulse = t > 3 ? 0.5 + 0.5 * Math.sin((t - 3) * 1.2) : 0;
    const glowSize = 60 + 40 * pulse;
    const brand = params.brand || "NextFrame";
    const tagline = params.tagline || "JSON 进来，MP4 出去";
    const sub = params.sub || "AI 视频引擎 · 开源 · 可编程";
    return `
      <div style="position:absolute;inset:0;background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
        <div style="opacity:${k1};transform:scale(${0.85 + 0.15*k1});">
          <div style="font:700 ${Math.round(W*0.075)}px/1.1 Inter,'PingFang SC',system-ui,sans-serif;color:#ff6b35;letter-spacing:-2px;text-shadow:0 0 ${glowSize}px rgba(255,107,53,${0.4+0.3*pulse});">${brand}</div>
        </div>
        <div style="opacity:${k2};transform:translateY(${(1-k2)*20}px);margin-top:${H*0.03}px;">
          <div style="font:600 ${Math.round(W*0.03)}px/1.2 Inter,'PingFang SC',system-ui,sans-serif;color:#f5f2e8;">${tagline}</div>
        </div>
        <div style="opacity:${k3};transform:translateY(${(1-k3)*16}px);margin-top:${H*0.02}px;">
          <div style="font:400 ${Math.round(W*0.016)}px/1.4 Inter,'PingFang SC',system-ui,sans-serif;color:#8b92a5;letter-spacing:1px;">${sub}</div>
        </div>
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "brandTitle", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "headline", role: "brand", value: params.brand || "" },
        { type: "subtitle", role: "tagline", value: params.tagline || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { brand: "NextFrame", tagline: "JSON 进来，MP4 出去", sub: "AI 视频引擎 · 开源 · 可编程" };
  },
};
