import { TOKENS, GRID, TYPE, esc, escAttr, scaleW, scaleH, fadeIn } from "../../../shared/design.js";

export const meta = {
  id: "interviewVideoArea",
  version: 1,
  ratio: "9:16",
  category: "media",
  label: "Interview Video Area",
  description: "访谈视频嵌入区域，匹配 9:16 clip-slide 的 .video-area 布局。支持持久播放和片段标签。",
  tech: "video",
  videoOverlay: true,
  duration_hint: 0,
  loopable: false,
  z_hint: "middle",
  tags: ["video", "interview", "clip", "media", "9:16"],
  mood: ["neutral", "cinematic", "documentary"],
  theme: ["interview", "education", "presentation"],
  params: {
    src: {
      type: "string",
      required: false,
      default: "",
      label: "视频地址",
      semantic: "absolute local path or remote URL pointing to an mp4 file; empty shows placeholder",
      group: "content",
    },
    clipNum: {
      type: "number",
      default: 0,
      label: "片段序号",
      semantic: "current clip number (1-based); 0 hides the clip label",
      group: "content",
      range: [0, 99],
      step: 1,
    },
    totalClips: {
      type: "number",
      default: 0,
      label: "总片段数",
      semantic: "total clip count shown in label e.g. CLIP 1/3; 0 hides the label",
      group: "content",
      range: [0, 99],
      step: 1,
    },
  },
  ai: {
    when: "访谈视频区域 — 占据画面中部，对应设计稿的 .video-area 区块。",
    how: "传入 src 指向 mp4；clipNum/totalClips 控制左上角标签（如 CLIP 1/3）。不传 src 则显示占位框。",
    example: { src: "/Users/demo/clips/interview.mp4", clipNum: 1, totalClips: 3 },
    avoid: "不要和其他视频层叠放；videoOverlay=true 告知 recorder 这是视频层。",
    pairs_with: ["interviewBiSub", "interviewHeader", "interviewBrand", "interviewMeta"],
  },
};

export function render(t, params, vp) {
  const src = typeof params.src === "string" ? params.src.trim() : "";
  const clipNum = Number.isFinite(params.clipNum) ? Math.max(0, params.clipNum) : 0;
  const totalClips = Number.isFinite(params.totalClips) ? Math.max(0, params.totalClips) : 0;
  const currentTime = Math.max(0, Number.isFinite(t) ? t : 0);

  // Layout — derived from GRID.video at 1080×1920
  const left = scaleW(vp, GRID.video.left);
  const top = scaleH(vp, GRID.video.top);
  const width = vp.width - scaleW(vp, GRID.video.left) - scaleW(vp, GRID.video.right);
  const height = scaleH(vp, GRID.video.height);
  const radius = scaleW(vp, 8);
  const shadow = `0 4px ${scaleW(vp, 32)}px rgba(0,0,0,0.6)`;

  // Clip label sizing
  const labelFontSize = scaleW(vp, TYPE.clipLabel.size);
  const labelPad = scaleW(vp, 12);
  const labelTop = scaleH(vp, 12);

  // Video or placeholder content
  let inner;
  if (src) {
    // Hash src to a stable short token for data-nf-persist
    const persistKey = `iv-${src.replace(/[^a-zA-Z0-9]/g, "").slice(-20)}`;
    inner = `<video data-nf-persist="${escAttr(persistKey)}" data-nf-time="${currentTime}" src="${escAttr(src)}" muted playsinline preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:${radius}px;display:block"></video>`;
  } else {
    const pFontSize = scaleW(vp, 28);
    inner = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${TOKENS.interview.textFaint};font-family:${TYPE.clipLabel.font};font-size:${pFontSize}px;letter-spacing:0.2em;font-weight:${TYPE.clipLabel.weight}">VIDEO</div>`;
  }

  // Clip label (top-left, only when clipNum > 0)
  let clipLabel = "";
  if (clipNum > 0) {
    const labelText = totalClips > 0 ? `CLIP ${clipNum}/${totalClips}` : `CLIP ${clipNum}`;
    clipLabel = `<div style="position:absolute;left:${labelPad}px;top:${labelTop}px;background:rgba(0,0,0,0.55);color:${TOKENS.interview.textDim};font-family:${TYPE.clipLabel.font};font-size:${labelFontSize}px;font-weight:${TYPE.clipLabel.weight};letter-spacing:${TYPE.clipLabel.spacing};padding:${scaleH(vp, 5)}px ${scaleW(vp, 10)}px;border-radius:${scaleW(vp, 4)}px;pointer-events:none;z-index:2">${esc(labelText)}</div>`;
  }

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;pointer-events:none">` +
    `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:${TOKENS.interview.bg === "#111111" ? "#000000" : TOKENS.interview.bg};border-radius:${radius}px;box-shadow:${shadow};overflow:hidden">` +
    inner +
    clipLabel +
    `</div>` +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "视频起始帧" },
    { t: 2, label: "播放中画面" },
    { t: 6, label: "后段画面" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.src !== undefined && typeof params.src !== "string") {
    errors.push("src 必须是字符串。Fix: 传入 mp4 路径或 URL，或省略此参数显示占位框");
  }
  if (params.clipNum !== undefined && (!Number.isFinite(params.clipNum) || params.clipNum < 0 || params.clipNum > 99)) {
    errors.push("clipNum 超出范围 [0, 99]。Fix: 设为 0–99（0 表示不显示标签）");
  }
  if (params.totalClips !== undefined && (!Number.isFinite(params.totalClips) || params.totalClips < 0 || params.totalClips > 99)) {
    errors.push("totalClips 超出范围 [0, 99]。Fix: 设为 0–99");
  }
  if (params.clipNum > 0 && params.totalClips > 0 && params.clipNum > params.totalClips) {
    errors.push(`clipNum(${params.clipNum}) 大于 totalClips(${params.totalClips})。Fix: clipNum 必须 ≤ totalClips`);
  }
  if (!vp || !Number.isFinite(vp.width) || !Number.isFinite(vp.height)) {
    errors.push("vp 无效：需要 { width, height }");
  }
  return { ok: errors.length === 0, errors };
}
