// scenes/16x9/warm-editorial/chrome-bookSpine.js
// Bottom book-spine chrome: series name | issue | page number.

export default {
  id: "bookSpine",
  name: "书脊底栏",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "chrome",
  description: "底部 chrome：左侧 serif italic 系列名 + 中间 mono 期号 + 右侧 mono 页码",
  duration_hint: null,
  type: "dom",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的持久底栏。设计取舍：
    1. 贴底 80px 高度 — 不抢主内容视线，视觉重量极轻。
    2. 左中右三段布局 — 系列名（作者）/ 期号（作品）/ 页码（位置），书籍元信息全齐。
    3. bg3 底色 — 比主 bg 略深一档，形成"分界"但不是硬边框。
    4. serif italic 系列名 — 主题灵魂字体，italic 表示"作者签名感"。
    5. 顶部一条 1px 细线 — 和主内容区的边界线呼应。
    6. 持续显示（frame_pure: true, 不随 t 变）— chrome 层不闪不动。
  `,
  when_to_use: ["系列视频所有集数的通用底栏", "书评类内容的『所在书籍』元信息展示"],
  when_not_to_use: ["开场/结尾 reveal 页（chrome 应消失让主题独占）"],
  limitations: ["series 建议 ≤ 16 字，issue + page 建议各 ≤ 8 字"],
  inspired_by: "Penguin Classics 封底条 / 诚品季刊底栏",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-editorial", "text-chapterTitle"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "light",
  z_layer: "foreground",
  mood: ["calm"],
  tags: ["chrome", "footer", "book", "metadata"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    series: { type: "string", default: "深夜读书", semantic: "系列/作者名" },
    issue: { type: "string", default: "EP. 07", semantic: "期号" },
    page: { type: "string", default: "p. 142", semantic: "页码/位置标识" },
  },
  enter: null,
  exit: null,
  render(host, _t, params, vp) {
    const series = escapeHtml(params.series || "深夜读书");
    const issue = escapeHtml(params.issue || "EP. 07");
    const page = escapeHtml(params.page || "p. 142");
    host.innerHTML = `
      <div style="
        position: absolute;
        left: 0; right: 0; bottom: 0;
        height: 80px;
        background: #e3ddd3;
        border-top: 1px solid rgba(44,36,24,.2);
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        padding: 0 120px;
        color: #2c2418;
        font-variant-numeric: tabular-nums;
      ">
        <div style="
          font: italic 400 26px/1 Georgia, 'Noto Serif SC', serif;
          color: #2c2418;
          letter-spacing: 0.01em;
        ">${series}</div>
        <div style="
          font: 500 22px/1 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          letter-spacing: 0.15em;
          color: #c45a3c;
          padding: 0 48px;
        ">${issue}</div>
        <div style="
          text-align: right;
          font: 400 22px/1 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: rgba(44,36,24,.6);
          letter-spacing: 0.1em;
        ">${page}</div>
      </div>
    `;
  },
  describe(_t, params, vp) {
    return { sceneId: "bookSpine", phase: "persistent", visible: true, params, viewport: vp };
  },
  sample() {
    return { series: "深夜读书", issue: "EP. 07 · 2024", page: "p. 142 / 256" };
  },
};

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
