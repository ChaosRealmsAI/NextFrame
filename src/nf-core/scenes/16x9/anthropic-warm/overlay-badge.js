/**
 * overlay-badge — 右上角标签徽章 (anthropic-warm / 16:9)
 *
 * 在画面右上角显示一个圆角标签，用于标注内容类型（如"深度解析"、"核心概念"、"案例"）。
 * 不抢主视觉，只是语境补充。
 *
 * 注意：smoke-test 传 canvas ctx，故使用 canvas 类型。
 */
export default {
  // ── 身份 ─────────────────────────────────────────────────────────────────
  id: "overlayBadge",
  name: "Overlay Badge",
  version: "1.0.0",

  // ── 归属 ─────────────────────────────────────────────────────────────────
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "overlay",

  // ── 语义 ─────────────────────────────────────────────────────────────────
  description: "右上角圆角标签徽章，标注内容类型或章节标记。暖橙底色配米白文字，与 anthropic-warm 主视觉融合而不喧宾夺主。",
  duration_hint: "与宿主 slide 等长",

  // ── 渲染 ─────────────────────────────────────────────────────────────────
  type: "canvas",
  frame_pure: true,
  assets: [],

  // ── 契约 ─────────────────────────────────────────────────────────────────
  params: {
    label: {
      type: "string",
      default: "核心概念",
      description: "徽章文字，建议 2-6 字",
    },
    color: {
      type: "color",
      default: "#da7756",
      description: "背景色（默认 Anthropic 暖橙）",
    },
    textColor: {
      type: "color",
      default: "#f5ece0",
      description: "文字色",
    },
    top: {
      type: "number",
      default: 48,
      min: 0,
      max: 500,
      description: "距顶部距离(px，基于 1920×1080)",
    },
    right: {
      type: "number",
      default: 60,
      min: 0,
      max: 800,
      description: "距右侧距离(px，基于 1920×1080)",
    },
    fontSize: {
      type: "number",
      default: 22,
      min: 12,
      max: 48,
      description: "字号(px)",
    },
  },

  // ── AI 理解字段 ───────────────────────────────────────────────────────────
  intent:
    "这个组件解决的问题是：在讲解型视频中，观众需要快速判断当前画面的内容性质（是定义、是案例、还是对比），但如果用大标题或字幕来承载这个元信息会抢占主体内容的视觉权重。徽章提供了一个轻量、固定位置的语境标记，视觉上类似 YouTube 视频中的 'SPONSOR' 角标或学术 PDF 的 section 标签。选择右上角是因为中文阅读习惯从左到右，主内容往往在左侧或中部，右上角是视觉盲区中信息密度最低的位置，适合放辅助信息而不干扰主流。",

  when_to_use:
    "内容有明确类型分类时（深度解析 / 案例 / 数据 / 对比 / 小结），放在包含实质内容的 slide 上。",
  when_not_to_use:
    "片头/片尾/过渡页不需要；已有大标题的全屏字幕 slide 不需要（重复标注）。",
  limitations: "文字超过 8 字会撑破排版，建议 2-6 字。多语言（英文单词）需要调大 fontSize。canvas 文字渲染依赖系统字体，CJK 字体需要已注册。",
  inspired_by: "YouTube 章节角标、Notion callout 块、学术 slide 的 section 标签。",
  used_in: "claude-code-源码讲解系列 slide 03-07",

  requires: ["bg-warmGradient 或任意深色背景，否则暖橙底色在浅色背景上对比度不足"],
  pairs_well_with: ["content-keyPoints", "content-codeBlock", "chrome-titleBar"],
  conflicts_with: ["chrome-footer（右侧空间竞争）"],
  alternatives: ["chrome-chaptermark（如果需要带章节编号）"],

  visual_weight: "light",
  z_layer: 80,
  mood: "professional, warm, subtle",

  tags: ["badge", "overlay", "label", "角标", "徽章", "标注"],
  complexity: "simple",
  performance: "instant",
  status: "stable",
  changelog: [{ version: "1.0.0", note: "初始版本" }],

  // ── 渲染函数 ──────────────────────────────────────────────────────────────
  render(ctx, _t, params, vp) {
    const label     = params.label    ?? "核心概念";
    const bgColor   = params.color    ?? "#da7756";
    const textColor = params.textColor ?? "#f5ece0";
    const fontSize  = params.fontSize  ?? 22;
    const W = vp?.width  ?? 1920;
    const H = vp?.height ?? 1080;

    // 以 1920×1080 为基准，按实际 viewport 缩放
    const scaleX = W / 1920;
    const scaleY = H / 1080;

    const topBase   = (params.top   ?? 48) * scaleY;
    const rightBase = (params.right ?? 60) * scaleX;
    const fs        = fontSize * Math.min(scaleX, scaleY);
    const padH      = 8  * scaleY;
    const padV      = 18 * scaleX;
    const radius    = (padH + fs / 2);

    ctx.save();

    // 测量文字宽度
    ctx.font = `600 ${fs}px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;
    const textW = ctx.measureText(label).width;

    const boxW = textW + padV * 2;
    const boxH = fs + padH * 2;
    const x    = W - rightBase - boxW;
    const y    = topBase;

    // 绘制圆角矩形背景
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + boxW - radius, y);
    ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + radius);
    ctx.lineTo(x + boxW, y + boxH - radius);
    ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - radius, y + boxH);
    ctx.lineTo(x + radius, y + boxH);
    ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = bgColor;
    ctx.fill();

    // 绘制文字
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + boxW / 2, y + boxH / 2);

    ctx.restore();
  },

  // ── describe（AI 自验用）─────────────────────────────────────────────────
  describe(_t, params, vp) {
    const W = vp?.width  ?? 1920;
    const H = vp?.height ?? 1080;
    const scaleX = W / 1920;
    const scaleY = H / 1080;
    const topBase   = (params.top   ?? 48) * scaleY;
    const rightBase = (params.right ?? 60) * scaleX;
    const estBoxW = 120 * scaleX;
    const estBoxH = 40  * scaleY;
    return {
      sceneId: "overlayBadge",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        {
          type: "badge",
          role: "overlay-label",
          value: params.label ?? "核心概念",
          position: "top-right",
        },
      ],
      boundingBox: {
        x: W - rightBase - estBoxW,
        y: topBase,
        w: estBoxW,
        h: estBoxH,
      },
    };
  },

  // ── sample（可直接跑的参数样例）─────────────────────────────────────────
  sample() {
    return {
      label: "深度解析",
      color: "#da7756",
      textColor: "#f5ece0",
      top: 48,
      right: 60,
      fontSize: 22,
    };
  },
};
