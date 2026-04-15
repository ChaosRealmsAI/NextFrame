// scenes/16x9/anthropic-warm/content-fourSlots.js
// 四槽位网格：system / tools / messages / params 的 2x2 结构化说明。

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const chars = String(text || "").split("");
  const lines = [];
  let current = "";
  for (const ch of chars) {
    if (ch === "\n") {
      lines.push(current);
      current = "";
      continue;
    }
    const next = current + ch;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export default {
  // ===== 身份 =====
  id: "fourSlots",
  name: "Four Slots 四槽位网格",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "2×2 槽位网格，展示 API 请求的四个核心容器",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    四槽位是这集最重要的骨架认知，所以组件必须优先呈现结构感，而不是花哨样式。2×2 网格的价值在于让观众一眼看到“四个并列容器”，而不是读完长段文字才意识到 system、tools、messages、params 是同一级概念。每个格子里同时放 label、title、desc，是为了兼顾口播节奏和后续复看：label 给短记忆钩子，title 给正式术语，desc 给一句用途解释。卡片边界要清楚但不能太重，确保它是“骨架图”，不是广告拼贴。
  `,

  when_to_use: [
    "介绍 API 请求整体结构、四个槽位时",
    "章节转换需要先建立大框架再深入细节时",
    "需要观众在后面十几分钟反复回忆这四个容器时",
  ],

  when_not_to_use: [
    "内容节点超过四个或存在明显主次关系时",
    "口播已经进入单个维度深挖，不再是总体结构介绍时",
    "需要展示时间顺序而不是并列结构时",
  ],

  limitations: [
    "默认按 2×2 布局，最适合 4 项内容",
    "每格说明建议控制在 2~3 行，否则会显得拥挤",
    "不负责箭头或流程关系表达，那是 flowDiagram 的职责",
  ],

  inspired_by: "讲解片中的结构图思路 + 暖棕主题卡片网格",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/03-slots"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["headline", "titleBar", "footer"],
  conflicts_with: ["flowDiagram"],
  alternatives: ["flowDiagram", "keyPoints", "compare-cols"],

  // ===== 视觉权重 =====
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["organized", "didactic", "clear"],

  // ===== 索引 =====
  tags: [
    "四槽位", "four slots", "grid", "system", "tools", "messages", "params",
    "API request", "框架图", "teaching grid",
  ],

  // ===== 工程 =====
  complexity: "medium",
  performance: { cost: "low", notes: "4 张卡片和少量分行文本" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 四槽位结构网格" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    slots: {
      type: "array",
      required: true,
      semantic: "四个槽位的数据",
      purpose: "把 system/tools/messages/params 的角色结构化呈现出来",
      constraints: ["建议正好 4 项", "每项包含 label/title/desc"],
      common_mistakes: ["把多段正文塞进 desc，导致四格失衡"],
    },
  },

  // ===== 动画钩子 =====
  enter: null,
  exit: null,

  // ========================================
  // ===== 三函数 =====
  // ========================================

  render(ctx, _t, params, viewport) {
    const W = viewport.width;
    const H = viewport.height;
    const slots = Array.isArray(params.slots) ? params.slots.slice(0, 4) : [];
    const startX = W * 0.12;
    const startY = H * 0.22;
    const gapX = W * 0.025;
    const gapY = H * 0.03;
    const cardW = W * 0.366;
    const cardH = H * 0.24;
    const colors = ["#da7756", "#d4b483", "#7ec699", "#8ab4cc"];

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    slots.forEach((slot, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const accent = colors[index % colors.length];

      roundedRect(ctx, x, y, cardW, cardH, W * 0.006);
      ctx.fillStyle = "rgba(33,28,21,0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(245,236,224,0.12)";
      ctx.lineWidth = Math.max(1, W * 0.0008);
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.font = `700 ${Math.round(H * 0.016)}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
      ctx.fillText(slot.label || "", x + W * 0.018, y + H * 0.026);

      ctx.fillStyle = "#f5ece0";
      ctx.font = `700 ${Math.round(H * 0.031)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(slot.title || "", x + W * 0.018, y + H * 0.056);

      ctx.fillStyle = "rgba(245,236,224,0.75)";
      ctx.font = `500 ${Math.round(H * 0.023)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      const lines = wrapText(ctx, slot.desc || "", cardW - W * 0.036);
      lines.slice(0, 3).forEach((line, lineIndex) => {
        ctx.fillText(line, x + W * 0.018, y + H * 0.112 + lineIndex * H * 0.034);
      });
    });
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "fourSlots",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: (params.slots || []).map((slot, index) => ({
        type: "slot",
        role: `slot-${index + 1}`,
        value: slot,
      })),
      boundingBox: {
        x: viewport.width * 0.12,
        y: viewport.height * 0.22,
        w: viewport.width * 0.76,
        h: viewport.height * 0.54,
      },
    };
  },

  sample() {
    return {
      slots: [
        { label: "01", title: "system[]", desc: "你是谁、你该怎么做。像员工第一天拿到的员工手册。" },
        { label: "02", title: "tools[]", desc: "告诉模型你手里有哪些工具，每个工具都带一页说明书。" },
        { label: "03", title: "messages[]", desc: "你说的、模型回的、工具返回的，以及系统悄悄塞进来的。" },
        { label: "04", title: "params", desc: "模型名、最大输出、思考模式、快慢档，决定请求的性格。" },
      ],
    };
  },
};
