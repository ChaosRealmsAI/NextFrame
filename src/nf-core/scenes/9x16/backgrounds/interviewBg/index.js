import { TOKENS, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "interviewBg",
  version: 1,
  ratio: "9:16",
  category: "backgrounds",
  label: "Interview Background",
  description: "访谈竖屏背景：深黑底色 + 金色双径向光晕 + 点阵网格 + 暗角。适配 MediaAgentTeam / INTERVIEW 合集风格。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "bottom",
  tags: ["background", "dark", "interview", "gold", "9x16"],
  mood: ["premium", "focused", "professional"],
  theme: ["interview", "talk", "vertical"],
  default_theme: "interview-dark",
  themes: {
    "interview-dark": {
      bg: TOKENS.interview.bg,
      glowTop: TOKENS.interview.glowTop,
      glowBottom: TOKENS.interview.glowBottom,
      gridDot: TOKENS.interview.gridDot,
      vignette: TOKENS.interview.vignette,
    },
  },
  params: {
    bg: { type: "color", default: TOKENS.interview.bg, label: "背景色", semantic: "full-viewport base color", group: "color" },
    glowTop: { type: "color", default: TOKENS.interview.glowTop, label: "顶部光晕色", semantic: "radial glow at top 20% of frame", group: "color" },
    glowBottom: { type: "color", default: TOKENS.interview.glowBottom, label: "底部光晕色", semantic: "radial glow at bottom 85% of frame", group: "color" },
    gridDot: { type: "color", default: TOKENS.interview.gridDot, label: "网格点色", semantic: "dot grid overlay color", group: "color" },
    vignette: { type: "color", default: TOKENS.interview.vignette, label: "暗角色", semantic: "radial vignette edge darkening", group: "color" },
  },
  ai: {
    when: "访谈、竖屏短视频、对话类内容需要精致深色背景时使用。",
    how: "放在最底层，其他 overlay scene 叠在上面。通常无需修改参数，直接使用默认值即可。",
    example: {},
    avoid: "不要再叠加其他 background scene；不要改变光晕位置，否则视觉风格会偏离设计系统。",
    pairs_with: ["interviewHeader", "interviewMeta", "interviewBiSub", "interviewBrand", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const bg = params.bg || TOKENS.interview.bg;
  const glowTop = params.glowTop || TOKENS.interview.glowTop;
  const glowBottom = params.glowBottom || TOKENS.interview.glowBottom;
  const gridDot = params.gridDot || TOKENS.interview.gridDot;
  const vignette = params.vignette || TOKENS.interview.vignette;

  // Dot grid: 40px at 1080px width → scale to viewport
  const dotSpacing = scaleW(vp, 40);
  const dotSize = Math.max(1, Math.round(scaleW(vp, 2)));

  // Radial glows: top at 50% / 20%, bottom at 50% / 85%
  const glowTopCss = `radial-gradient(ellipse 80% 40% at 50% 20%, ${glowTop} 0%, transparent 70%)`;
  const glowBottomCss = `radial-gradient(ellipse 80% 40% at 50% 85%, ${glowBottom} 0%, transparent 70%)`;

  // Vignette: radial from center, dark on edges
  const vignetteCss = `radial-gradient(ellipse 90% 90% at 50% 50%, transparent 60%, ${vignette} 100%)`;

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;overflow:hidden;background:${bg}">` +
    // Top glow
    `<div style="position:absolute;inset:0;background:${glowTopCss};pointer-events:none"></div>` +
    // Bottom glow
    `<div style="position:absolute;inset:0;background:${glowBottomCss};pointer-events:none"></div>` +
    // Dot grid via CSS radial-gradient pattern
    `<div style="position:absolute;inset:0;background-image:radial-gradient(circle,${gridDot} ${dotSize}px,transparent ${dotSize}px);background-size:${dotSpacing}px ${dotSpacing}px;pointer-events:none"></div>` +
    // Vignette overlay
    `<div style="position:absolute;inset:0;background:${vignetteCss};pointer-events:none"></div>` +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "背景静帧" },
    { t: 10, label: "中段静帧" },
    { t: 25, label: "持续态" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.bg) errors.push("bg 不能为空。Fix: 传入背景色");
  if (!params.glowTop) errors.push("glowTop 不能为空。Fix: 传入顶部光晕色");
  if (!params.glowBottom) errors.push("glowBottom 不能为空。Fix: 传入底部光晕色");
  if (!params.gridDot) errors.push("gridDot 不能为空。Fix: 传入网格点色");
  if (!params.vignette) errors.push("vignette 不能为空。Fix: 传入暗角色");
  return { ok: errors.length === 0, errors };
}
