// scenes/16x9/anthropic-warm/content-glossaryCard.js
//
// glossaryCard - 术语/概念卡：术语名（serif 大字）+ 一句话解释 + mono 源码引用行

export default {
  // ===== Identity =====
  id: "glossaryCard",
  name: "glossaryCard",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "术语卡 — serif 96px 术语名 + serif 28px 一句话解释 + mono 小字源码引用，讲每一个专有名词时用",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `Deep 类视频每引入一个专有名词（Agent Loop / DYNAMIC_BOUNDARY / Memory surfacer / system-reminder / Microcompact），都应该有一屏专门让这个词"立住"。用 serif 96px 术语名当画面锚点（跟 statBig 的大数字气质一致），下面 serif 28px 一句话解释（不是定义堆叠，是"口语翻译"），最底部 mono 小字给源码出处（prompts.ts / claude.ts）— 这一行是给 dev 观众的"我不是瞎编的"信任凭证。左侧贴一枚橙色方形 bullet 当视觉别针，避免整屏太空。`,

  when_to_use: [
    "引入一个技术术语，需要让观众『记住这个词』（Agent Loop / DYNAMIC_BOUNDARY）",
    "源码概念首次出场，需要标注出处建立可信度",
    "一段类比讲完后回到『技术名字』做收束",
  ],

  when_not_to_use: [
    "只是普通正文，不是术语（用 bodyText）",
    "需要对比两个术语（用 compareCard）",
    "术语附带 > 2 行解释（拆成多屏或换 keyPoints）",
  ],

  limitations: [
    "术语名建议 ≤ 20 字符（英文术语最佳，中文 ≤ 8 字符）",
    "subtitle ≤ 40 中文字符 / 80 英文字符",
    "source ≤ 32 字符（通常是文件名 + 行号）",
  ],

  inspired_by: "Wikipedia 词条首屏 hero + O'Reilly 技术书章节扉页",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "analogyCard", "statBig"],
  conflicts_with: [],
  alternatives: ["analogyCard"],

  // ===== Visual weight =====
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["serious", "professional"],

  // ===== Index =====
  tags: ["glossaryCard", "term", "glossary", "概念", "术语", "definition", "content", "anthropic-warm"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "4 个 DOM 元素 + 4 keyframes" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for claude-code 源码讲解 E01（Agent Loop / DYNAMIC_BOUNDARY 概念卡）" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    term: {
      type: "string",
      required: true,
      semantic: "术语名，serif 96px 主体。英文 / 中英混合最好",
    },
    subtitle: {
      type: "string",
      default: "",
      semantic: "一句话口语翻译，serif 28px",
    },
    source: {
      type: "string",
      default: "",
      semantic: "源码出处或引用，mono 小字（例：src/prompts.ts:142）",
    },
    accent: {
      type: "color",
      default: "#da7756",
      semantic: "左侧别针和 source 前缀色",
    },
  },

  // ===== Animation hooks =====
  enter: null,
  exit: null,

  // ========================================
  // ===== 3 functions =====
  // ========================================

  render(host, t, params, vp) {
    if (host._rendered && t > 1.0) return;
    host._rendered = true;

    const term = String(params.term || "");
    const subtitle = String(params.subtitle || "");
    const source = String(params.source || "");
    const accent = params.accent || "#da7756";

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <style>
        @keyframes nf-gloss-pin {
          0%   { opacity: 0; transform: scale(0.5) rotate(-20deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes nf-gloss-term {
          0%   { opacity: 0; transform: translateY(20px); letter-spacing: -0.04em; }
          100% { opacity: 1; transform: translateY(0); letter-spacing: -0.02em; }
        }
        @keyframes nf-gloss-sub {
          0%   { opacity: 0; transform: translateY(12px); }
          60%  { opacity: 0; transform: translateY(12px); }
          100% { opacity: 0.82; transform: translateY(0); }
        }
        @keyframes nf-gloss-source {
          0%   { opacity: 0; }
          75%  { opacity: 0; }
          100% { opacity: 0.55; }
        }
      </style>
      <div style="
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        padding: ${H * 0.15}px ${W * 0.1}px;
        color: #f5ece0;
      ">
        <div style="
          flex: 0 0 auto;
          width: 24px;
          height: 24px;
          background: ${accent};
          margin-right: 48px;
          align-self: flex-start;
          margin-top: 40px;
          opacity: 0;
          animation: nf-gloss-pin 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both;
        "></div>

        <div style="display: flex; flex-direction: column; gap: 32px; max-width: ${W * 0.7}px;">
          <div style="
            font: 700 96px/1.1 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: #f5ece0;
            letter-spacing: -0.02em;
            opacity: 0;
            animation: nf-gloss-term 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s both;
          ">${escapeHtml(term)}</div>

          ${subtitle ? `
          <div style="
            font: 400 32px/1.5 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: rgba(245,236,224,.82);
            max-width: ${W * 0.6}px;
            opacity: 0;
            animation: nf-gloss-sub 0.6s cubic-bezier(0.16,1,0.3,1) 0.5s both;
          ">${escapeHtml(subtitle)}</div>
          ` : ""}

          ${source ? `
          <div style="
            font: 500 20px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: rgba(245,236,224,.55);
            letter-spacing: 0.04em;
            display: flex;
            align-items: center;
            gap: 12px;
            opacity: 0;
            animation: nf-gloss-source 0.5s linear 0.8s both;
          ">
            <span style="color:${accent};">//</span>
            ${escapeHtml(source)}
          </div>
          ` : ""}
        </div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 1.3));
    return {
      sceneId: "glossaryCard",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "pin", role: "accent", value: "" },
        { type: "term", role: "headline", value: params.term || "", font: "serif-700-96" },
        ...(params.subtitle ? [{ type: "subtitle", role: "definition", value: params.subtitle }] : []),
        ...(params.source ? [{ type: "source", role: "citation", value: params.source }] : []),
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      term: "Agent Loop",
      subtitle: "像洗衣机的循环 — 拼装提示词、发给模型、执行工具、把结果塞回去、再拼装。直到模型不再调工具，循环才停。",
      source: "src/claude.ts · query() 主循环",
      accent: "#da7756",
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
