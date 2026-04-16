// scenes/16x9/warm-editorial/content-pullQuote.js
// Pull quote — giant serif italic centered, brick-red left bar, source below.

export default {
  id: "pullQuote",
  name: "大号引文",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "content",
  description: "大号 serif italic 引文居中，左侧 3px ac 竖线，下方 sans 来源",
  duration_hint: 5,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `
    warm-editorial 主题的"金句时刻"组件。设计取舍：
    1. 字号 96px serif italic — 引文需要「停顿感」，大字 + 斜体双重放大。
    2. 左侧 3px 砖红竖线 — 经典杂志引用标记，替代引号本身（引号易被字体搞坏）。
    3. 居中左对齐 — 文字不撑满，左边界对齐主栏，右边大量留白。
    4. 来源小字 sans 带破折号前缀 — 与引文形成正文/元信息的层级对比。
    5. 整体 bg 底色（非 bg2）— 引文是"跳出正文"的时刻，不要卡片边框。
  `,
  when_to_use: ["播到金句/反转论断时停顿", "引用文学作品/名人话语的视觉放大", "章节结尾留白反思"],
  when_not_to_use: ["超过 40 字的长段（换 content-editorial）", "引号是设计主体（用 icon-quoteOpen + editorial）"],
  limitations: ["引文建议 8-24 字中文或 20-60 字英文"],
  inspired_by: "New Yorker magazine pull-quotes / 毛姆《月亮与六便士》台译本",
  used_in: [],
  requires: [],
  pairs_well_with: ["bg-warmGlow", "icon-quoteOpen"],
  conflicts_with: ["content-editorial"],
  alternatives: ["content-editorial"],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["literate", "reflective"],
  tags: ["quote", "serif-italic", "reveal", "literary"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    quote: { type: "string", required: true, semantic: "引文正文" },
    source: { type: "string", default: "", semantic: "来源（作者 + 作品）" },
  },
  enter: null,
  exit: null,
  render(host, t, params, vp) {
    const quote = escapeHtml(params.quote || "");
    const source = escapeHtml(params.source || "");
    const fadeDur = 0.8;
    const p = Math.min(Math.max(t / fadeDur, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const opacity = eased;
    const tx = (1 - eased) * 40;
    host.innerHTML = `
      <div style="
        position: absolute;
        left: 240px;
        top: 50%;
        transform: translateY(-50%) translateX(${tx}px);
        width: 1200px;
        color: #2c2418;
        opacity: ${opacity};
        padding-left: 48px;
        border-left: 3px solid #c45a3c;
      ">
        <blockquote style="
          font: italic 400 96px/1.25 Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif;
          color: #2c2418;
          margin: 0;
          letter-spacing: -0.01em;
        ">${quote}</blockquote>
        ${source ? `<div style="
          margin-top: 56px;
          font: 500 28px/1 'Helvetica Neue', 'PingFang SC', system-ui, sans-serif;
          letter-spacing: 0.08em;
          color: #8b6b4a;
        ">— ${source}</div>` : ""}
      </div>
    `;
  },
  describe(t, params, vp) {
    return { sceneId: "pullQuote", phase: t < 0.8 ? "enter" : "show", progress: Math.min(1, t / 0.8), visible: true, params, viewport: vp };
  },
  sample() {
    return {
      quote: "真正的发现之旅\n不在于寻找新的景观，\n而在于拥有新的眼光。",
      source: "Marcel Proust",
    };
  },
};

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}
