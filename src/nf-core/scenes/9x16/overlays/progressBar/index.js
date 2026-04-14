export const meta = {
  // ─── 身份 ───
  id: "progressBar",
  version: 1,
  ratio: "9:16",

  // ─── 分类与发现 ───
  category: "overlays",
  label: "Progress Bar",
  description: "细条进度条从左向右填充，前端带发光圆点。可放置顶部或底部，适合计时感、进度感场景。",
  tags: ["progress", "timeline", "indicator", "glow", "bar", "countdown"],
  mood: ["focused", "energetic", "clean"],
  theme: ["tech", "business", "minimal"],

  // ─── 渲染 ───
  tech: "dom",
  duration_hint: 8,
  loopable: true,
  z_hint: "top",

  // ─── 主题预设 ───
  default_theme: "indigo-glow",
  themes: {
    "indigo-glow":   { hue: 245, barHeight: 3, glowSize: 10, position: "bottom" },
    "cyan-pulse":    { hue: 185, barHeight: 4, glowSize: 14, position: "bottom" },
    "amber-energy":  { hue: 38,  barHeight: 3, glowSize: 12, position: "top" },
    "rose-neon":     { hue: 345, barHeight: 5, glowSize: 16, position: "bottom" },
    "lime-minimal":  { hue: 100, barHeight: 2, glowSize: 8,  position: "top" },
  },

  // ─── 参数 ───
  params: {
    barHeight: {
      type: "number",
      default: 3,
      range: [1, 10],
      step: 1,
      label: "条高度(px)",
      semantic: "height of the progress bar in pixels: 1=hairline, 3=standard, 6=chunky",
      group: "style",
    },
    hue: {
      type: "number",
      default: 245,
      range: [0, 360],
      step: 1,
      label: "色相",
      semantic: "hue angle on color wheel: 0=red, 120=green, 185=cyan, 245=indigo, 300=purple",
      group: "color",
    },
    glowSize: {
      type: "number",
      default: 10,
      range: [0, 30],
      step: 1,
      label: "发光半径",
      semantic: "radius of the glow dot in pixels: 0=no glow, 10=subtle, 20=prominent halo",
      group: "style",
    },
    position: {
      type: "enum",
      default: "bottom",
      options: ["top", "bottom"],
      label: "位置",
      semantic: "vertical placement: top=top 5% of screen, bottom=bottom 5% of screen",
      group: "shape",
    },
  },

  // ─── AI 指南 ───
  ai: {
    when: "需要传递时间流逝或进度推进感时使用。适合：倒计时场景、章节过渡、数据加载演示、技巧步骤讲解",
    how: "放在 z-index 最顶层，配合背景和标题 scene 叠加使用。duration 设为视频段落的实际时长，进度条随时间自动填满。",
    example: { barHeight: 3, hue: 245, glowSize: 10, position: "bottom" },
    theme_guide: "indigo-glow=深邃蓝紫, cyan-pulse=科技青, amber-energy=活力橙, rose-neon=霓虹粉, lime-minimal=清新绿",
    avoid: "不要和其他进度条 scene 叠加；时长超过 30 秒时考虑换循环动画代替",
    pairs_with: ["auroraGradient", "kineticHeadline", "lowerThirdVelvet"],
  },
};

export function render(t, params, vp) {
  const { barHeight, hue, glowSize, position } = params;
  const W = vp.width;
  const H = vp.height;
  const DURATION = 8;
  const progress = Math.min(1, t / DURATION);
  const fillW = Math.round(W * progress);

  const offsetY = position === "top"
    ? Math.round(H * 0.05)
    : Math.round(H * 0.95);

  const barTop = position === "top"
    ? offsetY
    : offsetY - barHeight;

  const dotX = fillW;
  const dotY = barTop + Math.round(barHeight / 2);

  const trackColor = `hsla(${hue},60%,60%,0.18)`;
  const fillColor = `hsl(${hue},80%,65%)`;
  const glowColor = `hsl(${hue},90%,70%)`;

  return `<div style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;pointer-events:none;overflow:hidden">
  <!-- track -->
  <div style="position:absolute;top:${barTop}px;left:0;width:${W}px;height:${barHeight}px;background:${trackColor};border-radius:${barHeight}px"></div>
  <!-- fill -->
  <div style="position:absolute;top:${barTop}px;left:0;width:${fillW}px;height:${barHeight}px;background:${fillColor};border-radius:${barHeight}px"></div>
  <!-- glow dot -->
  ${glowSize > 0 ? `<div style="position:absolute;top:${dotY - glowSize}px;left:${dotX - glowSize}px;width:${glowSize * 2}px;height:${glowSize * 2}px;border-radius:50%;background:radial-gradient(circle,${glowColor} 0%,transparent 70%);opacity:0.85"></div>` : ""}
  <!-- leading dot -->
  <div style="position:absolute;top:${dotY - Math.ceil(barHeight * 1.5)}px;left:${dotX - Math.ceil(barHeight * 1.5)}px;width:${Math.ceil(barHeight * 3)}px;height:${Math.ceil(barHeight * 3)}px;border-radius:50%;background:${fillColor};box-shadow:0 0 ${Math.round(barHeight * 4)}px ${fillColor}"></div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0,   label: "起点（空条）" },
    { t: 2,   label: "25% 进度" },
    { t: 4,   label: "50% 中点" },
    { t: 7.9, label: "接近满格" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.barHeight < 1 || params.barHeight > 10) {
    errors.push("barHeight 超出范围 [1, 10]。Fix: 设为 1–10 之间的整数");
  }
  if (params.hue < 0 || params.hue > 360) {
    errors.push("hue 超出范围 [0, 360]。Fix: 设为 0–360 之间的数值");
  }
  if (params.glowSize < 0 || params.glowSize > 30) {
    errors.push("glowSize 超出范围 [0, 30]。Fix: 设为 0–30 之间的整数");
  }
  if (!["top", "bottom"].includes(params.position)) {
    errors.push(`position 无效值 "${params.position}"。Fix: 只能是 "top" 或 "bottom"`);
  }
  return { ok: errors.length === 0, errors };
}
