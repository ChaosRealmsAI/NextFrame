// interviewBg — deep black background with gold glow, dot grid, vignette
import { TOKENS, GRID, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "interviewBg",
  version: 1,
  ratio: "9:16",
  category: "backgrounds",
  label: "Interview Background",
  description: "Deep black background with gold radial glow, dot grid, and vignette — base layer for all 9:16 interview slides",
  tech: "dom",
  duration_hint: 60,
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {},
  ai: {
    when: "Always use as the bottom-most layer for 9:16 interview videos",
    how: "No params needed. Place at z-order 0 with start:0, dur:total_duration",
  },
};

export function render(t, params, vp) {
  const bg = TOKENS.interview.bg;
  const glowTop = TOKENS.interview.glowTop;
  const glowBottom = TOKENS.interview.glowBottom;
  const gridDot = TOKENS.interview.gridDot;
  const vignette = TOKENS.interview.vignette;

  const w = vp.width;
  const h = vp.height;

  return `<div style="position:absolute;inset:0;background:${bg};overflow:hidden">
  <!-- Radial gold glow top -->
  <div style="position:absolute;left:0;right:0;top:0;height:${scaleH(vp, 600)}px;background:radial-gradient(ellipse 80% 50% at 50% 0%,${glowTop},transparent);pointer-events:none"></div>
  <!-- Radial gold glow bottom -->
  <div style="position:absolute;left:0;right:0;bottom:0;height:${scaleH(vp, 500)}px;background:radial-gradient(ellipse 80% 40% at 50% 100%,${glowBottom},transparent);pointer-events:none"></div>
  <!-- Dot grid overlay -->
  <div style="position:absolute;inset:0;background-image:radial-gradient(circle,${gridDot} 1px,transparent 1px);background-size:${scaleW(vp, 32)}px ${scaleH(vp, 32)}px;pointer-events:none"></div>
  <!-- Vignette -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse 120% 100% at 50% 50%,transparent 40%,${vignette} 100%);pointer-events:none"></div>
</div>`;
}

export function screenshots() {
  return [{ t: 0.5, label: "background" }];
}

export function lint(params, vp) {
  return { ok: true, errors: [] };
}
