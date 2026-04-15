// scenes/9x16/sv-interview/overlay-chapterMark.js
//
// 章节标记 - clip 编号/总数 + 章节标题小标签

export default {
  // ===== Identity =====
  id: "chapterMark",
  name: "章节标记",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "overlay",

  // ===== Semantics =====
  description: "视频区上方的章节标签：CLIP N/M + 章节标题（≤14 字），给每段原声片段起名",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    访谈类内容最容易被观众刷走的原因是"不知道这段在讲啥、值不值得看"。
    章节标签（如"Big Blob 7 变量"、"Scaling Law 极限"）是每段原声片段的"小标题"——
    帮观众 3 秒做决定：继续看 or 划走。
    放在视频区上方（y=268 @ 1920，紧贴 source-bar 下方）是视觉扫描的自然入口点。
    蓝色 # 前缀（JetBrains Mono）视觉上暗示"标签化 / 索引化"，和金句的仪式感区分开。
    CLIP N/M 用 mono 字体 + 金色，是进度条的语义补充——进度条给感性进度，标签给理性段数。
  `,

  when_to_use: [
    "每个 clip slide 开头——告诉观众「这一段讲什么」",
    "需要目录/索引感的内容段落",
  ],

  when_not_to_use: [
    "bridge slide（AI 讲解）——过渡段不需要章节标签",
    "单段视频——一段不用标号",
  ],

  limitations: [
    "title 超过 14 汉字会被 ellipsis",
    "总段数 > 99 时 N/M 布局可能挤（实际不会发生）",
  ],

  inspired_by: "YouTube Chapters 功能的时间轴标签 + Notion 文档 heading 左侧锚点",
  used_in: ["硅谷访谈 E01 所有 clip slide"],

  requires: [],
  pairs_well_with: ["content-videoArea", "chrome-sourceBar", "overlay-progressBar"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["informative", "focused"],

  tags: ["overlay", "chapter", "clip", "marker", "label", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "static inline flex row" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — CLIP N/M mono + title sans" },
  ],

  // ===== Params =====
  params: {
    clipNum: {
      type: "number",
      required: true,
      semantic: "当前段号，1 开始",
    },
    totalClips: {
      type: "number",
      required: true,
      semantic: "总段数",
    },
    title: {
      type: "string",
      required: true,
      semantic: "章节标题，≤14 汉字",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const num = Number(params.clipNum || 1);
    const tot = Number(params.totalClips || 1);
    const title = escapeHtml(params.title || "");
    const pad = Math.round(vp.width * 0.044);
    const top = Math.round(vp.height * 0.140); // ~268 @ 1920
    const fs = Math.round(vp.width * 0.028); // 30 @ 1080
    const fsClip = Math.round(vp.width * 0.022);

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${pad}px;right:${pad}px;top:${top}px;
        display:flex;align-items:center;gap:${Math.round(fs * 0.5)}px;
      ">
        <span style="
          color:#f0a030;
          font:700 ${fsClip}px/1 'SF Mono','JetBrains Mono',monospace;
          letter-spacing:.1em;
          flex-shrink:0;
        ">CLIP ${String(num).padStart(2, "0")}/${String(tot).padStart(2, "0")}</span>
        <span style="
          flex:1;height:0.5px;
          background:linear-gradient(90deg, rgba(232,196,122,.3), transparent);
        "></span>
        <span style="
          color:#4da6ff;
          font:500 ${fs}px/1.2 system-ui,'PingFang SC',sans-serif;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          max-width:60%;
        ">#&nbsp;${title}</span>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "chapterMark",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "clip-index", value: `${params.clipNum}/${params.totalClips}` },
        { type: "text", role: "chapter-title", value: params.title },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.044),
        y: Math.round(vp.height * 0.140),
        w: Math.round(vp.width * 0.912),
        h: Math.round(vp.width * 0.04),
      },
    };
  },

  sample() {
    return {
      clipNum: 1,
      totalClips: 3,
      title: "Big Blob 7 变量",
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
