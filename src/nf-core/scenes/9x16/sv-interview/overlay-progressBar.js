// scenes/9x16/sv-interview/overlay-progressBar.js
//
// 进度条 - 3px 金色细进度条 + 段分割竖线

export default {
  // ===== Identity =====
  id: "progressBar",
  name: "进度条",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "overlay",

  // ===== Semantics =====
  description: "底部 3px 高金色进度条：随时间推进填充，段边界用 1px 竖线标记",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    短视频里进度信息必须有但不能抢戏。3px 高（视频只有 1920 高中的 0.15%）是研究过的——
    再低看不清，再高就像 YouTube 播放器 UI 会分散注意力。
    金色 #e8c47a 不是主金 #f0a030——主金太饱和会和金句争色，柔调金 e8c47a 做"底色系统"。
    最关键的设计：段分割竖线（rgba(255,255,255,.15) 1px）。
    硅谷访谈是多段剪辑拼接，观众需要知道"当前在第几段 / 还有几段"，
    但不想看一个生硬的"1/3"数字——用竖线分段是最自然的 UX（Instagram Stories 风格）。
    frame_pure：progress 和 segments 由 timeline 给定，组件只做 CSS width 变换。
  `,

  when_to_use: [
    "所有 clip / bridge slide 的底部进度层",
    "需要展示「整集多段组成」结构的场合",
  ],

  when_not_to_use: [
    "封面/片尾——那两页不需要进度暗示",
    "单段视频——无需分割竖线（segments=[] 即可）",
  ],

  limitations: [
    "segments > 20 段时竖线会变得视觉拥挤",
    "progress 超出 0..1 会被 clamp",
  ],

  inspired_by: "Instagram Stories 顶部分段条 + Apple Podcast 播放进度细线",
  used_in: ["硅谷访谈 E01 所有 slide"],

  requires: [],
  pairs_well_with: ["bg-spaceField", "chrome-brandFooter"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "light",
  z_layer: "foreground",
  mood: ["informative", "calm"],

  tags: ["overlay", "progress", "progressbar", "segments", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "single div + N thin divs for segment markers" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — 3px gold track with segment dividers" },
  ],

  // ===== Params =====
  params: {
    progress: {
      type: "number",
      required: true,
      semantic: "当前进度 0..1 (timeline 给定，frame_pure)",
    },
    segments: {
      type: "array",
      default: [],
      semantic: "段分割点数组（0..1 之间的数字），如 [0.33, 0.66]",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const p = Math.max(0, Math.min(1, Number(params.progress) || 0));
    const segs = Array.isArray(params.segments) ? params.segments : [];
    const trackWidth = Math.round(vp.width * 0.657); // 710 @ 1080
    const left = Math.round((vp.width - trackWidth) / 2);
    const top = Math.round(vp.height * 0.672); // 1290 @ 1920
    const height = Math.max(2, Math.round(vp.height * 0.0016)); // 3 @ 1920

    const markersHtml = segs.map((s) => {
      const sp = Math.max(0, Math.min(1, Number(s)));
      return `<div style="
        position:absolute;
        left:${(sp * 100).toFixed(2)}%;top:-1px;
        width:1px;height:${height + 2}px;
        background:rgba(255,255,255,.15);
        pointer-events:none;
      "></div>`;
    }).join("");

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${left}px;top:${top}px;
        width:${trackWidth}px;height:${height}px;
        background:rgba(232,196,122,.10);
        border-radius:${height}px;overflow:visible;
      ">
        <div style="
          position:absolute;left:0;top:0;bottom:0;
          width:${(p * 100).toFixed(2)}%;
          background:linear-gradient(90deg, #e8c47a, rgba(232,196,122,.6));
          border-radius:${height}px;
        "></div>
        ${markersHtml}
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "progressBar",
      phase: "hold",
      progress: Number(params.progress) || 0,
      visible: true,
      params,
      elements: [
        { type: "bar", role: "track", value: "rgba(232,196,122,.1)" },
        { type: "bar", role: "fill", value: `${((params.progress || 0) * 100).toFixed(1)}%` },
        { type: "markers", role: "segments", value: (params.segments || []).length },
      ],
      boundingBox: {
        x: Math.round((vp.width - Math.round(vp.width * 0.657)) / 2),
        y: Math.round(vp.height * 0.672),
        w: Math.round(vp.width * 0.657),
        h: Math.max(2, Math.round(vp.height * 0.0016)),
      },
    };
  },

  sample() {
    return {
      progress: 0.42,
      segments: [0.25, 0.6, 0.85],
    };
  },
};
