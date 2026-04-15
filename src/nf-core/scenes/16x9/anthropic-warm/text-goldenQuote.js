// scenes/16x9/anthropic-warm/text-goldenQuote.js
//
// 金句卡 - serif 大字金句 + 金色引号装饰，视频收尾或转折点的强调画面

export default {
  // ===== Identity =====
  id: "goldenQuote",
  name: "金句卡",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "text",

  // ===== Semantics =====
  description: "serif 大字金句 + 金色引号装饰，视频收尾或转折点的强调画面",
  duration_hint: 6,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    每集视频最值得截图传播的那一帧。金句需要视觉仪式感：serif 字体（Georgia 或宋体）
    比 sans 更有历史重量感；#d4b483 金色引号大号装饰（120px），用 opacity 0.3 的
    开闭双引号在文字前后浮现，不喧宾夺主但提供视觉锚点。
    文字主色仍用 #f5ece0 米白，行高 1.5 让中文长句呼吸感好。
    可选 attribution 署名用小号 Caption (22px) + gold 色，如「— Claude Code 本人」。
    整体居中布局，垂直居中于主内容区（72px 顶部 chrome 以下），留足天地白。
    设计参考：Apple keynote 金句页 + 3Blue1Brown 片尾语录。
  `,

  when_to_use: [
    "每集视频的收尾金句，情绪高点",
    "章节转折点，用一句话总结前一章节的核心洞察",
    "B 站封面图，配 thumbnail 截图用",
  ],

  when_not_to_use: [
    "内容超过 40 个汉字——字太小且不够金句感，改用 content-keyPoints",
    "需要多行对比的场合——改用 content-fourSlots",
  ],

  limitations: [
    "建议金句 ≤ 35 汉字，超过会分两行且引号装饰错位",
    "serif 字体依赖系统字体：macOS 有 Hiragino Mincho ProN，Windows 可能降级为宋体",
  ],

  inspired_by: "Apple keynote 金句页 + 3Blue1Brown 片尾语录风格",
  used_in: ["claude-code-源码讲解 E07 收尾金句 Slide 33"],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-footer"],
  conflicts_with: ["content-keyPoints（同时出现会竞争视觉焦点）"],
  alternatives: ["text-headline（无引号装饰的标题）"],

  visual_weight: "high",
  z_layer: "text",
  mood: ["inspirational", "warm", "closing"],

  tags: ["quote", "serif", "golden", "closing", "highlight", "summary", "golden-quote"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure DOM text, no images" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — serif quote + gold decorative marks + optional attribution" },
  ],

  // ===== Params =====
  params: {
    quote: {
      type: "string",
      required: true,
      semantic: "金句正文，建议 ≤ 35 汉字",
    },
    attribution: {
      type: "string",
      default: "",
      semantic: "可选署名，如「— Claude Code 本人」",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const quote = escapeHtml(params.quote || "");
    const attribution = escapeHtml(params.attribution || "");
    const w = vp.width;
    const h = vp.height;

    const quoteSize = Math.round(w * 0.0292);  // ~56px H2
    const markSize = Math.round(w * 0.0625);   // ~120px decorative
    const attrSize = Math.round(w * 0.0115);   // ~22px Caption
    const chromePad = 72; // top chrome height
    const padX = Math.round(w * 0.12);
    const availH = h - chromePad;

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${padX}px;
        top:${chromePad}px;
        width:${w - padX * 2}px;
        height:${availH}px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:${Math.round(h * 0.037)}px;
      ">
        <!-- open quote mark -->
        <div style="
          font:700 ${markSize}px/1 Georgia,'Hiragino Mincho ProN','Noto Serif SC',serif;
          color:rgba(212,180,131,0.30);
          line-height:0.6;
          align-self:flex-start;
          margin-left:${Math.round(w*-0.005)}px;
          user-select:none;
        ">"</div>

        <!-- quote text -->
        <div style="
          color:#f5ece0;
          font:700 ${quoteSize}px/1.5 Georgia,'Hiragino Mincho ProN','Noto Serif SC',serif;
          text-align:center;
          letter-spacing:0.02em;
          margin-top:${Math.round(h*-0.06)}px;
          max-width:${w - padX * 2}px;
        ">${quote}</div>

        <!-- close quote mark -->
        <div style="
          font:700 ${markSize}px/1 Georgia,'Hiragino Mincho ProN','Noto Serif SC',serif;
          color:rgba(212,180,131,0.30);
          line-height:0.6;
          align-self:flex-end;
          margin-right:${Math.round(w*-0.005)}px;
          margin-top:${Math.round(h*-0.04)}px;
          user-select:none;
        ">"</div>

        ${attribution ? `
        <!-- attribution -->
        <div style="
          color:#d4b483;
          font:400 ${attrSize}px/1.4 system-ui,-apple-system,'PingFang SC',sans-serif;
          letter-spacing:0.06em;
          margin-top:${Math.round(h*0.018)}px;
        ">${attribution}</div>` : ""}
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "goldenQuote",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "quote", value: params.quote },
        { type: "text", role: "attribution", value: params.attribution || "" },
        { type: "decoration", role: "quote-marks", value: "gold open+close" },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.12),
        y: 72,
        w: Math.round(vp.width * 0.76),
        h: vp.height - 72,
      },
    };
  },

  sample() {
    return {
      quote: "你写了 1 行，系统拼了 87 类。每一轮，重新拼一遍。",
      attribution: "— Claude Code 本人",
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
