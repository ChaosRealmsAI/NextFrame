// scenes/9x16/sv-interview/text-speakerLabel.js
//
// 说话人标签 - 当前说话嘉宾名 + 身份，位于字幕区上方

export default {
  // ===== Identity =====
  id: "speakerLabel",
  name: "说话人标签",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "text",

  // ===== Semantics =====
  description: "字幕区上方的说话人胶囊：名字 + 身份，切到不同说话人时更新",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    访谈类视频经常两人对话，观众必须在 0.5 秒内知道"当前这句话是谁说的"。
    视频区是原片，但原片可能不带大图名字牌（尤其播客只有肖像小圆图的那种）。
    这个小胶囊放在视频区底部/字幕区上方（overlap 过渡区），避免和字幕争夺中心位置。
    左边小圆点颜色代表说话人（主持人 vs 嘉宾可以不同色，默认金色 = 嘉宾），
    名字用白色正体，身份用半透明（ink-50）——层级清晰但不抢眼。
    设计决策：不放视频区内（会挡真实人脸），放字幕区上方做"注脚式"锚点。
  `,

  when_to_use: [
    "clip slide，尤其对话切换密集时",
    "需要明确「是谁在说」的任何带人名的片段",
  ],

  when_not_to_use: [
    "只有一个人独白的片段——多余信息反而干扰",
    "金句卡——金句卡已有嘉宾署名",
  ],

  limitations: [
    "name + title 合并超 20 字会撑破胶囊宽度",
    "不带头像图（因为 assets:[] 约束）",
  ],

  inspired_by: "新闻节目底部专家嘉宾小条 + Slack 用户 tag 的样式",
  used_in: ["硅谷访谈 E01 clip 对话场景"],

  requires: [],
  pairs_well_with: ["text-bilingualSub", "content-videoArea"],
  conflicts_with: [],
  alternatives: ["chrome-sourceBar (if only one speaker)"],

  visual_weight: "light",
  z_layer: "mid",
  mood: ["informative"],

  tags: ["text", "speaker", "label", "attribution", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "single inline-flex row" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — name + title pill above subtitles" },
  ],

  // ===== Params =====
  params: {
    name: {
      type: "string",
      required: true,
      semantic: "说话人名字，如「Dario Amodei」",
    },
    title: {
      type: "string",
      default: "",
      semantic: "身份，如「Anthropic CEO」",
    },
    role: {
      type: "string",
      default: "guest",
      semantic: "speaker 角色：host (主持人) | guest (嘉宾)，影响点颜色",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const name = escapeHtml(params.name || "");
    const title = escapeHtml(params.title || "");
    const dotColor = params.role === "host" ? "#4da6ff" : "#f0a030";
    const pad = Math.round(vp.width * 0.044);
    const top = Math.round(vp.height * 0.440); // just above subtitle block
    const fs = Math.round(vp.width * 0.022); // 24 @ 1080

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${pad}px;top:${top}px;
        display:inline-flex;align-items:center;gap:${Math.round(fs * 0.4)}px;
        background:rgba(22,27,46,.85);
        border:0.5px solid rgba(232,196,122,.15);
        padding:${Math.round(fs * 0.3)}px ${Math.round(fs * 0.6)}px;
        border-radius:${Math.round(fs * 0.8)}px;
        backdrop-filter:blur(4px);
      ">
        <span style="
          width:${Math.round(fs * 0.45)}px;height:${Math.round(fs * 0.45)}px;
          border-radius:50%;
          background:${dotColor};
          flex-shrink:0;
        "></span>
        <span style="
          color:#e8edf5;
          font:600 ${fs}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
          white-space:nowrap;
        ">${name}</span>
        ${title ? `<span style="
          color:rgba(232,237,245,.5);
          font:400 ${Math.round(fs * 0.85)}px/1 system-ui,'PingFang SC',sans-serif;
          white-space:nowrap;
        ">· ${title}</span>` : ""}
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "speakerLabel",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "dot", role: "speaker-role", value: params.role || "guest" },
        { type: "text", role: "name", value: params.name },
        { type: "text", role: "title", value: params.title || "" },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.044),
        y: Math.round(vp.height * 0.440),
        w: Math.round(vp.width * 0.5),
        h: Math.round(vp.height * 0.03),
      },
    };
  },

  sample() {
    return {
      name: "Dario Amodei",
      title: "Anthropic CEO",
      role: "guest",
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
