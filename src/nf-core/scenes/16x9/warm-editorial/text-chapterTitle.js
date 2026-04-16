// scenes/16x9/warm-editorial/text-chapterTitle.js
//
// chapterTitle — 章节标题：serif 居中 + 上下各一条细横线（1px ink-60）。
// t-driven fadeIn。留白极重。

export default {
  id: "chapterTitle",
  name: "chapterTitle",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "text",

  description: "章节标题 — serif 56px 居中 + 上下各一条 1px ink-60 细横线，t-driven fadeIn，极重留白",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `杂志的章节页是读者翻书时最重要的「呼吸节点」— 上一章读完，翻到一张只有标题的页面，大脑自动 reset，准备接收新内容。这个组件还原那种感觉：56px Georgia serif 标题居中，上下各一条 1px 细横线（ink-60 色）做装饰边界。细横线不是分隔线 — 它是「章节感」的符号：没有这两条线，标题只是一行大字；有了它们，标题变成「第三章」。留白占屏幕 70%+ — 这是故意的，因为章节标题页的职责不是传递信息，是让观众的眼睛休息 0.5 秒。入场：上横线从中心展开（scaleX 0→1），标题淡入，下横线展开。stagger 0.2s，全部 easeOutCubic。配合 chrome-bookSpine 底部书脊栏使用效果最佳。`,

  when_to_use: [
    "章节转场（从一个主题切到另一个主题）",
    "视频开头的总标题帧",
    "需要让观众「缓一口气」的呼吸帧",
  ],

  when_not_to_use: [
    "标题附带正文（用 content-editorial）",
    "标题附带引文（用 content-pullQuote）",
    "不需要庄重感的轻量标题（直接用文字层）",
  ],

  limitations: [
    "标题 ≤ 15 个汉字（超过会换行破坏居中构图）",
    "副标题 ≤ 25 个字符",
    "只做单行标题，不支持多行",
  ],

  inspired_by: "Monocle 章节页 + 企鹅经典丛书扉页 + 纽约时报特稿章节分隔",
  used_in: [],

  requires: [],
  pairs_well_with: ["chrome-bookSpine", "bg-paperGrain", "bg-warmGlow"],
  conflicts_with: [],
  alternatives: ["content-editorial"],

  visual_weight: "medium",
  z_layer: "mid",
  mood: ["solemn", "clean", "editorial"],

  tags: ["text", "chapter", "title", "serif", "divider", "warm-editorial"],

  complexity: "simple",
  performance: { cost: "low", notes: "3 个 div + 3 个 t-driven 值" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · 章节标题" },
  ],

  params: {
    title: {
      type: "string",
      required: true,
      semantic: "章节标题（serif 56px）",
    },
    subtitle: {
      type: "string",
      default: "",
      semantic: "副标题或章节号（caption 22px）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const title = String(params.title || "");
    const subtitle = String(params.subtitle || "");

    const W = vp.width;
    const H = vp.height;

    // top rule: scaleX 0 → 1, 0 → 0.5s
    const pTop = Math.min(Math.max(t / 0.5, 0), 1);
    const topEase = 1 - Math.pow(1 - pTop, 3);
    const topScale = topEase;

    // title fade-in: 0.2 → 0.7s
    const pTitle = Math.min(Math.max((t - 0.2) / 0.5, 0), 1);
    const titleEase = 1 - Math.pow(1 - pTitle, 3);
    const titleOpacity = titleEase;

    // subtitle fade-in: 0.35 → 0.8s
    const pSub = Math.min(Math.max((t - 0.35) / 0.45, 0), 1);
    const subEase = 1 - Math.pow(1 - pSub, 3);
    const subOpacity = 0.6 * subEase;

    // bottom rule: scaleX 0 → 1, 0.4 → 0.9s
    const pBot = Math.min(Math.max((t - 0.4) / 0.5, 0), 1);
    const botEase = 1 - Math.pow(1 - pBot, 3);
    const botScale = botEase;

    const lineW = W * 0.25;
    const cx = W / 2;
    const cy = H / 2;

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
      ">
        <div style="
          width: ${lineW}px;
          height: 1px;
          background: rgba(44,36,24,.6);
          transform-origin: center;
          transform: scaleX(${topScale.toFixed(3)});
        "></div>

        <div style="
          font: 400 56px/1.3 Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif;
          color: #2c2418;
          text-align: center;
          padding: 20px 80px;
          opacity: ${titleOpacity.toFixed(3)};
        ">${escapeHtml(title)}</div>

        ${subtitle ? `
        <div style="
          font: 400 22px/1.5 'Helvetica Neue', 'PingFang SC', system-ui, sans-serif;
          color: rgba(44,36,24,.6);
          text-align: center;
          letter-spacing: 0.08em;
          opacity: ${subOpacity.toFixed(3)};
        ">${escapeHtml(subtitle)}</div>
        ` : ""}

        <div style="
          width: ${lineW}px;
          height: 1px;
          background: rgba(44,36,24,.6);
          transform-origin: center;
          transform: scaleX(${botScale.toFixed(3)});
          ${subtitle ? "" : "margin-top: 0;"}
        "></div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 0.9));
    return {
      sceneId: "chapterTitle",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "rule", role: "divider-top" },
        { type: "title", role: "heading", value: params.title || "", font: "serif-56" },
        { type: "subtitle", role: "caption", value: params.subtitle || "" },
        { type: "rule", role: "divider-bottom" },
      ],
      boundingBox: { x: vp.width * 0.15, y: vp.height * 0.3, w: vp.width * 0.7, h: vp.height * 0.4 },
    };
  },

  sample() {
    return {
      title: "第三章 · 深夜书房",
      subtitle: "Chapter III — The Midnight Library",
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
