// scenes/16x9/cosmos-viridian/text-aweQuote.js
//
// aweQuote — 大字金句 serif italic + 下方出处 mono + 上下两条极细翠青辉光 + 背景星光微强化
// 用在收尾 3s 的敬畏收束

export default {
  // ===== Identity =====
  id: "aweQuote",
  name: "aweQuote",
  version: "1.0.0",

  ratio: "16:9",
  theme: "cosmos-viridian",
  role: "text",

  description: "敬畏金句 — 居中 serif italic 72px 大字 + 出处 mono 小字 + 上下翠青辉光细线 + 整体 breathe 呼吸",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `每个宇宙科普视频的收尾 3 秒必须留一句金句 — Carl Sagan "We are made of star stuff" / Feynman "I think I can safely say that nobody understands quantum mechanics" / 李淼 "宇宙的尺度让人谦卑"。这个组件专门承这个使命：serif italic 72px（不是 display 260 那么大，因为句子长），两行内显示，上下各一条翠青辉光细线从中心向两边展开（verb 1: reveal/unfold），出处 mono 小字在下方 fly-in（verb 2: fly）。整体入场后持续 scale 1.000↔1.008 极微呼吸（verb 3: breathe）— 定格感要强但不能死，死了观众就退出。辉光线用 linear-gradient(transparent → accent → transparent) 两端消融，比 solid line 仙得多。字色主白 --ink 100%，出处 --ink-50 让主次分明。情绪波形：收尾 3s 金句定格，serif italic 是这个位置的唯一选项。对标 Kurzgesagt 收尾字幕 + Veritasium 视频末尾金句 + Cosmos 系列开场闭场语。`,

  when_to_use: [
    "视频最后 3-5 秒的金句定格",
    "章节收束的诗意一句",
    "开场定调的 epigraph",
  ],

  when_not_to_use: [
    "需要多行长文本（用 body 正文代替）",
    "中间段普通叙述（金句只在情绪高点用）",
    "技术说明（用 formulaReveal / orbitDiagram）",
  ],

  limitations: [
    "quote ≤ 40 中文字符（两行内）",
    "source ≤ 20 字符",
    "入场动画 1.5s，建议 duration ≥ 3s",
  ],

  inspired_by: "Carl Sagan Cosmos 开场语 + Kurzgesagt 收尾金句 + 书籍章节扉页题词",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-voidField", "chrome-observatoryBar"],
  conflicts_with: ["aweQuote", "cosmicCounter"],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["contemplative", "awe", "hopeful", "poetic"],

  tags: ["text", "quote", "golden", "closer", "italic", "awe", "cosmos-viridian"],

  complexity: "simple",
  performance: { cost: "low", notes: "单 innerHTML + 3 个 t-driven 值（line scale + quote opacity + source y）" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for cosmos-viridian · E01 收尾金句" },
  ],

  params: {
    quote: {
      type: "string",
      required: true,
      semantic: "金句正文，serif italic，建议 ≤ 40 中文字符",
    },
    source: {
      type: "string",
      default: "",
      semantic: "出处（例 '— Carl Sagan'），mono 小字在下方",
    },
    accent: {
      type: "color",
      default: "#3ddc97",
      semantic: "上下辉光线 + 出处的翠青强调色",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const quote = String(params.quote || "");
    const source = String(params.source || "");
    const accent = params.accent || "#3ddc97";

    const W = vp.width;
    const H = vp.height;

    // 上 line reveal 0 → 0.8s（verb: reveal/unfold）
    const pLine1 = Math.min(Math.max(t / 0.8, 0), 1);
    const line1Scale = 1 - Math.pow(1 - pLine1, 3);

    // quote fly + fade 0.3 → 1.2s（verb: fly）
    const pQuote = Math.min(Math.max((t - 0.3) / 0.9, 0), 1);
    const quoteEase = 1 - Math.pow(1 - pQuote, 3);
    const quoteOpacity = quoteEase;
    const quoteY = 20 * (1 - quoteEase);

    // 下 line reveal 0.6 → 1.4s
    const pLine2 = Math.min(Math.max((t - 0.6) / 0.8, 0), 1);
    const line2Scale = 1 - Math.pow(1 - pLine2, 3);

    // source fly 1.0 → 1.6s
    const pSrc = Math.min(Math.max((t - 1.0) / 0.6, 0), 1);
    const srcEase = 1 - Math.pow(1 - pSrc, 3);
    const srcOpacity = 0.5 * srcEase;
    const srcY = 14 * (1 - srcEase);

    // 整体 breathe scale（verb: breathe），1.5s 后开始
    const breatheStart = 1.5;
    const breathe = t > breatheStart
      ? 1 + 0.008 * Math.sin((t - breatheStart) * Math.PI * 0.6)
      : 1;

    // 辉光脉冲（verb: pulse）— 上下线的亮度
    const glowPulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * Math.PI * 0.5));

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-rows: 1fr auto auto auto auto 1fr;
        align-content: center;
        justify-items: center;
        row-gap: 40px;
        padding: ${H*0.14}px ${W*0.1}px;
        transform: scale(${breathe.toFixed(4)});
        transform-origin: center;
      ">
        <div></div>

        <div style="
          width: ${W*0.4}px;
          height: 1px;
          background: linear-gradient(to right,
            transparent 0%,
            rgba(61,220,151,${(glowPulse*0.85).toFixed(3)}) 50%,
            transparent 100%);
          box-shadow: 0 0 16px rgba(61,220,151,${(glowPulse*0.35).toFixed(3)});
          transform-origin: center;
          transform: scaleX(${line1Scale.toFixed(3)});
        "></div>

        <div style="
          font: italic 400 72px/1.35 'Times New Roman', 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
          color: #eaf4f2;
          text-align: center;
          letter-spacing: -0.005em;
          max-width: ${W*0.72}px;
          opacity: ${quoteOpacity.toFixed(3)};
          transform: translateY(${quoteY.toFixed(2)}px);
        ">${escapeHtml(quote)}</div>

        <div style="
          width: ${W*0.4}px;
          height: 1px;
          background: linear-gradient(to right,
            transparent 0%,
            rgba(61,220,151,${(glowPulse*0.85).toFixed(3)}) 50%,
            transparent 100%);
          box-shadow: 0 0 16px rgba(61,220,151,${(glowPulse*0.35).toFixed(3)});
          transform-origin: center;
          transform: scaleX(${line2Scale.toFixed(3)});
        "></div>

        <div style="
          font: 500 22px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: ${accent};
          letter-spacing: 0.2em;
          text-transform: uppercase;
          opacity: ${srcOpacity.toFixed(3)};
          transform: translateY(${srcY.toFixed(2)}px);
        ">${escapeHtml(source)}</div>

        <div></div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 1.6));
    return {
      sceneId: "aweQuote",
      phase: progress < 1 ? "enter" : "breathe",
      progress,
      visible: true,
      params,
      elements: [
        { type: "line", role: "divider", position: "top" },
        { type: "quote", role: "body", value: params.quote || "", font: "serif-italic-72" },
        { type: "line", role: "divider", position: "bottom" },
        { type: "source", role: "caption", value: params.source || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      quote: "我们都是由星尘构成的 —— 宇宙正在通过我们认识它自己。",
      source: "— Carl Sagan · Cosmos",
      accent: "#3ddc97",
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
