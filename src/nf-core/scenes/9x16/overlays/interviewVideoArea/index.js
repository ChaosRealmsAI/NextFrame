// interviewVideoArea — 硅谷访谈 9:16 视频嵌入层
// meta.videoOverlay = true → recorder 用 ffmpeg 把真实视频叠进来。
// 浏览器预览时显示黑框 + CLIP 标签。

import { getPreset, esc, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "interviewVideoArea",
  version: 1,
  ratio: "9:16",
  category: "media",
  label: "Interview Video Area",
  description: "硅谷访谈视频嵌入层（9:16）。meta.videoOverlay=true，recorder 把 clip.mp4 叠进来。坐标从 interview-dark preset 读取。",
  tech: "dom",
  duration_hint: 80,
  loopable: false,
  z_hint: "middle",
  videoOverlay: true,
  tags: ["interview", "video", "9x16"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "interview-dark",
  themes: { "interview-dark": {} },
  params: {
    clipLabel: { type: "string", default: "", label: "CLIP N/M 标签（空=不显示）", group: "content" },
    src:       { type: "string", default: "", label: "视频路径（预览用，录制时由 recorder 替换）", group: "content" },
  },
  ai: {
    when: "需要在视频区放入 clip.mp4 时使用。必须搭配 interviewChrome 使用。",
    how: "{ scene: 'interviewVideoArea', start: 0, dur: <clip_duration>, params: { clipLabel: 'CLIP 1/1' }, videoOverlay: { x: ..., y: ..., w: ..., h: ... } }",
    example: { clipLabel: "CLIP 1/1" },
    avoid: "不要用这个层放字幕或背景",
    pairs_with: ["interviewChrome", "interviewBiSub", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const preset = getPreset("interview-dark");
  const { colors, layout, type } = preset;
  const bW = layout.baseW;
  const bH = layout.baseH;

  const sw = (px) => scaleW(vp, px, bW);
  const sh = (px) => scaleH(vp, px, bH);

  const left   = sw(layout.video.left);
  const top    = sh(layout.video.top);
  const width  = vp.width - sw(layout.video.left) - sw(layout.video.right);
  const height = sh(layout.video.height);

  const clipLabel = params.clipLabel || "";

  const clipLabelHtml = clipLabel
    ? `<span style="position:absolute;top:${sh(8)}px;left:${sw(10)}px;z-index:20;font-size:${sw(type.clipLabel.size)}px;color:rgba(232,196,122,0.6);font-family:${type.clipLabel.font};background:rgba(232,196,122,0.08);padding:${sh(2)}px ${sw(6)}px;border-radius:${sw(2)}px;letter-spacing:${type.clipLabel.spacing}">${esc(clipLabel)}</span>`
    : "";

  // If src provided, embed video element (for preview); recorder replaces with actual overlay
  const src = params.src || "";
  const videoContent = src
    ? `<video data-nf-persist="iv-main" data-nf-time="${t}" src="${esc(src)}" playsinline preload="auto" style="width:100%;height:100%;object-fit:cover"></video>`
    : `<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:rgba(232,196,122,0.2);font:${sw(14)}px system-ui">VIDEO</div>`;

  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:#000;border-radius:${sw(4)}px;box-shadow:0 ${sh(4)}px ${sw(24)}px rgba(0,0,0,0.4),inset 0 0 0 0.5px rgba(232,196,122,0.08);overflow:hidden;z-index:10">` +
    clipLabelHtml +
    videoContent +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "start" },
    { t: 40, label: "mid" },
  ];
}

export function lint(params) {
  return { ok: true, errors: [] };
}
