// scenes/9x16/sv-interview/chrome-sourceBar.js
//
// 来源标注条 - 顶部频道名/期数/集号条，识别来源身份

export default {
  // ===== Identity =====
  id: "sourceBar",
  name: "来源标注条",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "chrome",

  // ===== Semantics =====
  description: "顶部频道名 / 期数 / 集号 的薄条，告诉观众这段原声来自哪里",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    硅谷访谈的核心卖点是"硅谷大佬原话+中英双语"，所以每一秒都要让观众知道"这是谁说的、来源是否权威"。
    来源条放在顶部安全区（y=100..150，避开平台 UI 的 top 100px 覆盖），
    左边小蓝圆点 + 频道名（#4da6ff 电光蓝）做"直播源"的视觉暗示，
    中间细分割点，右边金色 E01 集号标签——一眼辨认出合集身份。
    不做成华丽 banner，因为字幕和视频才是主角，顶部条只做"署名"。
  `,

  when_to_use: [
    "所有 clip slide，让观众任何时刻截图都能看到原片来源",
    "bridge slide 也可用，保持身份一致",
  ],

  when_not_to_use: [
    "封面 slide——封面有专门的大排版 cover 组件，不用再加顶部条",
    "全屏金句卡——避免分散注意力",
  ],

  limitations: [
    "channel 超过 22 个字符会被截断（ellipsis）",
    "不含进度信息——进度在 overlay-progressBar 里",
  ],

  inspired_by: "CNBC / Bloomberg 新闻直播左上角频道水印 + YouTube 频道 verified badge",
  used_in: ["硅谷访谈 E01 所有 clip slide"],

  requires: [],
  pairs_well_with: ["bg-spaceField", "chrome-brandFooter", "overlay-chapterMark"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "foreground",
  mood: ["informative", "professional", "tech"],

  tags: ["chrome", "header", "source", "channel", "episode", "branding", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "single flex row, no animation" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — channel + episode badge + live dot" },
  ],

  // ===== Params =====
  params: {
    series: {
      type: "string",
      required: true,
      semantic: "系列名，如「速通硅谷访谈」",
    },
    channel: {
      type: "string",
      required: true,
      semantic: "原片来源频道，如「Dwarkesh Podcast」",
    },
    episode: {
      type: "string",
      required: true,
      semantic: "集号标签，如「E01」",
    },
    guest: {
      type: "string",
      default: "",
      semantic: "嘉宾名（可选），显示在集号后，如「Dario Amodei」",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const series = escapeHtml(params.series || "");
    const channel = escapeHtml(params.channel || "");
    const episode = escapeHtml(params.episode || "");
    const guest = escapeHtml(params.guest || "");
    const pad = Math.round(vp.width * 0.044); // 48 @ 1080
    const top = Math.round(vp.height * 0.055); // 105 @ 1920
    const fs = Math.round(vp.width * 0.022); // 24 @ 1080
    const fsEp = Math.round(vp.width * 0.024);

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${pad}px;right:${pad}px;top:${top}px;
        height:${Math.round(vp.height * 0.026)}px;
        display:flex;align-items:center;gap:${Math.round(vp.width * 0.014)}px;
        font:500 ${fs}px/1 system-ui,-apple-system,'SF Pro Text','PingFang SC',sans-serif;
      ">
        <span style="
          width:${Math.round(fs * 0.4)}px;height:${Math.round(fs * 0.4)}px;
          border-radius:50%;
          background:#4dff91;
          box-shadow:0 0 ${Math.round(fs * 0.3)}px rgba(77,255,145,.6);
          flex-shrink:0;
        "></span>
        <span style="
          color:#4da6ff;letter-spacing:.06em;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        ">${channel}</span>
        <span style="color:rgba(232,237,245,.25);">·</span>
        <span style="
          color:rgba(232,237,245,.50);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          font-family:'PingFang SC','Heiti SC',sans-serif;
        ">${series}</span>
        <span style="flex:1"></span>
        <span style="
          background:#f0a030;color:#0a0e1a;
          font-weight:700;font-size:${fsEp}px;letter-spacing:.06em;
          padding:${Math.round(fsEp * 0.2)}px ${Math.round(fsEp * 0.5)}px;
          border-radius:4px;flex-shrink:0;
        ">${episode}</span>
        ${guest ? `<span style="
          color:rgba(232,237,245,.75);
          font-family:'PingFang SC','Heiti SC',sans-serif;
          white-space:nowrap;flex-shrink:0;
        ">${guest}</span>` : ""}
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "sourceBar",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "dot", role: "live-indicator", value: "green" },
        { type: "text", role: "channel", value: params.channel },
        { type: "text", role: "series", value: params.series },
        { type: "badge", role: "episode", value: params.episode },
        { type: "text", role: "guest", value: params.guest || "" },
      ],
      boundingBox: { x: 0, y: Math.round(vp.height * 0.055), w: vp.width, h: Math.round(vp.height * 0.03) },
    };
  },

  sample() {
    return {
      series: "速通硅谷访谈",
      channel: "Dwarkesh Podcast",
      episode: "E01",
      guest: "Dario Amodei",
    };
  },
};

// Inline utility (zero import rule)
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
