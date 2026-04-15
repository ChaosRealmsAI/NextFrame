// scenes/9x16/sv-interview/content-topicCard.js
//
// 话题卡片 - 字幕下方话题说明 + 标签胶囊，告诉观众正在聊什么

export default {
  // ===== Identity =====
  id: "topicCard",
  name: "话题卡片",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "content",

  // ===== Semantics =====
  description: "字幕区下方的话题说明：话题标签（「正在聊」）+ 一句话说明 + 标签胶囊（原片来源 / 原声时长 / 嘉宾）",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    访谈精华容易碎——观众看了 30 秒还不知道主角在聊的大方向。
    话题卡是"信息上下文"的锚：一句话说明（≤40 字）+ 3 个胶囊标签（来源/嘉宾/时长）。
    标签用 mono 字体 + 浅蓝色（#7ec8e3）= 数据/引用的视觉语言。
    "正在聊" 用金色 #e8c47a 做 label，后面接半透明水平线——
    既像杂志的小标题，也像终端里的 log 前缀，信息密度高但不喧宾夺主。
    放在字幕区下方（y=1310..1570 @ 1920）是阅读顺序的尾部，不抢字幕焦点。
  `,

  when_to_use: [
    "clip slide 需要补充「这段视频的元信息」时",
    "观众需要知道来源频道、原片位置的场合",
  ],

  when_not_to_use: [
    "bridge slide — AI 讲解页用 text-goldenQuote 更合适",
    "封面 — 封面信息密度不同",
  ],

  limitations: [
    "topic 超过 40 字会被 2 行截断（防止撑爆高度）",
    "tags 最多显示 3 个，多的会被忽略",
  ],

  inspired_by: "Wikipedia 信息侧栏 + 播客 app 节目描述卡",
  used_in: ["硅谷访谈 E01 所有 clip slide"],

  requires: [],
  pairs_well_with: ["text-bilingualSub", "overlay-progressBar", "chrome-brandFooter"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "mid",
  mood: ["informative", "calm"],

  tags: ["content", "topic", "description", "tags", "metadata", "sv-interview"],

  complexity: "medium",
  performance: { cost: "low", notes: "flexbox col with N inline tag pills" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — label + desc + tag pills" },
  ],

  // ===== Params =====
  params: {
    label: {
      type: "string",
      default: "正在聊",
      semantic: "话题标签文字，默认「正在聊」",
    },
    topic: {
      type: "string",
      required: true,
      semantic: "一句话说明，≤40 字",
    },
    tags: {
      type: "array",
      default: [],
      semantic: "标签数组，最多 3 个，每个 ≤10 字，如 [\"Dwarkesh Podcast\", \"Dario Amodei\", \"原声 3:11\"]",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const label = escapeHtml(params.label || "正在聊");
    const topic = escapeHtml(params.topic || "");
    const rawTags = Array.isArray(params.tags) ? params.tags : [];
    const tags = rawTags.slice(0, 3).map((t) => escapeHtml(String(t)));
    const pad = Math.round(vp.width * 0.044);
    const top = Math.round(vp.height * 0.682); // ~1310 @ 1920
    const fsLabel = Math.round(vp.width * 0.020); // 22
    const fsTopic = Math.round(vp.width * 0.026); // 28
    const fsTag = Math.round(vp.width * 0.020);

    const tagsHtml = tags.map((t) => `
      <span style="
        flex-shrink:0;
        color:#7ec8e3;
        font:500 ${fsTag}px/1 'SF Mono','JetBrains Mono',monospace;
        background:rgba(126,200,227,.08);
        border:0.5px solid rgba(126,200,227,.18);
        padding:${Math.round(fsTag * 0.3)}px ${Math.round(fsTag * 0.6)}px;
        border-radius:4px;
        letter-spacing:.03em;
        white-space:nowrap;
      ">${t}</span>
    `).join("");

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${pad}px;right:${pad}px;top:${top}px;
        display:flex;flex-direction:column;gap:${Math.round(vp.height * 0.012)}px;
      ">
        <div style="
          display:flex;align-items:center;gap:${Math.round(fsLabel * 0.5)}px;
          color:#e8c47a;
          font:600 ${fsLabel}px/1 system-ui,'PingFang SC',sans-serif;
          letter-spacing:.1em;
        ">
          <span style="flex-shrink:0;">${label}</span>
          <span style="
            flex:1;height:0.5px;
            background:linear-gradient(90deg, rgba(232,196,122,.25), transparent);
          "></span>
        </div>
        <div style="
          color:rgba(232,237,245,.75);
          font:400 ${fsTopic}px/1.55 system-ui,'PingFang SC',sans-serif;
          max-height:${Math.round(fsTopic * 1.55 * 2)}px;
          overflow:hidden;
        ">${topic}</div>
        <div style="
          display:flex;flex-wrap:nowrap;gap:${Math.round(fsTag * 0.4)}px;
          margin-top:${Math.round(vp.height * 0.006)}px;
          overflow:hidden;
        ">${tagsHtml}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "topicCard",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "label", value: params.label || "正在聊" },
        { type: "text", role: "topic", value: params.topic },
        { type: "tags", role: "metadata", value: Array.isArray(params.tags) ? params.tags.slice(0, 3) : [] },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.044),
        y: Math.round(vp.height * 0.682),
        w: Math.round(vp.width * 0.912),
        h: Math.round(vp.height * 0.135),
      },
    };
  },

  sample() {
    return {
      label: "正在聊",
      topic: "Dario 2017 年那份内部文档：决定 AI 能多强的 7 件事。",
      tags: ["Dwarkesh Podcast", "Dario Amodei", "原声 3:11"],
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
