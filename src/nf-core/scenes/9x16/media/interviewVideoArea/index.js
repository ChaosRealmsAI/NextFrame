export const meta = {
  id: "interviewVideoArea",
  version: 1,
  ratio: "9:16",
  category: "media",
  label: "Interview Video Area",
  description: "访谈视频区域：圆角视频嵌入框，支持真实 MP4 或占位色块",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "middle",
  tags: ["media", "interview", "video", "9x16"],
  mood: ["professional"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { placeholderBg: "#1a1510", placeholderTextColor: "rgba(245,236,224,0.3)" },
  },
  params: {
    src: { type: "string", default: "", label: "视频 URL（空则显示占位）", group: "content" },
    placeholderBg: { type: "color", default: "#1a1510", label: "占位背景色", group: "color" },
    placeholderTextColor: { type: "color", default: "rgba(245,236,224,0.3)", label: "占位文字颜色", group: "color" },
    placeholderText: { type: "string", default: "视频区域", label: "占位文字", group: "content" },
    borderRadius: { type: "number", default: 12, label: "圆角(px)", group: "layout", range: [0, 32], step: 1 },
  },
  ai: {
    when: "访谈切片视频显示区，y=220 h=600，左右各留40px",
    how: '{ scene: "interviewVideoArea", start: 0, dur: 20, params: { src: "", placeholderText: "视频区域" } }',
    example: { src: "", placeholderText: "视频区域" },
    avoid: "src 为空时自动显示占位色块，不要单独处理空 src 的情况",
    pairs_with: ["interviewBg", "interviewHeader", "interviewBiSub", "progressBar9x16"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const src = params.src || "";
  const placeholderBg = params.placeholderBg || "#1a1510";
  const placeholderTextColor = params.placeholderTextColor || "rgba(245,236,224,0.3)";
  const placeholderText = esc(params.placeholderText || "视频区域");
  const borderRadius = Number.isFinite(params.borderRadius) ? params.borderRadius : 12;

  // Spec: y=220 h=600 left/right pad=40, width=1000 centered
  const top = Math.round(vp.height * 220 / 1920);
  const areaH = Math.round(vp.height * 600 / 1920);
  const pad = Math.round(vp.width * 40 / 1080);
  const areaW = vp.width - pad * 2;

  const fadeAlpha = Math.min(1, ease3(Math.min(1, t * 3)));
  const scaledRadius = Math.round(borderRadius * vp.width / 1080);

  if (src) {
    const persistKey = "iv-" + String(src).replace(/[^a-zA-Z0-9]/g, "").slice(-20);
    return `<div style="position:absolute;left:${pad}px;top:${top}px;width:${areaW}px;height:${areaH}px;opacity:${fadeAlpha};border-radius:${scaledRadius}px;overflow:hidden;pointer-events:none">
  <video data-nf-persist="${persistKey}" data-nf-time="${t}" src="${esc(src)}" playsinline preload="auto" style="width:100%;height:100%;object-fit:cover"></video>
</div>`;
  }

  // Placeholder
  const placeholderFontSize = Math.round(vp.width * 18 / 1080);
  return `<div style="position:absolute;left:${pad}px;top:${top}px;width:${areaW}px;height:${areaH}px;opacity:${fadeAlpha};background:${placeholderBg};border-radius:${scaledRadius}px;display:flex;align-items:center;justify-content:center;pointer-events:none">
  <span style="font-family:system-ui,'PingFang SC',sans-serif;font-size:${placeholderFontSize}px;font-weight:400;color:${placeholderTextColor}">${placeholderText}</span>
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
