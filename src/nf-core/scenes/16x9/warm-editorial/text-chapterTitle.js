// scenes/16x9/warm-editorial/text-chapterTitle.js
// Chapter title: centered serif + thin horizontal rules above/below.

export default {
  id: "chapterTitle",
  name: "章节标题",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "text",
  description: "章节标题：serif 居中 + 上下各一条 1px ink-60 细横线 + 小号罗马数字章节号",
  duration_hint: 3,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `
    warm-editorial 主题的章节过渡组件。设计取舍：
    1. 罗马数字 章节号 — 比阿拉伯数字更有"书卷气"，也是 Monocle / New Yorker 经典做法。
    2. 上下细横线 — 替代卡片边界，画两条"目录线"框住标题文字，典型杂志排版。
    3. 字号 96px serif — 比 editorial 小但比正文大，章节感独立于主内容。
    4. 中英文并列（可选）— 英文斜体小字在中文标题下方，做文化互译呼应。
    5. 整体居中 + 大量上下留白 — 章节标题是"呼吸页"，不能信息拥挤。
  `,
  when_to_use: ["视频开场章节分隔", "系列视频每集开头", "讲解从一个主题切换到另一个"],
  when_not_to_use: ["主标题开场（用 display 级字号的 scene）", "短字幕（用 subtitleBar）"],
  limitations: ["标题建议 ≤ 8 字中文或 ≤ 20 字英文"],
  inspired_by: "New Yorker 章节页 / 诚品书店内页",
  used_in: [],
  requires: [],
  pairs_well_with: ["bg-paperGrain", "chrome-bookSpine"],
  conflicts_with: [],
  alternatives: ["content-editorial"],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["calm", "literate"],
  tags: ["title", "chapter", "serif", "divider"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    chapterNo: { type: "string", default: "I", semantic: "章节号（罗马数字推荐）" },
    title: { type: "string", required: true, semantic: "章节标题（中文）" },
    subtitle: { type: "string", default: "", semantic: "副标题（英文斜体）" },
  },
  enter: null,
  exit: null,
  render(host, t, params, vp) {
    const chapterNo = escapeHtml(params.chapterNo || "I");
    const title = escapeHtml(params.title || "");
    const subtitle = escapeHtml(params.subtitle || "");
    const fadeDur = 0.8;
    const p = Math.min(Math.max(t / fadeDur, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const opacity = eased;
    // line grow animation
    const lineScale = eased;
    host.innerHTML = `
      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #2c2418;
        opacity: ${opacity};
        width: 80%;
      ">
        <div style="
          height: 1px; background: rgba(44,36,24,.6);
          width: 320px; margin: 0 auto 72px;
          transform: scaleX(${lineScale}); transform-origin: center;
        "></div>
        <div style="
          font: 400 24px/1 Georgia, 'Noto Serif SC', serif;
          letter-spacing: 0.5em;
          color: #c45a3c;
          margin-bottom: 48px;
          font-variant: small-caps;
        ">CHAPTER ${chapterNo}</div>
        <h1 style="
          font: 400 96px/1.1 Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif;
          color: #2c2418;
          margin: 0;
          letter-spacing: 0.02em;
        ">${title}</h1>
        ${subtitle ? `<div style="
          margin-top: 28px;
          font: italic 400 28px/1.4 Georgia, 'Noto Serif SC', serif;
          color: rgba(44,36,24,.6);
        ">${subtitle}</div>` : ""}
        <div style="
          height: 1px; background: rgba(44,36,24,.6);
          width: 320px; margin: 72px auto 0;
          transform: scaleX(${lineScale}); transform-origin: center;
        "></div>
      </div>
    `;
  },
  describe(t, params, vp) {
    return { sceneId: "chapterTitle", phase: t < 0.8 ? "enter" : "show", progress: Math.min(1, t / 0.8), visible: true, params, viewport: vp };
  },
  sample() {
    return { chapterNo: "III", title: "阅读的仪式", subtitle: "On the Ritual of Reading" };
  },
};

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}
