// scenes/16x9/anthropic-warm/content-flowDiagram.js
// 横向流程图：矩形节点 + 箭头，适合解释 Agent Loop 或请求链路。

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
  id: "flowDiagram",
  name: "Flow Diagram 流程图",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "横向流程框和箭头图，展示请求链路、Agent Loop 或阶段转换",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    这个组件的目标不是做“漂亮的流程图”，而是把时间顺序和因果关系压缩成一眼就能扫懂的路径。讲 Claude Code 内部逻辑时，观众最容易迷失在很多概念名词里，所以 flowDiagram 必须用最朴素的横向推进感，把“先发生什么，再发生什么”固定下来。节点坚持用规则矩形而不是图标盒子，是为了把注意力留给标题和说明，不引入额外视觉语义。箭头颜色略亮于节点边框，确保视线真的会沿着路径走，而不是停在某一个框上。
  `,

  when_to_use: [
    "解释 Agent Loop、请求拼装链路、工具调用顺序时",
    "需要强调时间推进和前后因果关系时",
    "一屏只讲 3~5 个阶段节点时",
  ],

  when_not_to_use: [
    "内容是并列结构或分类关系，不是时间顺序时",
    "节点太多超过 5 个，横向可读性会明显下降",
    "需要详细展开每个节点内部字段时",
  ],

  limitations: [
    "最适合 3~5 个节点，过多需要拆屏",
    "只支持单行主流程，不支持复杂分支树",
    "desc 建议短句，不适合长段文字",
  ],

  inspired_by: "landscape-atoms/flow-diagram.html 的横向推进行为",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/20-agentloop"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["titleBar", "footer", "statNumber"],
  conflicts_with: ["fourSlots"],
  alternatives: ["fourSlots", "keyPoints", "compare-cols"],

  // ===== 视觉权重 =====
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["systematic", "clear", "technical"],

  // ===== 索引 =====
  tags: [
    "流程图", "flow diagram", "pipeline", "agent loop", "sequence", "arrow",
    "节点", "process", "chain", "系统流程",
  ],

  // ===== 工程 =====
  complexity: "medium",
  performance: { cost: "low", notes: "少量节点和箭头路径，几何计算简单" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 横向流程图组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    nodes: {
      type: "array",
      required: true,
      semantic: "流程节点数组",
      purpose: "按顺序表达阶段推进和因果关系",
      constraints: ["建议 3~5 项", "每项包含 label/desc"],
      common_mistakes: ["把太多解释文字放进单个节点，导致流程断掉"],
    },
    direction: {
      type: "string",
      default: "ltr",
      semantic: "流程方向",
      purpose: "允许同一组件表达左到右或右到左的路径",
      constraints: ["ltr 或 rtl"],
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
    const sourceNodes = Array.isArray(params.nodes) ? params.nodes.slice(0, 5) : [];
    const nodes = (params.direction || "ltr") === "rtl" ? [...sourceNodes].reverse() : sourceNodes;
    const count = Math.max(nodes.length, 1);
    const usableW = W * 0.78;
    const nodeW = Math.min(W * 0.17, usableW / count - W * 0.04);
    const gap = count > 1 ? (usableW - nodeW * count) / (count - 1) : 0;
    const nodeH = H * 0.18;
    const startX = (W - usableW) * 0.5;
    const y = H * 0.39;
    const colors = ["#7ec699", "#da7756", "#8ab4cc", "#d4b483", "#f5ece0"];

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    nodes.forEach((node, index) => {
      const x = startX + index * (nodeW + gap);
      const accent = colors[index % colors.length];

      roundedRect(ctx, x, y, nodeW, nodeH, W * 0.006);
      ctx.fillStyle = "rgba(21,17,12,0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(245,236,224,0.12)";
      ctx.lineWidth = Math.max(1, W * 0.0008);
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.font = `700 ${Math.round(H * 0.026)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(node.label || "", x + nodeW * 0.5, y + H * 0.03);

      ctx.fillStyle = "rgba(245,236,224,0.75)";
      ctx.font = `500 ${Math.round(H * 0.019)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      const lines = wrapText(ctx, node.desc || "", nodeW - W * 0.028);
      lines.slice(0, 2).forEach((line, lineIndex) => {
        ctx.fillText(line, x + nodeW * 0.5, y + H * 0.075 + lineIndex * H * 0.028);
      });

      if (index < nodes.length - 1) {
        const nextX = startX + (index + 1) * (nodeW + gap);
        const ax = x + nodeW;
        const ay = y + nodeH * 0.5;
        const bx = nextX;
        const by = ay;
        const arrowColor = colors[(index + 1) % colors.length] === "#f5ece0" ? "#d4b483" : colors[(index + 1) % colors.length];

        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = Math.max(2, W * 0.0012);
        ctx.beginPath();
        ctx.moveTo(ax + W * 0.01, ay);
        ctx.lineTo(bx - W * 0.012, by);
        ctx.stroke();

        ctx.fillStyle = arrowColor;
        ctx.beginPath();
        ctx.moveTo(bx - W * 0.012, by);
        ctx.lineTo(bx - W * 0.021, by - H * 0.008);
        ctx.lineTo(bx - W * 0.021, by + H * 0.008);
        ctx.closePath();
        ctx.fill();
      }
    });
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "flowDiagram",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: (params.nodes || []).map((node, index) => ({
        type: "node",
        role: `node-${index + 1}`,
        value: node,
      })),
      boundingBox: {
        x: viewport.width * 0.11,
        y: viewport.height * 0.39,
        w: viewport.width * 0.78,
        h: viewport.height * 0.18,
      },
    };
  },

  sample() {
    return {
      direction: "ltr",
      nodes: [
        { label: "用户", desc: "“帮我写个天气工具”" },
        { label: "系统拼装", desc: "87 类内容往四个槽位里塞" },
        { label: "模型", desc: "思考、回复、决定是否用工具" },
        { label: "工具结果", desc: "执行后再塞回 messages[]" },
      ],
    };
  },
};
