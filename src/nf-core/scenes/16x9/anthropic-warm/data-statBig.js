// scenes/16x9/anthropic-warm/data-statBig.js
//
// statBig - 大数字 metric 组件，serif 200-320px 显示核心数量

export default {
  // ===== Identity =====
  id: "statBig",
  name: "statBig",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "data",

  // ===== Semantics =====
  description: "大数字 metric — serif 超大字号（200-320px）承载视频里最核心的那个数字，配单位和一行说明",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI understanding layer =====
  // ========================================

  intent: `用 serif Georgia 320px 的巨型数字做视觉锚点，左上挂 mono 小标签（kicker）交代数字在讲什么，右侧贴单位，底部一行 body 做注解。Deep 风视频里第一幕揭露性数字（比如 "87 类提示词"）必须 dominate 画面 — 字号小于 240 观众记不住。serif 比 sans 更稳、更"书房感"，配 anthropic-warm 的暖棕底不冷。橙色只用在单位或关键词上，不染主数字（主数字用米白 --ink，避免整屏失衡）。`,

  when_to_use: [
    "一屏只想让观众记住一个数字（87 类、15 维度、4 槽位、9 段出厂设置）",
    "Deep 类视频开场揭露性 reveal（'我数过了，有 87 类'）",
    "章节转场承上启下的 checkpoint（第 X 维度 / X 条系统消息）",
  ],

  when_not_to_use: [
    "需要多个数字并列对比（用 slotGrid 或 statCompare 代替）",
    "数字不是重点、只是顺带一提（用 bodyText 代替）",
    "数字 > 4 位（会溢出安全区，换 statCompact 或拆成单位）",
  ],

  limitations: [
    "主数字建议 1-3 位字符，超过 4 位会挤压右侧单位区",
    "kicker 标签 ≤ 12 中文字符，否则换行破坏节奏",
    "subtitle ≤ 24 中文字符，超过会压到底部安全线",
  ],

  inspired_by: "Apple keynote 发布会的大数字 + Anthropic 官网年度报告 hero 数字排版",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "text-goldenClose"],
  conflicts_with: ["statBig"],
  alternatives: ["glossaryCard"],

  // ===== Visual weight =====
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["serious", "intense"],

  // ===== Index =====
  tags: ["statBig", "metric", "number", "reveal", "hero", "大数字", "数据", "data", "anthropic-warm"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "单个 DOM 节点 + 一个 keyframes；无重排" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for claude-code 源码讲解 E01（87 类提示词 reveal）" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    value: {
      type: "string",
      required: true,
      semantic: "主数字，serif 超大号，建议 1-3 位字符",
    },
    unit: {
      type: "string",
      default: "",
      semantic: "单位或量词，挂在数字右下角（例：类、个、维度）",
    },
    kicker: {
      type: "string",
      default: "",
      semantic: "左上 mono 小标签，说明数字的来源或语境",
    },
    subtitle: {
      type: "string",
      default: "",
      semantic: "数字下方一行注解，body 字号",
    },
    accent: {
      type: "color",
      default: "#da7756",
      semantic: "单位和 kicker 的强调色，主数字本身不染色",
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

    const value = String(params.value || "87");
    const unit = String(params.unit || "");
    const kicker = String(params.kicker || "");
    const subtitle = String(params.subtitle || "");
    const accent = params.accent || "#da7756";

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <style>
        @keyframes nf-statBig-kicker {
          0%   { opacity: 0; transform: translateY(-8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nf-statBig-num {
          0%   { opacity: 0; transform: translateY(24px) scale(0.96); letter-spacing: -0.04em; }
          100% { opacity: 1; transform: translateY(0) scale(1); letter-spacing: -0.03em; }
        }
        @keyframes nf-statBig-unit {
          0%   { opacity: 0; transform: translateX(-12px); }
          60%  { opacity: 0; transform: translateX(-12px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes nf-statBig-sub {
          0%   { opacity: 0; transform: translateY(8px); }
          70%  { opacity: 0; transform: translateY(8px); }
          100% { opacity: 0.75; transform: translateY(0); }
        }
        @keyframes nf-statBig-rule {
          0%   { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
      </style>
      <div style="
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: 1fr;
        align-content: center;
        justify-items: center;
        gap: 32px;
        padding: ${H * 0.1}px ${W * 0.08}px;
        color: #f5ece0;
        text-align: center;
      ">
        <div style="
          font: 500 22px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: ${accent};
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0;
          animation: nf-statBig-kicker 0.6s cubic-bezier(0.16,1,0.3,1) 0.05s both;
        ">${escapeHtml(kicker)}</div>

        <div style="
          display: inline-flex;
          align-items: baseline;
          gap: 16px;
        ">
          <div style="
            font: 700 320px/0.95 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: #f5ece0;
            letter-spacing: -0.03em;
            opacity: 0;
            animation: nf-statBig-num 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s both;
          ">${escapeHtml(value)}</div>
          <div style="
            font: 600 56px/1.1 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: ${accent};
            opacity: 0;
            animation: nf-statBig-unit 0.6s cubic-bezier(0.16,1,0.3,1) 0.55s both;
          ">${escapeHtml(unit)}</div>
        </div>

        <div style="
          width: ${W * 0.08}px;
          height: 2px;
          background: ${accent};
          transform-origin: center;
          transform: scaleX(0);
          animation: nf-statBig-rule 0.5s cubic-bezier(0.16,1,0.3,1) 0.7s both;
        "></div>

        <div style="
          font: 400 28px/1.55 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
          color: rgba(245,236,224,.75);
          max-width: ${W * 0.6}px;
          opacity: 0;
          animation: nf-statBig-sub 0.6s cubic-bezier(0.16,1,0.3,1) 0.85s both;
        ">${escapeHtml(subtitle)}</div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 1.5));
    const phase = progress < 1 ? "enter" : "show";
    return {
      sceneId: "statBig",
      phase,
      progress,
      visible: true,
      params,
      elements: [
        { type: "kicker", role: "label", value: params.kicker || "" },
        { type: "number", role: "metric", value: params.value || "", font: "serif-700-320" },
        { type: "unit", role: "unit", value: params.unit || "" },
        { type: "rule", role: "divider" },
        { type: "subtitle", role: "caption", value: params.subtitle || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      kicker: "我数过了",
      value: "87",
      unit: "类",
      subtitle: "这是你对 AI 说一句话时，系统悄悄拼进去的提示词种类数。",
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
