// scenes/16x9/anthropic-warm/content-chatSim.js
// 微信式聊天模拟：用户绿气泡，AI 灰气泡，可带 type badge。

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
  id: "chatSim",
  name: "Chat Simulation 聊天模拟",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "微信式对话气泡列表，用户为绿色气泡，AI 为灰色气泡，可附加类型标签",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    这类场景的重点是让观众瞬间理解“这是一次真实交互”，而不是在读一张说明卡。所以 chatSim 选择大众最熟悉的聊天界面语法：左右分边、圆角气泡、轻量头像、顶部会话栏。用户气泡用绿色，是借微信式肌肉记忆把“人类输入”快速固定下来；AI 气泡退到灰棕，是为了避免和主题主强调橙色抢角色。type 字段存在的意义，是让同一个聊天流里能轻微区分普通回复、工具反馈、提醒信息，而不把整个组件做成复杂终端。
  `,

  when_to_use: [
    "解释 messages[]、真实 session、用户与系统交互时",
    "需要把一段脚本化案例转成可视对话流程时",
    "需要让观众看到不同消息类型如何混进同一轮对话时",
  ],

  when_not_to_use: [
    "内容核心是命令行或代码，不是聊天语义时",
    "消息超过 6 条导致气泡区过长时",
    "需要展示精确工具调用结构而不是对话感时",
  ],

  limitations: [
    "更适合短消息，不适合长段落或大段日志",
    "type 只做轻量标签，不会变成完整消息协议可视化",
    "默认居中单列容器，不适合并行多会话对比",
  ],

  inspired_by: "landscape-atoms/chat-sim.html，改成更接近微信的左右分边逻辑",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/21-s1-baseline"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["titleBar", "footer", "keyPoints"],
  conflicts_with: ["codeBlock"],
  alternatives: ["terminal", "flowDiagram", "fourSlots"],

  // ===== 视觉权重 =====
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["conversational", "concrete", "lively"],

  // ===== 索引 =====
  tags: [
    "聊天", "chat", "messages", "bubble", "weixin", "session", "对话模拟",
    "Claude Code", "user ai", "conversation",
  ],

  // ===== 工程 =====
  complexity: "medium",
  performance: { cost: "medium", notes: "气泡尺寸依赖文字测量，但消息数有限" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 微信式对话气泡组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    messages: {
      type: "array",
      required: true,
      semantic: "消息列表",
      purpose: "模拟用户和 Claude Code 的往返对话",
      constraints: ["建议 2~6 条", "每项包含 from/text/type"],
      common_mistakes: ["把解释性旁白塞进 message，导致不再像对话"],
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
    const boxW = W * 0.47;
    const boxH = H * 0.61;
    const x = (W - boxW) * 0.5;
    const y = H * 0.2;
    const headerH = H * 0.06;
    const bodyX = x + W * 0.02;
    const bodyY = y + headerH + H * 0.025;
    const bubbleFont = Math.round(H * 0.023);
    const avatarSize = H * 0.036;
    const bubbleMaxW = boxW * 0.62;

    roundedRect(ctx, x, y, boxW, boxH, W * 0.01);
    ctx.fillStyle = "#15110c";
    ctx.fill();
    ctx.strokeStyle = "rgba(245,236,224,0.08)";
    ctx.lineWidth = Math.max(1, W * 0.0008);
    ctx.stroke();

    ctx.fillStyle = "rgba(245,236,224,0.03)";
    ctx.fillRect(x, y, boxW, headerH);
    ctx.strokeStyle = "rgba(245,236,224,0.06)";
    ctx.beginPath();
    ctx.moveTo(x, y + headerH);
    ctx.lineTo(x + boxW, y + headerH);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#7ec699";
    ctx.beginPath();
    ctx.arc(x + W * 0.022, y + headerH * 0.5, H * 0.0048, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(245,236,224,0.75)";
    ctx.font = `700 ${Math.round(H * 0.018)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
    ctx.fillText("对话 · 模拟", x + W * 0.03, y + headerH * 0.5);

    let cursorY = bodyY;
    ctx.font = `500 ${bubbleFont}px system-ui, -apple-system, "PingFang SC", sans-serif`;

    (params.messages || []).slice(0, 6).forEach((message, index) => {
      const from = message.from === "user" ? "user" : "ai";
      const badge = message.type && message.type !== "text" ? String(message.type).toUpperCase() : "";
      const textMaxW = bubbleMaxW - W * 0.03;
      const lines = wrapText(ctx, message.text || "", textMaxW);
      const badgeExtra = badge ? H * 0.035 : 0;
      const bubbleH = H * 0.04 + lines.length * H * 0.034 + badgeExtra;
      const bubbleW = Math.min(
        bubbleMaxW,
        Math.max(
          W * 0.12,
          Math.max(...lines.map((line) => ctx.measureText(line).width), 0) + W * 0.03
        )
      );
      const rowY = cursorY;
      const isUser = from === "user";
      const avatarX = isUser ? x + boxW - W * 0.028 - avatarSize : x + W * 0.028;
      const bubbleX = isUser ? avatarX - W * 0.012 - bubbleW : avatarX + avatarSize + W * 0.012;

      roundedRect(ctx, avatarX, rowY + H * 0.01, avatarSize, avatarSize, W * 0.0045);
      ctx.fillStyle = isUser ? "#7ec699" : "#2a2319";
      ctx.fill();
      ctx.fillStyle = isUser ? "#15110c" : "#f5ece0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.round(H * 0.014)}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
      ctx.fillText(isUser ? "U" : "AI", avatarX + avatarSize * 0.5, rowY + H * 0.01 + avatarSize * 0.54);

      roundedRect(ctx, bubbleX, rowY, bubbleW, bubbleH, W * 0.009);
      ctx.fillStyle = isUser ? "rgba(126,198,153,0.14)" : "rgba(42,35,25,0.92)";
      ctx.fill();
      ctx.strokeStyle = isUser ? "rgba(126,198,153,0.24)" : "rgba(245,236,224,0.12)";
      ctx.stroke();

      let textY = rowY + H * 0.018;
      if (badge) {
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = isUser ? "#15110c" : "#d4b483";
        ctx.font = `700 ${Math.round(H * 0.013)}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
        const badgeW = ctx.measureText(badge).width + W * 0.012;
        roundedRect(ctx, bubbleX + W * 0.012, rowY + H * 0.015, badgeW, H * 0.025, W * 0.0035);
        ctx.fillStyle = isUser ? "#7ec699" : "rgba(212,180,131,0.12)";
        ctx.fill();
        ctx.fillStyle = isUser ? "#15110c" : "#d4b483";
        ctx.fillText(badge, bubbleX + W * 0.018, rowY + H * 0.018);
        textY += H * 0.035;
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#f5ece0";
      ctx.font = `500 ${bubbleFont}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, bubbleX + W * 0.015, textY + lineIndex * H * 0.034);
      });

      cursorY += bubbleH + H * 0.02 + (index === 0 ? H * 0.002 : 0);
    });
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "chatSim",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: (params.messages || []).map((message, index) => ({
        type: "message",
        role: `message-${index + 1}`,
        value: message,
      })),
      boundingBox: {
        x: viewport.width * 0.265,
        y: viewport.height * 0.2,
        w: viewport.width * 0.47,
        h: viewport.height * 0.61,
      },
    };
  },

  sample() {
    return {
      messages: [
        { from: "user", text: "你好", type: "text" },
        { from: "ai", text: "你好！有什么可以帮你的？", type: "text" },
        { from: "user", text: "帮我解释一下什么是 Agent Loop。", type: "text" },
        { from: "ai", text: "每一轮对话，系统都重新打一个新包裹。", type: "text" },
        { from: "user", text: "帮我搜一下最近有没有相关的新文章。", type: "tool" },
      ],
    };
  },
};
