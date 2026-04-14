export const meta = {
  id: "demoBg",
  version: 1,
  ratio: "16:9",
  category: "backgrounds",
  label: "Demo Background",
  description: "深色渐变背景，用于 demo 展示。支持多种暗色主题。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "bottom",
  tags: ["background", "dark", "gradient", "demo"],
  mood: ["professional", "calm", "mysterious"],
  theme: ["tech", "dark", "minimal"],
  default_theme: "deep-space",
  themes: {
    "deep-space":  { colorA: "#0a0a1a", colorB: "#0d1a2e", colorC: "#0a1220" },
    "dark-slate":  { colorA: "#0f0f0f", colorB: "#1a1a2e", colorC: "#16213e" },
    "midnight":    { colorA: "#050510", colorB: "#0d0d1f", colorC: "#080818" },
  },
  params: {
    colorA: { type: "string", default: "#0a0a1a", label: "背景色A", semantic: "primary background color, top-left area", group: "color" },
    colorB: { type: "string", default: "#0d1a2e", label: "背景色B", semantic: "secondary background color, center", group: "color" },
    colorC: { type: "string", default: "#0a1220", label: "背景色C", semantic: "tertiary background color, bottom-right", group: "color" },
  },
  ai: {
    when: "需要深色背景时放在最底层，适合所有 demo 场景",
    how: "z-index 最低，全屏铺满，start=0 dur=全视频时长",
    example: { colorA: "#0a0a1a", colorB: "#0d1a2e", colorC: "#0a1220" },
    theme_guide: { "deep-space": "深邃宇宙蓝", "dark-slate": "经典深色", "midnight": "极暗午夜" },
    avoid: "不要叠加其他背景 scene",
    pairs_with: ["demoBarSvg", "demoParticles", "demoCompareCards", "demoCodeBlock"],
  },
};

export function render(t, params, vp) {
  const { colorA, colorB, colorC } = params;
  const W = vp.width, H = vp.height;
  return `<div style="position:absolute;inset:0;width:${W}px;height:${H}px;background:radial-gradient(ellipse at 30% 40%, ${colorB} 0%, ${colorA} 50%, ${colorC} 100%);overflow:hidden">
  <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.02) 0%,transparent 50%,rgba(0,0,0,0.1) 100%)"></div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "初始状态" },
    { t: 15, label: "中间" },
    { t: 29, label: "结束" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  const hexRe = /^#[0-9a-fA-F]{3,8}$/;
  if (!hexRe.test(params.colorA)) errors.push("colorA 必须是合法 hex 颜色");
  if (!hexRe.test(params.colorB)) errors.push("colorB 必须是合法 hex 颜色");
  if (!hexRe.test(params.colorC)) errors.push("colorC 必须是合法 hex 颜色");
  return { ok: errors.length === 0, errors };
}
