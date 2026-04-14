import { TOKENS, esc, escAttr, fadeIn, scaleH, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "interviewVideoArea",
  version: 2,
  ratio: "9:16",
  category: "media",
  label: "Interview Video Area",
  description: "Rounded interview video embed locked to the reference poster geometry.",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "middle",
  tags: ["media", "interview", "video", "9x16"],
  mood: ["focused"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { placeholderBg: "#120f0d", placeholderTextColor: TOKENS.interview.muted },
  },
  params: {
    src: { type: "string", default: "", label: "视频 URL", group: "content" },
    placeholderBg: { type: "color", default: "#120f0d", label: "占位背景色", group: "color" },
    placeholderTextColor: { type: "color", default: TOKENS.interview.muted, label: "占位文字颜色", group: "color" },
    placeholderText: { type: "string", default: "视频区域", label: "占位文字", group: "content" },
    borderRadius: { type: "number", default: 12, label: "圆角(px)", group: "layout", range: [0, 48], step: 1 },
  },
};

export function render(t, params, vp) {
  const src = params.src || "";
  const placeholderBg = params.placeholderBg || "#120f0d";
  const placeholderTextColor = params.placeholderTextColor || TOKENS.interview.muted;
  const placeholderText = esc(params.placeholderText || "视频区域");
  const borderRadius = Number.isFinite(params.borderRadius) ? params.borderRadius : 12;
  const top = scaleH(vp, 220, 1920);
  const height = scaleH(vp, 600, 1920);
  const pad = scaleW(vp, 40, 1080);
  const width = vp.width - pad * 2;
  const radius = scaleW(vp, borderRadius, 1080);
  const alpha = fadeIn(t, 0, 0.45);
  const shellStyle = `position:absolute;left:${pad}px;top:${top}px;width:${width}px;height:${height}px;opacity:${alpha};border-radius:${radius}px;overflow:hidden;pointer-events:none;background:#000;border:1px solid rgba(255,255,255,0.04);box-shadow:0 18px 40px rgba(0,0,0,0.26)`;
  if (src) {
    const persistKey = `iv-${String(src).replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`;
    return `<div style="${shellStyle}">
  <video data-nf-persist="${persistKey}" data-nf-time="${Math.max(0, t)}" src="${escAttr(src)}" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:cover;display:block;background:#000"></video>
</div>`;
  }
  const fontSize = scaleW(vp, 18, 1080);
  return `<div style="${shellStyle};display:flex;align-items:center;justify-content:center;background:${placeholderBg}">
  <span style="font-family:'PingFang SC','Noto Sans SC',sans-serif;font-size:${fontSize}px;color:${placeholderTextColor}">${placeholderText}</span>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.1, label: "视频区域淡入" },
    { t: 10, label: "视频区域显示中" },
  ];
}

export function lint(params) {
  return { ok: true, errors: [] };
}
