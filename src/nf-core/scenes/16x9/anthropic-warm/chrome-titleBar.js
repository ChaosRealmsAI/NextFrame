// scenes/16x9/anthropic-warm/chrome-titleBar.js
// 顶部 chrome：左系列名，中间集数，右时间。用于建立整集统一框架。

export default {
  // ===== 身份 =====
  id: "titleBar",
  name: "Title Bar 顶部条",
  version: "1.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "chrome",

  // ===== 一句话 =====
  description: "顶部 72px 品牌条，左侧合集名、中间集数、右侧时间显示",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ========================================
  // ===== AI 理解层 =====
  // ========================================

  intent: `
    这个顶部条的任务不是装饰，而是给观众一个稳定的阅读框架。讲解类视频一旦连续切很多不同内容卡片，观众会失去“我现在还在同一集里”的连续感，所以顶部条把系列名、集数和时间固定成一条窄 chrome。左侧系列名负责品牌记忆，中间集数负责章节定位，右侧时间负责建立“正在播放”的媒介感。高度控制在 72px 内，是为了压住存在感，既不侵占主内容区，也不让画面像网页导航栏那样喧宾夺主。
  `,

  when_to_use: [
    "整集教学视频需要统一框架和连续观看感时",
    "章节页和内容页都希望保留相同品牌 chrome 时",
    "搭配底部品牌带形成上下闭环构图时",
  ],

  when_not_to_use: [
    "封面页需要纯净大留白且不希望任何 chrome 干扰时",
    "全屏截图或实拍素材已经自带顶部 UI 信息时",
    "竖屏或其他 ratio 采用不同安全边距体系时",
  ],

  limitations: [
    "只显示单行文本，不负责长标题换行",
    "时间为传入字符串，不内置动态计时逻辑",
    "默认使用中文系列名布局，英文长标题需要缩短",
  ],

  inspired_by: "Apple keynote 的细顶栏节奏 + 原子页统一 top title 结构",
  used_in: ["MediaAgentTeam/series/claude-code-源码讲解/E07"],

  // ===== 配伍 =====
  requires: ["warmGradient"],
  pairs_well_with: ["footer", "headline", "goldenQuote", "statNumber"],
  conflicts_with: ["interviewHeader"],
  alternatives: ["无 chrome 标题页", "左上角 headline 小标题"],

  // ===== 视觉权重 =====
  visual_weight: "light",
  z_layer: "foreground",
  mood: ["professional", "steady", "editorial"],

  // ===== 索引 =====
  tags: [
    "顶部条", "title bar", "chrome", "navbar", "episode", "timecode",
    "Claude Code", "系列", "框架", "branding",
  ],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "文字和一条分隔线，无复杂路径" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 建立 anthropic-warm 顶部 chrome" },
  ],

  // ========================================
  // ===== 参数契约 =====
  // ========================================
  params: {
    collection: {
      type: "string",
      default: "Claude Code 讲解",
      semantic: "左侧合集名",
      purpose: "固定系列身份，帮助观众确认节目上下文",
      constraints: ["建议 ≤ 12 个汉字", "单行显示"],
      common_mistakes: ["把章节标题塞到 collection，导致左侧过长"],
    },
    episode: {
      type: "string",
      default: "E07",
      semantic: "中间集数",
      purpose: "快速定位当前集别",
      constraints: ["建议格式类似 E07", "单行显示"],
    },
    time: {
      type: "string",
      default: "20:07",
      semantic: "右侧时间文本",
      purpose: "提供播放中的媒介感和节奏锚点",
      constraints: ["建议 mm:ss 或 hh:mm:ss", "单行显示"],
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
    const barH = H * (72 / 1080);
    const lineY = barH - H * (10 / 1080);
    const padX = W * (96 / 1920);
    const collection = params.collection || "Claude Code 讲解";
    const episode = params.episode || "E07";
    const time = params.time || "20:07";

    ctx.fillStyle = "rgba(21,17,12,0.18)";
    ctx.fillRect(0, 0, W, barH);

    ctx.strokeStyle = "rgba(245,236,224,0.1)";
    ctx.lineWidth = Math.max(1, W * 0.0007);
    ctx.beginPath();
    ctx.moveTo(padX, lineY);
    ctx.lineTo(W - padX, lineY);
    ctx.stroke();

    ctx.textBaseline = "alphabetic";

    ctx.textAlign = "left";
    ctx.fillStyle = "#f5ece0";
    ctx.font = `700 ${Math.round(H * 0.022)}px system-ui, -apple-system, "PingFang SC", sans-serif`;
    ctx.fillText(collection, padX, lineY - H * 0.012);

    ctx.textAlign = "center";
    ctx.fillStyle = "#da7756";
    ctx.font = `700 ${Math.round(H * 0.029)}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
    ctx.fillText(episode, W * 0.5, lineY - H * 0.01);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(245,236,224,0.75)";
    ctx.font = `600 ${Math.round(H * 0.021)}px "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace`;
    ctx.fillText(time, W - padX, lineY - H * 0.012);
  },

  describe(_t, params, viewport) {
    return {
      sceneId: "titleBar",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "collection", value: params.collection || "Claude Code 讲解" },
        { type: "text", role: "episode", value: params.episode || "E07" },
        { type: "text", role: "time", value: params.time || "20:07" },
        { type: "rule", role: "divider", color: "rgba(245,236,224,0.1)" },
      ],
      boundingBox: { x: 0, y: 0, w: viewport.width, h: viewport.height * (72 / 1080) },
    };
  },

  sample() {
    return {
      collection: "Claude Code 讲解",
      episode: "E07",
      time: "20:07",
    };
  },
};
