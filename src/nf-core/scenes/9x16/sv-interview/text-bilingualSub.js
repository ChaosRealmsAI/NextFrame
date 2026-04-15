// scenes/9x16/sv-interview/text-bilingualSub.js
//
// 中英双语字幕 - 中文金色主字幕 + 英文白色辅字幕，双行居中

export default {
  // ===== Identity =====
  id: "bilingualSub",
  name: "中英双语字幕",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "text",

  // ===== Semantics =====
  description: "视频下方的中英双语字幕：中文金色居中（主），英文白色次行（辅），半透明深底托",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    这是合集的核心卖点——让看不懂英文的观众秒懂硅谷大佬在说啥。
    中文必须突出（#e8c47a 金色 + 600 字重），因为主要受众读中文速度 > 听英文速度。
    英文保留原文（白色 #e8edf5 500 字重，字号略小）是为了保留"原话"的权威感——
    有些术语（GPU / scaling law / RL）中文没法完美翻译，观众看到英文原文会更信服。
    深色底托（rgba(10,14,26,.75)）是因为原始视频背景色不可控，
    不套底托字幕会在某些帧（白板/深色皮肤）看不清。
    双行居中，中文 ≤2 行，英文 ≤1 行——超长必须外部拆句，组件不自动截断。
    中文字幕必须带标点符号（句号/逗号），否则读起来像乱码（rules.md 硬规定）。
  `,

  when_to_use: [
    "clip slide 的主字幕区（说话人原声同步显示）",
    "bridge slide 需要展示原文引用时（中英对照）",
  ],

  when_not_to_use: [
    "金句卡/封面——那里用 text-goldenQuote serif 大字更有仪式感",
    "章节标题——章节用 overlay-chapterMark 小标签",
  ],

  limitations: [
    "不自动换行超长句（会撑破底托）——外部必须先拆成 ≤18 汉字/行",
    "英文 > 55 字符会被 ellipsis 截断（视觉故意，防破坏排版）",
    "frame_pure：cn/en 由外部 timeline 给定，不在组件内做分词",
  ],

  inspired_by: "TED 双语字幕 + 爱奇艺海外剧双语字幕的金+白配色",
  used_in: ["硅谷访谈 E01 所有 clip slide 字幕区"],

  requires: [],
  pairs_well_with: ["content-videoArea", "text-speakerLabel", "bg-spaceField"],
  conflicts_with: ["text-goldenQuote"],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["focused", "informative"],

  tags: ["text", "subtitle", "bilingual", "CN", "EN", "caption", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "static render per frame, no text layout measurement" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — CN gold + EN white stacked" },
  ],

  // ===== Params =====
  params: {
    cn: {
      type: "string",
      required: true,
      semantic: "中文翻译，≤45 字，已拆好行，可含 \\n",
    },
    en: {
      type: "string",
      required: true,
      semantic: "英文原文，≤55 字符，超长会 ellipsis",
    },
    emphasize: {
      type: "boolean",
      default: false,
      semantic: "true = 金句强调模式（中文加粗 + 轻微放大）",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const cn = escapeHtml(params.cn || "").replace(/\n/g, "<br>");
    const en = escapeHtml(params.en || "");
    const pad = Math.round(vp.width * 0.044);
    const top = Math.round(vp.height * 0.469); // ~900 @ 1920
    const h = Math.round(vp.height * 0.177); // ~340 @ 1920
    const cnSize = Math.round(vp.width * (params.emphasize ? 0.056 : 0.050)); // 54 or 60 @ 1080
    const enSize = Math.round(vp.width * 0.033); // 36 @ 1080
    const cnWeight = params.emphasize ? 700 : 600;

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${pad}px;right:${pad}px;top:${top}px;
        min-height:${h}px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:${Math.round(vp.height * 0.012)}px;
        padding:${Math.round(vp.height * 0.015)}px ${Math.round(vp.width * 0.028)}px;
        background:rgba(10,14,26,.75);
        border-radius:${Math.round(vp.width * 0.012)}px;
        backdrop-filter:blur(4px);
      ">
        <div style="
          color:#e8c47a;
          font:${cnWeight} ${cnSize}px/1.4 'PingFang SC','Heiti SC',sans-serif;
          text-align:center;
          letter-spacing:.02em;
          text-shadow:0 2px 6px rgba(0,0,0,.6);
          max-width:100%;
        ">${cn}</div>
        <div style="
          color:#e8edf5;
          font:500 ${enSize}px/1.3 system-ui,-apple-system,'SF Pro Text',sans-serif;
          text-align:center;
          letter-spacing:.005em;
          text-shadow:0 2px 6px rgba(0,0,0,.6);
          max-width:100%;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          opacity:.9;
        ">${en}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "bilingualSub",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "cn-subtitle", value: params.cn, lang: "zh" },
        { type: "text", role: "en-subtitle", value: params.en, lang: "en" },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.044),
        y: Math.round(vp.height * 0.469),
        w: Math.round(vp.width * 0.912),
        h: Math.round(vp.height * 0.177),
      },
    };
  },

  sample() {
    return {
      cn: "指数快到头了——但圈外的人，浑然不觉。",
      en: "The exponential is almost over — but people outside don't realize it.",
      emphasize: false,
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
