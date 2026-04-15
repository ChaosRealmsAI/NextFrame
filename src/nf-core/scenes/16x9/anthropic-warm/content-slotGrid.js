// scenes/16x9/anthropic-warm/content-slotGrid.js
//
// slotGrid - 2x2 槽位网格，4 格各展示一个 API 槽位（system/tools/messages/params）

export default {
  // ===== Identity =====
  id: "slotGrid",
  name: "slotGrid",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "2x2 槽位网格 — 专为讲 4 个 API 槽位（system[] / tools[] / messages[] / params）设计，每格有 role 编号、mono 代码名、serif 描述、body 一句话",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `E01 第二幕 "四个槽位" 的专用组件。用 2x2 真正的 grid（不是横向列表）因为 "4 个格子" 是类比核心 — 观众必须视觉上感受到 "一个包裹被分成四格"。每格四段信息自上而下：编号（01-04，mono 橙色）/ 代码名（mono，如 system[]，这是要让观众记住的 API 字段）/ 中文短描述（sans 28px）/ 一句话注解（body 22px 弱化）。格子之间用 1px 暖色分割线围出"井"字，但不画外框 — 让画面呼吸。4 格错峰进场（stagger 0.1s），让观众大脑逐个消化。`,

  when_to_use: [
    "讲 4 个并列概念（API 四槽位、四种压缩方式、四幕结构）",
    "分类 overview — 数量刚好 4 个，不多不少",
    "每个类别有 1 个代码名/标签 + 1 句描述",
  ],

  when_not_to_use: [
    "类别 ≠ 4 个（3 个用 threeUp，5+ 个用 keyPoints 或 listGrid）",
    "每格内容 > 3 行（grid 会太挤，换 fourSlots 单独出页）",
    "需要展示类别之间的流程箭头（用 flowDiagram 代替）",
  ],

  limitations: [
    "固定 4 格，不支持动态数量",
    "每格代码名 ≤ 16 字符，超出会换行破坏对齐",
    "每格描述 ≤ 20 中文字符，注解 ≤ 28 中文字符",
  ],

  inspired_by: "Stripe 文档的 API concept grid + Apple 发布会 4-up feature matrix",
  used_in: [],

  // ===== Compatibility =====
  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "analogyCard"],
  conflicts_with: [],
  alternatives: ["fourSlots"],

  // ===== Visual weight =====
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["serious", "professional"],

  // ===== Index =====
  tags: ["slotGrid", "2x2", "grid", "四槽位", "api", "classification", "content", "anthropic-warm"],

  // ===== Engineering =====
  complexity: "medium",
  performance: { cost: "low", notes: "4 个 grid cell + 8 个 keyframes，一次性 paint" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for claude-code 源码讲解 E01（system/tools/messages/params 四槽位）" },
  ],

  // ========================================
  // ===== Params =====
  // ========================================
  params: {
    slots: {
      type: "array",
      required: true,
      semantic: "4 个槽位对象，结构：{ code: 'system[]', title: '系统提示词', desc: '你是谁、你该怎么做' }；必须恰好 4 个",
    },
    accent: {
      type: "color",
      default: "#da7756",
      semantic: "编号和代码名的强调色",
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

    const slots = Array.isArray(params.slots) ? params.slots.slice(0, 4) : [];
    while (slots.length < 4) slots.push({ code: "", title: "", desc: "" });
    const accent = params.accent || "#da7756";

    const W = vp.width;
    const H = vp.height;

    const cells = slots.map((s, i) => {
      const idx = String(i + 1).padStart(2, "0");
      const delay = 0.15 + i * 0.12;
      return `
        <div style="
          position: relative;
          padding: 40px 48px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          opacity: 0;
          animation: nf-slotgrid-cell 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s both;
        ">
          <div style="
            font: 600 20px/1 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: ${accent};
            letter-spacing: 0.16em;
          ">${idx}</div>
          <div style="
            font: 600 32px/1.2 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: #f5ece0;
            letter-spacing: -0.01em;
          ">${escapeHtml(s.code || "")}</div>
          <div style="
            font: 600 28px/1.35 system-ui, -apple-system, 'PingFang SC', sans-serif;
            color: #f5ece0;
          ">${escapeHtml(s.title || "")}</div>
          <div style="
            font: 400 22px/1.5 system-ui, -apple-system, 'PingFang SC', sans-serif;
            color: rgba(245,236,224,.6);
          ">${escapeHtml(s.desc || "")}</div>
        </div>
      `;
    }).join("");

    host.innerHTML = `
      <style>
        @keyframes nf-slotgrid-cell {
          0%   { opacity: 0; transform: translateY(16px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes nf-slotgrid-v-rule {
          0%   { transform: translateX(-50%) scaleY(0); }
          100% { transform: translateX(-50%) scaleY(1); }
        }
        @keyframes nf-slotgrid-h-rule {
          0%   { transform: translateY(-50%) scaleX(0); }
          100% { transform: translateY(-50%) scaleX(1); }
        }
      </style>
      <div style="
        position: absolute;
        inset: ${H * 0.11}px ${W * 0.08}px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        background: rgba(245,236,224,.02);
        border-radius: 8px;
      ">
        ${cells}
        <div style="
          position: absolute;
          left: 50%;
          top: 8%;
          bottom: 8%;
          width: 1px;
          background: rgba(245,236,224,.12);
          transform-origin: top;
          transform: translateX(-50%) scaleY(0);
          animation: nf-slotgrid-v-rule 0.6s cubic-bezier(0.16,1,0.3,1) 0.05s both;
        "></div>
        <div style="
          position: absolute;
          top: 50%;
          left: 6%;
          right: 6%;
          height: 1px;
          background: rgba(245,236,224,.12);
          transform-origin: left;
          transform: translateY(-50%) scaleX(0);
          animation: nf-slotgrid-h-rule 0.6s cubic-bezier(0.16,1,0.3,1) 0.05s both;
        "></div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const slots = Array.isArray(params.slots) ? params.slots : [];
    const progress = Math.min(1, Math.max(0, t / 1.2));
    return {
      sceneId: "slotGrid",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: slots.map((s, i) => ({
        type: "cell",
        role: "slot",
        index: i,
        code: s.code,
        title: s.title,
        desc: s.desc,
      })),
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      slots: [
        { code: "system[]",   title: "系统提示词",  desc: "你是谁、你该怎么做 — 像员工入职第一天的手册" },
        { code: "tools[]",    title: "工具定义",    desc: "你手里有哪些工具可以用，每个带一页说明书" },
        { code: "messages[]", title: "对话消息",    desc: "你说的、模型回的、系统悄悄塞的 — 格子最大" },
        { code: "params",     title: "请求参数",    desc: "模型、max_tokens、thinking — 决定这次请求的『性格』" },
      ],
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
