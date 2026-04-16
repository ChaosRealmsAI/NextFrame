// scenes/16x9/warm-editorial/content-editorial.js
//
// Magazine-style editorial layout: large serif title + body copy + caption.
// Paper-white ground, brick-red accent, zero rounded corners, serif primary.

export default {
  id: "editorial",
  name: "杂志排版卡片",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "content",

  description: "杂志式双栏排版：左侧大 serif 标题 + 右侧 sans 正文 + 底部 caption",
  duration_hint: 6,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `
    warm-editorial 主题的信息主体组件。设计取舍：
    1. 左右双栏 5:7 比例 — Monocle 杂志经典排版，左侧大 serif 钩住视线（章节感），右侧密度正文承载内容。
    2. 标题用 80px Georgia — serif 是主题字体灵魂，字重 400（不加粗）保持纸质感阅读体验。
    3. 顶部细横线 ink-60 — 替代 border-radius 卡片边界，延续杂志"分栏线"语言。
    4. caption 22px italic serif — 图注/出处用斜体小字，和正文形成层级对比。
    5. 底色 bg2 (#ede8df) 而非纯白 — 米白基调整体呼吸感，避免刺眼。
  `,

  when_to_use: [
    "知识类视频讲解一个观点/论断的主体画面",
    "书评视频介绍一本书的章节",
    "思考类内容展示作者观点 + 背景段落",
  ],
  when_not_to_use: [
    "纯标题场景（用 text-chapterTitle 更轻）",
    "引文金句场景（用 content-pullQuote）",
    "数据图表场景（用 data-compactChart）",
  ],
  limitations: [
    "正文不超过 140 字，超过会被 ellipsis 截断",
    "标题建议中文 4-10 字，过长会换行超过预算",
  ],

  inspired_by: "Monocle magazine spread / 豆瓣读书条目页",
  used_in: [],
  requires: [],
  pairs_well_with: ["bg-warmGlow", "chrome-bookSpine"],
  conflicts_with: [],
  alternatives: ["content-pullQuote"],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["calm", "serious", "literate"],

  tags: ["editorial", "magazine", "serif", "bilingual-ok", "text-dense"],
  complexity: "medium",
  performance: "light",
  status: "stable",

  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial — magazine two-column layout" },
  ],

  params: {
    eyebrow: {
      type: "string",
      default: "ESSAY",
      semantic: "小标签（全大写英文，类别/系列名）",
    },
    title: {
      type: "string",
      required: true,
      semantic: "主标题（serif 大字）",
    },
    body: {
      type: "string",
      required: true,
      semantic: "正文段落",
    },
    caption: {
      type: "string",
      default: "",
      semantic: "底部注释（来源/日期/页码）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const eyebrow = escapeHtml(params.eyebrow || "ESSAY");
    const title = escapeHtml(params.title || "");
    const body = escapeHtml(params.body || "");
    const caption = escapeHtml(params.caption || "");

    // t-driven fade + slide enter (0 → 0.6s)
    const fadeDur = 0.6;
    const p = Math.min(Math.max(t / fadeDur, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const opacity = eased;
    const ty = (1 - eased) * 24;

    // Layout sizes at 1920×1080
    const W = vp.width;
    const H = vp.height;
    const padX = 120;
    const padY = 120;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: ${padX}px;
        top: ${padY}px;
        width: ${W - padX * 2}px;
        height: ${H - padY * 2}px;
        background: #ede8df;
        padding: 80px 96px;
        display: grid;
        grid-template-columns: 5fr 7fr;
        gap: 96px;
        color: #2c2418;
        opacity: ${opacity};
        transform: translateY(${ty}px);
        border-top: 1px solid rgba(44,36,24,.2);
        border-bottom: 1px solid rgba(44,36,24,.12);
      ">
        <div style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="
              font: 500 22px/1 'Helvetica Neue', 'PingFang SC', system-ui, sans-serif;
              letter-spacing: 0.2em;
              color: #c45a3c;
              margin-bottom: 56px;
            ">${eyebrow}</div>
            <h1 style="
              font: 400 80px/1.08 Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif;
              color: #2c2418;
              margin: 0;
              letter-spacing: -0.01em;
            ">${title}</h1>
          </div>
          <div style="
            width: 80px; height: 3px;
            background: #c45a3c;
            margin-top: 48px;
          "></div>
        </div>
        <div style="display: flex; flex-direction: column; justify-content: space-between; padding-top: 24px;">
          <p style="
            font: 400 32px/1.6 'Helvetica Neue', 'PingFang SC', system-ui, sans-serif;
            color: #2c2418;
            margin: 0;
            max-width: 60ch;
          ">${body}</p>
          ${caption ? `<div style="
            font-style: italic;
            font: italic 400 22px/1.4 Georgia, 'Noto Serif SC', serif;
            color: rgba(44,36,24,.6);
            margin-top: 48px;
            border-left: 2px solid #8b6b4a;
            padding-left: 20px;
          ">${caption}</div>` : ""}
        </div>
      </div>
    `;
  },

  describe(t, params, vp) {
    return {
      sceneId: "editorial",
      phase: t < 0.6 ? "enter" : "show",
      progress: Math.min(1, t / 0.6),
      visible: true,
      params,
      viewport: vp,
    };
  },

  sample() {
    return {
      eyebrow: "BOOK REVIEW",
      title: "纸质书\n的未来",
      body: "当 Kindle 普及十年后，精装纸书的销量反而创了新高。人们开始意识到：阅读不只是信息摄取，更是一种触觉与时间的仪式。翻页的顿挫、纸张的气味、字距的呼吸，这些是屏幕永远复刻不出的。",
      caption: "《阅读的未来》· 三联书店 · 2024 · p. 142",
    };
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
