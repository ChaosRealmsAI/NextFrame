import { getPreset, scaleW, scaleH } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

export const meta = {
  id: "interviewBg",
  version: 1,
  ratio: "9:16",
  category: "backgrounds",
  label: "Interview Background",
  description: "9:16 访谈视频深色背景，带金色网格点和径向光晕。",
  tech: "dom",
  duration_hint: 60,
  loopable: true,
  z_hint: "bottom",
  tags: ["interview", "background", "9x16"],
  mood: ["editorial", "dark", "premium"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {},
  ai: {
    when: "用作 9:16 访谈视频的全程底板层。",
    how: "整段时间全程铺底，无需参数。",
    avoid: "不要再叠加第二个全屏背景层。",
  },
};

export function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const dotSpacingW = scaleW(vp, 32, baseW);
  const dotSpacingH = scaleH(vp, 32, baseH);
  const dotSize = Math.max(1, scaleW(vp, 2, baseW));

  return `
    <div style="position:absolute;inset:0;overflow:hidden;background:${colors.bg || "#111111"};">
      <div style="position:absolute;inset:0;background-image:radial-gradient(circle,${colors.gridDot || "rgba(232,196,122,0.08)"} ${dotSize}px,transparent ${dotSize}px);background-size:${dotSpacingW}px ${dotSpacingH}px;"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 20%,${colors.glowTop || "rgba(232,196,122,0.03)"} 0%,transparent 60%);"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 85%,${colors.glowBottom || "rgba(232,196,122,0.02)"} 0%,transparent 50%);"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,transparent 40%,${colors.vignette || "rgba(17,17,17,0.5)"} 100%);"></div>
    </div>
  `;
}

export function screenshots() {
  return [{ t: 0.5, label: "bg" }];
}

export function lint() {
  return { ok: true, errors: [] };
}
