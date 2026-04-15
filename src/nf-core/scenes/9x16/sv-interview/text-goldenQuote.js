// scenes/9x16/sv-interview/text-goldenQuote.js
//
// 金句大字卡 - bridge 段落/封面金句 serif 放大显示

export default {
  // ===== Identity =====
  id: "goldenQuote",
  name: "金句大字卡",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "text",

  // ===== Semantics =====
  description: "bridge slide / 封面 / 两段之间的过渡金句：serif 斜体 + 金色 + 上下引号装饰",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    信息压缩的仪式感担当。AI 讲解中最重要的一句话（或原片最重要的一句英文金句），
    用 serif（Georgia / Noto Serif SC）把观众从"刷短视频"的焦躁节奏里拉出来停几秒。
    金色 #f0a030 是合集统一的"观点色"，和电光蓝（来源色）分工清晰。
    上下大引号（" ")是 serif 字体的自然延伸，不加任何卡片框——留白比边框更有分量。
    署名用小号白色 + 身份金色小字，放在右下角，不抢金句本身的权重。
    设计决策：不加入场动画（frame_pure 原则），进出过渡由上游 timeline fadeIn/fadeOut 控制。
  `,

  when_to_use: [
    "bridge slide 的主文字层（AI 讲解中最关键那句）",
    "两段 clip 之间的过渡金句（原片亮句的 callback）",
    "封面/片尾的核心 CTA",
  ],

  when_not_to_use: [
    "同时有 content-videoArea 的 slide——金句卡是 z=2 独立画面",
    "字幕翻译——那是 text-bilingualSub 的职责",
  ],

  limitations: [
    "quote 超过 30 个汉字会自动缩字号（72 → 54 → 40），再长必须外部拆句",
    "署名+身份合计 > 30 字符会被折到第二行",
  ],

  inspired_by: "Anthropic 官方博客的 Big Quote 排版 + Apple keynote 的 serif 金句页",
  used_in: ["硅谷访谈 E01 bridge_01 金句"],

  requires: [],
  pairs_well_with: ["bg-spaceField", "chrome-sourceBar", "chrome-brandFooter"],
  conflicts_with: ["content-videoArea", "text-bilingualSub"],
  alternatives: ["text-bilingualSub (for synchronized dialog)"],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["serious", "reflective"],

  tags: ["text", "quote", "bridge", "cover", "serif", "gold", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "static serif render; no layout measurement" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — serif italic with decorative quotes" },
  ],

  // ===== Params =====
  params: {
    quote: {
      type: "string",
      required: true,
      semantic: "金句正文，≤30 汉字最佳",
    },
    attribution: {
      type: "string",
      default: "",
      semantic: "署名，如「Dario Amodei」",
    },
    attributionTitle: {
      type: "string",
      default: "",
      semantic: "署名身份，如「Anthropic CEO」",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const quote = escapeHtml(params.quote || "");
    const attr = escapeHtml(params.attribution || "");
    const attrT = escapeHtml(params.attributionTitle || "");
    const len = (params.quote || "").length;
    // Auto-fit: >30chars → 54px, >50 → 40px, else 60px
    const fs = len > 50 ? Math.round(vp.width * 0.037)
             : len > 30 ? Math.round(vp.width * 0.050)
             : Math.round(vp.width * 0.061); // 60/54/40 @ 1080
    const fsAttr = Math.round(vp.width * 0.026);
    const pad = Math.round(vp.width * 0.083); // 96 @ 1080

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${pad}px;right:${pad}px;top:50%;
        transform:translateY(-50%);
        display:flex;flex-direction:column;gap:${Math.round(vp.height * 0.025)}px;
      ">
        <div style="
          color:#f0a030;
          font:700 ${Math.round(fs * 1.4)}px/1 Georgia, serif;
          opacity:.4;
          line-height:1;
        ">&ldquo;</div>
        <div style="
          color:#f0a030;
          font:400 italic ${fs}px/1.4 Georgia, 'Noto Serif SC', 'PingFang SC', serif;
          letter-spacing:.01em;
          text-shadow:0 2px 12px rgba(0,0,0,.5);
        ">${quote}</div>
        <div style="
          align-self:flex-end;
          color:#f0a030;
          font:700 ${Math.round(fs * 1.4)}px/1 Georgia, serif;
          opacity:.4;
          line-height:1;
        ">&rdquo;</div>
        ${attr ? `<div style="
          margin-top:${Math.round(vp.height * 0.03)}px;
          align-self:flex-end;
          text-align:right;
          font:500 ${fsAttr}px/1.4 system-ui,'PingFang SC',sans-serif;
        ">
          <div style="color:#e8edf5;">— ${attr}</div>
          ${attrT ? `<div style="color:#e8c47a;opacity:.7;font-size:${Math.round(fsAttr * 0.85)}px;margin-top:4px;">${attrT}</div>` : ""}
        </div>` : ""}
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
        { type: "text", role: "quote", value: params.quote, style: "serif-italic-gold" },
        { type: "text", role: "attribution", value: params.attribution || "" },
        { type: "text", role: "attribution-title", value: params.attributionTitle || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      quote: "指数快到头了——但圈外的人，浑然不觉。",
      attribution: "Dario Amodei",
      attributionTitle: "Anthropic CEO",
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
