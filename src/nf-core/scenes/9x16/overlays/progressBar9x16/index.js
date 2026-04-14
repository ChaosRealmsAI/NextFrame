import { TOKENS, GRID, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "progressBar9x16",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Progress Bar 9x16",
  description: "访谈竖屏进度条：金色渐变填充条，随时间推进。位于元数据区下方固定位置。",
  tech: "dom",
  duration_hint: 30,
  loopable: false,
  z_hint: "middle",
  tags: ["overlay", "progress", "interview", "timeline", "9x16"],
  mood: ["informative", "dynamic"],
  theme: ["interview", "talk", "vertical"],
  default_theme: "interview-dark",
  themes: {
    "interview-dark": {
      gold: TOKENS.interview.gold,
    },
  },
  params: {
    duration: { type: "number", default: 20, label: "总时长（秒）", semantic: "视频总时长，决定进度条满格时刻", group: "timing", min: 1, max: 3600 },
  },
  ai: {
    when: "访谈类竖屏视频，需要在屏幕上显示当前播放进度时使用。",
    how: "duration 设为视频实际时长秒数。放在 interviewBg 之上，layer 时间范围与整条视频相同。",
    example: { duration: 60 },
    avoid: "不要把 duration 设为 0 或负数，会导致进度永远不变。",
    pairs_with: ["interviewBg", "interviewHeader", "interviewMeta", "interviewBrand"],
  },
};

export function render(t, params, vp) {
  const duration = Math.max(1, Number.isFinite(params.duration) ? params.duration : 20);
  const progress = Math.max(0, Math.min(1, t / duration));

  const trackY = scaleH(vp, GRID.progress);
  const trackH = scaleH(vp, 6);
  const trackLeft = scaleW(vp, GRID.sidePad);
  const trackRight = scaleW(vp, GRID.sidePad);
  const trackWidth = vp.width - trackLeft - trackRight;
  const fillWidth = Math.round(trackWidth * progress);
  const radius = Math.round(trackH / 2);

  // Background track
  const bgTrack = `<div style="position:absolute;left:${trackLeft}px;top:${trackY}px;` +
    `width:${trackWidth}px;height:${trackH}px;border-radius:${radius}px;` +
    `background:rgba(232,196,122,0.1)"></div>`;

  // Filled track (gold gradient)
  const fillTrack = fillWidth > 0
    ? `<div style="position:absolute;left:${trackLeft}px;top:${trackY}px;` +
      `width:${fillWidth}px;height:${trackH}px;border-radius:${radius}px;` +
      `background:linear-gradient(90deg,${TOKENS.interview.gold} 0%,rgba(232,196,122,0.7) 100%)"></div>`
    : "";

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;pointer-events:none">` +
    bgTrack +
    fillTrack +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "进度 0%", params: { duration: 20 } },
    { t: 5, label: "进度 25%", params: { duration: 20 } },
    { t: 10, label: "进度 50%", params: { duration: 20 } },
    { t: 20, label: "进度 100%", params: { duration: 20 } },
  ];
}

export function lint(params) {
  const errors = [];
  const d = params.duration;
  if (d !== undefined && d !== null) {
    if (!Number.isFinite(Number(d))) errors.push("duration 必须是有效数字。Fix: 传入正整数，如 60");
    else if (Number(d) <= 0) errors.push("duration 必须大于 0。Fix: 传入正整数，如 60");
  }
  return { ok: errors.length === 0, errors };
}
