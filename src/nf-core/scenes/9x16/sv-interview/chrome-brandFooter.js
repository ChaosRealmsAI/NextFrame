// scenes/9x16/sv-interview/chrome-brandFooter.js
//
// 品牌底栏 - 底部 OPC 品牌名 + 数字员工签名

export default {
  // ===== Identity =====
  id: "brandFooter",
  name: "品牌底栏",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "chrome",

  // ===== Semantics =====
  description: "底部品牌条：主品牌名（OPC · 王宇轩）+ 数字员工全流程署名小字",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    合集发布者身份 + 数字员工署名。主品牌名居中（OPC · 王宇轩），是观众识别出品方的关键。
    底下一行更小的灰字（ink-50）列出数字员工 Alysa 负责的全流程——这不是传统意义的水印，
    而是"这个频道是 AI 做出来的"的诚实标识，符合 AI-native 产品的透明原则。
    放在 y=1640..1700（底部平台 UI 覆盖区上方 20px），不会被抖音/小红书 UI 挡住。
    两行居中对齐，间距 8px，整体高度 60px 内。
    用 system-ui 不用 serif，因为底栏需要"克制"不需要"仪式感"。
  `,

  when_to_use: [
    "所有主要 slide（clip / bridge）的底部固定署名",
    "需要品牌曝光的所有硅谷访谈 9:16 输出",
  ],

  when_not_to_use: [
    "封面 slide（封面有更大的品牌 hero 版）",
    "片尾 CTA slide（片尾用专门 CTA 组件）",
  ],

  limitations: [
    "brand + teamLine 总字数超 60 字，第二行会自动缩字号",
    "只做静态渲染，不含动画",
  ],

  inspired_by: "电视台台标 + YouTube 频道底栏 + BBC 纪录片结尾署名",
  used_in: ["硅谷访谈 E01 所有 slide"],

  requires: [],
  pairs_well_with: ["overlay-progressBar", "bg-spaceField"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "foreground",
  mood: ["calm", "professional"],

  tags: ["chrome", "footer", "brand", "signature", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "static 2-line flex col" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — brand + AI team signature" },
  ],

  // ===== Params =====
  params: {
    brand: {
      type: "string",
      default: "OPC · 王宇轩",
      semantic: "主品牌名，中间小字圆点分隔",
    },
    teamLine: {
      type: "string",
      default: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布",
      semantic: "数字员工署名行，描述 AI agent 负责的环节",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const brand = escapeHtml(params.brand || "OPC · 王宇轩");
    const teamLine = escapeHtml(params.teamLine || "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布");
    const top = Math.round(vp.height * 0.854); // ~1640 @ 1920
    const fsBrand = Math.round(vp.width * 0.024); // 26 @ 1080
    const fsTeam = Math.round(vp.width * 0.0165); // 18 @ 1080

    host.innerHTML = `
      <div style="
        position:absolute;
        left:0;right:0;top:${top}px;
        display:flex;flex-direction:column;align-items:center;
        gap:${Math.round(vp.height * 0.004)}px;
      ">
        <div style="
          color:rgba(232,237,245,.75);
          font:500 ${fsBrand}px/1.2 system-ui,-apple-system,'PingFang SC',sans-serif;
          letter-spacing:.04em;
          text-align:center;
        ">${brand}</div>
        <div style="
          color:rgba(232,237,245,.35);
          font:400 ${fsTeam}px/1.4 system-ui,-apple-system,'PingFang SC',sans-serif;
          letter-spacing:.02em;
          text-align:center;
          max-width:${Math.round(vp.width * 0.85)}px;
        ">${teamLine}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "brandFooter",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "brand", value: params.brand || "OPC · 王宇轩" },
        { type: "text", role: "team-signature", value: params.teamLine || "" },
      ],
      boundingBox: {
        x: 0,
        y: Math.round(vp.height * 0.854),
        w: vp.width,
        h: Math.round(vp.height * 0.05),
      },
    };
  },

  sample() {
    return {
      brand: "OPC · 王宇轩",
      teamLine: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布",
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
