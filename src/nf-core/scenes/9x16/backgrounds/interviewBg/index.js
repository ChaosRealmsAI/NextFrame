import { TOKENS } from "../../../shared/design.js";

export const meta = {
  id: "interviewBg",
  version: 2,
  ratio: "9:16",
  category: "backgrounds",
  label: "Interview Background",
  description: "Deep black interview background with a restrained warm glow.",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "bottom",
  tags: ["backgrounds", "interview", "dark", "9x16"],
  mood: ["focused", "editorial"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": {
      bg: TOKENS.interview.bg,
      glowColor: "rgba(218,119,86,0.08)",
      glowX: 50,
      glowY: 38,
      glowSize: 46,
    },
  },
  params: {
    bg: { type: "color", default: TOKENS.interview.bg, label: "背景色", group: "color" },
    glowColor: { type: "color", default: "rgba(218,119,86,0.08)", label: "光晕色", group: "color" },
    glowX: { type: "number", default: 50, label: "光晕 X(%)", group: "layout", range: [0, 100], step: 1 },
    glowY: { type: "number", default: 38, label: "光晕 Y(%)", group: "layout", range: [0, 100], step: 1 },
    glowSize: { type: "number", default: 46, label: "光晕尺寸(%)", group: "style", range: [10, 120], step: 1 },
  },
};

export function render(t, params, vp) {
  const bg = params.bg || TOKENS.interview.bg;
  const glowColor = params.glowColor || "rgba(218,119,86,0.08)";
  const glowX = Number.isFinite(params.glowX) ? params.glowX : 50;
  const glowY = Number.isFinite(params.glowY) ? params.glowY : 38;
  const glowSize = Number.isFinite(params.glowSize) ? params.glowSize : 46;
  const warmGlow = `radial-gradient(circle at ${glowX}% ${glowY}%, ${glowColor} 0%, transparent ${glowSize}%)`;
  const lowerLift = "radial-gradient(circle at 50% 78%, rgba(212,180,131,0.05) 0%, transparent 34%)";
  const vignette = "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.08) 18%, rgba(0,0,0,0.06) 42%, rgba(0,0,0,0.22) 100%)";
  const sideShade = "linear-gradient(90deg, rgba(0,0,0,0.2) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.2) 100%)";
  return `<div style="position:absolute;inset:0;overflow:hidden;background:${bg}">
  <div style="position:absolute;inset:0;background:${warmGlow}"></div>
  <div style="position:absolute;inset:0;background:${lowerLift}"></div>
  <div style="position:absolute;inset:0;background:${vignette}"></div>
  <div style="position:absolute;inset:0;background:${sideShade}"></div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "访谈背景" },
    { t: 10, label: "中段静帧" },
    { t: 19, label: "结尾" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.bg) errors.push("bg 不能为空。Fix: 传入背景色");
  return { ok: errors.length === 0, errors };
}
