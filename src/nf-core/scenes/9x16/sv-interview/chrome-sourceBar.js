// scenes/9x16/sv-interview/chrome-sourceBar.js

export default {
  id: "sourceBar",
  name: "顶部来源条",
  version: "1.0.0",
  ratio: "9:16",
  theme: "sv-interview",
  role: "chrome",
  description: "顶部品牌条 显示节目名 + 集数 + 嘉宾",
  duration_hint: null,
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `
    sv-interview 的核心卖点是 硅谷大佬原话 所以每一秒都要让观众知道这是谁
    在哪儿说的。Top bar 用电光蓝 #4da6ff 代表来源/权威 琥珀金 #f0a030 代表
    集数标识。分工明确 视觉上一眼分出信息层级。高度 168px 是 theme.md 定的
    chrome 上限 给下面 videoArea 留足空间。
  `,
  when_to_use: ["每个 sv-interview slide 的固定顶栏"],
  when_not_to_use: ["16:9 主题不用这个"],
  limitations: ["固定高度 168px 顶部", "最多 3 段文字 超过会截断"],
  inspired_by: "Lex Fridman Podcast YouTube 顶部信息条 + Dwarkesh Podcast 署名",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-spaceField", "content-videoArea"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "light",
  z_layer: "foreground",
  mood: ["informative", "authoritative"],

  tags: ["chrome", "header", "source", "podcast", "branding"],

  complexity: "simple",
  performance: { cost: "low", notes: "纯 DOM 无动画" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版" }],

  params: {
    source: {
      type: "string",
      required: false,
      default: "Dwarkesh Podcast",
      semantic: "节目源 比如 Lex Fridman / Dwarkesh / All-In",
    },
    episode: {
      type: "string",
      default: "E01",
      semantic: "集数标识",
    },
    guest: {
      type: "string",
      default: "",
      semantic: "嘉宾名 可选",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, _vp) {
    if (host._rendered && t > 1.0) return;
    host._rendered = true;
    const source = params.source || "Dwarkesh Podcast";
    const episode = params.episode || "E01";
    const guest = params.guest || "";
    host.innerHTML = `
      <style>
        .sv-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 168px;
          padding: 56px 80px 0;
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .sv-source {
          font: 500 32px/1 system-ui, -apple-system, 'PingFang SC', sans-serif;
          color: #4da6ff;
          letter-spacing: 0.02em;
        }
        .sv-ep {
          font: 600 28px/1 'SF Mono', 'JetBrains Mono', monospace;
          color: #f0a030;
          padding: 6px 14px;
          border: 1px solid rgba(240,160,48,0.3);
          border-radius: 4px;
        }
        .sv-guest {
          font: 500 28px/1 system-ui, -apple-system, 'PingFang SC', sans-serif;
          color: rgba(245,249,255,0.6);
          margin-left: auto;
        }
      </style>
      <div class="sv-bar">
        <div class="sv-source">${escapeHtml(source)}</div>
        <div class="sv-ep">${escapeHtml(episode)}</div>
        ${guest ? `<div class="sv-guest">${escapeHtml(guest)}</div>` : ""}
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "sourceBar",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "source", value: params.source || "Dwarkesh Podcast" },
        { type: "text", role: "episode", value: params.episode || "E01" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: (168 / 1920) * vp.height },
    };
  },

  sample() {
    return { source: "Dwarkesh Podcast", episode: "E01", guest: "Dario Amodei" };
  },
};

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
