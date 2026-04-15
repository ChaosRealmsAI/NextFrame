// progressBar9x16 — 硅谷访谈 9:16 进度条
// t / params.duration → 填充比例。金色线 + 透明轨道。

import { getPreset, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "progressBar9x16",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Progress Bar 9:16",
  description: "9:16 访谈进度条。根据 t/duration 自动填充。金色渐变，轨道半透明。",
  tech: "dom",
  duration_hint: 80,
  loopable: false,
  z_hint: "top",
  tags: ["progress", "9x16", "interview"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "interview-dark",
  themes: { "interview-dark": {} },
  params: {
    duration: { type: "number", default: 60, label: "总时长（秒），用于计算进度", group: "content" },
  },
  ai: {
    when: "9:16 访谈视频需要进度条时使用。",
    how: "{ scene: 'progressBar9x16', start: 0, dur: <clip_duration>, params: { duration: <clip_duration> } }",
    example: { duration: 81.31 },
    avoid: "",
    pairs_with: ["interviewChrome", "interviewBiSub", "interviewVideoArea"],
  },
};

export function render(t, params, vp) {
  const preset = getPreset("interview-dark");
  const { colors, layout } = preset;
  const bW = layout.baseW;
  const bH = layout.baseH;

  const sw = (px) => scaleW(vp, px, bW);
  const sh = (px) => scaleH(vp, px, bH);

  const duration = typeof params.duration === "number" && params.duration > 0 ? params.duration : 60;
  const progress = Math.max(0, Math.min(1, t / duration));

  const barY    = sh(layout.progress);
  const sidePad = sw(layout.sidePad);
  const barH    = sh(3);

  return `<div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${barY}px;height:${sh(20)}px;display:flex;align-items:center;z-index:10">` +
    `<div style="flex:1;height:${barH}px;position:relative;background:rgba(232,196,122,0.1);border-radius:${barH/2}px;overflow:hidden">` +
    `<div style="position:absolute;left:0;top:0;bottom:0;width:${(progress * 100).toFixed(3)}%;background:linear-gradient(90deg,${colors.primary},rgba(232,196,122,0.6));border-radius:${barH/2}px;transition:none"></div>` +
    `</div>` +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "start (empty)" },
    { t: 40, label: "mid (half)" },
    { t: 80, label: "end (full)" },
  ];
}

export function lint(params) {
  const errors = [];
  if (params.duration !== undefined && (typeof params.duration !== "number" || params.duration <= 0)) {
    errors.push("duration must be a positive number");
  }
  return { ok: errors.length === 0, errors };
}
