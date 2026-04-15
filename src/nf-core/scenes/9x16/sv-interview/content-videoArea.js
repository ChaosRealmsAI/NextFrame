// scenes/9x16/sv-interview/content-videoArea.js
// 视频嵌入区 — 黑框占位，真实视频由 nf-recorder ffmpeg overlay 合成

export default {
  id: "videoArea",
  name: "视频嵌入区",
  version: "1.0.0",

  ratio: "9:16",
  theme: "sv-interview",
  role: "content",

  description: "访谈片段 16:9 视频嵌入区 — 黑框占位，真实视频由 recorder ffmpeg overlay 合成",
  duration_hint: null,

  type: "media",
  frame_pure: true,
  assets: [],

  // 关键：recorder 靠这个 flag 识别视频层 → ffmpeg overlay_video_layers
  videoOverlay: true,

  intent: `
    9:16 竖屏访谈片段的核心内容区。历史踩过的坑：早期尝试让 WKWebView 直接
    渲染 video 元素 + takeSnapshot 捕帧 → 所有截图里 video 画面是黑的（WebKit
    安全策略：跨源 video 帧不进入 snapshot）。最终方案：HTML 只画黑框占位 +
    meta.videoOverlay:true 告诉 recorder 这层是视频 → 所有 HTML 帧录完后
    ffmpeg 再把真 video 以 overlay filter 合成到坐标 x:80 y:276 w:920 h:538
    （1080×1920 CSS）上。
  `,

  when_to_use: [
    "9:16 访谈切片 / 播客片段",
    "需要嵌入横屏 16:9 真实视频到竖屏画面",
  ],

  when_not_to_use: [
    "不需要真实视频的纯讲解（用 bg-spaceField 即可）",
    "全屏 video（用 16:9 ratio）",
  ],

  limitations: [
    "坐标写死 x:80 y:276 w:920 h:538（1080×1920 CSS）",
    "recorder 必须走 clip 模式：nextframe-recorder clip <html> --video <mp4>",
    "真实视频必须是 .mp4 文件路径",
  ],

  inspired_by: "硅谷访谈 E01 Dario Amodei 竖屏播客切片的标准布局",
  used_in: [],

  requires: ["bg-spaceField"],
  pairs_well_with: ["chrome-sourceBar", "text-bilingualSub"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["focused", "authentic"],

  tags: ["video", "clip", "overlay", "interview", "ffmpeg"],

  complexity: "medium",
  performance: { cost: "low", notes: "只画黑框，真视频由 ffmpeg 合成" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "初版 — 恢复 videoOverlay flag，兼容 recorder clip 模式" },
  ],

  params: {
    src: {
      type: "string",
      required: false,
      semantic: "视频路径 实际由 recorder --video flag 传入 本参数仅备用",
    },
    borderRadius: {
      type: "number",
      default: 8,
      range: [0, 24],
      unit: "px",
      semantic: "黑框圆角",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, vp) {
    const x = (80 / 1080) * vp.width;
    const y = (276 / 1920) * vp.height;
    const w = (920 / 1080) * vp.width;
    const h = (538 / 1920) * vp.height;
    const br = params.borderRadius || 8;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${w}px;
        height: ${h}px;
        background: #000;
        border: 1px solid rgba(77,166,255,0.15);
        border-radius: ${br}px;
        overflow: hidden;
        box-shadow: 0 0 40px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.5);
      "></div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "videoArea",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [{ type: "placeholder", role: "video-frame", value: "black box for ffmpeg overlay" }],
      boundingBox: {
        x: (80 / 1080) * vp.width,
        y: (276 / 1920) * vp.height,
        w: (920 / 1080) * vp.width,
        h: (538 / 1920) * vp.height,
      },
    };
  },

  sample() {
    return { src: "clip.mp4", borderRadius: 8 };
  },
};
