// scenes/16x9/anthropic-warm/chrome-dimNav.js
//
// 维度进度导航条 - 顶部 15 段进度条 + 当前维度计数，专为 15 维度讲解页面共享抬头

export default {
  // ===== Identity =====
  id: "dimNav",
  name: "维度导航条",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "chrome",

  // ===== Semantics =====
  description: "顶部 N 段进度条（done/current/todo 三态）+ mono 计数 X/N，全集 15 维度共享抬头",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    E01 第三幕讲 15 个维度，足足 10 分钟。观众很容易「听到一半不知道自己在哪儿」。
    这个 chrome 条的使命：观众任何时刻一瞥，就知道"现在在维度 X / 15，前面讲过 X-1 个，后面还有 N 个"。
    对应脚本 §11-46 共 36 段旁白，跨 15 个 slide 文件（04-dim-factory 到 18-dim-caching）。
    视觉语言：
    - 15 个 4px 高细条均分顶部可用宽度，gap=6px（借鉴 YouTube 章节条）
    - done 态：green-30 rgba(126,198,153,.3) 暗绿——进度感不抢戏
    - current 态：ac 橙 #da7756 + 0 0 12px 发光——像"你现在在这儿"的灯
    - todo 态：ink-8 rgba(245,236,224,.08) 幽灵暗色
    - 右侧 mono 计数「X / N」：ac 橙强调 X，ink-75 分隔线，保持克制
    固定在 top=48px 安全区，高度不超过 28px，不侵占主内容区。
    不负责主标题（主标题用 chrome-titleBar）——两层 chrome 可以并存。
    segments 参数让这个组件复用到其他集数不同维度数的视频。
  `,

  when_to_use: [
    "E01 维度 1-15 讲解页面共享顶部（Slide 04-18）",
    "任何分 N 段讲解的精读视频顶部进度指示",
    "需要让观众对「还剩多少」有清晰感的长视频分段",
  ],

  when_not_to_use: [
    "封面 / 目录 / 结尾等非分段内容页（会误导观众以为在某维度）",
    "段数 < 5 或 > 25——太少不够直观、太多细条挤成线",
    "已有自定义顶部 UI 的 slide",
  ],

  limitations: [
    "只显示进度不带段标签（段标签放 chrome-titleBar 或主内容区）",
    "segments 数量变化时 gap 自适应但字号不变",
    "current 索引越界（>= segments）会被夹到 segments-1",
  ],

  inspired_by: "YouTube 章节进度条 + Apple Keynote 分步进度点",
  used_in: ["claude-code-源码讲解 E01 Slide 04-18（15 维度）"],

  requires: [],
  pairs_well_with: ["chrome-titleBar", "bg-warmGradient", "content-analogyCard", "content-keyPoints"],
  conflicts_with: [],
  alternatives: ["overlay-progress（单条总进度）"],

  visual_weight: "low",
  z_layer: "chrome",
  mood: ["informative", "orienting"],

  tags: ["nav", "progress", "chrome", "dimension", "chapter", "segments"],

  complexity: "simple",
  performance: { cost: "low", notes: "static DOM, no per-frame animation" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — segmented top nav bar with done/current/todo states" },
  ],

  // ===== Params =====
  params: {
    segments: {
      type: "number",
      default: 15,
      semantic: "段数，E01 是 15 个维度。建议 5-25 之间",
    },
    current: {
      type: "number",
      required: true,
      semantic: "当前段索引（0-based）。设为 4 = 现在讲维度 5",
    },
    label: {
      type: "string",
      default: "",
      semantic: "可选右侧 mono 计数前的标签，如「维度」。留空只显示数字",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const w = vp.width;
    const h = vp.height;
    const rawSeg = Number.isInteger(params.segments) ? params.segments : 15;
    const segments = Math.max(1, Math.min(40, rawSeg));
    const rawCur = Number.isInteger(params.current) ? params.current : 0;
    const current = Math.max(0, Math.min(segments - 1, rawCur));
    const label = escapeHtml(params.label || "");

    const topPad = Math.round(h * 0.044);         // ~48px
    const sideX = Math.round(w * 0.042);          // ~80px
    const counterW = Math.round(w * 0.072);       // reserve right space
    const barsArea = w - sideX * 2 - counterW - Math.round(w * 0.008);
    const gap = 6;
    const barW = Math.max(4, Math.floor((barsArea - gap * (segments - 1)) / segments));
    const counterSize = Math.round(w * 0.0094);   // ~18px

    const bars = [];
    for (let i = 0; i < segments; i++) {
      let bg, shadow = "";
      if (i < current) {
        bg = "rgba(126,198,153,0.30)";
      } else if (i === current) {
        bg = "#da7756";
        shadow = "box-shadow:0 0 12px rgba(218,119,86,0.50);";
      } else {
        bg = "rgba(245,236,224,0.08)";
      }
      bars.push(`<div style="
        width:${barW}px;
        height:4px;
        border-radius:2px;
        background:${bg};
        ${shadow}
      "></div>`);
    }

    const counterHtml = `
      <div style="
        font:500 ${counterSize}px/1 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
        color:rgba(245,236,224,0.75);
        white-space:nowrap;
      ">
        ${label ? `<span style="color:rgba(245,236,224,0.50);margin-right:8px;">${label}</span>` : ""}
        <strong style="color:#da7756;font-weight:600;">${current + 1}</strong>
        <span style="color:rgba(245,236,224,0.35);margin:0 6px;">/</span>
        <span>${segments}</span>
      </div>
    `;

    host.innerHTML = `
      <div style="
        position:absolute;
        top:${topPad}px;
        left:${sideX}px;
        right:${sideX}px;
        display:flex;
        align-items:center;
        gap:16px;
      ">
        <div style="
          display:flex;
          gap:${gap}px;
          flex:1;
          align-items:center;
        ">${bars.join("")}</div>
        ${counterHtml}
      </div>
    `;
  },

  describe(_t, params, vp) {
    const segments = Number.isInteger(params.segments) ? params.segments : 15;
    const current = Number.isInteger(params.current) ? params.current : 0;
    return {
      sceneId: "dimNav",
      phase: "hold",
      progress: (current + 1) / segments,
      visible: true,
      params,
      elements: [
        { type: "progress", role: "segments", value: `${current + 1}/${segments}` },
        { type: "text", role: "label", value: params.label || "" },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.042),
        y: Math.round(vp.height * 0.044),
        w: Math.round(vp.width * 0.916),
        h: 28,
      },
    };
  },

  sample() {
    return {
      segments: 15,
      current: 4,
      label: "维度",
    };
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
