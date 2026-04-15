// scenes/16x9/anthropic-warm/content-statNumber.js
// 巨大数字组件：数字冲击 + 单位 + 解释文本。

export default {
  // ===== 身份 =====
  id: "statNumber",
  name: "Stat Number 数据大数字",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "居中巨大数字展示，适合呈现 87 类、15 维度、4 槽位一类的核心量级",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    这个组件的目标不是做“数据可视化”，而是做“量级冲击”。当观众还没有完全理解 87 类、15 维度意味着什么时，一个巨大数字先把心理尺度拉开，后面的解释才会有重量。所以数字必须足够大、足够靠中间，并且和单位、标签形成明确层级：数字负责冲击，单位负责语义归类，label 和 sublabel 负责把冲击落回讲解结论。视觉上采用暖橙渐变和金色单位，是为了让它看起来像主题里最重要的一记重音，而不是报表界面。
  `,

  when_to_use: [
    "强调 87 类、15 维度、4 槽位这类核心数字时",
    "章节开头先打量级，再进入结构拆解时",
    "总结页需要用一个数字收束观众记忆时",
  ],

  when_not_to_use: [
    "需要比较多组数字关系时，单一 statNumber 不够用",
    "数字本身不重要，重点在流程或解释文字时",
    "一屏里已经有太多大字组件，会互相争主次时",
  ],

  limitations: [
    "更适合 1~4 位数字，过长数字需要手动缩写",
    "只承载单个核心量级，不适合多组指标并排",
    "不做自动计数动画，动态变化应由 timeline 控制",
  ],

  inspired_by: "landscape-atoms/stat-number.html 的中心重音式数字呈现",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07/19-summary"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["titleBar", "footer", "flowDiagram"],
  conflicts_with: ["goldenQuote", "headline"],
  alternatives: ["keyPoints", "pillTags", "compare-cols"],

  // ===== 视觉权重 =====
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["bold", "confident", "memorable"],

  // ===== 索引 =====
  tags: [
    "大数字", "stat", "number", "metric", "hero number", "87 类",
    "15 维度", "数据冲击", "summary number",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "少量 fillText 和线性渐变" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 数据冲击大数字组件" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    number: {
      type: "string",
      required: true,
      semantic: "主数字",
      purpose: "第一眼建立量级冲击",
      constraints: ["建议 1~4 位", "字符串或数字均可"],
      common_mistakes: ["把解释文本拼进 number，破坏数字冲击"],
    },
    unit: {
      type: "string",
      default: "",
      semantic: "数字单位",
      purpose: "告诉观众这个数在统计什么",
      constraints: ["建议 1~4 个字"],
    },
    label: {
      type: "string",
      default: "",
      semantic: "主标签",
      purpose: "补充数字的正式含义",
      constraints: ["建议 ≤ 16 汉字"],
    },
    sublabel: {
      type: "string",
      default: "",
      semantic: "副文字",
      purpose: "把数字拉回口播结论或情绪层",
      constraints: ["建议 ≤ 30 汉字"],
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
    const number = String(params.number ?? "87");
    const unit = params.unit || "";
    const digits = number.length;
    const numberSize = Math.round(H * (digits >= 4 ? 0.18 : 0.22));
    const unitSize = Math.round(H * 0.05);
    const numberY = H * 0.4;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const gradient = ctx.createLinearGradient(W * 0.36, 0, W * 0.64, 0);
    gradient.addColorStop(0, "#da7756");
    gradient.addColorStop(1, "#e8956f");
    ctx.fillStyle = gradient;
    ctx.font = `900 ${numberSize}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
    ctx.fillText(number, W * 0.5, numberY);

    if (unit) {
      ctx.fillStyle = "#d4b483";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 ${unitSize}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(unit, W * 0.5 + ctx.measureText(number).width * 0.52, numberY - H * 0.02);
    }

    if (params.label) {
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#f5ece0";
      ctx.font = `700 ${Math.round(H * 0.042)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(params.label, W * 0.5, H * 0.56);
    }

    if (params.sublabel) {
      ctx.fillStyle = "#d4b483";
      ctx.font = `700 ${Math.round(H * 0.033)}px Georgia, "Hiragino Mincho ProN", "Noto Serif SC", serif`;
      ctx.fillText(params.sublabel, W * 0.5, H * 0.66);
    }
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "statNumber",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "number", value: String(params.number ?? "87") },
        { type: "text", role: "unit", value: params.unit || "" },
        { type: "text", role: "label", value: params.label || "" },
        { type: "text", role: "sublabel", value: params.sublabel || "" },
      ],
      boundingBox: {
        x: viewport.width * 0.2,
        y: viewport.height * 0.22,
        w: viewport.width * 0.6,
        h: viewport.height * 0.5,
      },
    };
  },

  sample() {
    return {
      number: "87",
      unit: "类",
      label: "内容类型",
      sublabel: "你写了 1 行，系统拼了 87 类",
    };
  },
};
