import { getPreset, scaleW, scaleH, clamp01 } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

export const meta = {
  id: "progressBar9x16",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Progress Bar 9:16",
  description: "9:16 访谈视频进度条，位于字幕区和品牌区之间。",
  tech: "dom",
  duration_hint: 60,
  z_hint: "top",
  tags: ["interview", "progress", "9x16"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {
    duration: { type: "number", default: 60, label: "总时长（秒）", group: "timing", range: [1, 600] },
  },
  ai: {
    when: "9:16 访谈视频进度条，放在 meta/字幕区下方。",
    how: "duration 传视频总时长，进度条自动跟进。",
  },
};

export function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const dur = Number.isFinite(params.duration) && params.duration > 0 ? params.duration : 60;
  const progress = clamp01(t / dur);

  const progressY   = scaleH(vp, layout.progress || 1496, baseH);
  const sidePad     = scaleW(vp, layout.sidePad || 80, baseW);
  const barH        = Math.max(2, scaleH(vp, 4, baseH));
  const knobSize    = Math.max(6, scaleW(vp, 12, baseW));
  const trackWidth  = vp.width - sidePad * 2;
  const filled      = Math.round(progress * trackWidth);

  return `
    <div style="position:absolute;left:${sidePad}px;top:${progressY}px;width:${trackWidth}px;">
      <div style="position:relative;height:${barH}px;background:${colors.textFaint || "rgba(255,255,255,0.3)"};border-radius:${barH}px;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;height:100%;width:${filled}px;background:linear-gradient(90deg,${colors.accent || "#da7756"},${colors.primary || "#e8c47a"});border-radius:${barH}px;box-shadow:0 0 ${scaleW(vp, 10, baseW)}px ${colors.primary || "#e8c47a"};"></div>
      </div>
      <div style="position:absolute;left:${Math.max(0, filled - knobSize / 2)}px;top:${-(knobSize - barH) / 2}px;width:${knobSize}px;height:${knobSize}px;border-radius:50%;background:${colors.primary || "#e8c47a"};box-shadow:0 0 ${scaleW(vp, 8, baseW)}px ${colors.primary || "#e8c47a"};"></div>
    </div>
  `;
}

export function screenshots() {
  return [
    { t: 0.5,  label: "start" },
    { t: 30,   label: "half" },
    { t: 59.5, label: "end" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!Number.isFinite(params.duration) || params.duration <= 0) {
    errors.push("duration must be a positive number");
  }
  return { ok: errors.length === 0, errors };
}
