function escAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const meta = {
  id: "videoClip",
  version: 1,
  ratio: "9:16",
  category: "media",
  label: "Video Clip",
  description: "嵌入真实视频文件（MP4），支持定位和圆角。适合竖屏 B-roll、访谈切片、屏幕录制等素材直接上屏。",
  tech: "video",
  duration_hint: 0,
  loopable: false,
  z_hint: "middle",
  tags: ["video", "clip", "media", "portrait", "interview"],
  mood: ["neutral", "cinematic", "documentary"],
  theme: ["education", "interview", "shorts"],
  default_theme: "portrait-safe",
  themes: {
    "portrait-safe": { x: 40, y: 180, width: 1000, height: 0, borderRadius: 24, objectFit: "cover" },
    "portrait-contain": { x: 40, y: 160, width: 1000, height: 1320, borderRadius: 24, objectFit: "contain" },
    "full-bleed": { x: 0, y: 0, width: 1080, height: 1920, borderRadius: 0, objectFit: "cover" },
  },
  params: {
    src: { type: "string", required: true, default: "https://example.com/sample.mp4", label: "视频地址", semantic: "absolute local path or remote URL pointing to an mp4 file", group: "content" },
    x: { type: "number", default: 40, label: "X 偏移(px)", semantic: "left offset from viewport origin", group: "layout", range: [0, 1080], step: 10 },
    y: { type: "number", default: 180, label: "Y 偏移(px)", semantic: "top offset from viewport origin", group: "layout", range: [0, 1920], step: 10 },
    width: { type: "number", default: 1000, label: "宽度(px)", semantic: "video width in pixels, tuned for portrait safe margins by default", group: "layout", range: [80, 1080], step: 10 },
    height: { type: "number", default: 0, label: "高度(px)", semantic: "video height in pixels; 0 keeps the source aspect ratio automatically", group: "layout", range: [0, 1920], step: 10 },
    borderRadius: { type: "number", default: 24, label: "圆角(px)", semantic: "corner radius applied to the video element", group: "style", range: [0, 120], step: 2 },
    objectFit: { type: "enum", default: "cover", options: ["cover", "contain"], label: "填充模式", semantic: "cover fills the box, contain keeps the full frame visible", group: "style" },
  },
  ai: {
    when: "短视频或竖屏教程里需要直接嵌入原始视频素材时使用。",
    how: "传入 src 指向 mp4 文件。默认给竖屏画面留安全边距；height=0 会按素材比例自动算高。",
    example: { src: "/Users/demo/assets/broll.mp4", x: 40, y: 180, width: 1000, height: 0, borderRadius: 24, objectFit: "cover" },
    theme_guide: { "portrait-safe": "带安全边距的竖屏卡片", "portrait-contain": "完整显示视频内容", "full-bleed": "整屏铺满" },
    avoid: "不要传空 src；如果 height=0 且素材太高，可能超出底部，需要手动调 y 或 width。",
    pairs_with: ["interviewBg", "interviewBiSub", "progressBar"],
  },
};

export function render(t, params, vp) {
  const src = params.src || "";
  const x = Number.isFinite(params.x) ? params.x : 40;
  const y = Number.isFinite(params.y) ? params.y : 180;
  const width = Number.isFinite(params.width) && params.width > 0 ? params.width : vp.width;
  const height = Number.isFinite(params.height) && params.height > 0 ? params.height : 0;
  const borderRadius = Number.isFinite(params.borderRadius) ? Math.max(0, params.borderRadius) : 0;
  const objectFit = params.objectFit === "contain" ? "contain" : "cover";
  const currentTime = Math.max(0, Number.isFinite(t) ? t : 0);
  const sizeStyle = height > 0
    ? `width:${width}px;height:${height}px;object-fit:${objectFit};`
    : `width:${width}px;height:auto;max-height:${Math.max(0, vp.height - y)}px;`;

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;overflow:hidden">
  <video src="${escAttr(src)}" playsinline muted preload="auto" style="position:absolute;left:${x}px;top:${y}px;${sizeStyle}display:block;background:#000;border-radius:${borderRadius}px"></video>
  <script>(function(){const s=document.currentScript;const v=s&&s.previousElementSibling;if(!v)return;v.defaultMuted=true;v.muted=true;try{v.currentTime=${currentTime};}catch(_){}})()<\/script>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "片头帧" },
    { t: 2, label: "中段画面" },
    { t: 6, label: "后段画面" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.src || typeof params.src !== "string" || params.src.trim() === "") {
    errors.push("src 不能为空。Fix: 传入 mp4 的绝对路径或 URL");
  }
  if (params.width !== undefined && params.width <= 0) {
    errors.push("width 必须大于 0。Fix: 设为正数宽度");
  }
  if (params.height !== undefined && params.height < 0) {
    errors.push("height 不能小于 0。Fix: 设为 0 或正数");
  }
  if (params.borderRadius !== undefined && (params.borderRadius < 0 || params.borderRadius > 120)) {
    errors.push("borderRadius 超出范围 [0, 120]。Fix: 设为 0–120");
  }
  if (!["cover", "contain"].includes(params.objectFit)) {
    errors.push(`objectFit 无效值 "${params.objectFit}"。Fix: 只能是 "cover" 或 "contain"`);
  }
  if ((params.x || 0) >= vp.width) {
    errors.push(`x=${params.x} 已超出画面宽度。Fix: 把 x 调整到 ${vp.width} 以内`);
  }
  if ((params.y || 0) >= vp.height) {
    errors.push(`y=${params.y} 已超出画面高度。Fix: 把 y 调整到 ${vp.height} 以内`);
  }
  return { ok: errors.length === 0, errors };
}
