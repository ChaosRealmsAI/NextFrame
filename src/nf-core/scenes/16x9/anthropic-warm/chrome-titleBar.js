// scenes/16x9/anthropic-warm/chrome-titleBar.js
//
// 顶部标题条 - 顶部 chrome：集名 + 集数标签 + 进度时间，固定在 y=0..72 安全区

export default {
  // ===== Identity =====
  id: "titleBar",
  name: "顶部标题条",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "chrome",

  // ===== Semantics =====
  description: "顶部 chrome：集名 + 集数标签 + 进度时间，固定在 y=0..72 安全区",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    视频的"抬头"——观众任何时刻截图都能知道这是哪个系列哪一集。
    左侧集名用 #f5ece0 正文色保持安静，右侧集数用 #da7756 橙色小标签突出身份感。
    高度限定在 72px（grid 规定的 chrome 顶部条区域），不侵占主内容区。
    半透明深色底条（rgba(26,21,16,.8)）让文字在任何背景上都可读，
    同时不做成硬边框——边缘柔化，保持整体沉浸感。
  `,

  when_to_use: [
    "所有内容 slide，作为固定顶部 chrome 层",
    "需要在视频截图中保留集名和集数信息时",
  ],

  when_not_to_use: [
    "封面/片头/片尾等全屏视觉 slide——顶部条会干扰大图视觉",
    "已有自定义顶部 UI 的场景",
  ],

  limitations: [
    "series 名称超过 20 个汉字会和 episode 标签重叠，需缩短",
    "无动画，仅静态展示——进度动画在 overlay-progress 组件",
  ],

  inspired_by: "Anthropic 产品品牌条 + YouTube 频道标注风格",
  used_in: ["claude-code-源码讲解 全系列"],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-footer", "overlay-progress"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "chrome",
  mood: ["informative", "calm"],

  tags: ["chrome", "title", "header", "series", "episode", "navigation"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure DOM, no paint overhead" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — series + episode label + right-side time" },
  ],

  // ===== Params =====
  params: {
    series: {
      type: "string",
      required: true,
      semantic: "系列名称，如「Claude Code 源码讲解」",
    },
    episode: {
      type: "string",
      required: true,
      semantic: "集数标签，如「E07」",
    },
    subtitle: {
      type: "string",
      default: "",
      semantic: "本集副标题，如「以终为始」，可选",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const series = escapeHtml(params.series || "");
    const episode = escapeHtml(params.episode || "");
    const subtitle = escapeHtml(params.subtitle || "");
    const h = 72;
    const pad = Math.round(vp.width * 0.05); // 96px at 1920

    host.innerHTML = `
      <div style="
        position:absolute;
        top:0;left:0;
        width:${vp.width}px;height:${h}px;
        background:rgba(26,21,16,0.80);
        backdrop-filter:blur(2px);
        display:flex;align-items:center;
        padding:0 ${pad}px;
        box-sizing:border-box;
        gap:${Math.round(vp.width * 0.012)}px;
      ">
        <!-- episode badge -->
        <span style="
          background:#da7756;
          color:#fff;
          font:700 ${Math.round(vp.width * 0.0115)}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
          padding:4px 12px;
          border-radius:4px;
          letter-spacing:0.04em;
          white-space:nowrap;
          flex-shrink:0;
        ">${episode}</span>
        <!-- series name -->
        <span style="
          color:rgba(245,236,224,0.75);
          font:400 ${Math.round(vp.width * 0.0115)}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
          white-space:nowrap;
          flex-shrink:0;
        ">${series}</span>
        ${subtitle ? `
        <!-- divider -->
        <span style="color:rgba(245,236,224,0.25);font-size:${Math.round(vp.width*0.011)}px;">·</span>
        <!-- subtitle -->
        <span style="
          color:rgba(245,236,224,0.50);
          font:400 ${Math.round(vp.width * 0.0115)}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
          white-space:nowrap;
          overflow:hidden;text-overflow:ellipsis;
        ">${subtitle}</span>` : ""}
        <!-- spacer -->
        <span style="flex:1"></span>
        <!-- brand dot -->
        <span style="
          width:8px;height:8px;
          border-radius:50%;
          background:#da7756;
          flex-shrink:0;
        "></span>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "titleBar",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "badge", role: "episode", value: params.episode },
        { type: "text", role: "series", value: params.series },
        { type: "text", role: "subtitle", value: params.subtitle || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: 72 },
    };
  },

  sample() {
    return {
      series: "Claude Code 源码讲解",
      episode: "E07",
      subtitle: "以终为始",
    };
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
