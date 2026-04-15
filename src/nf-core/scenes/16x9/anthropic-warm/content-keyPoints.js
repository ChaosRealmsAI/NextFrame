// scenes/16x9/anthropic-warm/content-keyPoints.js
//
// 要点列表 - 数字序号 + 要点描述，2-5 条，核心概念逐条陈列

export default {
  // ===== Identity =====
  id: "keyPoints",
  name: "要点列表",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "数字序号 + 要点描述，2-5 条，核心概念逐条陈列",
  duration_hint: 5,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    源码讲解视频的核心骨架组件。每集开头的"今天讲什么"、每章节的"三个关键点"都需要它。
    数字序号用 #da7756 橙色大字（40px bold），与正文色 #f5ece0 形成跳跃感，
    让观众扫视时可以快速数清条数。正文用 28px Body，行高 1.55，信息密度和可读性取平衡。
    每条之间用 rgba(245,236,224,.10) 细分割线隔开，保持节奏感但不沉重。
    可选 title 参数给整块内容加 H3 标题（40px），对应 theme.md 字号阶梯。
    最多 5 条是因为 16:9 主内容区 920px 高，5 条×最大高度约 160px + padding = 安全范围。
  `,

  when_to_use: [
    "章节开头列提纲：「今天讲四件事」",
    "技术概念的特性对比：「Agent Loop 的三个特点」",
    "步骤流程：「提示词拼装的四个槽位」",
  ],

  when_not_to_use: [
    "超过 5 条——改用两列 content-fourSlots 或拆成多张 slide",
    "条目之间有强逻辑依赖/流程箭头——改用 svg 流程图",
    "内容很短（单行词语）——改用 content-pillTags 更轻量",
  ],

  limitations: [
    "每条描述建议 ≤ 30 汉字，超长会换行导致条目高度不一致",
    "最多 5 条，超过会溢出主内容区",
    "无逐条进入动画——动画由 timeline enter/exit 控制整个层",
  ],

  inspired_by: "3Blue1Brown 章节要点卡 + Anthropic 文档列表风格",
  used_in: ["claude-code-源码讲解 E07 Slide 02 目录总览"],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "text-goldenQuote"],
  conflicts_with: [],
  alternatives: ["content-fourSlots（2×2网格）", "content-pillTags（无序标签）"],

  visual_weight: "medium",
  z_layer: "content",
  mood: ["informative", "structured"],

  tags: ["list", "keypoints", "numbered", "structured", "lecture", "outline"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure DOM list, no special rendering" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — numbered list, 2-5 items, optional title" },
  ],

  // ===== Params =====
  params: {
    title: {
      type: "string",
      default: "",
      semantic: "可选标题，显示在列表上方，如「今天讲四件事」",
    },
    items: {
      type: "array",
      required: true,
      semantic: "要点数组，每项 { text: string, note?: string }，2-5 条",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const items = Array.isArray(params.items) ? params.items : [];
    const title = params.title || "";
    const w = vp.width;
    const h = vp.height;
    const padX = Math.round(w * 0.05);
    const contentTop = 96;
    const topOffset = Math.round(h * 0.074);

    const numSize = Math.round(w * 0.021);
    const bodySize = Math.round(w * 0.0146);
    const noteSize = Math.round(w * 0.0115);
    const titleSize = Math.round(w * 0.0208);

    const itemsHtml = items.map((item, i) => {
      const text = escapeHtml(typeof item === "string" ? item : (item.text || ""));
      const note = (item && item.note) ? escapeHtml(item.note) : "";
      return `
        <div style="
          display:flex;align-items:flex-start;gap:${Math.round(w*0.0167)}px;
          padding:${Math.round(h*0.018)}px 0;
          border-bottom:1px solid rgba(245,236,224,0.10);
        ">
          <span style="
            color:#da7756;
            font:700 ${numSize}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
            min-width:${Math.round(w*0.026)}px;
            flex-shrink:0;
            padding-top:2px;
          ">${i + 1}</span>
          <div style="flex:1;">
            <div style="
              color:#f5ece0;
              font:500 ${bodySize}px/1.55 system-ui,-apple-system,'PingFang SC',sans-serif;
            ">${text}</div>
            ${note ? `<div style="
              color:rgba(245,236,224,0.50);
              font:400 ${noteSize}px/1.4 system-ui,-apple-system,'PingFang SC',sans-serif;
              margin-top:6px;
            ">${note}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    const titleHtml = title ? `
      <div style="
        color:rgba(245,236,224,0.75);
        font:600 ${titleSize}px/1.3 system-ui,-apple-system,'PingFang SC',sans-serif;
        margin-bottom:${Math.round(h*0.037)}px;
      ">${escapeHtml(title)}</div>
    ` : "";

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${padX}px;
        top:${contentTop + topOffset}px;
        width:${w - padX * 2}px;
      ">
        ${titleHtml}
        <div>${itemsHtml}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    const items = Array.isArray(params.items) ? params.items : [];
    return {
      sceneId: "keyPoints",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "title", value: params.title || "" },
        ...items.map((item, i) => ({
          type: "list-item",
          role: `item-${i + 1}`,
          value: typeof item === "string" ? item : item.text,
        })),
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.05),
        y: 176,
        w: Math.round(vp.width * 0.9),
        h: Math.round(vp.height * 0.7),
      },
    };
  },

  sample() {
    return {
      title: "今天讲四件事",
      items: [
        { text: "你看到的和我收到的，不是同一条消息", note: "微信类比：你打两字，数据包里有几十个字段" },
        { text: "提示词由四个槽位拼装而成", note: "出厂设置 / 用户配置 / 会话上下文 / 工具结果" },
        { text: "每一轮对话都重新拼一遍，不缓存", note: "87 类注入，每次全量" },
        { text: "Agent Loop 是一个 while(true) 循环", note: "直到没有工具调用为止" },
      ],
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
