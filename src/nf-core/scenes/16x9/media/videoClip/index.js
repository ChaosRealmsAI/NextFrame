// videoClip — 嵌入真实视频文件。只做视频播放这一件事。
export const meta = {
  id: "videoClip", version: 1, ratio: "16:9", category: "media",
  label: "Video Clip",
  description: "嵌入真实视频文件（MP4），支持定位、圆角、object-fit。用于访谈片段、B-roll。",
  tech: "video", duration_hint: 30, loopable: false, z_hint: "middle",
  tags: ["video", "视频", "clip", "播放", "mp4", "访谈"],
  mood: ["neutral"], theme: ["interview", "documentary", "tech"],
  default_theme: "default",
  themes: {
    "default": {},
    "rounded": { borderRadius: 12 },
    "cinematic": { borderRadius: 0, objectFit: "cover" },
  },
  params: {
    src: { type: "string", required: true, label: "视频路径", semantic: "absolute path or URL to mp4 file", group: "content" },
    x: { type: "number", default: 0, label: "X偏移(px)", semantic: "left offset", group: "style", range: [0, 1920], step: 10 },
    y: { type: "number", default: 0, label: "Y偏移(px)", semantic: "top offset", group: "style", range: [0, 1080], step: 10 },
    width: { type: "number", default: 0, label: "宽度(px, 0=画布宽)", semantic: "video width, 0 means viewport width", group: "style", range: [0, 1920], step: 10 },
    height: { type: "number", default: 0, label: "高度(px, 0=自适应)", semantic: "video height, 0 means auto", group: "style", range: [0, 1080], step: 10 },
    borderRadius: { type: "number", default: 0, label: "圆角(px)", semantic: "border radius", group: "style", range: [0, 40], step: 2 },
    objectFit: { type: "enum", default: "cover", label: "填充方式", semantic: "CSS object-fit", group: "style", options: ["cover", "contain", "fill"] },
  },
  ai: {
    when: "需要播放真实视频片段时。访谈、B-roll、录屏演示。",
    how: "src 传绝对路径。浏览器用 <video> 标签播放，recorder 用 __onFrame 同步 currentTime。",
    example: { src: "/path/to/clip.mp4", x: 40, y: 140, width: 1000, height: 562, borderRadius: 12 },
    theme_guide: { "default": "无圆角", "rounded": "12px 圆角", "cinematic": "全屏无圆角" },
    avoid: "不要用于纯图片（用 image scene）。视频路径必须是绝对路径或可访问 URL。",
    pairs_with: ["interviewTopBar", "interviewBiSub", "subtitleBar", "progressBar"],
  },
};

export function render(t, params, vp) {
  const p = {};
  for (const k in meta.params) p[k] = params[k] !== undefined ? params[k] : meta.params[k].default;
  const src = p.src || "";
  const x = p.x || 0;
  const y = p.y || 0;
  const w = p.width || vp.width;
  const h = p.height || Math.round(w * 9 / 16);
  const br = p.borderRadius || 0;
  const fit = p.objectFit || "cover";

  // Video tag with currentTime sync via inline script
  const videoId = "nf-video-" + Math.abs(src.length * 31 + x * 7 + y);
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${br}px;overflow:hidden;background:#000">
  <video id="${videoId}" src="${src}" style="width:100%;height:100%;object-fit:${fit}" playsinline preload="auto"></video>
  <script>
    (function(){
      var v=document.getElementById("${videoId}");
      if(v){v.currentTime=${t.toFixed(3)};v.muted=true;}
    })();
  </script>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "视频第一帧" },
    { t: 5, label: "播放中" },
    { t: 15, label: "中段" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.src) errors.push("src 不能为空。Fix: 传入视频文件绝对路径");
  return { ok: errors.length === 0, errors };
}
