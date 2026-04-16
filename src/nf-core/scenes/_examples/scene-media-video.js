// scenes/_examples/scene-media-video.js — minimal media scene skeleton (AI reads, copies, adapts)

export default {
  id: "exampleVideo",
  name: "exampleVideo",
  version: "1.0.0",
  ratio: "16:9",
  theme: "_examples",
  role: "content",
  type: "media",
  frame_pure: false,
  assets: [],
  description: "最小 media 组件样例 — 居中 video 播放器，t-driven 淡入。",
  duration_hint: null,
  params: {
    src:     { type: "string", required: true, semantic: "视频源路径" },
    opacity: { type: "number", default: 1.0,   semantic: "不透明度 0-1" },
  },
  sample() { return { src: "./sample.mp4", opacity: 1.0 }; },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const op = clamp(Number(params.opacity ?? 1), 0, 1) * clamp(t / 0.4, 0, 1);
    const src = esc(params.src || "");
    return `
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;">
        <video src="${src}" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;opacity:${op};"></video>
      </div>
    `;
  },
  describe(t, params, vp) {
    return {
      sceneId: "exampleVideo", phase: "show", progress: 1, visible: true, params,
      elements: [{ type: "video", role: "media", value: params.src || "" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
