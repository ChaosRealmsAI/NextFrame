import { TOKENS, scaleH, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "progressBar9x16",
  version: 2,
  ratio: "9:16",
  category: "overlays",
  label: "Progress Bar 9:16",
  description: "Lower editorial timeline with a warm fill, guide dots, and a thin muted rail.",
  tech: "dom",
  duration_hint: 20,
  loopable: false,
  z_hint: "top",
  tags: ["overlays", "progressbar", "9x16"],
  mood: ["editorial"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { color: TOKENS.interview.warm, trackColor: "rgba(245,236,224,0.12)", height: 2 },
  },
  params: {
    duration: { type: "number", default: 20, label: "总时长(秒)", group: "timing" },
    color: { type: "color", default: TOKENS.interview.warm, label: "进度条颜色", group: "color" },
    trackColor: { type: "color", default: "rgba(245,236,224,0.12)", label: "轨道颜色", group: "color" },
    height: { type: "number", default: 2, label: "高度(px)", group: "style", range: [1, 10], step: 1 },
  },
};

export function render(t, params, vp) {
  const duration = Number.isFinite(params.duration) && params.duration > 0 ? params.duration : 20;
  const progress = Math.max(0, Math.min(1, t / duration));
  const color = params.color || TOKENS.interview.warm;
  const trackColor = params.trackColor || "rgba(245,236,224,0.12)";
  const height = Math.max(1, Number.isFinite(params.height) ? params.height : 2);
  const left = scaleW(vp, 82, 1080);
  const width = vp.width - left * 2;
  const top = scaleH(vp, 1560, 1920);
  const fill = Math.round(width * progress);
  const tickCount = 5;
  const tickSize = scaleW(vp, 3, 1080);
  const endRing = scaleW(vp, 8, 1080);
  let ticks = "";
  for (let i = 1; i < tickCount; i += 1) {
    const x = Math.round((width * i) / tickCount);
    ticks += `<div style="position:absolute;left:${x - tickSize / 2}px;top:${-scaleW(vp, 1, 1080)}px;width:${tickSize}px;height:${tickSize}px;border-radius:50%;background:rgba(245,236,224,0.55)"></div>`;
  }
  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${scaleW(vp, 18, 1080)}px;pointer-events:none">
  <div style="position:absolute;left:0;top:${scaleW(vp, 8, 1080)}px;width:${width}px;height:${height}px;background:${trackColor}"></div>
  <div style="position:absolute;left:0;top:${scaleW(vp, 8, 1080)}px;width:${fill}px;height:${height}px;background:${color};box-shadow:0 0 ${scaleW(vp, 8, 1080)}px rgba(218,119,86,0.18)"></div>
  ${ticks}
  <div style="position:absolute;left:${-endRing / 2}px;top:${scaleW(vp, 8, 1080) - Math.round((endRing - height) / 2)}px;width:${endRing}px;height:${endRing}px;border-radius:50%;border:1px solid rgba(245,236,224,0.18)"></div>
  <div style="position:absolute;right:${-endRing / 2}px;top:${scaleW(vp, 8, 1080) - Math.round((endRing - height) / 2)}px;width:${endRing}px;height:${endRing}px;border-radius:50%;border:1px solid rgba(245,236,224,0.18)"></div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "进度条开始" },
    { t: 10, label: "进度50%" },
    { t: 19.9, label: "进度条结束" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.duration <= 0) errors.push("duration 必须大于0。Fix: 传入视频总时长");
  return { ok: errors.length === 0, errors };
}
