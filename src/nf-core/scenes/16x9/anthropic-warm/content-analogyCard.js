// scenes/16x9/anthropic-warm/content-analogyCard.js
//
// analogyCard - 类比卡，左 mono 标签 + 右 serif 大字类比，关键词橙色高亮

export default {
  // ===== Identity =====
  id: "analogyCard",
  name: "analogyCard",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "类比卡 — 左侧 mono 小标签（『类比』），右侧 serif 36px 讲一个贴近生活的比喻，关键词用 Anthropic 橙高亮",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `Deep 风视频 15+ 个类比（微信/餐厅/员工手册/CSS 层叠/瑞士军刀/护士量血压）是这个组件的主战场。左侧 mono 竖标签做"我在打类比"的视觉信号（让观众心理切换频道），右侧 serif 36px 承载主文案 — serif 比 sans 更贴近"书房讲故事"的气质。关键词用 {{橙色}} 语法标记，渲染成 --ac #da7756 并加一条极细下划线，像铅笔画的重点。左右双栏 40/60 比例让"标签 → 内容"的眼动自然，不需要观众找焦点。`,

  when_to_use: [
    "讲技术概念前用日常事物打比方（微信类比 API 请求、餐厅后厨类比 prompt 拼装）",
    "维度切换时做『换个角度看』的过渡（Skill → HR 转发手册、Hook → 安检员）",
    "收尾回扣开头类比（『你没看到的是整个后厨』）",
  ],

  when_not_to_use: [
    "没有类比对象、只是普通正文（用 bodyText 或 pillTags 代替）",
    "需要并列两个类比对比（用 compareCard 代替）",
    "内容超过 2 行、信息密度太高（拆成两张 analogyCard 或换 keyPoints）",
  ],

  limitations: [
    "主文案建议 20-45 中文字符，超过 60 会压到 3 行破坏节奏",
    "关键词高亮最多 2 处，多了失去强调意义",
    "左侧标签 ≤ 4 中文字符（默认『类比』）",
  ],

  inspired_by: "3Blue1Brown 的类比教学黑板板书 + Medium 长文的 pull-quote 排版",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "statBig", "glossaryCard"],
  conflicts_with: [],
  alternatives: ["glossaryCard"],

  // ===== Visual weight =====
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["calm", "serious"],

  // ===== Index =====
  tags: ["analogyCard", "analogy", "类比", "metaphor", "content", "anthropic-warm", "serif"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "单次 innerHTML + 2 keyframes；高亮走 span 内联样式" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for claude-code 源码讲解 E01（微信/餐厅/快递包裹类比）" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    label: {
      type: "string",
      default: "类比",
      semantic: "左侧 mono 竖标签，通常就是『类比』两字",
    },
    text: {
      type: "string",
      required: true,
      semantic: "主文案，用 {{关键词}} 语法包裹需要高亮的词",
    },
    source: {
      type: "string",
      default: "",
      semantic: "可选的来源注解（例：— 源码 prompts.ts），底部小字",
    },
    accent: {
      type: "color",
      default: "#da7756",
      semantic: "关键词高亮色，默认 Anthropic 橙",
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

    const label = String(params.label || "类比");
    const raw = String(params.text || "");
    const source = String(params.source || "");
    const accent = params.accent || "#da7756";

    // {{关键词}} → 橙色 span（同时安全 escape）
    const parts = raw.split(/(\{\{[^}]+\}\})/g);
    const html = parts.map((seg) => {
      const m = seg.match(/^\{\{([^}]+)\}\}$/);
      if (m) {
        return `<span style="color:${accent};border-bottom:2px solid ${accent};padding-bottom:2px;">${escapeHtml(m[1])}</span>`;
      }
      return escapeHtml(seg);
    }).join("");

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <style>
        @keyframes nf-analogy-label {
          0%   { opacity: 0; transform: translateX(-16px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes nf-analogy-rule {
          0%   { transform: scaleY(0); }
          100% { transform: scaleY(1); }
        }
        @keyframes nf-analogy-body {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nf-analogy-source {
          0%   { opacity: 0; }
          100% { opacity: 0.5; }
        }
      </style>
      <div style="
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: ${W * 0.22}px 1fr;
        align-content: center;
        align-items: center;
        gap: ${W * 0.04}px;
        padding: ${H * 0.12}px ${W * 0.08}px;
        color: #f5ece0;
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 24px;
          justify-self: end;
        ">
          <div style="
            font: 600 26px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: ${accent};
            letter-spacing: 0.24em;
            writing-mode: vertical-rl;
            text-orientation: upright;
            opacity: 0;
            animation: nf-analogy-label 0.6s cubic-bezier(0.16,1,0.3,1) 0.05s both;
          ">${escapeHtml(label)}</div>
          <div style="
            width: 2px;
            height: ${H * 0.4}px;
            background: ${accent};
            transform-origin: top;
            transform: scaleY(0);
            animation: nf-analogy-rule 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both;
          "></div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 24px; max-width: ${W * 0.58}px;">
          <div style="
            font: 400 44px/1.55 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: #f5ece0;
            opacity: 0;
            animation: nf-analogy-body 0.7s cubic-bezier(0.16,1,0.3,1) 0.35s both;
          ">${html}</div>
          ${source ? `
          <div style="
            font: 400 20px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: rgba(245,236,224,.5);
            letter-spacing: 0.04em;
            opacity: 0;
            animation: nf-analogy-source 0.5s linear 0.7s both;
          ">${escapeHtml(source)}</div>
          ` : ""}
        </div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 1.2));
    return {
      sceneId: "analogyCard",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "label", role: "kicker", value: params.label || "类比" },
        { type: "rule", role: "divider", orientation: "vertical" },
        { type: "body", role: "analogy", value: params.text || "", font: "serif-44" },
        ...(params.source ? [{ type: "source", role: "caption", value: params.source }] : []),
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      label: "类比",
      text: "你对我说『帮我写个天气工具』，就像去餐厅点了一句『宫保鸡丁』 —— 但{{后厨准备了几十种调料和配菜}}，你看到的只是最后端上来的那盘菜。",
      source: "— E01 §03",
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
