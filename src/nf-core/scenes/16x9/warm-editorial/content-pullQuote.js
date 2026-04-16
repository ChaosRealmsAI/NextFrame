// scenes/16x9/warm-editorial/content-pullQuote.js
//
// pullQuote — 大号 serif italic 引文居中，左侧竖线 ac 色 3px。
// 下方小字来源 + 页码。留白极重。

export default {
  id: "pullQuote",
  name: "pullQuote",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "content",

  description: "大号 serif italic 引文居中 + 左侧砖红竖线 3px + 下方来源小字 + 页码。留白 40%+",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `杂志里最让人停下来的元素不是标题，是「pull quote」— 那种从正文里拎出来、放大、居中、加竖线的金句。Monocle 每期至少用 8 处。这个组件还原这个经典排版：56px Georgia italic 引文居中偏左，左边一根 3px 砖红竖线（ac #c45a3c）做视觉锚 — 竖线的存在让引文从「一段话」变成「一个被编辑选中的观点」。下方右对齐小字标注来源和页码，用 ink-60 色保持安静。留白是这个组件的命脉：引文区域只占屏幕 50% 宽度，上下各留 25%+ 空白 — 留白越多，引文的分量越重。入场：竖线从上往下 reveal（scaleY 0→1），引文淡入，来源最后淡入。全部 t-driven，禁 @keyframes。`,

  when_to_use: [
    "名人名言 / 文学金句展示",
    "从正文中拎出的核心观点",
    "需要让观众「停下来品味」的一句话",
  ],

  when_not_to_use: [
    "需要大段正文（用 content-editorial）",
    "引文超过 60 字（太长失去 pull quote 的「一眼扫完」特性）",
    "纯数据展示（用 data-compactChart）",
  ],

  limitations: [
    "引文 ≤ 60 个汉字（超过会溢出或字号太小）",
    "来源 ≤ 30 个字符",
    "页码 ≤ 10 个字符",
  ],

  inspired_by: "Monocle pull quote 排版 + 纽约客长文引言 + KINFOLK serif italic 金句",
  used_in: [],

  requires: [],
  pairs_well_with: ["icon-quoteOpen", "bg-paperGrain", "chrome-bookSpine"],
  conflicts_with: [],
  alternatives: ["content-editorial"],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["literary", "contemplative", "warm"],

  tags: ["content", "quote", "pullquote", "serif", "italic", "warm-editorial"],

  complexity: "simple",
  performance: { cost: "low", notes: "纯 innerHTML，3 个 t-driven 值" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · pull quote 引文" },
  ],

  params: {
    quote: {
      type: "string",
      required: true,
      semantic: "引文正文（serif italic 56px）",
    },
    source: {
      type: "string",
      default: "",
      semantic: "来源（作者名 / 书名 / 出处）",
    },
    page: {
      type: "string",
      default: "",
      semantic: "页码或期号（例 'p.42' 或 'Vol.3'）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const quote = String(params.quote || "");
    const source = String(params.source || "");
    const page = String(params.page || "");

    const W = vp.width;
    const H = vp.height;

    // vertical line reveal: scaleY 0 → 1, 0 → 0.5s
    const pLine = Math.min(Math.max(t / 0.5, 0), 1);
    const lineEase = 1 - Math.pow(1 - pLine, 3);
    const lineScaleY = lineEase;

    // quote fade-in: 0.2 → 0.9s
    const pQuote = Math.min(Math.max((t - 0.2) / 0.7, 0), 1);
    const quoteEase = 1 - Math.pow(1 - pQuote, 3);
    const quoteOpacity = quoteEase;
    const quoteY = 20 * (1 - quoteEase);

    // source fade-in: 0.6 → 1.1s
    const pSrc = Math.min(Math.max((t - 0.6) / 0.5, 0), 1);
    const srcEase = 1 - Math.pow(1 - pSrc, 3);
    const srcOpacity = 0.6 * srcEase;

    const contentW = W * 0.5;
    const contentX = (W - contentW) / 2;
    const contentY = H * 0.25;
    const contentH = H * 0.5;

    const sourceText = [source, page].filter(Boolean).join(" · ");

    host.innerHTML = `
      <div style="
        position: absolute;
        left: ${contentX}px;
        top: ${contentY}px;
        width: ${contentW}px;
        height: ${contentH}px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 32px;
      ">
        <div style="
          display: flex;
          gap: 28px;
          align-items: stretch;
        ">
          <div style="
            width: 3px;
            background: #c45a3c;
            flex-shrink: 0;
            transform-origin: top;
            transform: scaleY(${lineScaleY.toFixed(3)});
          "></div>

          <div style="
            font: italic 400 56px/1.45 Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif;
            color: #2c2418;
            opacity: ${quoteOpacity.toFixed(3)};
            transform: translateY(${quoteY.toFixed(2)}px);
          ">${escapeHtml(quote)}</div>
        </div>

        ${sourceText ? `
        <div style="
          text-align: right;
          font: 400 22px/1.5 'Helvetica Neue', 'PingFang SC', system-ui, sans-serif;
          color: rgba(44,36,24,.6);
          padding-right: 8px;
          opacity: ${srcOpacity.toFixed(3)};
        ">${escapeHtml(sourceText)}</div>
        ` : ""}
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 1.1));
    return {
      sceneId: "pullQuote",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "line", role: "accent-bar", color: "#c45a3c", width: 3 },
        { type: "quote", role: "text", value: params.quote || "", font: "serif-italic-56" },
        { type: "source", role: "caption", value: [params.source, params.page].filter(Boolean).join(" · ") },
      ],
      boundingBox: { x: vp.width * 0.25, y: vp.height * 0.25, w: vp.width * 0.5, h: vp.height * 0.5 },
    };
  },

  sample() {
    return {
      quote: "一个人的阅读史，就是他的精神成长史。每一本书都是一次和陌生灵魂的深夜对话。",
      source: "朱光潜《谈读书》",
      page: "p.37",
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
