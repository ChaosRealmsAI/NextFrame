// scenes/16x9/warm-editorial/chrome-bookSpine.js
//
// bookSpine — 底部书脊栏：bg3 底色，左侧系列名 serif italic + 中间期号 mono + 右侧页码。
// 高度 64px。

export default {
  id: "bookSpine",
  name: "bookSpine",
  version: "1.0.0",

  ratio: "16:9",
  theme: "warm-editorial",
  role: "chrome",

  description: "底部书脊栏 — bg3 底色 64px，左侧 serif italic 系列名 + 中间 mono 期号 + 右侧页码",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `书脊是纸质书最被忽略又最有辨识度的元素 — 你在书架上只看得到书脊，它决定了一本书的「身份标识」。这个组件把书脊隐喻搬到视频底部：64px 高的 bg3 (#e3ddd3) 底色栏，左侧 serif italic 系列名（「深夜书房」/「编辑部手记」），中间 mono 期号（「Vol.03 · No.12」），右侧页码。三个元素等距排列，用 ink-60 色保持安静。高度写死 64px 是因为书脊在视频里的职责是「在场但不干扰」— 太高抢画面，太矮看不清。入场：整条栏从下方 translateY(64) 滑入 + 淡入，0.4s easeOutCubic。这是最后入场的 chrome 元素，在所有内容之后出现。`,

  when_to_use: [
    "所有 warm-editorial 场景的底部装饰",
    "需要标注系列/期号/页码的连续内容",
    "需要书籍/杂志身份标识的场景",
  ],

  when_not_to_use: [
    "全屏引文（pull quote 需要完整留白，不加书脊）",
    "Hook 帧（前 3 秒不需要 chrome 干扰）",
    "竖屏比例（底部空间有限）",
  ],

  limitations: [
    "系列名 ≤ 12 个汉字",
    "期号 ≤ 16 个字符",
    "页码 ≤ 8 个字符",
    "高度固定 64px，不可自定义",
  ],

  inspired_by: "实体书书脊排版 + Monocle 底部导航栏 + 企鹅经典丛书书脊条纹",
  used_in: [],

  requires: [],
  pairs_well_with: ["content-editorial", "text-chapterTitle", "content-pullQuote"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "chrome",
  mood: ["understated", "editorial", "anchoring"],

  tags: ["chrome", "spine", "footer", "series", "page", "warm-editorial"],

  complexity: "simple",
  performance: { cost: "low", notes: "单 div，1 个 t-driven translateY + opacity" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial for warm-editorial · 底部书脊栏" },
  ],

  params: {
    series: {
      type: "string",
      default: "",
      semantic: "系列名（serif italic，例「深夜书房」）",
    },
    issue: {
      type: "string",
      default: "",
      semantic: "期号（mono，例 'Vol.03 · No.12'）",
    },
    page: {
      type: "string",
      default: "",
      semantic: "页码（mono，例 'p.07'）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const series = String(params.series || "");
    const issue = String(params.issue || "");
    const page = String(params.page || "");

    const W = vp.width;
    const H = vp.height;
    const barH = 64;

    // slide up from bottom: 0 → 0.4s
    const p = Math.min(Math.max(t / 0.4, 0), 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const barOpacity = ease;
    const barY = barH * (1 - ease);

    host.innerHTML = `
      <div style="
        position: absolute;
        left: 0;
        bottom: 0;
        width: ${W}px;
        height: ${barH}px;
        background: #e3ddd3;
        border-top: 1px solid rgba(44,36,24,.12);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 120px;
        opacity: ${barOpacity.toFixed(3)};
        transform: translateY(${barY.toFixed(2)}px);
      ">
        <div style="
          font: italic 400 20px/1 Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif;
          color: rgba(44,36,24,.6);
          letter-spacing: 0.04em;
        ">${escapeHtml(series)}</div>

        <div style="
          font: 400 18px/1 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: rgba(44,36,24,.6);
          letter-spacing: 0.1em;
        ">${escapeHtml(issue)}</div>

        <div style="
          font: 400 18px/1 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: rgba(44,36,24,.6);
          letter-spacing: 0.06em;
        ">${escapeHtml(page)}</div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 0.4));
    return {
      sceneId: "bookSpine",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "series", role: "label", value: params.series || "", font: "serif-italic-20" },
        { type: "issue", role: "label", value: params.issue || "", font: "mono-18" },
        { type: "page", role: "label", value: params.page || "", font: "mono-18" },
      ],
      boundingBox: { x: 0, y: vp.height - 64, w: vp.width, h: 64 },
    };
  },

  sample() {
    return {
      series: "深夜书房",
      issue: "Vol.03 · No.12",
      page: "p.07",
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
