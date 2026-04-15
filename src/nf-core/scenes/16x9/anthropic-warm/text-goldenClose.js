// scenes/16x9/anthropic-warm/text-goldenClose.js
//
// goldenClose - 收尾金句卡：大引号 + serif italic 金句 + 署名

export default {
  // ===== Identity =====
  id: "goldenClose",
  name: "goldenClose",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "text",

  // ===== Semantics =====
  description: "收尾金句 — 上下大引号符 + serif italic 56px 金句 + mono 小字署名，视频最后一屏用",
  duration_hint: 4.0,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `视频最后一屏的"金句 slide"必须慢、稳、留白多 — 观众刚听完 20 分钟密集内容，需要一个"让这句话落地"的空间。用 Georgia italic 56px 因为 italic 天然带"被引用"气质，serif 本身的衬线又让字体显得郑重。上下两枚巨大的 Gold 色 (--gold #d4b483) 装饰性引号（200px，0.15 透明度）做视觉包裹 — 不喧宾夺主，但让"这是一句被珍藏的话"的意味立起来。金句长度建议 2 行，中间可以自然换行。底部 mono 小字署名（— Claude Code / OPC-王宇轩）收束。`,

  when_to_use: [
    "视频最后一屏 hook 观众 / 让金句被截图",
    "章节收尾的 pull-quote（把一段金句单独拎出来）",
    "引用名人 / 引用自己之前的话 — 需要『这是句话』的仪式感",
  ],

  when_not_to_use: [
    "不是引用性内容（用 headline 代替）",
    "金句 > 3 行（56px 会挤爆安全区，换 goldenQuote 标准款）",
    "需要多个金句排列（用 quoteList）",
  ],

  limitations: [
    "建议金句 20-40 中文字符，超过 50 需要换行且影响节奏",
    "author ≤ 24 字符",
    "italic + serif 对某些中文字体显示效果弱，建议金句里英文/标点穿插时最自然",
  ],

  inspired_by: "Medium 文章结尾的 pull-quote + Anthropic Claude.ai 营销页 hero quote",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-footer"],
  conflicts_with: ["goldenClose"],
  alternatives: ["goldenQuote"],

  // ===== Visual weight =====
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["calm", "serious"],

  // ===== Index =====
  tags: ["goldenClose", "quote", "closing", "金句", "收尾", "引用", "italic", "text", "anthropic-warm"],

  // ===== Engineering =====
  complexity: "simple",
  performance: { cost: "low", notes: "5 个 DOM 元素 + 5 keyframes，慢节奏动画" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for claude-code 源码讲解 E01 收尾金句『你写了 1 行，系统拼了 87 类』" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    text: {
      type: "string",
      required: true,
      semantic: "金句本体，serif italic 显示。可包含 \\n 强制换行",
    },
    author: {
      type: "string",
      default: "",
      semantic: "署名，底部 mono 小字（例：— Claude Code）",
    },
    quoteColor: {
      type: "color",
      default: "#d4b483",
      semantic: "上下大引号装饰色，默认 gold",
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

    const raw = String(params.text || "");
    const lines = raw.split("\n").map((l) => escapeHtml(l)).join("<br>");
    const author = String(params.author || "");
    const quoteColor = params.quoteColor || "#d4b483";

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <style>
        @keyframes nf-close-openq {
          0%   { opacity: 0; transform: translate(-20px, -20px) scale(0.7); }
          100% { opacity: 0.18; transform: translate(0, 0) scale(1); }
        }
        @keyframes nf-close-closeq {
          0%   { opacity: 0; transform: translate(20px, 20px) scale(0.7); }
          100% { opacity: 0.18; transform: translate(0, 0) scale(1); }
        }
        @keyframes nf-close-text {
          0%   { opacity: 0; transform: translateY(16px); }
          40%  { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nf-close-rule {
          0%   { transform: scaleX(0); }
          70%  { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes nf-close-author {
          0%   { opacity: 0; }
          85%  { opacity: 0; }
          100% { opacity: 0.55; }
        }
      </style>
      <div style="
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: ${H * 0.14}px ${W * 0.1}px;
        color: #f5ece0;
      ">
        <div style="position: relative; max-width: ${W * 0.72}px; text-align: center;">
          <div style="
            position: absolute;
            left: -80px;
            top: -120px;
            font: 400 240px/1 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: ${quoteColor};
            opacity: 0;
            animation: nf-close-openq 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s both;
            pointer-events: none;
            user-select: none;
          ">&ldquo;</div>

          <div style="
            position: absolute;
            right: -80px;
            bottom: -180px;
            font: 400 240px/1 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: ${quoteColor};
            opacity: 0;
            animation: nf-close-closeq 0.8s cubic-bezier(0.16,1,0.3,1) 0.25s both;
            pointer-events: none;
            user-select: none;
          ">&rdquo;</div>

          <div style="
            position: relative;
            font: 400 italic 56px/1.5 Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: #f5ece0;
            letter-spacing: 0.01em;
            opacity: 0;
            animation: nf-close-text 1.0s cubic-bezier(0.16,1,0.3,1) 0.4s both;
          ">${lines}</div>

          <div style="
            margin: 48px auto 0;
            width: ${W * 0.08}px;
            height: 1px;
            background: ${quoteColor};
            transform-origin: center;
            transform: scaleX(0);
            animation: nf-close-rule 0.6s cubic-bezier(0.16,1,0.3,1) 1.1s both;
          "></div>

          ${author ? `
          <div style="
            margin-top: 32px;
            font: 500 22px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: rgba(245,236,224,.55);
            letter-spacing: 0.12em;
            opacity: 0;
            animation: nf-close-author 0.6s linear 1.3s both;
          ">${escapeHtml(author)}</div>
          ` : ""}
        </div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 2.0));
    return {
      sceneId: "goldenClose",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "quote-open", role: "decoration", value: "\u201C" },
        { type: "quote-close", role: "decoration", value: "\u201D" },
        { type: "text", role: "quote", value: params.text || "", font: "serif-italic-56" },
        { type: "rule", role: "divider" },
        ...(params.author ? [{ type: "author", role: "byline", value: params.author }] : []),
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      text: "你写了 1 行，系统拼了 87 类。\n每一轮，重新拼一遍。",
      author: "— Claude Code · OPC-王宇轩",
      quoteColor: "#d4b483",
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
