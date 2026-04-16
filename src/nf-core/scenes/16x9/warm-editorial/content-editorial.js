// scenes/16x9/warm-editorial/content-editorial.js
//
// editorial — 杂志排版卡片。左侧大 serif 标题 + 右侧正文 + 底部图注。
// 直角边框，bg2 底色，留白极重。

export default {
  id: "editorial",
  name: "editorial",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "content",

  description: "杂志排版卡片 — 左侧 80px Georgia 大标题 + 右侧 32px sans 正文 + 底部 22px caption，bg2 底色直角边框",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `杂志排版的精髓不是"好看"，是"让眼睛知道先看哪里"。这个组件还原 Monocle / KINFOLK 式的经典双栏布局：左侧一个 80px Georgia serif 标题占据 40% 宽度，右侧 32px sans 正文占 55%，底部一行 22px caption 图注做锚。标题和正文之间不用分隔线 — 字号差本身就是分隔。bg2 (#ede8df) 底色让卡片从 bg (#f7f3ec) 主背景上浮起来，但色差极小（ΔE < 5），不抢眼。直角边框（border-radius: 0）是杂志感的硬性要求 — 圆角 = app 感 = 破坏纸质隐喻。入场动画：标题从左滑入 + 正文淡入 + 图注最后淡入，stagger 0.3s，全部 t-driven。一屏只放一个核心论点，周围 40%+ 留白。`,

  when_to_use: [
    "核心论点展示（一个标题 + 一段解释）",
    "章节主体内容（书摘 / 观点 / 分析）",
    "需要杂志排版感的信息卡片",
  ],

  when_not_to_use: [
    "纯引文（用 content-pullQuote）",
    "纯标题（用 text-chapterTitle）",
    "数据密集型（用 data-compactChart）",
  ],

  limitations: [
    "标题 ≤ 12 个汉字（超过会换行破坏构图）",
    "正文 ≤ 120 个汉字（超过会溢出可视区）",
    "caption ≤ 40 个字符",
  ],

  inspired_by: "Monocle 杂志双栏排版 + KINFOLK 极简卡片 + 纽约时报特稿排版",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-photoBlur", "bg-paperGrain", "chrome-bookSpine"],
  conflicts_with: [],
  alternatives: ["content-pullQuote"],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["intellectual", "warm", "editorial"],

  tags: ["content", "editorial", "magazine", "card", "serif", "warm-editorial"],

  complexity: "simple",
  performance: { cost: "low", notes: "纯 innerHTML，3 个 t-driven opacity/transform" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · 杂志排版卡片" },
  ],

  params: {
    title: {
      type: "string",
      required: true,
      semantic: "左侧大标题（serif 80px）",
    },
    body: {
      type: "string",
      required: true,
      semantic: "右侧正文（sans 32px）",
    },
    caption: {
      type: "string",
      default: "",
      semantic: "底部图注（sans 22px）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const title = String(params.title || "");
    const body = String(params.body || "");
    const caption = String(params.caption || "");

    const W = vp.width;
    const H = vp.height;

    // title slide-in from left: 0 → 0.6s
    const pTitle = Math.min(Math.max(t / 0.6, 0), 1);
    const titleEase = 1 - Math.pow(1 - pTitle, 3);
    const titleOpacity = titleEase;
    const titleX = -40 * (1 - titleEase);

    // body fade-in: 0.3 → 0.9s
    const pBody = Math.min(Math.max((t - 0.3) / 0.6, 0), 1);
    const bodyEase = 1 - Math.pow(1 - pBody, 3);
    const bodyOpacity = bodyEase;
    const bodyY = 16 * (1 - bodyEase);

    // caption fade-in: 0.6 → 1.1s
    const pCap = Math.min(Math.max((t - 0.6) / 0.5, 0), 1);
    const capEase = 1 - Math.pow(1 - pCap, 3);
    const capOpacity = 0.6 * capEase;

    // card fade-in: 0 → 0.4s
    const pCard = Math.min(Math.max(t / 0.4, 0), 1);
    const cardOpacity = 1 - Math.pow(1 - pCard, 3);

    const pad = 120;
    const cardW = W - pad * 2;
    const cardH = H * 0.6;
    const cardY = (H - cardH) / 2;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: ${pad}px;
        top: ${cardY}px;
        width: ${cardW}px;
        height: ${cardH}px;
        background: #ede8df;
        border: 1px solid rgba(44,36,24,.12);
        border-radius: 0;
        display: grid;
        grid-template-columns: 40% 1fr;
        grid-template-rows: 1fr auto;
        padding: 60px 64px;
        gap: 0 48px;
        opacity: ${cardOpacity.toFixed(3)};
      ">
        <div style="
          grid-row: 1;
          grid-column: 1;
          font: 400 80px/1.1 Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif;
          color: #2c2418;
          align-self: start;
          opacity: ${titleOpacity.toFixed(3)};
          transform: translateX(${titleX.toFixed(2)}px);
        ">${escapeHtml(title)}</div>

        <div style="
          grid-row: 1;
          grid-column: 2;
          font: 400 32px/1.65 'Helvetica Neue', 'PingFang SC', system-ui, sans-serif;
          color: #2c2418;
          align-self: start;
          padding-top: 12px;
          opacity: ${bodyOpacity.toFixed(3)};
          transform: translateY(${bodyY.toFixed(2)}px);
        ">${escapeHtml(body)}</div>

        <div style="
          grid-row: 2;
          grid-column: 1 / -1;
          font: 400 22px/1.5 'Helvetica Neue', 'PingFang SC', system-ui, sans-serif;
          color: rgba(44,36,24,.6);
          border-top: 1px solid rgba(44,36,24,.12);
          padding-top: 20px;
          margin-top: 24px;
          opacity: ${capOpacity.toFixed(3)};
        ">${escapeHtml(caption)}</div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 1.1));
    return {
      sceneId: "editorial",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "title", role: "heading", value: params.title || "", font: "serif-80" },
        { type: "body", role: "text", value: params.body || "", font: "sans-32" },
        { type: "caption", role: "caption", value: params.caption || "", font: "sans-22" },
      ],
      boundingBox: { x: 120, y: vp.height * 0.2, w: vp.width - 240, h: vp.height * 0.6 },
    };
  },

  sample() {
    return {
      title: "阅读的黄金时代",
      body: "我们正处在一个前所未有的时代：人类积累了数千年的文字，如今只需一部手机就能触达。问题不再是「能不能读到」，而是「愿不愿意慢下来读」。深度阅读需要的不是更好的工具，而是更安静的心境。",
      caption: "出处：《慢阅读宣言》第三章 · 2024 年修订版",
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
