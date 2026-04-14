import { TOKENS, esc, escAttr, easeOutCubic, fadeIn, sw16, sh16 } from "../../../shared/design.js";

export const meta = {
  id: "darkGradient",
  version: 1,
  ratio: "16:9",
  category: "backgrounds",
  label: "Dark Gradient",
  description: "深色暖棕背景，带极轻微的径向光晕。适合讲解、课程和访谈类视频，不会像极光背景那样抢戏。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "bottom",
  tags: ["background", "dark", "gradient", "lecture", "subtle"],
  mood: ["calm", "focused", "professional"],
  theme: ["education", "lecture", "interview"],
  default_theme: "warm-lecture",
  themes: {
    "warm-lecture": { bg: TOKENS.lecture.bg, glowColor: "rgba(218,119,86,0.16)", glowX: 52, glowY: 34, glowSize: 54 },
    "charcoal-focus": { bg: "#121214", glowColor: "rgba(138,180,204,0.12)", glowX: 50, glowY: 30, glowSize: 48 },
    "espresso-soft": { bg: "#18110d", glowColor: "rgba(212,180,131,0.12)", glowX: 48, glowY: 28, glowSize: 44 },
  },
  params: {
    bg: { type: "color", default: TOKENS.lecture.bg, label: "背景色", semantic: "base background color covering the full viewport", group: "color" },
    glowColor: { type: "color", default: "rgba(218,119,86,0.16)", label: "光晕色", semantic: "color used in the subtle radial glow overlay", group: "color" },
    glowX: { type: "number", default: 52, label: "光晕 X(%)", semantic: "horizontal glow anchor in percent of viewport width", group: "layout", range: [0, 100], step: 1 },
    glowY: { type: "number", default: 34, label: "光晕 Y(%)", semantic: "vertical glow anchor in percent of viewport height", group: "layout", range: [0, 100], step: 1 },
    glowSize: { type: "number", default: 54, label: "光晕尺寸(%)", semantic: "radial glow falloff size in percent, larger values spread the glow wider", group: "style", range: [10, 120], step: 1 },
  },
  ai: {
    when: "做课程讲解、lecture video、访谈说明等需要克制背景的时候使用。",
    how: "放在最底层作为全屏背景。只调 bg 和 glowColor 就能快速换气质；glowX/glowY 控制光斑落点。",
    example: { bg: TOKENS.lecture.bg, glowColor: "rgba(218,119,86,0.16)", glowX: 52, glowY: 34, glowSize: 54 },
    theme_guide: { "warm-lecture": "默认暖棕 lecture 背景", "charcoal-focus": "偏冷深灰，适合科技内容", "espresso-soft": "更柔和的棕黑" },
    avoid: "不要再叠加其他背景 scene；glowSize 太大或 glowColor 太亮会让文字对比变差。",
    pairs_with: ["videoClip", "slideChrome", "subtitleBar"],
  },
};

export function render(t, params, vp) {
  const bg = params.bg || TOKENS.lecture.bg;
  const glowColor = params.glowColor || "rgba(218,119,86,0.16)";
  const glowX = Number.isFinite(params.glowX) ? params.glowX : 52;
  const glowY = Number.isFinite(params.glowY) ? params.glowY : 34;
  const glowSize = Number.isFinite(params.glowSize) ? params.glowSize : 54;
  const glow = `radial-gradient(circle at ${glowX}% ${glowY}%, ${glowColor} 0%, transparent ${glowSize}%)`;
  const vignette = "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.4) 100%)";
  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;overflow:hidden;background:${bg}">
  <div style="position:absolute;inset:0;background:${glow}"></div>
  <div style="position:absolute;inset:0;background:${vignette}"></div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "默认背景" },
    { t: 8, label: "中段静帧" },
    { t: 20, label: "长期保持" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.bg) errors.push("bg 不能为空。Fix: 传入背景色");
  if (!params.glowColor) errors.push("glowColor 不能为空。Fix: 传入光晕色");
  if (params.glowX < 0 || params.glowX > 100) errors.push("glowX 超出范围 [0, 100]。Fix: 设为 0–100");
  if (params.glowY < 0 || params.glowY > 100) errors.push("glowY 超出范围 [0, 100]。Fix: 设为 0–100");
  if (params.glowSize < 10 || params.glowSize > 120) errors.push("glowSize 超出范围 [10, 120]。Fix: 设为 10–120");
  return { ok: errors.length === 0, errors };
}
