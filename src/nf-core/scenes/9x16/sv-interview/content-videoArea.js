// scenes/9x16/sv-interview/content-videoArea.js
//
// 视频区占位 - 16:9 嵌入 9:16 的透明黑盒，给 ffmpeg overlay 真实视频用

export default {
  // ===== Identity =====
  id: "videoArea",
  name: "视频区占位",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "content",

  // ===== Semantics =====
  description: "16:9 比例视频嵌入框（纯黑占位 + 细金边 + CLIP 角标），录制后由 ffmpeg overlay 覆盖真实视频",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    硅谷访谈最核心的内容区——原始播客视频在这里播放。横屏 16:9 内容强塞进竖屏 9:16，
    上下留黑是必然的，关键是"让黑边看起来是设计而不是失误"。
    极细金色描边（rgba(232,196,122,.08) 0.5px）暗示"这是一段精选剪辑"，
    左上 CLIP 角标（JetBrains Mono）让观众知道"当前是第 N 段"。
    实际视频由 recorder + ffmpeg overlay 后期合成到这个坐标框内，
    所以 render 只画黑盒占位——像素坐标必须和 ffmpeg overlay 参数一致（见 theme.md 网格段）。
    黑色背景可以在 preview 阶段作为"视频还没合成"的明确提示，不伪装成别的东西。
  `,

  when_to_use: [
    "clip slide 的主视频区——原声片段播放位",
    "需要保留 16:9 构图的任何 9:16 嵌入场景",
  ],

  when_not_to_use: [
    "bridge slide（AI 讲解自由画布）——那里是文字和图表，不需要视频框",
    "封面——封面用专门的大图组件，不是嵌入",
  ],

  limitations: [
    "坐标写死 CSS(x=48,y=316,w=984,h=554 @1080×1920)，改位置必须同步改 ffmpeg overlay",
    "frame_pure 只保证框位置，真实视频帧由外部合成，preview 看到的是纯黑框",
  ],

  inspired_by: "Shorts/Reels 横屏内容上下加黑边的经典做法 + 数字电视台的「画中画」边框",
  used_in: ["硅谷访谈 E01 所有 clip slide"],

  requires: [],
  pairs_well_with: ["bg-spaceField", "text-bilingualSub", "overlay-chapterMark", "chrome-sourceBar"],
  conflicts_with: ["text-goldenQuote"],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["focused", "neutral"],

  tags: ["content", "video", "placeholder", "clip", "overlay-target", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "single black div + inline SVG label; no paint after render" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — black placeholder box matching ffmpeg overlay coords" },
  ],

  // ===== Params =====
  params: {
    clipNum: {
      type: "number",
      default: 1,
      semantic: "当前 clip 编号，显示在左上角标",
    },
    totalClips: {
      type: "number",
      default: 1,
      semantic: "该集总 clip 数，和 clipNum 一起显示为 CLIP 1/3",
    },
    showLabel: {
      type: "boolean",
      default: true,
      semantic: "是否显示左上 CLIP N/M 角标",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    // Coords: 48:316 w=984 h=554 @ 1080×1920 (see theme.md grid)
    const x = Math.round(vp.width * (48 / 1080));
    const y = Math.round(vp.height * (316 / 1920));
    const w = Math.round(vp.width * (984 / 1080));
    const h = Math.round(vp.height * (554 / 1920));
    const showLabel = params.showLabel !== false;
    const num = Number(params.clipNum || 1);
    const tot = Number(params.totalClips || 1);
    const labelText = tot > 1 ? `CLIP ${num}/${tot}` : `CLIP ${num}`;
    const fsLabel = Math.round(vp.width * 0.018);

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${x}px;top:${y}px;
        width:${w}px;height:${h}px;
        background:#000;
        border-radius:6px;
        box-shadow:
          0 8px 32px rgba(0,0,0,.5),
          inset 0 0 0 0.5px rgba(232,196,122,.08);
        overflow:hidden;
      ">
        ${showLabel ? `<span style="
          position:absolute;top:${Math.round(fsLabel * 0.6)}px;left:${Math.round(fsLabel * 0.8)}px;
          font:600 ${fsLabel}px/1 'SF Mono','JetBrains Mono',Consolas,monospace;
          color:rgba(232,196,122,.6);
          background:rgba(232,196,122,.08);
          padding:${Math.round(fsLabel * 0.2)}px ${Math.round(fsLabel * 0.5)}px;
          border-radius:3px;letter-spacing:.1em;
        ">${escapeHtml(labelText)}</span>` : ""}
      </div>
    `;
  },

  describe(_t, params, vp) {
    const x = Math.round(vp.width * (48 / 1080));
    const y = Math.round(vp.height * (316 / 1920));
    const w = Math.round(vp.width * (984 / 1080));
    const h = Math.round(vp.height * (554 / 1920));
    return {
      sceneId: "videoArea",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "box", role: "video-target", value: "black 16:9" },
        { type: "text", role: "clip-label", value: `CLIP ${params.clipNum}/${params.totalClips || 1}` },
      ],
      boundingBox: { x, y, w, h },
    };
  },

  sample() {
    return { clipNum: 1, totalClips: 3, showLabel: true };
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
