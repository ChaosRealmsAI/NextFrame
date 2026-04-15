// scenes/16x9/anthropic-warm/content-analogyCard.js
//
// 类比卡 - 用日常事物类比技术概念，serif 大字 + gold 边框卡片

export default {
  // ===== Identity =====
  id: "analogyCard",
  name: "类比卡",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "gold 边框卡片 + serif 大字类比文本，用日常事物解释技术概念",
  duration_hint: 4,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    Claude Code 源码讲解系列的灵魂组件——整个 E01 脚本出现 15+ 次类比
    （微信、餐厅、快递包裹、员工手册、工具箱、CDN、旧笔记本、安检员、
    瑞士军刀、看医生、真空压缩袋、洗衣机循环、总经理实习生……），
    是方法论「深入浅出」的核心视觉载体。
    用 Georgia serif 700 字体（#f5ece0）承载 36-40px 类比正文，
    区别于 sans 正文的技术感，暗示"这一页是换个角度讲"。
    卡片底色 gold-12 (rgba(212,180,131,.06)) + 1px gold 边 ，
    左上角「类比」小标签（gold #d4b483 大写）快速让观众识别页面类型。
    关键词用 <strong> 包裹显示为 ac 橙 #da7756，让扫视时抓得住重点。
    最多 3 行，超过改成多页类比。
  `,

  when_to_use: [
    "新技术概念出场时先用一个日常类比（微信/餐厅/员工手册 等）",
    "抽象机制前先给一个生活中的对应物（CDN → 全球缓存 / 旧笔记本 → Memory）",
    "复杂流程的总结页（洗衣机循环类比 Agent Loop）",
  ],

  when_not_to_use: [
    "需要呈现技术事实本身（用 content-keyPoints 或 content-codeBlock）",
    "类比文字超过 3 行——拆成多张 slide 或用普通正文",
    "金句收尾场景（用 text-goldenQuote，那是 quote 不是 analogy）",
  ],

  limitations: [
    "单卡一个类比，不做并列多卡（那是 compareCols 的工作）",
    "正文建议 ≤ 60 汉字，超长会溢出卡片或字号被迫缩到难读",
    "无逐字/逐段进入动画——整卡由 timeline enter/exit 控制",
  ],

  inspired_by: "3Blue1Brown 章节引入类比 + Anthropic 官方 doc 的 callout 卡片",
  used_in: [
    "claude-code-源码讲解 E01 Slide 02（微信类比）",
    "claude-code-源码讲解 E01 Slide 11（预装 App 类比）",
    "claude-code-源码讲解 E01 Slide 48（洗衣机循环类比）",
  ],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "content-keyPoints"],
  conflicts_with: [],
  alternatives: ["text-goldenQuote（金句不是类比）", "content-compareCols（并列对比）"],

  visual_weight: "medium",
  z_layer: "content",
  mood: ["warm", "explanatory", "conversational"],

  tags: ["analogy", "callout", "serif", "card", "explanation", "metaphor"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure DOM card, no animation" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — gold card + serif analogy body + optional keyword highlights" },
  ],

  // ===== Params =====
  params: {
    label: {
      type: "string",
      default: "类比",
      semantic: "卡片左上角小标签，默认「类比」，也可写「就像 / 想象一下 / 举个例子」",
    },
    text: {
      type: "string",
      required: true,
      semantic: "类比正文，可用 **关键词** 标注橙色高亮（最多 3 处），建议 ≤ 60 汉字",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const label = escapeHtml(params.label || "类比");
    const rawText = String(params.text || "");
    const text = renderInline(rawText);
    const w = vp.width;
    const h = vp.height;

    const cardW = Math.round(w * 0.5);           // 960px
    const padV = Math.round(h * 0.054);          // ~58px
    const padH = Math.round(w * 0.033);          // ~64px
    const labelSize = Math.round(w * 0.0094);    // ~18px
    const bodySize = Math.round(w * 0.0208);     // ~40px
    const cardLeft = Math.round((w - cardW) / 2);
    const cardTop = Math.round(h * 0.24);

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${cardLeft}px;
        top:${cardTop}px;
        width:${cardW}px;
        padding:${padV}px ${padH}px;
        background:rgba(212,180,131,0.06);
        border:1px solid rgba(212,180,131,0.18);
        border-radius:12px;
      ">
        <div style="
          display:inline-block;
          color:#d4b483;
          font:600 ${labelSize}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
          letter-spacing:0.08em;
          text-transform:uppercase;
          padding:4px 14px;
          border:1px solid rgba(212,180,131,0.30);
          border-radius:4px;
          margin-bottom:${Math.round(h*0.03)}px;
        ">${label}</div>
        <div style="
          color:#f5ece0;
          font:700 ${bodySize}px/1.6 Georgia,'Hiragino Mincho ProN','Noto Serif SC',serif;
        ">${text}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "analogyCard",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "label", value: params.label || "类比" },
        { type: "text", role: "body", value: params.text || "" },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.25),
        y: Math.round(vp.height * 0.24),
        w: Math.round(vp.width * 0.5),
        h: Math.round(vp.height * 0.5),
      },
    };
  },

  sample() {
    return {
      label: "类比",
      text: "你打微信说「你好」两个字，但实际发出去的数据包里，有**头像、昵称、时间戳、加密签名**——几十个字段。你打的那两个字，只是其中很小一部分。",
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

// Markdown-lite: **word** → <strong> with ac orange
function renderInline(s) {
  const escaped = escapeHtml(s);
  return escaped.replace(/\*\*([^*]+)\*\*/g, (_m, kw) =>
    `<strong style="color:#da7756;font-weight:700;">${kw}</strong>`
  );
}
